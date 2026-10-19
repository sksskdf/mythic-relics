import * as THREE from 'three'

import { Giant, GRUNT, type GiantSpec, type GiantWorld, KING } from '../enemies/Giant'
import type { CircleCollider, Point2 } from '../world/colliders'
import { NavGrid } from '../world/navGrid'

/** 졸개 무리가 모여 있는 곳 */
interface Camp {
  center: Point2
  count: number
  giants: Giant[]
  /** 전멸한 뒤 다시 나타나기까지 남은 시간 */
  respawn: number
}

/** 다시 나타날 때, 주인공이 이보다 가까이 있으면 기다린다. */
const RESPAWN_CLEAR_DISTANCE = 10
const CAMP_RESPAWN = 25
const BOSS_RESPAWN = 45

export interface EncounterLayout {
  camps: { x: number; z: number; count: number }[]
  /** 보스 자리 (마을처럼 보스가 없는 지역은 null) */
  boss: { x: number; z: number } | null
}

type WorldBase = Omit<GiantWorld, 'nav' | 'giants' | 'summon'>

/**
 * 전투 맵의 적들을 관리한다. 무리 배치, 거인 왕, 포효로 불려 온 졸개, 다시 나타나기까지.
 */
export class Encounter {
  readonly giants: Giant[] = []
  readonly object = new THREE.Group()
  boss: Giant | null = null

  private camps: Camp[] = []
  private bossHome: Point2 | null = null
  private bossRespawn = 0
  private readonly navs = new Map<GiantSpec, NavGrid>()
  private seed = 1
  private readonly pendingSummons: Point2[] = []

  constructor(layout: EncounterLayout, staticColliders: readonly CircleCollider[], halfExtent: number) {
    for (const spec of [GRUNT, KING]) {
      this.navs.set(spec, new NavGrid(halfExtent, 0.5, staticColliders, spec.radius))
    }
    this.place(layout)
  }

  /** 지역을 바꿨다(또는 편집했다): 거인을 모두 지우고 새 배치로 다시 세운다. */
  reset(layout: EncounterLayout, staticColliders: readonly CircleCollider[], halfExtent: number): void {
    for (const giant of [...this.giants]) this.remove(giant)
    this.pendingSummons.length = 0
    for (const nav of this.navs.values()) nav.rebuild(halfExtent, staticColliders)
    this.place(layout)
  }

  private place(layout: EncounterLayout): void {
    const gruntNav = this.navs.get(GRUNT)!
    this.camps = layout.camps.map((c) => ({
      center: gruntNav.nearestFree(c) ?? c,
      count: c.count,
      giants: [],
      respawn: CAMP_RESPAWN,
    }))
    this.bossHome = layout.boss ? (this.navs.get(KING)!.nearestFree(layout.boss) ?? layout.boss) : null
    this.bossRespawn = 0
    for (const camp of this.camps) this.fillCamp(camp)
    this.spawnBoss()
  }

  /** 살아 있는 적들 (주인공의 공격 대상) */
  get alive(): Giant[] {
    return this.giants.filter((g) => g.alive)
  }

  /**
   * 주인공과 다른 거인이 비켜 가야 하는 원들.
   * onlyBlocking이면 밀리지 않는 거인(보스)만 돌려준다. (적을 무시하고 걷는 주인공은 졸개를 밀고 지나간다)
   */
  colliders(onlyBlocking = false): CircleCollider[] {
    return this.giants.filter((g) => g.alive && (!onlyBlocking || g.blocksPath)).map((g) => g.collider)
  }

  /** 보스가 싸움에 끼어들었는지 (HUD 표시용) */
  get bossEngaged(): boolean {
    const boss = this.boss
    return !!boss && boss.alive && boss.state !== 'idle' && boss.state !== 'return'
  }

  update(dt: number, base: WorldBase): Giant[] {
    const shattered: Giant[] = []
    for (const giant of this.giants) {
      const nav = this.navs.get(giant.spec) ?? this.navs.get(giant.spec.king ? KING : GRUNT)!
      giant.update(dt, {
        ...base,
        nav,
        giants: this.giants,
        summon: (x, z, count) => this.queueSummon(x, z, count),
      })
      if (giant.justShattered) shattered.push(giant)
    }
    this.flushSummons()
    this.cleanUp(dt, base.hero)
    return shattered
  }

  /** 자동 점검용: 지정한 곳에 졸개를 바로 세운다. */
  spawnGrunt(x: number, z: number): Giant {
    return this.addGiant(GRUNT, { x, z })
  }

  /** 무리와 보스가 처음 있던 곳 (개발 패널의 순간이동용) */
  get spots(): { camps: Point2[]; boss: Point2 | null } {
    return { camps: this.camps.map((c) => c.center), boss: this.bossHome }
  }

  /** 개발 패널: 모든 거인을 지우고 무리와 거인 왕을 처음처럼 다시 세운다. */
  resetAll(): void {
    for (const giant of [...this.giants]) this.remove(giant)
    for (const camp of this.camps) {
      camp.giants = []
      this.fillCamp(camp)
    }
    this.spawnBoss()
  }

  /** 개발 패널: 살아 있는 거인을 모두 지운다. (무리는 정해진 시간 뒤 다시 나타난다) */
  clearAll(): void {
    for (const giant of [...this.giants]) this.remove(giant)
    for (const camp of this.camps) camp.giants = []
    this.boss = null
  }

  /** 승급 전설 등에서 거인을 따로 세운다. alert면 바로 주인공을 쫓는다. */
  spawn(spec: GiantSpec, home: Point2, alert: boolean): Giant {
    const nav = this.navs.get(spec) ?? this.navs.get(spec.king ? KING : GRUNT)!
    const giant = this.addGiant(spec, nav.nearestFree(home) ?? home)
    if (alert) giant.alert()
    return giant
  }

  /** 거인을 바로 지운다. (승급 전설에 실패했을 때) */
  remove(giant: Giant): void {
    const index = this.giants.indexOf(giant)
    if (index < 0) return
    giant.dispose()
    this.giants.splice(index, 1)
  }

  private queueSummon(x: number, z: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random()
      this.pendingSummons.push({ x: x + Math.sin(angle) * 5, z: z + Math.cos(angle) * 5 })
    }
  }

  private flushSummons(): void {
    const nav = this.navs.get(GRUNT)!
    for (const point of this.pendingSummons.splice(0)) {
      const spot = nav.nearestFree(point) ?? point
      this.addGiant(GRUNT, spot).alert()
    }
  }

  private addGiant(spec: GiantSpec, home: Point2): Giant {
    const giant = new Giant(spec, home, this.seed++)
    this.giants.push(giant)
    this.object.add(giant.object)
    return giant
  }

  private fillCamp(camp: Camp): void {
    const nav = this.navs.get(GRUNT)!
    for (let i = 0; i < camp.count; i++) {
      const angle = (i / camp.count) * Math.PI * 2
      const spot = nav.nearestFree({ x: camp.center.x + Math.sin(angle) * 2.2, z: camp.center.z + Math.cos(angle) * 2.2 })
      camp.giants.push(this.addGiant(GRUNT, spot ?? camp.center))
    }
  }

  private spawnBoss(): void {
    this.boss = this.bossHome ? this.addGiant(KING, this.bossHome) : null
  }

  private cleanUp(dt: number, hero: { x: number; z: number }): void {
    for (let i = this.giants.length - 1; i >= 0; i--) {
      const giant = this.giants[i]!
      if (!giant.gone) continue
      giant.dispose()
      this.giants.splice(i, 1)
    }
    const far = (p: Point2) => Math.hypot(p.x - hero.x, p.z - hero.z) > RESPAWN_CLEAR_DISTANCE

    for (const camp of this.camps) {
      camp.giants = camp.giants.filter((g) => !g.gone)
      if (camp.giants.length > 0) {
        camp.respawn = CAMP_RESPAWN
        continue
      }
      camp.respawn -= dt
      if (camp.respawn <= 0 && far(camp.center)) this.fillCamp(camp)
    }

    if (this.boss?.gone) {
      this.boss = null
      this.bossRespawn = BOSS_RESPAWN
    }
    if (!this.boss) {
      this.bossRespawn -= dt
      if (this.bossHome && this.bossRespawn <= 0 && far(this.bossHome)) this.spawnBoss()
    }
  }
}

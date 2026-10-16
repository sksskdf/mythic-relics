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
  boss: { x: number; z: number }
}

/** 테스트 맵의 적 배치: 시작 지점 둘레에 졸개 무리 셋, 북쪽 공터에 거인 왕 */
export const TEST_ENCOUNTER: EncounterLayout = {
  camps: [
    { x: 11, z: 9, count: 3 },
    { x: -13, z: 5, count: 4 },
    { x: -4, z: -15, count: 3 },
  ],
  boss: { x: 4, z: -27 },
}

type WorldBase = Omit<GiantWorld, 'nav' | 'giants' | 'summon'>

/**
 * 전투 맵의 적들을 관리한다. 무리 배치, 거인 왕, 포효로 불려 온 졸개, 다시 나타나기까지.
 */
export class Encounter {
  readonly giants: Giant[] = []
  readonly object = new THREE.Group()
  boss: Giant | null = null

  private readonly camps: Camp[]
  private readonly bossHome: Point2
  private bossRespawn = 0
  private readonly navs = new Map<GiantSpec, NavGrid>()
  private seed = 1
  private readonly pendingSummons: Point2[] = []

  constructor(
    layout: EncounterLayout,
    staticColliders: readonly CircleCollider[],
    halfExtent: number,
  ) {
    for (const spec of [GRUNT, KING]) {
      this.navs.set(spec, new NavGrid(halfExtent, 0.5, staticColliders, spec.radius))
    }
    const gruntNav = this.navs.get(GRUNT)!
    this.camps = layout.camps.map((c) => ({
      center: gruntNav.nearestFree(c) ?? c,
      count: c.count,
      giants: [],
      respawn: CAMP_RESPAWN,
    }))
    this.bossHome = this.navs.get(KING)!.nearestFree(layout.boss) ?? layout.boss
    for (const camp of this.camps) this.fillCamp(camp)
    this.spawnBoss()
  }

  /** 살아 있는 적들 (주인공의 공격 대상) */
  get alive(): Giant[] {
    return this.giants.filter((g) => g.alive)
  }

  /** 주인공과 다른 거인이 비켜 가야 하는 원들 */
  colliders(): CircleCollider[] {
    return this.giants.filter((g) => g.alive).map((g) => g.collider)
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
    this.boss = this.addGiant(KING, this.bossHome)
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
      if (this.bossRespawn <= 0 && far(this.bossHome)) this.spawnBoss()
    }
  }
}

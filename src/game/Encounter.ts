import * as THREE from 'three'

import { ELITE_CHANCE, ELITE_KINDS } from '../enemies/elite'
import { ENEMIES, Giant, GRUNT, type GiantSpec, type GiantWorld, KING } from '../enemies/Giant'
import type { CircleCollider, Point2 } from '../world/colliders'
import { NavGrid } from '../world/navGrid'

/** 졸개 무리가 모여 있는 곳 */
interface Camp {
  center: Point2
  count: number
  /** 무리를 이루는 적 (돌아가며 채운다). 비면 졸개 */
  members: readonly GiantSpec[]
  giants: Giant[]
  /** 전멸한 뒤 다시 나타나기까지 남은 시간 */
  respawn: number
}

/** 다시 나타날 때, 주인공이 이보다 가까이 있으면 기다린다. */
const RESPAWN_CLEAR_DISTANCE = 10
const CAMP_RESPAWN = 25
const BOSS_RESPAWN = 45
/** 부르기로 늘어나는 적의 상한: 살아 있는 적이 이만큼이면 더 부르지 않는다 */
const SUMMON_CAP = 24

export interface EncounterLayout {
  /** members: 무리를 이루는 적 id (E8, 없으면 졸개) */
  camps: { x: number; z: number; count: number; members?: readonly string[] }[]
  /** 보스 자리와 보스 (마을처럼 보스가 없는 지역은 null, enemy가 없으면 거인 왕) */
  boss: { x: number; z: number; enemy?: string } | null
  /** 정예 확률에 더하는 값 (깊은 땅, E15) */
  elite?: number
  /** 무리와 보스가 다시 나타나는가 (균열 층은 한 번뿐, E17) */
  respawn?: boolean
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
  private readonly pendingSummons: { point: Point2; spec: GiantSpec }[] = []
  /** 이 지역의 보스 */
  private bossSpec: GiantSpec = KING
  /** 무리 하나에 정예가 섞일 확률 (점검할 때 0이나 1로 바꾼다) */
  eliteChance = ELITE_CHANCE
  /** 무리·보스가 다시 나타나는가 */
  private respawns = true
  /** 지금 지역이 더하는 정예 확률 (깊은 땅) */
  private regionElite = 0
  /** 위협 단계 배율 (E14-03): 새로 세우는 적에 건다 */
  threat = { hp: 1, damage: 1 }
  /** 정예를 고를 때 쓰는 난수 (점검할 때 바꿔 끼운다) */
  rng: () => number = Math.random

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
    this.regionElite = layout.elite ?? 0
    this.respawns = layout.respawn ?? true
    const gruntNav = this.navs.get(GRUNT)!
    this.camps = layout.camps.map((c) => ({
      center: gruntNav.nearestFree(c) ?? c,
      count: c.count,
      members: (c.members ?? []).map((id) => ENEMIES[id] ?? GRUNT),
      giants: [],
      respawn: CAMP_RESPAWN,
    }))
    this.bossSpec = (layout.boss?.enemy && ENEMIES[layout.boss.enemy]) || KING
    this.bossHome = layout.boss ? (this.navFor(this.bossSpec).nearestFree(layout.boss) ?? layout.boss) : null
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
  /** 무리와 보스가 모두 쓰러졌다 (균열 층을 깼다, E17) */
  get cleared(): boolean {
    return this.camps.every((c) => c.giants.every((g) => !g.alive)) && !this.boss?.alive && this.giants.every((g) => !g.alive)
  }

  get bossEngaged(): boolean {
    const boss = this.boss
    return !!boss && boss.alive && boss.state !== 'idle' && boss.state !== 'return'
  }

  update(dt: number, base: WorldBase): Giant[] {
    const shattered: Giant[] = []
    for (const giant of this.giants) {
      const nav = this.navFor(giant.spec)
      giant.update(dt, {
        ...base,
        nav,
        giants: this.giants,
        summon: (x, z, count, enemy) => this.queueSummon(x, z, count, enemy),
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
    const nav = this.navFor(spec)
    const giant = this.addGiant(spec, nav.nearestFree(home) ?? home)
    if (alert) giant.alert()
    return giant
  }

  /** 적 id로 세운다 (점검 스크립트용). 없는 id면 null */
  spawnById(id: string, home: Point2, alert: boolean): Giant | null {
    const spec = ENEMIES[id]
    return spec ? this.spawn(spec, home, alert) : null
  }

  /** 거인을 바로 지운다. (승급 전설에 실패했을 때) */
  remove(giant: Giant): void {
    const index = this.giants.indexOf(giant)
    if (index < 0) return
    giant.dispose()
    this.giants.splice(index, 1)
  }

  /** 덩치에 맞는 길찾기 격자: 큰 적은 거인 왕 격자, 나머지는 졸개 격자 */
  private navFor(spec: GiantSpec): NavGrid {
    return this.navs.get(spec) ?? this.navs.get(spec.radius >= 1.2 ? KING : GRUNT)!
  }

  private queueSummon(x: number, z: number, count: number, enemy?: string): void {
    const spec = (enemy && ENEMIES[enemy]) || GRUNT
    const room = SUMMON_CAP - this.giants.filter((g) => g.alive).length - this.pendingSummons.length
    count = Math.min(count, room)
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random()
      this.pendingSummons.push({ point: { x: x + Math.sin(angle) * 4, z: z + Math.cos(angle) * 4 }, spec })
    }
  }

  private flushSummons(): void {
    for (const { point, spec } of this.pendingSummons.splice(0)) {
      const spot = this.navFor(spec).nearestFree(point) ?? point
      this.addGiant(spec, spot).alert()
    }
  }

  private addGiant(spec: GiantSpec, home: Point2): Giant {
    const giant = new Giant(spec, home, this.seed++)
    if (this.threat.hp !== 1 || this.threat.damage !== 1) giant.applyThreat(this.threat)
    this.giants.push(giant)
    this.object.add(giant.object)
    return giant
  }

  private fillCamp(camp: Camp): void {
    const nav = this.navs.get(GRUNT)!
    for (let i = 0; i < camp.count; i++) {
      const angle = (i / camp.count) * Math.PI * 2
      const spot = nav.nearestFree({ x: camp.center.x + Math.sin(angle) * 2.2, z: camp.center.z + Math.cos(angle) * 2.2 })
      const spec = camp.members.length > 0 ? camp.members[i % camp.members.length]! : GRUNT
      camp.giants.push(this.addGiant(spec, spot ?? camp.center))
    }
    // 가끔 한 마리가 정예로 나온다 (부르는 적은 빼고: 정예 졸개가 끝없이 불어나지 않게)
    if (this.rng() < this.eliteChance + this.regionElite) {
      const candidates = camp.giants.filter((g) => g.spec.role !== 'summoner')
      const pick = candidates[Math.floor(this.rng() * candidates.length)]
      pick?.makeElite(ELITE_KINDS[Math.floor(this.rng() * ELITE_KINDS.length)]!)
    }
  }

  private spawnBoss(): void {
    this.boss = this.bossHome ? this.addGiant(this.bossSpec, this.bossHome) : null
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
      if (this.respawns && camp.respawn <= 0 && far(camp.center)) this.fillCamp(camp)
    }

    if (this.boss?.gone) {
      this.boss = null
      this.bossRespawn = BOSS_RESPAWN
    }
    if (!this.boss) {
      this.bossRespawn -= dt
      if (this.respawns && this.bossHome && this.bossRespawn <= 0 && far(this.bossHome)) this.spawnBoss()
    }
  }
}

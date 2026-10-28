import * as THREE from 'three'

import { landScale } from '../data/chapters'
import { ELITE_CHANCE, ELITE_KINDS } from '../enemies/elite'
import { ENEMIES, Giant, GRUNT, type GiantSpec, type GiantWorld, KING } from '../enemies/Giant'
import { type CircleCollider, inArea, type Point2, pushOut, type WalkArea } from '../world/colliders'
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
  /** 어느 땅의 배치인가 (E19: 이웃 땅에 남겨 둔 무리를 알아보려고). 없으면 이름 없는 땅 */
  id?: string
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

/** 한 땅의 무리와 보스 (E19: 지금 땅이 아니면 이웃 땅에 남겨 둔다) */
interface Herd {
  camps: Camp[]
  bossHome: Point2 | null
  bossSpec: GiantSpec
  boss: Giant | null
  bossRespawn: number
  elite: number
  /** 그 땅 적의 세기 (E22-02, 처음 땅 = 1) */
  power: number
  respawns: boolean
}

/** 이웃 땅에 남겨 둔 무리: 그 땅의 적들은 그 자리에 서서 숨쉬기만 한다 */
interface Parked {
  herd: Herd
  giants: Giant[]
}

/** 이웃 땅 하나: 그 땅의 배치와, 지금 땅 좌표로 옮길 만큼 (그 칸 자리 − 지금 칸 자리), 그 땅의 소품 충돌체 (지금 땅 좌표) */
export interface NeighborLayout {
  id: string
  layout: EncounterLayout
  offset: Point2
  colliders?: readonly CircleCollider[]
}

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
  private readonly pendingSummons: { point: Point2; spec: GiantSpec; ward: boolean }[] = []
  /**
   * 닫힌 결계 (승급 전설·시련): 결계 안에 세운 적(members)과 그 적이 부른 졸개만 주인공을 본다. 나머지 적은 결계 안의
   * 주인공을 알아채지 못하고, 쫓던 적은 제자리로 돌아간다 (성소 둘레 무리가 몰려와 전설이 들쭉날쭉하지 않게)
   */
  ward: { members: Set<Giant> } | null = null
  /** 이 지역의 보스 */
  private bossSpec: GiantSpec = KING
  /** 무리 하나에 정예가 섞일 확률 (점검할 때 0이나 1로 바꾼다) */
  eliteChance = ELITE_CHANCE
  /** 무리·보스가 다시 나타나는가 */
  private respawns = true
  /** 지금 지역이 더하는 정예 확률 (깊은 땅) */
  private regionElite = 0
  /** 지금 땅 적의 세기 (E22-02) */
  private regionPower = 1
  /** 땅 id → 그 땅 적의 세기 (장 데이터의 적 지수, E22-02). 생명은 그만큼, 피해는 landScale을 따른다 */
  landPower: (id: string | undefined) => number = () => 1
  /** 위협 단계 배율 (E14-03): 새로 세우는 적에 건다 */
  threat = { hp: 1, damage: 1 }
  /** 결계 안(전설·시련)에 따로 세우는 적의 배율. 없으면 threat (시련 난이도가 결계 밖 무리·보스에 번지지 않게) */
  arenaThreat: { hp: number; damage: number } | null = null
  /** 정예를 고를 때 쓰는 난수 (점검할 때 바꿔 끼운다) */
  rng: () => number = Math.random
  /** 지금 땅 (E19) */
  private region: string | null = null
  /** 이웃 땅에 남겨 둔 무리 (E19) */
  private readonly parked = new Map<string, Parked>()
  /** 아직 세우지 않은 이웃 무리와, 지금 세우고 있는 것 (한 프레임에 무리 하나씩) */
  private queue: NeighborLayout[] = []
  private building: { id: string; steps: Generator<void, Parked> } | null = null
  /** 마지막으로 받은 이웃 땅들 (무리를 처음처럼 다시 세울 때) */
  private neighbors: readonly NeighborLayout[] = []

  constructor(layout: EncounterLayout, staticColliders: readonly CircleCollider[], bounds: number | WalkArea, landPower?: (id: string | undefined) => number) {
    if (landPower) this.landPower = landPower
    for (const spec of [GRUNT, KING]) {
      this.navs.set(spec, new NavGrid(bounds, 0.5, staticColliders, spec.radius))
    }
    this.region = layout.id ?? null
    this.place(layout)
  }

  /** 걸을 수 있는 곳이 바뀌었다 (결계가 풀림, E22-02): 길찾기 격자만 다시 짓는다 */
  setArea(bounds: number | WalkArea, staticColliders: readonly CircleCollider[]): void {
    for (const nav of this.navs.values()) nav.rebuild(bounds, staticColliders)
  }

  /** 지역을 바꿨다(또는 편집했다): 거인을 모두 지우고 새 배치로 다시 세운다. 이웃 땅에 남겨 둔 무리도 지운다 */
  reset(layout: EncounterLayout, staticColliders: readonly CircleCollider[], bounds: number | WalkArea): void {
    for (const giant of [...this.giants]) this.remove(giant)
    this.pendingSummons.length = 0
    this.setNeighbors([])
    for (const nav of this.navs.values()) nav.rebuild(bounds, staticColliders)
    this.region = layout.id ?? null
    this.place(layout)
  }

  private place(layout: EncounterLayout): void {
    const gruntNav = this.navs.get(GRUNT)!
    this.load(this.newHerd(layout, (p) => gruntNav.nearestFree(p) ?? p, { x: 0, z: 0 }))
    for (const camp of this.camps) this.fillCamp(camp)
    this.spawnBoss()
  }

  /** 배치로 새 무리 상태를 만든다 (적은 아직 세우지 않음). snap: 바위·나무에 걸린 자리를 빈 곳으로 */
  private newHerd(layout: EncounterLayout, snap: (p: Point2) => Point2, offset: Point2): Herd {
    const at = (p: Point2) => snap({ x: p.x + offset.x, z: p.z + offset.z })
    const bossSpec = (layout.boss?.enemy && ENEMIES[layout.boss.enemy]) || KING
    return {
      camps: layout.camps.map((c) => ({
        center: at(c),
        count: c.count,
        members: (c.members ?? []).map((id) => ENEMIES[id] ?? GRUNT),
        giants: [],
        respawn: CAMP_RESPAWN,
      })),
      bossHome: layout.boss ? at(layout.boss) : null,
      bossSpec,
      boss: null,
      bossRespawn: 0,
      elite: layout.elite ?? 0,
      power: this.landPower(layout.id),
      respawns: layout.respawn ?? true,
    }
  }

  /** 무리 상태를 지금 땅의 것으로 삼는다 */
  private load(herd: Herd): void {
    this.camps = herd.camps
    this.bossHome = herd.bossHome
    this.bossSpec = herd.bossSpec
    this.boss = herd.boss
    this.bossRespawn = herd.bossRespawn
    this.regionElite = herd.elite
    this.regionPower = herd.power
    this.respawns = herd.respawns
  }

  /** 지금 땅의 무리 상태 */
  private herd(): Herd {
    return { camps: this.camps, bossHome: this.bossHome, bossSpec: this.bossSpec, boss: this.boss, bossRespawn: this.bossRespawn, elite: this.regionElite, power: this.regionPower, respawns: this.respawns }
  }

  /**
   * 이웃 땅들 (E19): 지금 땅 둘레에 그려지는 땅의 무리를 미리 세워 그 자리에 둔다(넘어갔을 때 갑자기 나타나지 않게).
   * 이웃이 아니게 된 땅의 무리는 지운다. 새로 세울 무리는 buildStep으로 한 프레임에 무리 하나씩.
   */
  setNeighbors(list: readonly NeighborLayout[]): void {
    this.neighbors = list
    const keep = new Set(list.map((n) => n.id))
    for (const [id, parked] of this.parked) {
      if (keep.has(id)) continue
      for (const giant of parked.giants) giant.dispose()
      this.parked.delete(id)
    }
    if (this.building && !keep.has(this.building.id)) {
      this.building.steps.return(null as never)
      this.building = null
    }
    this.queue = list.filter((n) => !this.parked.has(n.id) && n.id !== this.region && n.id !== this.building?.id)
  }

  /** 이웃 무리를 하나 세운다 (땅 조각을 짓지 않는 프레임에 부른다). 세웠으면 true */
  buildStep(): boolean {
    if (this.queue.length === 0 && !this.building) return false
    this.buildNext()
    return true
  }

  /** 이웃 무리를 모두 바로 세운다 (점검용) */
  flushNeighbors(): void {
    while (this.queue.length > 0 || this.building) this.buildNext()
  }

  /** 이웃 땅에 남겨 둔 적들 (점검용) */
  get parkedGiants(): Giant[] {
    return [...this.parked.values()].flatMap((p) => p.giants)
  }

  private buildNext(): void {
    if (!this.building) {
      const next = this.queue.shift()
      if (!next) return
      this.building = { id: next.id, steps: this.neighborSteps(next) }
    }
    const step = this.building.steps.next()
    if (!step.done) return
    this.parked.set(this.building.id, step.value)
    this.building = null
  }

  /** 이웃 땅의 무리를 무리 하나씩 세운다. 길찾기 격자가 없는 땅이라 그 땅의 바위·나무에서 밀어내기만 한다 */
  private *neighborSteps(n: NeighborLayout): Generator<void, Parked> {
    const colliders = n.colliders ?? []
    const clear = (p: Point2) => pushOut(p, GRUNT.radius + 0.4, colliders)
    const herd = this.newHerd(n.layout, clear, n.offset)
    const giants: Giant[] = []
    for (const camp of herd.camps) {
      this.fillCamp(camp, herd.elite, clear, giants, herd.power)
      yield
    }
    if (herd.bossHome) {
      herd.boss = this.makeGiant(herd.bossSpec, herd.bossHome, this.scaled(herd.power))
      giants.push(herd.boss)
    }
    for (const giant of giants) giant.park()
    return { herd, giants }
  }

  /**
   * 걸어서 이웃 땅으로 넘어갔다 (E19). 모든 적을 shift만큼 옮기고, 앞 땅의 무리는 이웃 땅에 남겨 둔다.
   * 넘어간 땅에 남겨 둔 무리가 있으면 그대로 깨우고, 없으면 새로 세운다.
   * 주인공을 쫓던 적(과 쓰러지는 중인 적) 가운데 넘어간 땅 안에 있는 것은 그대로 남아 쫓는다.
   */
  cross(to: EncounterLayout, shift: Point2, staticColliders: readonly CircleCollider[], area: WalkArea): void {
    // 짓던 이웃 무리는 마저 지어 함께 옮긴다
    while (this.building) this.buildNext()
    const { x: dx, z: dz } = shift
    const move = (p: Point2 | null) => {
      if (!p) return
      p.x += dx
      p.z += dz
    }
    for (const giant of this.giants) giant.shift(dx, dz)
    for (const { herd, giants } of this.parked.values()) {
      for (const giant of giants) giant.shift(dx, dz)
      for (const camp of herd.camps) move(camp.center)
      move(herd.bossHome)
    }
    for (const camp of this.camps) move(camp.center)
    move(this.bossHome)
    for (const summon of this.pendingSummons) move(summon.point)
    for (const nav of this.navs.values()) nav.rebuild(area, staticColliders)

    const follow = (g: Giant) => !g.alive || (g.state !== 'idle' && inArea(area, g.x, g.z))
    const stay = this.giants.filter(follow)
    const leave = this.giants.filter((g) => !follow(g))
    // 앞 땅의 무리: 따라온 적은 무리에서 빼고(그 무리는 비면 나중에 다시 채워진다) 나머지는 그 자리에 세워 둔다
    const herd = this.herd()
    for (const camp of herd.camps) camp.giants = camp.giants.filter((g) => !stay.includes(g))
    if (herd.boss && stay.includes(herd.boss)) herd.boss = null
    for (const giant of leave) giant.park()
    if (this.region) this.parked.set(this.region, { herd, giants: leave })
    else for (const giant of leave) giant.dispose()

    this.giants.length = 0
    this.giants.push(...stay)
    this.region = to.id ?? null
    const waiting = to.id ? this.parked.get(to.id) : undefined
    if (waiting) {
      this.parked.delete(to.id!)
      const gruntNav = this.navs.get(GRUNT)!
      for (const camp of waiting.herd.camps) camp.center = gruntNav.nearestFree(camp.center) ?? camp.center
      // 길찾기 격자 없이 세운 거인들이라, 집 자리가 막힌 칸이면 가까운 빈 칸으로 (돌아가다 끝없이 맴돌지 않게)
      for (const giant of waiting.giants) {
        const home = this.navFor(giant.spec).nearestFree(giant.home)
        if (home) Object.assign(giant.home, { x: home.x, z: home.z })
      }
      this.load(waiting.herd)
      this.giants.push(...waiting.giants.filter((g) => !g.gone))
    } else {
      this.place(to)
    }
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
    for (const parked of this.parked.values()) for (const giant of parked.giants) giant.rest(dt)
    const shattered: Giant[] = []
    const ward = this.ward
    // 결계 밖의 적에게는 주인공(과 분신)이 없는 것처럼 보인다
    const unseen = ward ? { ...base, hero: { ...base.hero, alive: false }, decoy: null } : base
    for (const giant of this.giants) {
      const nav = this.navFor(giant.spec)
      const member = ward?.members.has(giant) ?? false
      giant.update(dt, {
        ...(ward && !member ? unseen : base),
        nav,
        giants: this.giants,
        summon: (x, z, count, enemy) => this.queueSummon(x, z, count, enemy, member),
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

  /** 모든 거인을 지우고 무리와 거인 왕을 처음처럼 다시 세운다 (위협 단계가 바뀌었을 때·개발 패널). 이웃 땅의 무리도 다시 세운다 */
  resetAll(): void {
    for (const giant of [...this.giants]) this.remove(giant)
    for (const camp of this.camps) {
      camp.giants = []
      this.fillCamp(camp)
    }
    this.spawnBoss()
    const neighbors = this.neighbors
    this.setNeighbors([])
    this.setNeighbors(neighbors)
  }

  /** 개발 패널: 살아 있는 거인을 모두 지운다. (무리는 정해진 시간 뒤 다시 나타난다) */
  clearAll(): void {
    for (const giant of [...this.giants]) this.remove(giant)
    for (const camp of this.camps) camp.giants = []
    this.boss = null
  }

  /** 승급 전설 등에서 거인을 따로 세운다. alert면 바로 주인공을 쫓는다. 시련 배율이 없으면 그 땅의 세기를 건다 */
  spawn(spec: GiantSpec, home: Point2, alert: boolean): Giant {
    const nav = this.navFor(spec)
    const giant = this.addGiant(spec, nav.nearestFree(home) ?? home, this.arenaThreat ?? this.scaled(this.regionPower))
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

  /** ward: 결계 안의 적이 부른 졸개 (그 졸개도 결계 안에서 싸운다) */
  private queueSummon(x: number, z: number, count: number, enemy?: string, ward = false): void {
    const spec = (enemy && ENEMIES[enemy]) || GRUNT
    const room = SUMMON_CAP - this.giants.filter((g) => g.alive).length - this.pendingSummons.length
    count = Math.min(count, room)
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random()
      this.pendingSummons.push({ point: { x: x + Math.sin(angle) * 4, z: z + Math.cos(angle) * 4 }, spec, ward })
    }
  }

  private flushSummons(): void {
    for (const { point, spec, ward } of this.pendingSummons.splice(0)) {
      const spot = this.navFor(spec).nearestFree(point) ?? point
      const giant = this.addGiant(spec, spot)
      giant.alert()
      if (ward) this.ward?.members.add(giant)
    }
  }

  /** 위협 단계 배율에 그 땅의 세기를 곱한다 (E22-02) */
  private scaled(power: number): { hp: number; damage: number } {
    const land = landScale(power)
    return { hp: this.threat.hp * land.hp, damage: this.threat.damage * land.damage }
  }

  private addGiant(spec: GiantSpec, home: Point2, threat = this.scaled(this.regionPower)): Giant {
    const giant = this.makeGiant(spec, home, threat)
    this.giants.push(giant)
    return giant
  }

  /** 거인을 만들어 장면에 놓는다 (지금 땅의 적 목록에는 넣지 않음) */
  private makeGiant(spec: GiantSpec, home: Point2, threat = this.scaled(this.regionPower)): Giant {
    // 집 자리는 거인마다 따로 (넘어갈 때 거인이 제 집을 옮기므로, 지역 데이터나 무리 자리를 같이 쥐면 함께 움직인다)
    const giant = new Giant(spec, { x: home.x, z: home.z }, this.seed++)
    if (threat.hp !== 1 || threat.damage !== 1) giant.applyThreat(threat)
    this.object.add(giant.object)
    return giant
  }

  /**
   * 무리를 채운다. free로 빈 자리를 찾고(지금 땅은 길찾기 격자), into가 있으면 지금 땅의 적 대신 거기에 넣는다 (이웃 땅)
   */
  private fillCamp(camp: Camp, elite = this.regionElite, free: (p: Point2) => Point2 | null = (p) => this.navs.get(GRUNT)!.nearestFree(p), into: Giant[] | null = null, power = this.regionPower): void {
    const threat = this.scaled(power)
    for (let i = 0; i < camp.count; i++) {
      const angle = (i / camp.count) * Math.PI * 2
      const around = { x: camp.center.x + Math.sin(angle) * 2.2, z: camp.center.z + Math.cos(angle) * 2.2 }
      const spot = free(around)
      const spec = camp.members.length > 0 ? camp.members[i % camp.members.length]! : GRUNT
      const giant = into ? this.makeGiant(spec, spot ?? camp.center, threat) : this.addGiant(spec, spot ?? camp.center, threat)
      into?.push(giant)
      camp.giants.push(giant)
    }
    // 가끔 한 마리가 정예로 나온다 (부르는 적은 빼고: 정예 졸개가 끝없이 불어나지 않게)
    if (this.rng() < this.eliteChance + elite) {
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

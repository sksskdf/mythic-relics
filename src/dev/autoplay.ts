import type { Giant, GiantDanger } from '../enemies/Giant'
import type { Game } from '../game/Game'
import { angleDiff, angleTo, inLine } from '../combat/arc'
import type { SourceId } from '../data/schema'
import { nextHop } from '../data/regions'
import { forgeReady } from '../gear/forge'
import { gearScore } from '../gear/roll'
import { mythRelic } from '../gear/mythRelic'
import { type God, godDef, isRelicId, relicDef } from '../relics/data'
import type { Point2 } from '../world/colliders'

/** 판단 간격 (초). 사람의 반응 속도쯤으로 둔다. */
const THINK = 0.25
/** 예고 범위에서 이만큼 더 떨어져야 안전하다고 본다. */
const MARGIN = 0.7
/** 피하거나 물러날 때 출구에서 이만큼은 떨어진다 */
const EXIT_CLEAR = 3.5
/** 싸울 상대가 없을 때 돌아다니는 길 (사람이 적을 찾아 맵을 둘러보는 것처럼) */

/**
 * 자동 플레이 검증용 봇.
 * 플레이어와 똑같이 이동 명령(클릭과 같은 hero.moveTo)만 내린다. 공격·스킬·궁극기는 게임이 자동으로 쓴다.
 * 화면에 보이는 정보(예고 범위, 생명력, 유물 빛기둥, 성소 빛기둥)만 보고 판단한다.
 */
export class Autoplayer {
  private thinkTimer = 0
  private patrol = 0
  /** 위협 단계를 올리는가: 열리면 마을에 가서 원천 갈래를 고르고 오른다 (scripts/playtest.mjs --threat) */
  climb = false
  /** 원천 갈래로 고를 원천 (없으면 장비에 가장 많은 원천) */
  source: SourceId | null = null
  /** 위협 단계를 처음 오른 게임 시각 */
  readonly climbs: number[] = []
  /** 이 신의 유물만 낀다 (다른 신 유물은 주우면 가방에 넣는다). null이면 가리지 않는다 (scripts/playtest.mjs --god) */
  god: God | null = null
  /** 다른 지역으로 가지 않고 이 자리에서만 싸운다 (scripts/enemy-trial.mjs) */
  stay = false
  /** 마지막 생각이 끝난 단계 (멈춤을 찾을 때) */
  step = 0

  constructor(private readonly game: Game) {}

  /** 게임 시간 seconds초 동안 자동으로 플레이한다. */
  run(seconds: number): void {
    const step = 1 / 30
    for (let t = 0; t < seconds; t += step) {
      this.thinkTimer -= step
      if (this.thinkTimer <= 0) {
        this.thinkTimer = THINK
        this.think()
        if (this.climb) this.climbUp()
      }
      this.game.advance(step, step)
    }
  }

  /** 위협 단계: 마을에 있고 다음 단계가 열렸으면, 정한 원천(없으면 장비에 가장 많은 원천)에 붓고 오른다 */
  private climbUp(): void {
    const { threat, threatSystem, region } = this.game
    if (region.kind !== 'hub' || threat.unlocked <= threat.reached) return
    const rows = this.game.sourceRows()
    const pick = this.source ?? rows.reduce((a, b) => (b.total > a.total ? b : a)).id
    if (threatSystem.advance(pick)) this.climbs.push(this.game.time)
  }

  /** 벼리기에 실패한 신화 (재료가 늘면 다시 해 본다) */
  private readonly forgeBlocked = new Set<God>()
  private forgeMaterials = 0
  /** 출구 위에서 안쪽으로 물러나는 중 */
  private backing = false

  /** 봇이 벼릴 신화: 고른 신화, 그다음 열린 신화 (실패한 것은 재료가 늘 때까지 빼고) */
  private forgeGods(): God[] {
    const total = [...this.game.powers.loadout.materials.values()].reduce((a, b) => a + b, 0)
    if (total !== this.forgeMaterials) {
      this.forgeMaterials = total
      this.forgeBlocked.clear()
    }
    const chosen = this.game.powers.manifested
    const open = this.game.progress.opened.filter((g) => g !== chosen)
    return (chosen ? [chosen, ...open] : open).filter((g) => !this.forgeBlocked.has(g))
  }

  /** 가야 할 필드 (E7): 승급할 때가 된 신의 땅, 한 신만 쓰면 그 신의 땅, 아니면 지금 필드(마을이면 미드가르드) */
  private wantRegion(): string {
    const { powers, progress, region, regions } = this.game
    const fieldOf = (god: God) => Object.values(regions).find((r) => r.realm === godDef(god).realm && r.zone === 'entrance')?.id
    const manifested = powers.manifested
    if (manifested && godDef(manifested).legend && progress.readyToPromote(manifested)) return fieldOf(manifested) ?? region.id
    // 벼릴 재료가 차면 마을 대장간으로 (E13-08)
    const hub = Object.values(regions).find((r) => r.kind === 'hub')?.id ?? region.id
    if (this.forgeGods().some((god) => forgeReady(powers.loadout, god))) return hub
    // 위협 단계가 새로 열렸으면 마을 촌장에게 (E14-07)
    const threat = this.game.threat
    if (this.climb && threat.unlocked > threat.reached) return hub
    // 2단계 뒤에는 고른 신화(없으면 북유럽)의 보스의 땅으로 가서 문지기를 친다 (E15: 보스는 보스의 땅에만)
    if (this.climb && progress.promotions >= 1 && threat.unlocked === threat.reached && threat.level === threat.reached) {
      const realm = manifested ? godDef(manifested).realm : 'norse'
      const bossLand = Object.values(regions).find((r) => r.zone === 'boss' && r.realm === realm)?.id
      if (bossLand) return bossLand
    }
    const here = region.kind === 'field' ? region.id : 'midgard'
    // 히든 신화는 자기 땅이 없어 지금 필드(마을이면 미드가르드)에서 싸운다
    if (this.god) return fieldOf(this.god) ?? here
    return here
  }

  /** 다른 지역으로 가야 하면 출구로 걷는다 (마을을 거쳐 간다). 걸었으면 true */
  private travel(): boolean {
    const { region, hero, legend } = this.game
    if (legend.active || this.stay) return false
    const want = this.wantRegion()
    if (want === region.id) return false
    const hop = nextHop(region.id, want, this.game.regions)
    const exit = region.exits.find((e) => e.to === hop) ?? region.exits.find((e) => this.game.regions[e.to]?.kind === 'hub')
    if (!exit) return false
    const at = dist(hero.object.position, exit)
    // 방금 그 출구로 들어와 그 위에 서 있으면, 출구는 한 번 벗어나야 다시 밟히므로 안쪽으로 한 걸음 물러난다
    // 물러나는 동안에는 출구로 다시 걷지 않는다 (출구가 다시 밟히는 거리까지 벗어날 때까지)
    if (this.backing && at < 3.6 && hero.isMoving) return true
    this.backing = false
    if (at < 2 && !hero.isMoving) {
      const len = Math.hypot(exit.x, exit.z) || 1
      hero.moveTo({ x: exit.x - (exit.x / len) * 5, z: exit.z - (exit.z / len) * 5 })
      this.backing = true
      return true
    }
    if (!hero.isMoving || at > 1) hero.moveTo(exit)
    return true
  }

  private think(): void {
    const { hero, combat, encounter, pickups, legend, progress, powers } = this.game
    if (!combat.alive) return void (this.step = 1)
    const p = hero.object.position
    const here = { x: p.x, z: p.z }
    const enemies = encounter.alive

    // 1. 예고 범위 안에 있으면 빠져나간다.
    const dangers = enemies.flatMap((g) => g.dangers)
    if (dangers.some((d) => inDanger(here, d, MARGIN))) {
      const escape = this.findEscape(here, dangers)
      if (escape) hero.moveTo(escape)
      this.step = 2
      return
    }
    // 피했으면 예고가 끝날 때까지 다시 들어가지 않는다.
    if (dangers.length > 0 && hero.isMoving) return void (this.step = 3)

    // 2. 생명력이 낮으면 물러나 회복한다. (전설 결계 안에서는 물러날 곳이 없다)
    const hp = combat.health.ratio
    const near = enemies.filter((g) => dist(g, here) < 9)
    if (hp < 0.35 && near.length > 0 && !legend.active) {
      hero.moveTo(this.retreatPoint(here, near))
      this.step = 4
      return
    }
    if (hp < 0.7 && near.length === 0 && !legend.active && !hero.isMoving) return void (this.step = 5)

    // 3. 떨어진 유물을 줍는다. 한 신만 쓰는 봇은 다른 신 유물을 가방에 넣는다.
    if (this.god) {
      powers.loadout.relics.forEach((id, slot) => id && relicDef(id).god !== this.god && this.game.dev.stow(slot))
    }
    // 정한 신이 있으면 그 신화가 열리는 대로 고른다 (사람은 마을·성소에서 고른다)
    if (this.god && powers.manifested !== this.god && this.game.progress.isOpen(this.god)) this.game.dev.choose(this.god)
    // 고른 신화의 유물이 가방에 있으면 그 부위 칸에 낀다 (대장간에서 만든 유물이 가방으로 들어간 때)
    const own = powers.manifested ? mythRelic(powers.manifested) : null
    if (own && powers.loadout.bag.includes(own)) {
      const slots = powers.loadout.slots.map((_, i) => i).filter((i) => powers.loadout.fits(own, i))
      const target = slots.find((i) => powers.loadout.slots[i] === null) ?? slots.find((i) => !isRelicId(powers.loadout.slots[i] ?? ''))
      if (target !== undefined) this.game.dev.wield(own, target)
    }
    // 가방의 일반 장비가 더 좋으면 바꿔 낀다 (빈 칸이면 그냥 낀다, 유물은 빼지 않는다) (E13-08)
    for (const id of [...powers.loadout.bag]) {
      const item = powers.loadout.gear.get(id)
      if (!item) continue
      const slots = powers.loadout.slots.map((_, i) => i).filter((i) => powers.loadout.fits(id, i))
      const target = slots.find((i) => powers.loadout.slots[i] === null) ?? slots.find((i) => {
        const worn = powers.loadout.gear.get(powers.loadout.slots[i] ?? '')
        return worn !== undefined && gearScore(worn) < gearScore(item)
      })
      if (target !== undefined) this.game.dev.wield(id, target)
    }
    // 마을에 있으면 벼릴 수 있는 것을 모두 벼린다 (고른 신화부터)
    // 벼리기에 실패한 신화는 재료가 바뀔 때까지 건너뛴다 (마을에 갇히지 않게)
    if (this.game.region.kind === 'hub') {
      for (const god of this.forgeGods()) if (forgeReady(powers.loadout, god) && !this.game.dev.forge(god)) this.forgeBlocked.add(god)
    }
    // 칸이 차 있어도 줍는다 (가방에 들어가고, 모이면 바꿔 낀다)
    if (!legend.active) {
      const pickup = nearest(pickups.list.filter((i) => !powers.loadout.has(i.id) && (i.gear !== undefined || !this.god || relicDef(i.id).god === this.god)), here)
      if (pickup && near.length < 3) {
        hero.moveTo(pickup)
        this.step = 6
        return
      }
    }

    // 4. 다른 땅으로 가야 하면 출구로 (마을에서 시작하면 필드로, 승급할 때가 되면 그 신의 땅으로)
    if (this.travel()) return void (this.step = 7)

    // 5. 승급 준비가 되면 성소로 간다.
    const manifested = powers.manifested
    if (!legend.active && legend.present && manifested && godDef(manifested).legend && progress.readyToPromote(manifested) && hp > 0.8) {
      hero.moveTo(legend.center)
      this.step = 8
      return
    }

    // 6. 싸울 상대를 고른다. 거인 왕은 유물이 둘 이상이고 생명력이 넉넉할 때만 건드린다.
    const worn = powers.loadout.slots.filter((id) => id !== null).length
    const boss = encounter.boss
    const bossOk = worn >= 2 && hp > 0.6
    // 위협 단계를 올리는 봇: 2단계 뒤에는 열린 가장 높은 단계의 문지기(지역 보스)를 찾아간다 (E14-07)
    const threat = this.game.threat
    if (this.climb && !legend.active && progress.promotions >= 1 && threat.unlocked === threat.reached && threat.level === threat.reached && boss?.alive && hp > 0.6) {
      this.step = 11
      this.engage(here, boss)
      return
    }
    let candidates = enemies.filter((g) => {
      if (legend.active) return true
      if (g === boss) return bossOk
      return !boss || !boss.alive || bossOk || dist(g, boss) > 18
    })
    // 거인 왕 둘레의 무리밖에 남지 않았으면 생명력이 넉넉할 때 그 졸개들과 싸운다 (빈 진지만 맴돌지 않게)
    if (candidates.length === 0 && hp > 0.6) candidates = enemies.filter((g) => g !== boss)
    const target = nearest(candidates, here)
    if (!target) {
      // 적이 없으면 무리 자리 근처를 돌며 다시 나타나기를 기다린다 (너무 붙으면 무리가 다시 나타나지 않는다)
      const spawn = this.game.region.spawn
      const patrol = encounter.spots.camps.map((c) => {
        const len = dist(c, spawn) || 1
        const k = Math.min(1, 11 / len)
        return { x: c.x + (spawn.x - c.x) * k, z: c.z + (spawn.z - c.z) * k }
      })
      if (patrol.length === 0) return void (this.step = 9)
      const point = patrol[this.patrol % patrol.length]!
      if (dist(here, point) < 2) this.patrol += 1
      else if (!hero.isMoving) hero.moveTo(point)
      this.step = 10
      return
    }
    this.step = 99
    this.engage(here, target)
  }

  /** 사거리 안까지 다가가 멈춘다. 멈추면 기본 공격이 자동으로 나간다. */
  private engage(here: Point2, target: Giant): void {
    const { hero } = this.game
    const d = dist(here, target)
    const reach = 2 + target.radius
    if (d <= reach - 0.3) {
      hero.stop()
      return
    }
    const want = reach - 0.6
    const k = (d - want) / d
    hero.moveTo({ x: here.x + (target.x - here.x) * k, z: here.z + (target.z - here.z) * k })
  }

  /** 모든 예고 범위 밖이면서 가장 가까운 곳 */
  private findEscape(here: Point2, dangers: GiantDanger[]): Point2 | null {
    const arena = this.game.hero.arena
    let best: Point2 | null = null
    let bestCost = Infinity
    for (const r of [1.5, 2.5, 3.5, 5, 7]) {
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2
        const point = { x: here.x + Math.sin(a) * r, z: here.z + Math.cos(a) * r }
        if (arena && dist(point, arena) > arena.radius - 0.5) continue
        if (dangers.some((d) => inDanger(point, d, MARGIN))) continue
        if (this.nearExit(point)) continue
        // 쉬고 있는 거인 왕 쪽으로는 피하지 않는다 (깨우면 무리와 함께 몰려온다)
        const boss = this.game.encounter.boss
        const cost = r + (boss?.alive && boss.state === 'idle' && dist(boss, point) < 18 ? 10 : 0)
        if (cost < bestCost) {
          bestCost = cost
          best = point
        }
      }
      if (best) return best
    }
    return null
  }

  /** 출구 가까이는 피하거나 물러날 곳으로 고르지 않는다 (밟으면 다른 땅으로 넘어간다) */
  private nearExit(point: Point2): boolean {
    return this.game.region.exits.some((e) => dist(e, point) < EXIT_CLEAR)
  }

  /** 물러날 곳: 둘레 열두 방향 가운데 가까운 적에게서 가장 멀고, 거인 왕을 깨우지 않고, 맵 안인 곳 */
  private retreatPoint(here: Point2, near: Giant[]): Point2 {
    const { encounter, region } = this.game
    const boss = encounter.boss
    const half = region.halfExtent - 2
    let best = here
    let bestScore = -Infinity
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2
      const point = { x: here.x + Math.sin(a) * 10, z: here.z + Math.cos(a) * 10 }
      if (Math.abs(point.x) > half || Math.abs(point.z) > half) continue
      if (this.nearExit(point)) continue
      let score = Math.min(...near.map((g) => dist(g, point)))
      if (boss?.alive && !near.includes(boss) && dist(boss, point) < 18) score -= 20
      if (score > bestScore) {
        bestScore = score
        best = point
      }
    }
    return best
  }

}

function dist(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function nearest<T extends Point2>(items: readonly T[], from: Point2): T | null {
  let best: T | null = null
  let bestDist = Infinity
  for (const item of items) {
    const d = dist(item, from)
    if (d < bestDist) {
      best = item
      bestDist = d
    }
  }
  return best
}

/** 예고 범위 안인가. 충격파(ring)는 안전한 안쪽 원 밖에서 13m 안쪽이 위험하다. */
function inDanger(p: Point2, d: GiantDanger, margin: number): boolean {
  const r = dist(p, d)
  switch (d.kind) {
    case 'circle':
      return r <= d.radius + margin
    case 'sector': {
      if (r > d.radius + margin) return false
      if (r < 1) return true
      return Math.abs(angleDiff(angleTo(d.x, d.z, p.x, p.z), d.facing)) <= d.halfAngle + 0.35
    }
    case 'ring':
      return r > d.radius - margin && r < 13
    case 'line':
      return inLine(d.x, d.z, d.facing, d.length, d.width + margin * 2, p.x, p.z, 0.4)
  }
}

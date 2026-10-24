import type { Giant, GiantDanger } from '../enemies/Giant'
import type { Game } from '../game/Game'
import { angleDiff, angleTo, inLine } from '../combat/arc'
import { SOURCE_IDS } from '../data/schema'
import type { StarId } from '../progress/Cycle'
import { type God, godDef, relicDef } from '../relics/data'
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
  /** 순환까지 돌리는가: 단련하고, 모이면 윤회한다 (scripts/playtest.mjs --loops) */
  cycle = false
  /** 윤회한 게임 시각 */
  readonly rebirths: number[] = []
  /** 이 신의 유물만 낀다 (다른 신 유물은 주우면 가방에 넣는다). null이면 가리지 않는다 (scripts/playtest.mjs --god) */
  god: God | null = null
  /** 다른 지역으로 가지 않고 이 자리에서만 싸운다 (scripts/enemy-trial.mjs) */
  stay = false

  constructor(private readonly game: Game) {}

  /** 게임 시간 seconds초 동안 자동으로 플레이한다. */
  run(seconds: number): void {
    const step = 1 / 30
    for (let t = 0; t < seconds; t += step) {
      this.thinkTimer -= step
      if (this.thinkTimer <= 0) {
        this.thinkTimer = THINK
        this.think()
        if (this.cycle) this.loop()
      }
      this.game.advance(step, step)
    }
  }

  /**
   * 순환: 살 수 있는 단련 중 가장 싼 것을 사고, 윤회할 수 있으면 바로 윤회한다.
   * 재는 별자리에 쓴다 (결정 → 비용 → 생명 → 불씨 차례로 싼 것부터)
   */
  private loop(): void {
    const { cycle, cycleSystem, legend } = this.game
    for (let i = 0; i < 50; i++) {
      const cheapest = SOURCE_IDS.filter((s) => cycle.canTrain(s)).sort((a, b) => cycle.cost(a) - cycle.cost(b))[0]
      if (!cheapest || cycleSystem.train(cheapest) === 0) break
    }
    if (legend.phase !== 'idle' || cycle.ashForRebirth() <= 0) return
    if (cycleSystem.rebirth(null)) {
      this.rebirths.push(this.game.time)
      const order: StarId[] = ['gain', 'cheap', 'hp', 'start']
      for (let i = 0; i < 20; i++) if (!order.some((id) => cycle.lightStar(id))) break
    }
  }

  /** 가야 할 필드 (E7): 승급할 때가 된 신의 땅, 한 신만 쓰면 그 신의 땅, 아니면 지금 필드(마을이면 미드가르드) */
  private wantRegion(): string {
    const { powers, progress, region, regions } = this.game
    const fieldOf = (god: God) => Object.values(regions).find((r) => r.realm === godDef(god).realm)?.id
    const manifested = powers.manifested
    if (manifested && godDef(manifested).legend && progress.readyToPromote(manifested)) return fieldOf(manifested) ?? region.id
    if (this.god) return fieldOf(this.god) ?? region.id
    return region.kind === 'field' ? region.id : 'midgard'
  }

  /** 다른 지역으로 가야 하면 출구로 걷는다 (마을을 거쳐 간다). 걸었으면 true */
  private travel(): boolean {
    const { region, hero, legend } = this.game
    if (legend.active || this.stay) return false
    const want = this.wantRegion()
    if (want === region.id) return false
    const exit = region.exits.find((e) => e.to === want) ?? region.exits.find((e) => this.game.regions[e.to]?.kind === 'hub')
    if (!exit) return false
    if (!hero.isMoving || dist(hero.object.position, exit) > 1) hero.moveTo(exit)
    return true
  }

  private think(): void {
    const { hero, combat, encounter, pickups, legend, progress, powers } = this.game
    if (!combat.alive) return
    const p = hero.object.position
    const here = { x: p.x, z: p.z }
    const enemies = encounter.alive

    // 1. 예고 범위 안에 있으면 빠져나간다.
    const dangers = enemies.flatMap((g) => g.dangers)
    if (dangers.some((d) => inDanger(here, d, MARGIN))) {
      const escape = this.findEscape(here, dangers)
      if (escape) hero.moveTo(escape)
      return
    }
    // 피했으면 예고가 끝날 때까지 다시 들어가지 않는다.
    if (dangers.length > 0 && hero.isMoving) return

    // 2. 생명력이 낮으면 물러나 회복한다. (전설 결계 안에서는 물러날 곳이 없다)
    const hp = combat.health.ratio
    const near = enemies.filter((g) => dist(g, here) < 9)
    if (hp < 0.35 && near.length > 0 && !legend.active) {
      hero.moveTo(this.retreatPoint(here, near))
      return
    }
    if (hp < 0.7 && near.length === 0 && !legend.active && !hero.isMoving) return

    // 3. 떨어진 유물을 줍는다. 한 신만 쓰는 봇은 다른 신 유물을 가방에 넣는다.
    if (this.god) {
      powers.loadout.slots.forEach((id, slot) => id && relicDef(id).god !== this.god && this.game.dev.stow(slot))
    }
    // 정한 신이 있으면 그 신화가 열리는 대로 고른다 (사람은 마을·성소에서 고른다)
    if (this.god && powers.manifested !== this.god && this.game.progress.isOpen(this.god)) this.game.dev.choose(this.god)
    // 칸이 차 있어도 줍는다 (가방에 들어가고, 모이면 바꿔 낀다)
    if (!legend.active) {
      const pickup = nearest(pickups.list.filter((i) => !powers.loadout.has(i.id) && (!this.god || relicDef(i.id).god === this.god)), here)
      if (pickup && near.length < 3) {
        hero.moveTo(pickup)
        return
      }
    }

    // 4. 다른 땅으로 가야 하면 출구로 (마을에서 시작하면 필드로, 승급할 때가 되면 그 신의 땅으로)
    if (this.travel()) return

    // 5. 승급 준비가 되면 성소로 간다.
    const manifested = powers.manifested
    if (!legend.active && legend.present && manifested && godDef(manifested).legend && progress.readyToPromote(manifested) && hp > 0.8) {
      hero.moveTo(legend.center)
      return
    }

    // 6. 싸울 상대를 고른다. 거인 왕은 유물이 둘 이상이고 생명력이 넉넉할 때만 건드린다.
    const worn = powers.loadout.slots.filter((id) => id !== null).length
    const boss = encounter.boss
    const bossOk = worn >= 2 && hp > 0.6
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
      if (patrol.length === 0) return
      const point = patrol[this.patrol % patrol.length]!
      if (dist(here, point) < 2) this.patrol += 1
      else if (!hero.isMoving) hero.moveTo(point)
      return
    }
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

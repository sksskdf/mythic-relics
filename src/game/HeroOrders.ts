import type { Point2 } from '../world/colliders'
import type { HeroController } from './HeroController'
import type { CombatTarget, PlayerCombat } from './PlayerCombat'

/** 플레이어가 내린 지시 */
export type Order =
  /** 땅을 눌러 이동. forced면 가는 길에 적을 만나도 무시한다. */
  | { kind: 'move'; forced: boolean }
  /** 적을 눌러 공격. 그 적에게 다가가 쓰러질 때까지 친다. (움직이다 적을 만나 싸우게 된 경우도 같다) */
  | { kind: 'attack'; target: CombatTarget; clicked: boolean }

/**
 * 클릭을 지시로 바꾸는 규칙. 조작은 클릭 하나뿐이고, 무엇을 눌렀는지와 지금 상황으로 뜻을 정한다.
 * - 적을 누르면: 그 적에게 가서 공격한다.
 * - 땅을 누르면: 그곳으로 걷는다. 가는 길에 적이 사거리 안에 들어오면 멈춰서 싸운다.
 * - 싸우는 중에 땅을 누르면: 적을 무시하고 끝까지 걷는다. (빠져나가기, 공격 피하기)
 * - 아무 지시가 없으면: 멈춰 선 채 사거리 안의 가장 가까운 적을 자동으로 친다.
 */
export class HeroOrders {
  order: Order | null = null
  /** 이번 프레임에 새로 찍은 이동 목표 (클릭 표시용). forced면 적을 무시하는 이동 */
  lastMoveTarget: (Point2 & { forced: boolean }) | null = null
  /** 버튼을 누른 채로 커서를 따라가는 중인가 */
  private following = false

  constructor(
    private readonly hero: HeroController,
    private readonly combat: PlayerCombat,
  ) {}

  /** 적을 무시하고 걷는 중인가 (이때는 졸개를 밀고 지나간다) */
  get plowing(): boolean {
    return this.order?.kind === 'move' && this.order.forced && this.hero.isMoving
  }

  /** 지금 공격하라고 지정된 적 (표시용) */
  get attackTarget(): CombatTarget | null {
    return this.order?.kind === 'attack' ? this.order.target : null
  }

  /** 마우스를 눌렀다. enemy는 커서 아래의 적 */
  press(ground: Point2 | null, enemy: CombatTarget | null): void {
    if (this.hero.locked) return
    if (enemy?.alive) {
      this.attack(enemy, true)
      this.following = false
      return
    }
    if (!ground) return
    const forced = this.combat.engaged || this.order?.kind === 'attack'
    this.order = { kind: 'move', forced }
    this.combat.focus = null
    this.hero.moveTo(ground)
    this.lastMoveTarget = { ...ground, forced }
    this.following = true
  }

  /** 누른 채로 커서를 움직이고 있다. */
  hold(ground: Point2 | null): void {
    if (!this.following || !ground || this.order?.kind !== 'move' || this.hero.locked) return
    if (this.hero.canRepath) this.hero.moveTo(ground)
  }

  release(): void {
    this.following = false
  }

  /** 지시를 모두 지운다. (쓰러졌을 때 등) */
  clear(): void {
    this.order = null
    this.following = false
    this.combat.focus = null
  }

  update(enemies: readonly CombatTarget[]): void {
    const order = this.order
    if (!order) return
    if (order.kind === 'attack') {
      this.updateAttack(order.target)
      return
    }
    // 그냥 걷는 중에 적이 사거리 안에 들어오면 멈춰서 싸운다.
    if (!order.forced) {
      const enemy = this.enemyInReach(enemies)
      if (enemy) {
        this.attack(enemy, false)
        this.following = false
        return
      }
    }
    if (!this.hero.isMoving) this.order = null
  }

  private attack(target: CombatTarget, clicked: boolean): void {
    this.order = { kind: 'attack', target, clicked }
    this.combat.focus = target
    this.updateAttack(target)
  }

  /** 대상이 사거리 밖이면 다가가고, 안이면 멈춘다. 멈추면 PlayerCombat이 친다. */
  private updateAttack(target: CombatTarget): void {
    if (!target.alive) {
      this.clear()
      return
    }
    const p = this.hero.object.position
    const dist = Math.hypot(target.x - p.x, target.z - p.z)
    if (dist <= this.combat.reachTo(target) - 0.25) {
      this.hero.stop()
    } else if (this.hero.canRepath || !this.hero.isMoving) {
      this.hero.moveTo({ x: target.x, z: target.z })
    }
  }

  private enemyInReach(enemies: readonly CombatTarget[]): CombatTarget | null {
    const p = this.hero.object.position
    let best: CombatTarget | null = null
    let bestDist = Infinity
    for (const enemy of enemies) {
      if (!enemy.alive) continue
      const dist = Math.hypot(enemy.x - p.x, enemy.z - p.z)
      if (dist <= this.combat.reachTo(enemy) && dist < bestDist) {
        best = enemy
        bestDist = dist
      }
    }
    return best
  }
}

import type { Point2 } from '../world/colliders'
import type { HeroController } from './HeroController'
import type { CombatTarget, PlayerCombat } from './PlayerCombat'

/** 플레이어가 내린 지시 */
export type Order =
  /** 땅을 눌러 이동. 가는 길에 적을 만나도 싸우지 않고 끝까지 간다. */
  | { kind: 'move' }
  /** 적을 눌러 공격. 그 적에게 다가가 쓰러질 때까지 친다. */
  | { kind: 'attack'; target: CombatTarget; clicked: boolean }

/**
 * 클릭을 지시로 바꾸는 규칙 (E12-08). 조작은 클릭 하나뿐이다.
 * - 적을 누르면: 그 적에게 가서 쓰러질 때까지 자동으로 친다.
 * - 땅을 누르면: 싸우던 중이어도 그곳까지 끝까지 걷는다. 졸개는 밀고 지나간다. (빠져나가기, 공격 피하기)
 * - 아무 지시가 없으면(도착해 멈추면): 멈춰 선 채 사거리 안의 가장 가까운 적을 자동으로 친다.
 * (1차 스프린트에는 땅 한 번 = 가다가 적을 만나면 싸움, 두 번 = 적 무시였다. 한 번으로 빠져나가지 못해 불편하다는 의견으로 바꿈)
 */
export class HeroOrders {
  order: Order | null = null
  /** 이번 프레임에 새로 찍은 이동 목표 (클릭 표시용) */
  lastMoveTarget: Point2 | null = null
  /** 지금 걸어가고 있는 목적지 (이동 지시일 때) */
  destination: Point2 | null = null
  /** 버튼을 누른 채로 커서를 따라가는 중인가 */
  private following = false

  constructor(
    private readonly hero: HeroController,
    private readonly combat: PlayerCombat,
  ) {}

  /** 땅을 눌러 걷는 중인가 (이때는 졸개를 밀고 지나간다) */
  get plowing(): boolean {
    return this.order?.kind === 'move' && this.hero.isMoving
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
    this.order = { kind: 'move' }
    this.combat.focus = null
    this.hero.moveTo(ground)
    this.destination = { ...ground }
    this.lastMoveTarget = { ...ground }
    this.following = true
  }

  /** 누른 채로 커서를 움직이고 있다. */
  hold(ground: Point2 | null): void {
    if (!this.following || !ground || this.order?.kind !== 'move' || this.hero.locked) return
    if (this.hero.canRepath) {
      this.hero.moveTo(ground)
      this.destination = { ...ground }
    }
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

  update(_enemies: readonly CombatTarget[]): void {
    const order = this.order
    if (!order) return
    if (order.kind === 'attack') {
      this.updateAttack(order.target)
      return
    }
    // 걷는 동안은 싸우지 않는다. 도착해 멈추면 지시가 끝나고 PlayerCombat이 둘레의 적을 친다.
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
}

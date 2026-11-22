import { MOUNT } from '../data/mount'
import { isBossLike } from '../enemies/grade'
import type { Point2 } from '../world/colliders'
import type { HeroController } from './HeroController'
import type { CombatTarget, PlayerCombat } from './PlayerCombat'

/** 공격하러 쫓을 때 사거리 안쪽으로 이만큼(m) 더 들어가서 멈춘다 (경계에서 멈췄다 걸었다 하지 않게) */
const CHASE_INSIDE = 0.6
/**
 * 멈춰 서서 맞는데 칠 적이 사거리 밖이면(멀리서 던지거나 쏘는 적) 이 거리(m) 안에서 깨어 있는 가장 가까운 적에게 다가가 친다.
 * 서 있는 동안 맞았고 맞은 지 `ANSWER_SECONDS`초 안일 때만 (2026-11-22 손 QA: 드라우그르·물에 빠진 자에게 서서 깎이기만 했다)
 */
const ANSWER_RADIUS = 7
const ANSWER_SECONDS = 1.5

/** 플레이어가 내린 지시 */
export type Order =
  /** 땅을 눌러 이동. 가는 길에 적을 만나도 싸우지 않고 끝까지 간다. */
  | { kind: 'move' }
  /** 적을 눌러 공격. 그 적에게 다가가 쓰러질 때까지 친다. */
  | { kind: 'attack'; target: CombatTarget; clicked: boolean }

/**
 * 스스로 다가가 칠 적인가: 깨어 있고(쉬거나 제자리로 돌아가는 적은 주인공을 노리지 않는다) 보스·수호자가 아니다
 * (큰 싸움은 플레이어가 고른다: 보스의 넓은 공격에 멀리서 맞았다고 그 품으로 걸어 들어가지 않게)
 */
function answerable(target: CombatTarget): boolean {
  if (!target.alive || target.state === 'idle' || target.state === 'return' || target.state === 'dead') return false
  return !target.spec || !(isBossLike(target.spec) || !!target.spec.boss)
}

/**
 * 클릭을 지시로 바꾸는 규칙 (E12-08). 조작은 클릭 하나뿐이다.
 * - 적을 누르면: 그 적에게 가서 쓰러질 때까지 자동으로 친다.
 * - 땅을 누르면: 싸우던 중이어도 그곳까지 끝까지 걷는다. 졸개는 밀고 지나간다. (빠져나가기, 공격 피하기)
 * - 아무 지시가 없으면(도착해 멈추면): 멈춰 선 채 사거리 안의 가장 가까운 적을 자동으로 친다.
 *   사거리 안에 적이 없는데 서서 맞고 있으면 7m 안의 깨어 있는 가장 가까운 적(보스·수호자 말고)에게 다가가 친다 (스스로 낸 공격 지시, `clicked: false`).
 *   그 사이 다른 적이 사거리에 들거나 다른 걸음이 내려지면(봇) 그 지시를 거둔다
 * - 탈것(E241): 탈것을 가졌으면 멀리(15m 넘게) 누른 땅은 올라타 달려간다. 싸우는 중이면 걸어서 빠져나가다 싸움이 풀리는 순간 탄다.
 *   적을 누르거나 멈추면 내린다. 같은 클릭 하나라 버튼이 늘지 않는다
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
  /** 스스로 낸 공격 지시로 쫓으며 내린 걸음의 끝 (다른 걸음이 내려졌는지 알아보려고) */
  private chase: Point2 | null = null
  /** 탈 수 있나 (E241: 탈것을 가졌고 싸우는 중이 아니다). MountSystem이 정한다 */
  mayRide: () => boolean = () => false
  /** 이번 걸음은 타고 가려 한다 (멀리 눌렀다). 멈추면 지운다 */
  wantRide = false

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
      // 적을 누르면 내려서 싸운다 (E241)
      this.hero.riding = false
      this.wantRide = false
      this.attack(enemy, true)
      this.following = false
      return
    }
    if (!ground) return
    this.order = { kind: 'move' }
    this.combat.focus = null
    // 탄 채 누르면 그대로 타고 가고, 멀리 누르면 올라탄다 (E241)
    this.wantRide = this.hero.riding || this.far(ground)
    this.hero.moveTo(ground)
    this.destination = { ...ground }
    this.lastMoveTarget = { ...ground }
    this.following = true
    this.tryRide()
  }

  /**
   * 타려는 걸음이면 지금 올라탄다 (E241). 탈 수 없으면(싸우는 중) 그대로 걷고, 그 걸음 동안 싸움이 풀리면 MountSystem이 태운다.
   * 걸음을 직접 내리는 봇은 걸음을 내린 뒤 이것을 부른다 (가는 곳이 멀면 타려는 걸음이 된다). 탔으면 true
   */
  tryRide(): boolean {
    const goal = this.hero.goal
    if (!this.wantRide && goal && this.far(goal)) this.wantRide = true
    if (this.wantRide && !this.hero.riding && this.hero.isMoving && this.mayRide()) this.hero.riding = true
    return this.hero.riding
  }

  /** 주인공에서 탈 만큼 먼 곳인가 */
  private far(p: Point2): boolean {
    const h = this.hero.object.position
    return Math.hypot(p.x - h.x, p.z - h.z) > MOUNT.farPress
  }

  /** 누른 채로 커서를 움직이고 있다. */
  hold(ground: Point2 | null): void {
    if (!this.following || !ground || this.hero.locked || !this.hero.canRepath) return
    if (this.order?.kind !== 'move') {
      // 도착하거나 막혀 지시가 끝났다. 누른 채 커서가 그곳을 벗어나면 다시 따라간다 (같은 곳을 밀며 제자리걸음하지 않게)
      const d = this.destination
      if (d && Math.hypot(ground.x - d.x, ground.z - d.z) < 0.5) return
      this.order = { kind: 'move' }
      this.combat.focus = null
    }
    this.hero.moveTo(ground)
    this.destination = { ...ground }
    // 누른 채 커서를 멀리 끌고 가도 탄다 (E241)
    if (this.far(ground)) this.wantRide = true
    this.tryRide()
  }

  release(): void {
    this.following = false
  }

  /**
   * 조이스틱으로 그쪽으로 걷는다 (E235). 이동 지시가 이어지면 목적지만 바꾸고,
   * 끊겼으면(가장자리·무리에 막혀 멈춤, 쓰러짐, 장면, 땅 넘어가기) 쥔 채로도 다시 내린다.
   * 다시 내릴 때도 길 찾는 간격을 지킨다 (막힌 채 밀면 프레임마다 길을 찾지 않게).
   * far: 손가락을 멀리 끌었다 (E241) → 거리와 상관없이 타려는 걸음
   */
  steer(ground: Point2, far = false): void {
    if (this.following && this.order?.kind === 'move') this.hold(ground)
    else if (this.hero.canRepath) this.press(ground, null)
    if (far) {
      this.wantRide = true
      this.tryRide()
    }
  }

  /** 지시를 모두 지운다. (쓰러졌을 때 등) */
  clear(): void {
    this.order = null
    this.following = false
    this.wantRide = false
    this.combat.focus = null
  }

  /**
   * 원점이 옮겨졌다 (E19: 걸어서 이웃 땅으로 넘어감). 가던 곳을 같은 만큼 옮겨 이어 걷는다.
   * 앞 땅의 적은 사라지므로 공격 지시는 거둔다.
   */
  shift(dx: number, dz: number): void {
    const move = (p: Point2 | null) => (p ? { x: p.x + dx, z: p.z + dz } : null)
    this.destination = move(this.destination)
    this.lastMoveTarget = move(this.lastMoveTarget)
    if (this.order?.kind === 'attack') this.clear()
    // 앞 땅에서는 통로 끝까지만 갈 수 있었으니, 넘어간 땅에서 누른 곳까지 다시 길을 찾는다
    else if (this.order?.kind === 'move' && this.hero.isMoving && this.destination) this.hero.moveTo(this.destination)
  }

  update(enemies: readonly CombatTarget[]): void {
    // 멈췄으면 타려는 걸음도 끝났다 (조이스틱을 쥔 동안 길이 잠깐 빈 것은 빼고)
    if (!this.hero.isMoving && !this.hero.holding) this.wantRide = false
    const order = this.order
    if (!order) return void this.answer(enemies)
    if (order.kind === 'attack') {
      if (!order.clicked && this.yields(order.target, enemies)) return void this.clear()
      this.updateAttack(order.target)
      return
    }
    // 걷는 동안은 싸우지 않는다. 도착해 멈추면 지시가 끝나고 PlayerCombat이 둘레의 적을 친다.
    if (!this.hero.isMoving) this.order = null
  }

  /** 멈춰 서서 맞는데 사거리 안에 칠 적이 없으면 둘레의 깨어 있는 가장 가까운 적에게 스스로 공격 지시를 낸다 */
  private answer(enemies: readonly CombatTarget[]): void {
    const { hero, combat } = this
    if (hero.locked || hero.isMoving || hero.riding || hero.holding || !combat.alive) return
    // 서 있는 동안 맞은 것만: 피해 걸어 나와 멈추자마자 피하기 전에 맞은 것으로 그 적에게 되돌아가지 않게 (보스의 예고를 피한 걸음)
    if (combat.target || combat.combo.swinging || combat.hurtAgo > ANSWER_SECONDS || combat.hurtAgo >= combat.stillFor) return
    const p = hero.object.position
    let best: CombatTarget | null = null
    let bestDist = ANSWER_RADIUS
    for (const enemy of enemies) {
      if (!answerable(enemy)) continue
      const d = Math.hypot(enemy.x - p.x, enemy.z - p.z) - enemy.radius
      if (d < bestDist) {
        best = enemy
        bestDist = d
      }
    }
    if (best) this.attack(best, false)
  }

  /** 스스로 낸 공격 지시를 거둘 때인가: 다른 적이 사거리에 들었거나(그 적을 여느 때처럼 친다) 다른 걸음이 내려졌다 */
  private yields(target: CombatTarget, enemies: readonly CombatTarget[]): boolean {
    const goal = this.hero.goal
    if (this.hero.isMoving && this.chase && goal && Math.hypot(goal.x - this.chase.x, goal.z - this.chase.z) > 0.3) return true
    if (this.combat.combo.swinging) return false
    const p = this.hero.object.position
    return enemies.some((e) => e !== target && e.alive && Math.hypot(e.x - p.x, e.z - p.z) <= this.combat.reachTo(e))
  }

  private attack(target: CombatTarget, clicked: boolean): void {
    this.chase = null
    this.order = { kind: 'attack', target, clicked }
    this.combat.focus = target
    this.updateAttack(target)
  }

  /**
   * 대상이 사거리 밖이면 다가가고, 안이면 멈춘다. 멈추면 PlayerCombat이 친다.
   * 뒷걸음치거나 거리를 두는 적(원거리 몬스터)을 쫓을 때 사거리 경계에서 멈췄다 걸었다 하면
   * 휘두르기가 시작되자마자 끊겨 공격 모션만 빠르게 되풀이된다. 그래서
   * - 시작한 휘두르기는 끝까지 휘두르고(그동안 쫓지 않는다)
   * - 쫓을 때는 사거리 안쪽으로 넉넉히 들어가 멈추고, 멈춘 뒤에는 사거리를 벗어나야 다시 쫓는다.
   */
  private updateAttack(target: CombatTarget): void {
    if (!target.alive) {
      this.clear()
      return
    }
    if (this.combat.combo.swinging) {
      if (this.hero.isMoving) this.hero.stop()
      return
    }
    const p = this.hero.object.position
    const dist = Math.hypot(target.x - p.x, target.z - p.z)
    const reach = this.combat.reachTo(target)
    if (this.hero.isMoving) {
      if (dist <= reach - CHASE_INSIDE) this.hero.stop()
      else if (this.hero.canRepath) this.chaseTo(target)
    } else if (dist > reach) {
      this.chaseTo(target)
    }
  }

  private chaseTo(target: CombatTarget): void {
    this.hero.moveTo({ x: target.x, z: target.z })
    this.chase = this.hero.goal
  }
}

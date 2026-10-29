import { angleTo, inArc } from '../combat/arc'
import { BASIC_COMBO, ComboState, type SwingSpec } from '../combat/combo'
import { type AttackStyle, STYLES } from '../combat/styles'
import { Health } from '../combat/Health'
import type { HeroController } from './HeroController'

/** 주인공이 때릴 수 있는 대상 */
export interface CombatTarget {
  readonly x: number
  readonly z: number
  readonly radius: number
  readonly alive: boolean
  /** impact: 휘청임을 판정할 타격 세기 (땅 세기 배율을 곱하기 전, 없으면 damage) */
  takeHit(damage: number, dirX: number, dirZ: number, knockback: number, impact?: number): number
}

/** 공격이 맞았을 때 연출을 위해 알려 주는 내용 */
export interface HitReport {
  target: CombatTarget
  damage: number
  /** 3연타의 마지막처럼 강한 타격 */
  strong: boolean
}

export interface CombatHooks {
  /** 휘두르기 시작 (궤적 연출) */
  onSwing(swing: SwingSpec, strong: boolean): void
  /** 한 번 휘두르기에 맞은 대상들 */
  onHits(hits: HitReport[]): void
  /** 원거리 공격(활·벼락)이 날아갔다: 연출용 */
  onShot?(target: CombatTarget, strong: boolean): void
}

/** 신위 게이지: 한 번 맞힐 때마다 차오르는 양 */
const DIVINE_PER_HIT = 0.015
/** 맞은 뒤 다시 맞지 않는 시간 (초) */
const INVULNERABLE_AFTER_HIT = 0.3
/** 마지막으로 맞은 뒤 이 시간이 지나면 생명력이 차오른다. */
const REGEN_DELAY = 3
const REGEN_PER_SECOND = 12
/** 이 아래면 「생명이 낮을 때」 (바리공주 상시 효과) */
const LOW_HP = 0.35

/**
 * 주인공의 자동 전투. 조작 최소화 원칙에 따라 공격 버튼이 없다.
 * - 멈춰 있을 때 사거리 안의 가장 가까운 적을 향해 3연타를 자동으로 휘두른다.
 * - 이동을 시작하면 휘두르던 공격은 바로 끊긴다. (피하는 쪽이 항상 먼저)
 */
export class PlayerCombat {
  readonly combo = new ComboState(BASIC_COMBO)
  readonly health = new Health(100)
  /** 신위 게이지 0~1. 궁극기는 M4에서 붙는다. */
  divine = 0
  target: CombatTarget | null = null
  /** 공격하라고 지정한 적. 있으면 가까운 다른 적 대신 이 적만 친다. */
  focus: CombatTarget | null = null
  /** 개발 패널: 맞아도 피해를 받지 않는다. */
  godMode = false
  /** 기본 공격 피해 배율 (발현 패시브 등) */
  damageScale = 1
  /** 기본 공격 빠르기 배율 (발현 패시브) */
  attackSpeed = 1
  /** 잠깐 붙는 공격 속도 배율 (사냥 각성) */
  boostAttackSpeed = 1
  /** 서 있을수록 받는 피해 배율 (바위 각성) */
  braceScale = 1
  /** 공격 모션 (E6-10). 발현한 신의 무기를 따른다 */
  style: AttackStyle = 'blade'
  /** 내 공격의 넉백 배율, 내가 받는 피해·넉백 배율 (유물 지속 효과) */
  knockbackScale = 1
  damageTakenScale = 1
  knockbackTakenScale = 1
  /** 상시 효과 (E12-03): 대상별 피해 배율, 받는 회복, 늘 도는 재생, 생명이 낮을 때 받는 피해, 신위 게이지 충전 */
  targetScale: (target: CombatTarget) => number = () => 1
  healScale = 1
  bonusRegen = 0
  lowHpTakenScale = 1
  divineScale = 1

  private invulnerable = 0
  private sinceHurt = REGEN_DELAY

  constructor(private readonly hero: HeroController) {}

  get alive(): boolean {
    return !this.health.dead
  }

  /** 지금 맞을 수 있는가 (쓰러졌거나 무적 시간이면 아니다) */
  get canBeHit(): boolean {
    return this.alive && this.invulnerable <= 0
  }

  /** 싸우는 중인가: 휘두르는 중이거나, 사거리 안에 칠 적이 있다. */
  get engaged(): boolean {
    return this.combo.swinging || this.target !== null
  }

  /** 자동 공격을 시작하는 거리: 첫 타 사거리 + 적 몸 반지름 */
  reachTo(target: CombatTarget): number {
    return this.combo.swings[0]!.range + target.radius
  }

  /** 공격 모션을 바꾼다 (발현·해제) */
  setStyle(style: AttackStyle): void {
    if (style === this.style) return
    this.style = style
    this.combo.setSwings(STYLES[style].combo)
  }

  update(dt: number, enemies: readonly CombatTarget[], hooks: CombatHooks): void {
    this.invulnerable = Math.max(0, this.invulnerable - dt)
    this.sinceHurt += dt
    if (this.alive && this.sinceHurt > REGEN_DELAY) this.heal(REGEN_PER_SECOND * dt)
    if (this.alive && this.bonusRegen > 0) this.heal(this.bonusRegen * dt)

    if (!this.alive || this.hero.isMoving) {
      this.combo.cancel()
      this.target = null
      return
    }

    const position = this.hero.object.position
    if (this.focus && !this.focus.alive) this.focus = null
    if (this.focus) this.target = this.inReach(this.focus) ? this.focus : null
    else if (!this.target?.alive || !this.inReach(this.target)) this.target = this.nearest(enemies)
    if (this.target) this.hero.face(angleTo(position.x, position.z, this.target.x, this.target.z))

    for (const event of this.combo.update(dt * this.attackSpeed * this.boostAttackSpeed, this.target !== null)) {
      if (event.type === 'end') continue
      const swing = this.combo.swings[event.index]!
      const strong = event.index === this.combo.swings.length - 1
      if (event.type === 'start') {
        hooks.onSwing(swing, strong)
        const lunge = swing.lunge * 10
        this.hero.push(Math.sin(this.hero.facing) * lunge, Math.cos(this.hero.facing) * lunge)
      } else if (event.type === 'hit') {
        hooks.onHits(this.resolveHit(swing, strong, enemies, hooks))
      }
    }
    this.pose()
  }

  /**
   * 적의 공격에 맞았다.
   * @returns 실제로 깎인 생명력 (무적 시간이면 0)
   */
  takeHit(damage: number, fromX: number, fromZ: number, knockback: number): number {
    if (!this.alive || this.invulnerable > 0 || this.godMode) return 0
    const low = this.health.ratio < LOW_HP ? this.lowHpTakenScale : 1
    const dealt = this.health.damage(damage * this.damageTakenScale * this.braceScale * low)
    knockback *= this.knockbackTakenScale
    this.invulnerable = INVULNERABLE_AFTER_HIT
    this.sinceHurt = 0
    const position = this.hero.object.position
    const dx = position.x - fromX
    const dz = position.z - fromZ
    const len = Math.hypot(dx, dz) || 1
    this.hero.push((dx / len) * knockback, (dz / len) * knockback)
    if (this.health.dead) this.combo.cancel()
    return dealt
  }

  /** 되살아난다. */
  revive(): void {
    this.health.reset()
    this.combo.cancel()
    this.invulnerable = 1.5
    this.sinceHurt = REGEN_DELAY
  }

  addDivine(amount: number): void {
    this.divine = Math.min(1, this.divine + amount * this.divineScale)
  }

  /** 생명을 되찾는다 (받는 회복 배율을 곱한다) */
  heal(amount: number): void {
    // 쓰러진 동안에는 차오르지 않는다 (되살리기는 HeroLife만 한다)
    if (!this.alive) return
    this.health.heal(amount * this.healScale)
  }

  private inReach(target: CombatTarget): boolean {
    const p = this.hero.object.position
    return Math.hypot(target.x - p.x, target.z - p.z) <= this.reachTo(target)
  }

  private nearest(enemies: readonly CombatTarget[]): CombatTarget | null {
    const p = this.hero.object.position
    let best: CombatTarget | null = null
    let bestDist = Infinity
    for (const enemy of enemies) {
      if (!enemy.alive) continue
      const dist = Math.hypot(enemy.x - p.x, enemy.z - p.z)
      if (dist <= this.reachTo(enemy) && dist < bestDist) {
        best = enemy
        bestDist = dist
      }
    }
    return best
  }

  private resolveHit(swing: SwingSpec, strong: boolean, enemies: readonly CombatTarget[], hooks?: CombatHooks): HitReport[] {
    const p = this.hero.object.position
    const hits: HitReport[] = []
    const struck = swingTargets(swing, p.x, p.z, this.hero.facing, enemies, this.target)
    for (const enemy of struck) {
      const dx = enemy.x - p.x
      const dz = enemy.z - p.z
      const len = Math.hypot(dx, dz) || 1
      const dealt = enemy.takeHit(swing.damage * this.damageScale * this.targetScale(enemy), dx / len, dz / len, swing.knockback * this.knockbackScale, swing.damage)
      if (dealt > 0) hits.push({ target: enemy, damage: dealt, strong })
    }
    if (swing.shape === 'shot') for (const target of struck.slice(0, swing.shots ?? 1)) hooks?.onShot?.(target, strong)
    if (hits.length > 0) this.addDivine(DIVINE_PER_HIT * hits.length)
    return hits
  }

  /** 휘두르는 자세: 공격 모션마다 다르다 (combat/styles.ts). 걷기·숨쉬기 자세를 덮어쓴다. */
  private pose(): void {
    const index = this.combo.index
    if (index < 0) return
    const swing = this.combo.current!
    const t = this.combo.time
    // 판정 시점까지 젖혔다가, 판정 순간 빠르게 휘두르고, 남은 시간 동안 천천히 돌아온다.
    const wind = Math.min(1, t / swing.hitTime)
    const follow = Math.min(1, Math.max(0, (t - swing.hitTime) / (swing.duration - swing.hitTime)))
    STYLES[this.style].pose(this.hero.rig, {
      index,
      last: index === this.combo.swings.length - 1,
      wind,
      strike: Math.min(1, follow * 4),
      settle: follow * follow,
    })
  }
}

/**
 * 한 번 휘두르기에 맞는 적들 (판정 모양별). 순수 함수라 테스트에서 바로 쓴다.
 * - shot은 지정한 대상(없으면 가장 가까운 적)부터 shots명, 각 대상 둘레 splash 안의 적도 함께
 */
export function swingTargets(
  swing: SwingSpec,
  x: number,
  z: number,
  facing: number,
  enemies: readonly CombatTarget[],
  preferred: CombatTarget | null = null,
): CombatTarget[] {
  const alive = enemies.filter((e) => e.alive)
  const dirX = Math.sin(facing)
  const dirZ = Math.cos(facing)
  switch (swing.shape ?? 'arc') {
    case 'arc':
      return alive.filter((e) => inArc(x, z, facing, swing.range, swing.halfAngle, e.x, e.z, e.radius))
    case 'ring':
      return alive.filter((e) => Math.hypot(e.x - x, e.z - z) <= swing.range + e.radius)
    case 'line': {
      const half = swing.width ?? 0.6
      return alive.filter((e) => {
        const along = (e.x - x) * dirX + (e.z - z) * dirZ
        const side = Math.abs((e.x - x) * dirZ - (e.z - z) * dirX)
        return along >= -e.radius && along <= swing.range + e.radius && side <= half + e.radius
      })
    }
    case 'burst': {
      const cx = x + dirX * swing.range * 0.75
      const cz = z + dirZ * swing.range * 0.75
      const radius = swing.width ?? 1.5
      return alive.filter((e) => Math.hypot(e.x - cx, e.z - cz) <= radius + e.radius)
    }
    case 'shot': {
      const inRange = alive
        .filter((e) => Math.hypot(e.x - x, e.z - z) <= swing.range + e.radius && inArc(x, z, facing, swing.range, 40 * (Math.PI / 180), e.x, e.z, e.radius))
        .sort((a, b) => Math.hypot(a.x - x, a.z - z) - Math.hypot(b.x - x, b.z - z))
      // 지정한 대상이 있으면 그 적부터 쏜다
      const first = preferred ? inRange.indexOf(preferred) : -1
      if (first > 0) inRange.unshift(...inRange.splice(first, 1))
      const primary = inRange.slice(0, swing.shots ?? 1)
      if (!swing.splash) return primary
      const out = new Set(primary)
      for (const p of primary) for (const e of alive) if (Math.hypot(e.x - p.x, e.z - p.z) <= swing.splash + e.radius) out.add(e)
      return [...out]
    }
  }
}

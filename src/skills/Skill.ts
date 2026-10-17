import type * as THREE from 'three'

import type { SoundCue } from '../audio/sounds'
import type { Lightning } from '../fx/Lightning'
import type { Puffs } from '../fx/Puffs'
import type { CombatTarget } from '../game/PlayerCombat'
import type { HeroController } from '../game/HeroController'
import type { ModifierKey } from '../data/schema'
import type { God, RelicId } from '../relics/data'
import type { DamageStyle } from '../ui/DamageNumbers'

/** 스킬이 세계와 주고받는 것들. Game이 프레임마다 채워 준다. */
export interface SkillContext {
  hero: HeroController
  /** 살아 있는 적 */
  enemies: readonly CombatTarget[]
  /** 지금 발현된 신 */
  manifested: God | null
  /** 발현된 클래스의 레벨 (발현하지 않았으면 0) */
  level: number
  /** 스킬 연출을 붙일 곳 */
  fx: THREE.Object3D
  lightning: Lightning
  puffs: Puffs
  /** 주인공이 적에게 피해를 준다. 배율, 피해 숫자, 신위 게이지는 Game이 처리한다. */
  hit(target: CombatTarget, damage: number, dirX: number, dirZ: number, knockback: number, style: DamageStyle): void
  shake(amount: number): void
  /** 소리를 낸다. x·z가 있으면 그 자리에서 */
  sound(cue: SoundCue, x?: number, z?: number): void
  /** 거인이 대신 쫓을 환영 분신을 세우거나 치운다. */
  setDecoy(decoy: { x: number; z: number; radius: number } | null): void
}

/**
 * 지속 효과가 바꾸는 수치. 여러 유물의 값은 서로 곱한다.
 * knockbackDealt: 내 공격의 넉백, knockbackTaken: 내가 받는 넉백, damageTaken: 내가 받는 피해, moveSpeed: 이동 속도
 */
export type Modifiers = Record<ModifierKey, number>

export const NO_MODIFIERS: Modifiers = { knockbackDealt: 1, knockbackTaken: 1, damageTaken: 1, moveSpeed: 1 }

/** 기본 공격이 맞았을 때의 정보 */
export interface BasicHit {
  targets: readonly CombatTarget[]
  /** 연타 중 몇 번째 타인지 (0부터) */
  comboIndex: number
  /** 연타 길이 (기본 3) */
  comboLength: number
  /** 3연타의 마지막 타 */
  finisher: boolean
}

/**
 * 유물 하나가 주는 효과. (DESIGN.md 8.3)
 * - 지속 효과: 끼고 있는 동안 늘 켜져 있다. (modifiers, update의 오라 등)
 * - 행동 연동 효과: 연타·처치·피격·이동으로 충전이 쌓이고, 다 차면 터진다. 재사용 대기시간은 없다.
 */
export interface RelicEffect {
  readonly relic: RelicId
  /** 지속 효과가 바꾸는 수치 (없으면 그대로) */
  readonly modifiers?: Partial<Modifiers>
  /** 행동 연동 효과의 충전 정도 0~1 (HUD 표시용) */
  readonly charge: number
  /** 매 프레임: 오라, 날아가는 투사체 등 */
  update(dt: number, ctx: SkillContext): void
  /** 기본 공격이 적을 맞혔다. */
  onBasicHit?(hit: BasicHit, ctx: SkillContext): void
  /** 적을 쓰러뜨렸다. (어떤 공격으로든) */
  onKill?(target: CombatTarget, ctx: SkillContext): void
  /** 주인공이 맞기 직전. 실제로 받을 피해를 돌려준다. */
  beforeHeroHit?(damage: number, fromX: number, fromZ: number, ctx: SkillContext): number
  /** 주인공이 distance(m)만큼 걸었다. */
  onWalk?(distance: number, ctx: SkillContext): void
  dispose(): void
}

/** 주인공 기준으로 가장 가까운 적. maxDist 안에서만 찾는다. (적 몸 반지름까지 포함한 거리) */
export function nearestEnemy(
  enemies: readonly CombatTarget[],
  x: number,
  z: number,
  maxDist: number,
): CombatTarget | null {
  let best: CombatTarget | null = null
  let bestDist = Infinity
  for (const enemy of enemies) {
    if (!enemy.alive) continue
    const dist = Math.hypot(enemy.x - x, enemy.z - z) - enemy.radius
    if (dist <= maxDist && dist < bestDist) {
      best = enemy
      bestDist = dist
    }
  }
  return best
}

/** 반지름 안에 있는 적들 */
export function enemiesWithin(enemies: readonly CombatTarget[], x: number, z: number, radius: number): CombatTarget[] {
  return enemies.filter((e) => e.alive && Math.hypot(e.x - x, e.z - z) - e.radius <= radius)
}

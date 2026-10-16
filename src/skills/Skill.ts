import type * as THREE from 'three'

import type { Lightning } from '../fx/Lightning'
import type { Puffs } from '../fx/Puffs'
import type { CombatTarget } from '../game/PlayerCombat'
import type { HeroController } from '../game/HeroController'
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
  /** 거인이 대신 쫓을 환영 분신을 세우거나 치운다. */
  setDecoy(decoy: { x: number; z: number; radius: number } | null): void
}

/**
 * 유물 하나가 주는 자동 스킬. 조작 최소화 원칙에 따라 스스로 대상과 때를 고른다.
 * 재사용 대기시간으로만 제한하고 마나 같은 자원은 없다. (DESIGN.md 8.3)
 */
export interface Skill {
  readonly relic: RelicId
  /** 재사용 대기시간 (초) */
  readonly cooldown: number
  /** 남은 재사용 대기시간 (초) */
  left: number
  update(dt: number, ctx: SkillContext): void
  /** 주인공이 맞기 직전에 불린다. 실제로 받을 피해를 돌려준다. */
  beforeHeroHit?(damage: number, fromX: number, fromZ: number, ctx: SkillContext): number
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

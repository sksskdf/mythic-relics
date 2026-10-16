import * as THREE from 'three'

import type { CombatTarget } from '../game/PlayerCombat'
import { enemiesWithin, type SkillContext } from './Skill'

const BOLTS = 8
const INTERVAL = 0.16
const DAMAGE = 45
const RADIUS = 9

/**
 * 천둥의 신 궁극기 「묠니르의 심판」: 신위 게이지가 가득 차고 적이 충분히 모이면 자동 발동한다.
 * 주변 적들에게 번개가 연달아 내리꽂힌다.
 */
export class ThunderJudgement {
  private remaining = 0
  private timer = 0
  private index = 0

  get active(): boolean {
    return this.remaining > 0
  }

  /** 지금 쓰면 좋은 때인가: 적 셋 이상이 모였거나, 거인 왕이 가까이 있다. */
  worthUsing(ctx: SkillContext, bossNear: boolean): boolean {
    const hero = ctx.hero.object.position
    return bossNear || enemiesWithin(ctx.enemies, hero.x, hero.z, 7).length >= 3
  }

  start(ctx: SkillContext): void {
    this.remaining = BOLTS
    this.timer = 0.25
    this.index = 0
    const hero = ctx.hero.object.position
    ctx.lightning.fromSky(hero.clone(), 0.3)
    ctx.puffs.burst(hero, 20, 3)
    ctx.shake(0.4)
  }

  update(dt: number, ctx: SkillContext): void {
    if (this.remaining <= 0) return
    this.timer -= dt
    if (this.timer > 0) return
    this.timer = INTERVAL
    this.remaining -= 1
    const hero = ctx.hero.object.position
    const targets = enemiesWithin(ctx.enemies, hero.x, hero.z, RADIUS)
    const target: CombatTarget | undefined = targets[this.index++ % Math.max(1, targets.length)]
    const point = target
      ? new THREE.Vector3(target.x, hero.y, target.z)
      : new THREE.Vector3(hero.x + (Math.random() - 0.5) * 10, hero.y, hero.z + (Math.random() - 0.5) * 10)
    ctx.lightning.fromSky(point, 0.24)
    ctx.puffs.burst(point, 8, 2)
    ctx.shake(0.22)
    // 번개가 떨어진 자리 주변도 함께 맞는다.
    for (const enemy of enemiesWithin(ctx.enemies, point.x, point.z, 1.6)) {
      const dx = enemy.x - point.x
      const dz = enemy.z - point.z
      const len = Math.hypot(dx, dz) || 1
      ctx.hit(enemy, DAMAGE, dx / len, dz / len, 2, 'thunder')
    }
  }
}

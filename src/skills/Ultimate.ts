import * as THREE from 'three'

import type { UltimateKind } from '../data/schema'
import type { CombatTarget } from '../game/PlayerCombat'
import { shadowRig } from './ClassPassives'
import { enemiesWithin, type SkillContext } from './Skill'

/** 궁극기: 신위 게이지가 가득 차고 쓸 만한 때가 오면 저절로 나간다. 클래스마다 다르다 (DESIGN.md 5.1.1) */
export interface Ultimate {
  readonly active: boolean
  /** 지금 쓰면 좋은 때인가: 적 셋 이상이 모였거나, 거인 왕이 가까이 있다. */
  worthUsing(ctx: SkillContext, bossNear: boolean): boolean
  start(ctx: SkillContext): void
  update(dt: number, ctx: SkillContext): void
}

function crowded(ctx: SkillContext, bossNear: boolean, radius = 7): boolean {
  const hero = ctx.hero.object.position
  return bossNear || enemiesWithin(ctx.enemies, hero.x, hero.z, radius).length >= 3
}

const BOLTS = 8
const INTERVAL = 0.16
const DAMAGE = 45
const RADIUS = 9

/**
 * 천둥의 신 궁극기 「묠니르의 심판」: 신위 게이지가 가득 차고 적이 충분히 모이면 자동 발동한다.
 * 주변 적들에게 번개가 연달아 내리꽂힌다.
 */
export class ThunderJudgement implements Ultimate {
  private remaining = 0
  private timer = 0
  private index = 0

  get active(): boolean {
    return this.remaining > 0
  }

  worthUsing(ctx: SkillContext, bossNear: boolean): boolean {
    return crowded(ctx, bossNear)
  }

  start(ctx: SkillContext): void {
    this.remaining = BOLTS
    this.timer = 0.25
    this.index = 0
    const hero = ctx.hero.object.position
    ctx.lightning.fromSky(hero.clone(), 0.3)
    ctx.puffs.burst(hero, 20, 3)
    ctx.shake(0.4)
    ctx.sound('ultimate')
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
    ctx.sound('thunder', point.x, point.z)
    // 번개가 떨어진 자리 주변도 함께 맞는다.
    for (const enemy of enemiesWithin(ctx.enemies, point.x, point.z, 1.6)) {
      const dx = enemy.x - point.x
      const dz = enemy.z - point.z
      const len = Math.hypot(dx, dz) || 1
      ctx.hit(enemy, DAMAGE, dx / len, dz / len, 2, 'thunder')
    }
  }
}

/**
 * 변신술사 궁극기 「환영 군단」: 그림자 분신 여섯이 사방으로 흩어졌다가 저마다 적에게 달려들어 터진다.
 */
export class IllusionLegion implements Ultimate {
  private readonly material = new THREE.MeshBasicMaterial({ color: 0x2f6a3a, transparent: true, opacity: 0.7, depthWrite: false })
  private readonly legion: { root: THREE.Group; from: THREE.Vector3; to: THREE.Vector3; target: CombatTarget | null; t: number; done: boolean }[] = []
  private time = -1

  get active(): boolean {
    return this.time >= 0
  }

  worthUsing(ctx: SkillContext, bossNear: boolean): boolean {
    return crowded(ctx, bossNear, 8)
  }

  start(ctx: SkillContext): void {
    const hero = ctx.hero.object.position
    const targets = enemiesWithin(ctx.enemies, hero.x, hero.z, 10)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2
      const target = targets[i % Math.max(1, targets.length)] ?? null
      const rig = shadowRig(this.material)
      rig.root.position.copy(hero)
      ctx.fx.add(rig.root)
      // 먼저 둘레로 흩어지고, 그다음 적에게 달려든다
      const to = new THREE.Vector3(hero.x + Math.sin(a) * 2.2, hero.y, hero.z + Math.cos(a) * 2.2)
      this.legion.push({ root: rig.root, from: hero.clone(), to, target, t: -i * 0.06, done: false })
    }
    ctx.puffs.burst(hero, 24, 3)
    ctx.shake(0.3)
    ctx.sound('legion')
    this.time = 0
  }

  update(dt: number, ctx: SkillContext): void {
    if (this.time < 0) return
    this.time += dt
    for (const c of this.legion) {
      if (c.done) continue
      c.t += dt
      if (c.t < 0) continue
      // 0~0.25초: 흩어짐, 0.45~0.7초: 달려듦
      if (c.t < 0.25) c.root.position.lerpVectors(c.from, c.to, c.t / 0.25)
      else if (c.t >= 0.45) {
        const k = Math.min(1, (c.t - 0.45) / 0.25)
        const goal = c.target?.alive ? new THREE.Vector3(c.target.x, c.to.y, c.target.z) : c.to.clone().add(c.to.clone().sub(c.from).multiplyScalar(1.5))
        c.root.position.lerpVectors(c.to, goal, k)
        c.root.rotation.y = Math.atan2(goal.x - c.to.x, goal.z - c.to.z)
        if (k >= 1) this.blast(c.root.position, ctx, c)
      }
    }
    if (this.legion.every((c) => c.done)) {
      for (const c of this.legion) c.root.removeFromParent()
      this.legion.length = 0
      this.time = -1
    }
  }

  private blast(at: THREE.Vector3, ctx: SkillContext, c: { done: boolean; root: THREE.Group }): void {
    c.done = true
    c.root.visible = false
    ctx.puffs.burst(at, 14, 2.5)
    ctx.slashes.spawn(at, Math.random() * Math.PI * 2, 2, 1.4, true, 0x5fd06a)
    ctx.shake(0.18)
    for (const enemy of enemiesWithin(ctx.enemies, at.x, at.z, 2.4)) {
      const dx = enemy.x - at.x
      const dz = enemy.z - at.z
      const len = Math.hypot(dx, dz) || 1
      ctx.hit(enemy, 30, dx / len, dz / len, 6, 'strong')
    }
  }
}

/**
 * 아수라왕 궁극기 「육비난무」: 1.6초 동안 여섯 팔이 둘레의 적을 쉼 없이 벤다.
 */
export class BladeDance implements Ultimate {
  private time = -1
  private timer = 0

  get active(): boolean {
    return this.time >= 0
  }

  worthUsing(ctx: SkillContext, bossNear: boolean): boolean {
    return crowded(ctx, bossNear, 5)
  }

  start(ctx: SkillContext): void {
    const hero = ctx.hero.object.position
    for (let i = 0; i < 6; i++) ctx.slashes.spawn(hero, (i / 6) * Math.PI * 2, 3.2, 0.6, true, i % 2 ? 0xff4a5a : 0xb0101c)
    ctx.puffs.burst(hero, 16, 3)
    ctx.shake(0.35)
    ctx.sound('bladeDance')
    this.time = 0
    this.timer = 0
  }

  update(dt: number, ctx: SkillContext): void {
    if (this.time < 0) return
    this.time += dt
    this.timer -= dt
    if (this.time >= 1.6) {
      this.time = -1
      return
    }
    if (this.timer > 0) return
    this.timer = 0.08
    const hero = ctx.hero.object.position
    const near = enemiesWithin(ctx.enemies, hero.x, hero.z, 5)
    const enemy = near[Math.floor(Math.random() * near.length)]
    const angle = Math.random() * Math.PI * 2
    if (!enemy) {
      ctx.slashes.spawn(hero, angle, 2.4, 0.5, false, 0xb0101c)
      return
    }
    const at = new THREE.Vector3(enemy.x, hero.y, enemy.z)
    ctx.slashes.spawn(at, angle, 1.6, 0.8, true, Math.random() < 0.5 ? 0xff4a5a : 0xb0101c)
    const dx = enemy.x - hero.x
    const dz = enemy.z - hero.z
    const len = Math.hypot(dx, dz) || 1
    ctx.hit(enemy, 12, dx / len, dz / len, 1.5, 'normal')
    ctx.sound('blade', enemy.x, enemy.z)
  }
}

/** 신 데이터의 ultimate 이름 → 궁극기 */
export function createUltimates(): Record<UltimateKind, Ultimate> {
  return { thunderJudgement: new ThunderJudgement(), illusionLegion: new IllusionLegion(), bladeDance: new BladeDance() }
}

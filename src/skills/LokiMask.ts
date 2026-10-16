import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'
import { buildHeroModel } from '../world/heroModel'
import { enemiesWithin, type RelicEffect, type SkillContext } from './Skill'

const LIFE = 4
/** 분신을 남기려면 걸어야 하는 거리 (m) */
const WALK = 12
/** 이 거리 안에 적이 있어야 분신을 남긴다. (아무도 없는 곳에 남기면 헛것이 된다) */
const NEAR = 6
const BLAST_RADIUS = 2.6
const BLAST_DAMAGE = 20

/**
 * 변신의 가면 「환영 분신」
 * - 지속: 이동 속도 10% 증가
 * - 이동: 12m를 걸을 때마다 충전되고, 가까이 적이 있으면 제자리에 자기와 똑같은 분신을 남긴다.
 *   거인들은 4초 동안 분신을 쫓고 때리며, 분신은 사라질 때 터져 주변에 피해를 준다.
 * 움직일수록 강해지는 유물이다. 그 틈에 자리를 옮기거나 거인의 등을 친다.
 */
export class IllusionClone implements RelicEffect {
  readonly relic = 'lokiMask'
  readonly modifiers = { moveSpeed: 1.1 }
  private walked = 0

  private readonly decoy = buildHeroModel()
  private readonly material = new THREE.MeshBasicMaterial({ color: 0x8fe07a, transparent: true, opacity: 0.55, depthWrite: false })
  private life = 0

  constructor(fx: THREE.Object3D) {
    this.decoy.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = this.material
        o.castShadow = false
      }
      o.layers.set(EFFECT_LAYER)
    })
    this.decoy.root.visible = false
    fx.add(this.decoy.root)
  }

  get charge(): number {
    return Math.min(1, this.walked / WALK)
  }

  onWalk(distance: number): void {
    // 분신이 있는 동안에는 쌓이지 않는다.
    if (this.life <= 0) this.walked = Math.min(WALK, this.walked + distance)
  }

  update(dt: number, ctx: SkillContext): void {
    const hero = ctx.hero.object.position
    if (this.life > 0) {
      this.life -= dt
      // 끝나 갈수록 빠르게 깜빡인다.
      const blink = this.life < 1 ? Math.sin(this.life * 40) > 0 : true
      this.material.opacity = blink ? 0.55 : 0.2
      if (this.life <= 0) this.vanish(ctx)
      return
    }
    if (this.walked < WALK) return
    if (enemiesWithin(ctx.enemies, hero.x, hero.z, NEAR).length === 0) return

    this.walked = 0
    this.life = LIFE
    this.decoy.root.position.copy(hero)
    this.decoy.root.rotation.y = ctx.hero.facing
    this.decoy.root.visible = true
    ctx.setDecoy({ x: hero.x, z: hero.z, radius: 0.4 })
    ctx.puffs.burst(hero, 10, 1.5)
  }

  private vanish(ctx: SkillContext): void {
    const p = this.decoy.root.position
    this.decoy.root.visible = false
    ctx.setDecoy(null)
    for (const enemy of enemiesWithin(ctx.enemies, p.x, p.z, BLAST_RADIUS)) {
      const dx = enemy.x - p.x
      const dz = enemy.z - p.z
      const len = Math.hypot(dx, dz) || 1
      ctx.hit(enemy, BLAST_DAMAGE, dx / len, dz / len, 7, 'normal')
    }
    ctx.puffs.burst(p, 18, 3)
    ctx.shake(0.12)
  }

  dispose(): void {
    this.decoy.root.removeFromParent()
    this.material.dispose()
  }
}

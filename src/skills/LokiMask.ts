import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'
import { buildHeroModel } from '../world/heroModel'
import { enemiesWithin, type Skill, type SkillContext } from './Skill'

const LIFE = 4
const BLAST_RADIUS = 2.6
const BLAST_DAMAGE = 20

/**
 * 변신의 가면 「환영 분신」: 적 여럿이 다가오면 그 자리에 자기와 똑같은 환영을 남긴다.
 * 거인들은 잠시 환영을 쫓고 때리며, 환영은 사라질 때 터져 주변에 피해를 준다.
 * 주인공은 그 틈에 자리를 옮기거나 거인의 등을 친다.
 */
export class IllusionClone implements Skill {
  readonly relic = 'lokiMask'
  readonly cooldown = 12
  left = 1

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
    this.left = Math.max(0, this.left - dt)
    if (this.left > 0) return
    if (enemiesWithin(ctx.enemies, hero.x, hero.z, 6).length < 2) return

    this.left = this.cooldown
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

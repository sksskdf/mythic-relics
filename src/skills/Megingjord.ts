import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'
import { enemiesWithin, type Skill, type SkillContext } from './Skill'

const RADIUS = 3.4
const DAMAGE = 26

/**
 * 메긴교르드 「힘의 해방」: 허리띠를 조여 힘을 두 배로 끌어올리고 땅을 내리찍는다.
 * 가까이 붙은 적이 있으면 자동으로 발동해 주변을 모두 때리고 멀리 밀어낸다.
 * 무리에 둘러싸였을 때 숨통을 틔워 주는 스킬이다.
 */
export class MightUnleashed implements Skill {
  readonly relic = 'megingjord'
  readonly cooldown = 6
  left = 0.5

  private readonly ring: THREE.Mesh
  private readonly material = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, depthWrite: false })
  private ringLife = 0

  constructor(fx: THREE.Object3D) {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), this.material)
    this.ring.rotation.x = -Math.PI / 2
    this.ring.layers.set(EFFECT_LAYER)
    this.ring.renderOrder = 12
    this.ring.visible = false
    fx.add(this.ring)
  }

  update(dt: number, ctx: SkillContext): void {
    this.left = Math.max(0, this.left - dt)
    if (this.ringLife > 0) {
      this.ringLife -= dt
      const t = 1 - this.ringLife / 0.3
      this.ring.scale.setScalar(0.5 + t * RADIUS)
      this.material.opacity = Math.max(0, 1 - t)
      this.ring.visible = this.ringLife > 0
    }
    if (this.left > 0) return
    const hero = ctx.hero.object.position
    const near = enemiesWithin(ctx.enemies, hero.x, hero.z, 1.6)
    if (near.length === 0) return

    this.left = this.cooldown
    for (const enemy of enemiesWithin(ctx.enemies, hero.x, hero.z, RADIUS)) {
      const dx = enemy.x - hero.x
      const dz = enemy.z - hero.z
      const len = Math.hypot(dx, dz) || 1
      ctx.hit(enemy, DAMAGE, dx / len, dz / len, 11, 'strong')
    }
    this.ring.position.set(hero.x, hero.y + 0.15, hero.z)
    this.ring.visible = true
    this.ringLife = 0.3
    ctx.puffs.burst(hero, 28, 4)
    ctx.shake(0.3)
    if (ctx.manifested === 'thor') {
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.random()
        ctx.lightning.fromSky(new THREE.Vector3(hero.x + Math.sin(a) * 2.2, hero.y, hero.z + Math.cos(a) * 2.2), 0.1)
      }
    }
  }

  dispose(): void {
    this.ring.removeFromParent()
    this.material.dispose()
  }
}

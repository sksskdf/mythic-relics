import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'
import { enemiesWithin, type RelicEffect, type SkillContext } from './Skill'

const RADIUS = 3.4
const DAMAGE = 26
/** 땅을 내리찍기까지 쌓아야 하는 처치 수 */
const STACKS = 5

/**
 * 메긴교르드 「힘의 해방」: 허리띠를 조이면 힘이 두 배가 된다.
 * - 지속: 내 공격의 넉백 1.5배, 내가 받는 넉백 절반 (밀리지 않고 버틴다)
 * - 처치: 적을 쓰러뜨릴 때마다 힘이 1 쌓이고, 5가 차면 다음 기본 공격이 땅을 내리찍어 주변을 모두 때리고 멀리 밀어낸다.
 */
export class MightUnleashed implements RelicEffect {
  readonly relic = 'megingjord'
  readonly modifiers = { knockbackDealt: 1.5, knockbackTaken: 0.5 }

  private stacks = 0
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

  get charge(): number {
    return this.stacks / STACKS
  }

  onKill(): void {
    this.stacks = Math.min(STACKS, this.stacks + 1)
  }

  onBasicHit(_hit: unknown, ctx: SkillContext): void {
    if (this.stacks < STACKS) return
    this.stacks = 0
    this.quake(ctx)
  }

  update(dt: number): void {
    if (this.ringLife <= 0) return
    this.ringLife -= dt
    const t = 1 - this.ringLife / 0.3
    this.ring.scale.setScalar(0.5 + t * RADIUS)
    this.material.opacity = Math.max(0, 1 - t)
    this.ring.visible = this.ringLife > 0
  }

  private quake(ctx: SkillContext): void {
    const hero = ctx.hero.object.position
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

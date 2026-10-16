import * as THREE from 'three'

import type { CombatTarget } from '../game/PlayerCombat'
import { voxelMesh } from '../voxel/mesher'
import { mjolnir, RELIC_VOXEL } from '../voxel/models/relics'
import { nearestEnemy, type Skill, type SkillContext } from './Skill'

const RANGE = 10
const OUT_SPEED = 20
const BACK_SPEED = 24
const DAMAGE = 16
const HIT_RADIUS = 0.7

/**
 * 묠니르 「망치 투척」: 가장 가까운 적 쪽으로 망치를 던진다.
 * 망치는 날아가며 닿는 적을 모두 때리고, 손으로 되돌아오며 한 번 더 때린다.
 * 천둥의 신이 발현되어 있으면 맞은 적에게 번개가 떨어진다. 천둥군주(Lv2)부터는 망치 피해가 1.5배다.
 */
export class MjolnirThrow implements Skill {
  readonly relic = 'mjolnir'
  readonly cooldown = 4.5
  left = 1

  private readonly mesh: THREE.Mesh
  private phase: 'ready' | 'out' | 'back' = 'ready'
  private readonly dir = new THREE.Vector3()
  private travelled = 0
  private distance = 0
  private readonly hitThisLeg = new Set<CombatTarget>()

  constructor(fx: THREE.Object3D) {
    this.mesh = voxelMesh(mjolnir(), { voxelSize: RELIC_VOXEL * 1.3, pivot: [4.5, 6, 2.5] })
    this.mesh.visible = false
    fx.add(this.mesh)
  }

  update(dt: number, ctx: SkillContext): void {
    const hero = ctx.hero.object.position
    if (this.phase === 'ready') {
      this.left = Math.max(0, this.left - dt)
      if (this.left > 0) return
      const target = nearestEnemy(ctx.enemies, hero.x, hero.z, RANGE)
      if (!target) return
      this.dir.set(target.x - hero.x, 0, target.z - hero.z).normalize()
      this.distance = Math.min(RANGE, Math.hypot(target.x - hero.x, target.z - hero.z) + 2.5)
      this.travelled = 0
      this.mesh.position.set(hero.x, hero.y + 1.1, hero.z)
      this.mesh.visible = true
      this.phase = 'out'
      this.hitThisLeg.clear()
      return
    }

    this.mesh.rotation.y = Math.atan2(this.dir.x, this.dir.z)
    this.mesh.rotateX(dt * 28)
    if (this.phase === 'out') {
      const step = OUT_SPEED * dt
      this.mesh.position.addScaledVector(this.dir, step)
      this.travelled += step
      this.hitAlong(ctx, this.dir.x, this.dir.z)
      if (this.travelled >= this.distance) {
        this.phase = 'back'
        this.hitThisLeg.clear()
      }
    } else {
      const to = new THREE.Vector3(hero.x - this.mesh.position.x, 0, hero.z - this.mesh.position.z)
      const dist = to.length()
      if (dist < 0.6) {
        this.mesh.visible = false
        this.phase = 'ready'
        this.left = this.cooldown
        return
      }
      to.divideScalar(dist)
      this.mesh.position.addScaledVector(to, Math.min(dist, BACK_SPEED * dt))
      this.mesh.position.y = hero.y + 1.1
      this.hitAlong(ctx, to.x, to.z)
    }
  }

  private hitAlong(ctx: SkillContext, dirX: number, dirZ: number): void {
    const p = this.mesh.position
    for (const enemy of ctx.enemies) {
      if (!enemy.alive || this.hitThisLeg.has(enemy)) continue
      if (Math.hypot(enemy.x - p.x, enemy.z - p.z) > enemy.radius + HIT_RADIUS) continue
      this.hitThisLeg.add(enemy)
      const damage = ctx.manifested === 'thor' && ctx.level >= 2 ? DAMAGE * 1.5 : DAMAGE
      ctx.hit(enemy, damage, dirX, dirZ, 3, 'thunder')
      if (ctx.manifested === 'thor') {
        ctx.lightning.fromSky(new THREE.Vector3(enemy.x, p.y - 1.1, enemy.z), 0.12)
        ctx.hit(enemy, 8, dirX, dirZ, 0, 'thunder')
      }
    }
  }

  dispose(): void {
    this.mesh.removeFromParent()
  }
}

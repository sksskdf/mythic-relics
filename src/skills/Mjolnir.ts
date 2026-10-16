import * as THREE from 'three'

import type { CombatTarget } from '../game/PlayerCombat'
import { voxelMesh } from '../voxel/mesher'
import { mjolnir, RELIC_VOXEL } from '../voxel/models/relics'
import { type BasicHit, enemiesWithin, type RelicEffect, type SkillContext } from './Skill'

const RANGE = 10
const OUT_SPEED = 20
const BACK_SPEED = 24
const DAMAGE = 16
const HIT_RADIUS = 0.7
/** 지속 효과: 주변 번개 */
const SPARK_RADIUS = 4
const SPARK_INTERVAL = 2
const SPARK_DAMAGE = 6
const SPARK_TARGETS = 3

/**
 * 묠니르 「망치 투척」
 * - 지속: 4m 안의 적에게 2초마다 작은 번개가 떨어진다. (가까운 적 셋까지)
 * - 연타: 3연타의 마지막 타가 맞으면 그 적 쪽으로 망치를 던진다. 날아가며 닿는 적을 모두 때리고 손으로 돌아오며 한 번 더 때린다.
 * 천둥군주(Lv2)부터는 망치 피해가 1.5배다.
 */
export class MjolnirThrow implements RelicEffect {
  readonly relic = 'mjolnir'
  /** 연타가 쌓인 정도. 마지막 타에서 가득 찬다. */
  charge = 0

  private readonly mesh: THREE.Mesh
  private phase: 'ready' | 'out' | 'back' = 'ready'
  private readonly dir = new THREE.Vector3()
  private travelled = 0
  private distance = 0
  private sparkTimer = SPARK_INTERVAL
  private readonly hitThisLeg = new Set<CombatTarget>()

  constructor(fx: THREE.Object3D) {
    this.mesh = voxelMesh(mjolnir(), { voxelSize: RELIC_VOXEL * 1.3, pivot: [4.5, 6, 2.5] })
    this.mesh.visible = false
    fx.add(this.mesh)
  }

  onBasicHit(hit: BasicHit, ctx: SkillContext): void {
    this.charge = hit.finisher ? 1 : (hit.comboIndex + 1) / 3
    if (!hit.finisher || this.phase !== 'ready') return
    const target = hit.targets[0]
    if (!target) return
    const hero = ctx.hero.object.position
    this.dir.set(target.x - hero.x, 0, target.z - hero.z).normalize()
    this.distance = Math.min(RANGE, Math.hypot(target.x - hero.x, target.z - hero.z) + 4)
    this.travelled = 0
    this.mesh.position.set(hero.x, hero.y + 1.1, hero.z)
    this.mesh.visible = true
    this.phase = 'out'
    this.hitThisLeg.clear()
  }

  update(dt: number, ctx: SkillContext): void {
    this.updateSparks(dt, ctx)
    if (this.phase === 'ready') return
    const hero = ctx.hero.object.position
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
        this.charge = 0
        return
      }
      to.divideScalar(dist)
      this.mesh.position.addScaledVector(to, Math.min(dist, BACK_SPEED * dt))
      this.mesh.position.y = hero.y + 1.1
      this.hitAlong(ctx, to.x, to.z)
    }
  }

  /** 지속 효과: 가까운 적에게 작은 번개 */
  private updateSparks(dt: number, ctx: SkillContext): void {
    this.sparkTimer -= dt
    if (this.sparkTimer > 0) return
    this.sparkTimer = SPARK_INTERVAL
    const hero = ctx.hero.object.position
    const near = enemiesWithin(ctx.enemies, hero.x, hero.z, SPARK_RADIUS)
      .sort((a, b) => Math.hypot(a.x - hero.x, a.z - hero.z) - Math.hypot(b.x - hero.x, b.z - hero.z))
      .slice(0, SPARK_TARGETS)
    for (const enemy of near) {
      ctx.lightning.fromSky(new THREE.Vector3(enemy.x, hero.y, enemy.z), 0.08)
      ctx.hit(enemy, SPARK_DAMAGE, 0, 0, 0, 'thunder')
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

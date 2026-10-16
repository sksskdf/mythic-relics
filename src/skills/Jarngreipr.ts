import * as THREE from 'three'

import type { CombatTarget } from '../game/PlayerCombat'
import { voxelMesh } from '../voxel/mesher'
import { emberIngot, RELIC_VOXEL } from '../voxel/models/relics'
import { nearestEnemy, type RelicEffect, type SkillContext } from './Skill'

const SPEED = 22
const DAMAGE = 34

interface Ingot {
  mesh: THREE.Mesh
  target: CombatTarget
}

/** 받아치기가 다시 차는 시간 (초) */
const RECHARGE = 4

/**
 * 야른그레이프르 「쇳덩이 되던지기」: 거인 게이로드가 던진 달군 쇳덩이를 쇠 장갑으로 받아 되던진 일화에서 왔다.
 * - 지속: 받는 피해 10% 감소
 * - 피격: 맞는 순간 피해를 절반으로 줄이고, 달군 쇳덩이를 그 적에게 되던진다. 충전 1개, 4초마다 다시 찬다.
 * 피하지 못한 공격도 반격 기회가 된다.
 */
export class IronCatch implements RelicEffect {
  readonly relic = 'jarngreipr'
  readonly modifiers = { damageTaken: 0.9 }
  private left = 0

  private readonly ingots: Ingot[] = []
  private readonly geometrySource = emberIngot()

  constructor(private readonly fx: THREE.Object3D) {}

  get charge(): number {
    return 1 - this.left / RECHARGE
  }

  beforeHeroHit(damage: number, fromX: number, fromZ: number, ctx: SkillContext): number {
    if (this.left > 0) return damage
    this.left = RECHARGE
    const hero = ctx.hero.object.position
    // 때린 쪽에 가장 가까운 적에게 되던진다.
    const target = nearestEnemy(ctx.enemies, fromX, fromZ, 3) ?? nearestEnemy(ctx.enemies, hero.x, hero.z, 12)
    if (target) {
      const mesh = voxelMesh(this.geometrySource, { voxelSize: RELIC_VOXEL * 1.6, pivot: [2.5, 1.5, 1.5] })
      mesh.position.set(hero.x, hero.y + 1.2, hero.z)
      this.fx.add(mesh)
      this.ingots.push({ mesh, target })
    }
    ctx.puffs.burst(new THREE.Vector3(hero.x, hero.y + 1, hero.z), 6, 1.2)
    return damage * 0.5
  }

  update(dt: number, ctx: SkillContext): void {
    this.left = Math.max(0, this.left - dt)
    for (let i = this.ingots.length - 1; i >= 0; i--) {
      const ingot = this.ingots[i]!
      const p = ingot.mesh.position
      const to = new THREE.Vector3(ingot.target.x - p.x, 0, ingot.target.z - p.z)
      const dist = to.length()
      ingot.mesh.rotation.y += dt * 20
      ingot.mesh.rotation.x += dt * 13
      if (!ingot.target.alive) {
        this.remove(i)
        continue
      }
      if (dist <= ingot.target.radius + 0.3) {
        ctx.hit(ingot.target, DAMAGE, to.x / (dist || 1), to.z / (dist || 1), 6, 'strong')
        ctx.puffs.burst(p, 10, 2)
        ctx.shake(0.15)
        this.remove(i)
        continue
      }
      p.addScaledVector(to.divideScalar(dist), Math.min(dist, SPEED * dt))
    }
  }

  private remove(index: number): void {
    const [ingot] = this.ingots.splice(index, 1)
    ingot?.mesh.removeFromParent()
    ingot?.mesh.geometry.dispose()
  }

  dispose(): void {
    while (this.ingots.length > 0) this.remove(0)
  }
}

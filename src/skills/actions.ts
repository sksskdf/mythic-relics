import * as THREE from 'three'

import type { ActionDef, AuraDef } from '../data/schema'
import type { CombatTarget } from '../game/PlayerCombat'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { voxelMesh } from '../voxel/mesher'
import { inArc } from '../combat/arc'
import { emberIngot, mistletoe, mjolnir, RELIC_VOXEL } from '../voxel/models/relics'
import { buildHeroModel } from '../world/heroModel'
import { enemiesWithin, nearestEnemy, type SkillContext } from './Skill'

/** 발현·레벨 조건으로 세진 정도 (유물 데이터의 bonus를 합친 값) */
export interface Boost {
  damageScale: number
  /** 맞은 적마다 함께 떨어지는 번개 피해. null이면 번개 없음, 0이면 연출만 */
  lightning: number | null
}

export const NO_BOOST: Boost = { damageScale: 1, lightning: null }

/** 행동 연동 효과가 터질 때 넘겨받는 것 */
export interface Cue {
  /** 기본 공격이 맞힌 첫 적 */
  target?: CombatTarget
  /** 주인공을 때린 쪽 */
  from?: { x: number; z: number }
}

/** 행동 연동 효과가 터지면 하는 일. 종류별 동작은 여기, 숫자는 유물 데이터에 있다. */
export interface Action {
  /** 아직 지난번 동작이 끝나지 않았다 (이 동안은 충전이 쌓이지 않고 터지지도 않는다) */
  readonly busy: boolean
  fire(ctx: SkillContext, cue: Cue, boost: Boost): void
  update(dt: number, ctx: SkillContext): void
  dispose(): void
}

/** 지속 효과 중 매 프레임 도는 것 (오라) */
export interface Aura {
  update(dt: number, ctx: SkillContext): void
  dispose(): void
}

/** 세진 효과: 맞은 적에게 번개가 함께 떨어진다. */
function boostLightning(ctx: SkillContext, enemy: CombatTarget, boost: Boost, dirX: number, dirZ: number): void {
  if (boost.lightning === null) return
  const y = ctx.hero.object.position.y
  ctx.lightning.fromSky(new THREE.Vector3(enemy.x, y, enemy.z), 0.12)
  if (boost.lightning > 0) ctx.hit(enemy, boost.lightning, dirX, dirZ, 0, 'thunder')
}

/** 중심에서 바깥으로 향하는 방향 */
function away(fromX: number, fromZ: number, to: CombatTarget): [number, number] {
  const dx = to.x - fromX
  const dz = to.z - fromZ
  const len = Math.hypot(dx, dz) || 1
  return [dx / len, dz / len]
}

// ───────────────────────────── 오라 ─────────────────────────────

/**
 * 주변 적 몇에게 주기적으로 작은 번개.
 * 끼고 있는 동안 발밑에 효과 범위가 옅은 고리로 보이고, 번개가 칠 때 고리가 밝게 번쩍인다.
 */
class Sparks implements Aura {
  private timer: number
  private ring: THREE.Mesh | null = null
  private readonly material = new THREE.MeshBasicMaterial({ color: 0x9fe3ff, transparent: true, opacity: 0.16, depthWrite: false })
  private flash = 0

  constructor(private readonly p: Readonly<Record<string, number>>) {
    this.timer = p.interval!
  }

  update(dt: number, ctx: SkillContext): void {
    const hero = ctx.hero.object.position
    if (!this.ring) {
      const r = this.p.radius!
      this.ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.12, r, 48), this.material)
      this.ring.rotation.x = -Math.PI / 2
      this.ring.layers.set(EFFECT_LAYER)
      this.ring.renderOrder = 11
      ctx.fx.add(this.ring)
    }
    this.ring.position.set(hero.x, hero.y + 0.06, hero.z)
    this.flash = Math.max(0, this.flash - dt * 3)
    this.material.opacity = 0.16 + this.flash * 0.5

    this.timer -= dt
    if (this.timer > 0) return
    this.timer = this.p.interval!
    const near = enemiesWithin(ctx.enemies, hero.x, hero.z, this.p.radius!)
      .sort((a, b) => Math.hypot(a.x - hero.x, a.z - hero.z) - Math.hypot(b.x - hero.x, b.z - hero.z))
      .slice(0, this.p.targets!)
    if (near.length > 0) this.flash = 1
    for (const enemy of near) {
      const at = new THREE.Vector3(enemy.x, hero.y, enemy.z)
      ctx.lightning.fromSky(at, 0.14)
      ctx.puffs.burst(at, 4, 1)
      ctx.hit(enemy, this.p.damage!, 0, 0, 0, 'thunder')
    }
  }

  dispose(): void {
    this.ring?.removeFromParent()
    this.ring?.geometry.dispose()
    this.material.dispose()
  }
}

export function createAura(def: AuraDef): Aura {
  switch (def.kind) {
    case 'sparks':
      return new Sparks(def.params)
  }
}

// ───────────────────────────── 행동 ─────────────────────────────

/** 망치 투척: 대상 쪽으로 날아가며 닿는 적을 모두 때리고, 손으로 돌아오며 한 번 더 때린다. */
class HammerThrow implements Action {
  private readonly mesh: THREE.Mesh
  private phase: 'ready' | 'out' | 'back' = 'ready'
  private readonly dir = new THREE.Vector3()
  private travelled = 0
  private distance = 0
  private boost = NO_BOOST
  private readonly hitThisLeg = new Set<CombatTarget>()

  constructor(
    private readonly p: Readonly<Record<string, number>>,
    fx: THREE.Object3D,
  ) {
    this.mesh = voxelMesh(mjolnir(), { voxelSize: RELIC_VOXEL * 1.3, pivot: [4.5, 6, 2.5] })
    this.mesh.visible = false
    fx.add(this.mesh)
  }

  get busy(): boolean {
    return this.phase !== 'ready'
  }

  fire(ctx: SkillContext, cue: Cue, boost: Boost): void {
    const target = cue.target ?? nearestEnemy(ctx.enemies, ctx.hero.object.position.x, ctx.hero.object.position.z, this.p.range!)
    if (!target) return
    const hero = ctx.hero.object.position
    this.boost = boost
    this.dir.set(target.x - hero.x, 0, target.z - hero.z).normalize()
    this.distance = Math.min(this.p.range!, Math.hypot(target.x - hero.x, target.z - hero.z) + 4)
    this.travelled = 0
    this.mesh.position.set(hero.x, hero.y + 1.1, hero.z)
    this.mesh.visible = true
    this.phase = 'out'
    this.hitThisLeg.clear()
  }

  update(dt: number, ctx: SkillContext): void {
    if (this.phase === 'ready') return
    const hero = ctx.hero.object.position
    this.mesh.rotation.y = Math.atan2(this.dir.x, this.dir.z)
    this.mesh.rotateX(dt * 28)
    if (this.phase === 'out') {
      const step = this.p.outSpeed! * dt
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
        return
      }
      to.divideScalar(dist)
      this.mesh.position.addScaledVector(to, Math.min(dist, this.p.backSpeed! * dt))
      this.mesh.position.y = hero.y + 1.1
      this.hitAlong(ctx, to.x, to.z)
    }
  }

  private hitAlong(ctx: SkillContext, dirX: number, dirZ: number): void {
    const p = this.mesh.position
    for (const enemy of ctx.enemies) {
      if (!enemy.alive || this.hitThisLeg.has(enemy)) continue
      if (Math.hypot(enemy.x - p.x, enemy.z - p.z) > enemy.radius + this.p.hitRadius!) continue
      this.hitThisLeg.add(enemy)
      ctx.hit(enemy, this.p.damage! * this.boost.damageScale, dirX, dirZ, this.p.knockback!, 'thunder')
      boostLightning(ctx, enemy, this.boost, dirX, dirZ)
    }
  }

  dispose(): void {
    this.mesh.removeFromParent()
  }
}

/** 땅 내리찍기: 주변을 모두 때리고 멀리 밀어낸다. */
class Quake implements Action {
  readonly busy = false
  private readonly ring: THREE.Mesh
  private readonly material = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, depthWrite: false })
  private ringLife = 0

  constructor(
    private readonly p: Readonly<Record<string, number>>,
    fx: THREE.Object3D,
  ) {
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), this.material)
    this.ring.rotation.x = -Math.PI / 2
    this.ring.layers.set(EFFECT_LAYER)
    this.ring.renderOrder = 12
    this.ring.visible = false
    fx.add(this.ring)
  }

  fire(ctx: SkillContext, _cue: Cue, boost: Boost): void {
    const hero = ctx.hero.object.position
    for (const enemy of enemiesWithin(ctx.enemies, hero.x, hero.z, this.p.radius!)) {
      const [dx, dz] = away(hero.x, hero.z, enemy)
      ctx.hit(enemy, this.p.damage! * boost.damageScale, dx, dz, this.p.knockback!, 'strong')
      boostLightning(ctx, enemy, boost, dx, dz)
    }
    this.ring.position.set(hero.x, hero.y + 0.15, hero.z)
    this.ring.visible = true
    this.ringLife = 0.3
    ctx.puffs.burst(hero, 28, 4)
    ctx.shake(0.3)
  }

  update(dt: number): void {
    if (this.ringLife <= 0) return
    this.ringLife -= dt
    const t = 1 - this.ringLife / 0.3
    this.ring.scale.setScalar(0.5 + t * this.p.radius!)
    this.material.opacity = Math.max(0, 1 - t)
    this.ring.visible = this.ringLife > 0
  }

  dispose(): void {
    this.ring.removeFromParent()
    this.material.dispose()
  }
}

interface Ingot {
  mesh: THREE.Mesh
  target: CombatTarget
  boost: Boost
}

/** 쇳덩이 되던지기: 때린 쪽에 가장 가까운 적에게 달군 쇳덩이를 던진다. */
class IngotThrow implements Action {
  readonly busy = false
  private readonly ingots: Ingot[] = []
  private readonly geometrySource = emberIngot()

  constructor(
    private readonly p: Readonly<Record<string, number>>,
    private readonly fx: THREE.Object3D,
  ) {}

  fire(ctx: SkillContext, cue: Cue, boost: Boost): void {
    const hero = ctx.hero.object.position
    const from = cue.from ?? hero
    const target = nearestEnemy(ctx.enemies, from.x, from.z, 3) ?? nearestEnemy(ctx.enemies, hero.x, hero.z, 12)
    if (target) {
      const mesh = voxelMesh(this.geometrySource, { voxelSize: RELIC_VOXEL * 1.6, pivot: [2.5, 1.5, 1.5] })
      mesh.position.set(hero.x, hero.y + 1.2, hero.z)
      this.fx.add(mesh)
      this.ingots.push({ mesh, target, boost })
    }
    ctx.puffs.burst(new THREE.Vector3(hero.x, hero.y + 1, hero.z), 6, 1.2)
  }

  update(dt: number, ctx: SkillContext): void {
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
        const dx = to.x / (dist || 1)
        const dz = to.z / (dist || 1)
        ctx.hit(ingot.target, this.p.damage! * ingot.boost.damageScale, dx, dz, this.p.knockback!, 'strong')
        boostLightning(ctx, ingot.target, ingot.boost, dx, dz)
        ctx.puffs.burst(p, 10, 2)
        ctx.shake(0.15)
        this.remove(i)
        continue
      }
      p.addScaledVector(to.divideScalar(dist), Math.min(dist, this.p.speed! * dt))
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

/** 환영 분신: 제자리에 분신을 남긴다. 적은 분신을 쫓고, 분신은 사라질 때 터진다. */
class Decoy implements Action {
  private readonly decoy = buildHeroModel()
  private readonly material = new THREE.MeshBasicMaterial({ color: 0x8fe07a, transparent: true, opacity: 0.55, depthWrite: false })
  private life = 0
  private boost = NO_BOOST

  constructor(
    private readonly p: Readonly<Record<string, number>>,
    fx: THREE.Object3D,
  ) {
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

  get busy(): boolean {
    return this.life > 0
  }

  fire(ctx: SkillContext, _cue: Cue, boost: Boost): void {
    const hero = ctx.hero.object.position
    this.boost = boost
    this.life = this.p.life!
    this.decoy.root.position.copy(hero)
    this.decoy.root.rotation.y = ctx.hero.facing
    this.decoy.root.visible = true
    ctx.setDecoy({ x: hero.x, z: hero.z, radius: 0.4 })
    ctx.puffs.burst(hero, 10, 1.5)
  }

  update(dt: number, ctx: SkillContext): void {
    if (this.life <= 0) return
    this.life -= dt
    // 끝나 갈수록 빠르게 깜빡인다.
    const blink = this.life < 1 ? Math.sin(this.life * 40) > 0 : true
    this.material.opacity = blink ? 0.55 : 0.2
    if (this.life <= 0) this.vanish(ctx)
  }

  private vanish(ctx: SkillContext): void {
    const p = this.decoy.root.position
    this.decoy.root.visible = false
    ctx.setDecoy(null)
    for (const enemy of enemiesWithin(ctx.enemies, p.x, p.z, this.p.blastRadius!)) {
      const [dx, dz] = away(p.x, p.z, enemy)
      ctx.hit(enemy, this.p.blastDamage! * this.boost.damageScale, dx, dz, this.p.knockback!, 'normal')
      boostLightning(ctx, enemy, this.boost, dx, dz)
    }
    ctx.puffs.burst(p, 18, 3)
    ctx.shake(0.12)
  }

  dispose(): void {
    this.decoy.root.removeFromParent()
    this.material.dispose()
  }
}

/** 불꽃 휘두르기 (레바테인): 바라보는 쪽 부채꼴을 초록 불꽃으로 쓸어 낸다. */
class FlameSweep implements Action {
  readonly busy = false
  private readonly fan: THREE.Mesh
  private readonly turn = new THREE.Group()
  private readonly material = new THREE.MeshBasicMaterial({ color: 0x5fd06a, transparent: true, depthWrite: false, side: THREE.DoubleSide })
  private life = 0

  constructor(
    private readonly p: Readonly<Record<string, number>>,
    fx: THREE.Object3D,
  ) {
    const half = (p.halfAngle! * Math.PI) / 180
    // 부채꼴: 눕히면 xy 평면의 −y가 앞(+z)이 되므로 −90°를 가운데에 둔다. 묶음을 돌려 바라보는 쪽을 맞춘다
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.4, 1, 24, 1, -Math.PI / 2 - half, half * 2), this.material)
    ring.rotation.x = -Math.PI / 2
    ring.layers.set(EFFECT_LAYER)
    ring.renderOrder = 12
    this.fan = ring
    this.turn.add(ring)
    this.turn.visible = false
    fx.add(this.turn)
  }

  fire(ctx: SkillContext, cue: Cue, boost: Boost): void {
    const hero = ctx.hero.object.position
    const facing = cue.target ? Math.atan2(cue.target.x - hero.x, cue.target.z - hero.z) : ctx.hero.facing
    const half = (this.p.halfAngle! * Math.PI) / 180
    for (const enemy of ctx.enemies) {
      if (!enemy.alive || !inArc(hero.x, hero.z, facing, this.p.range!, half, enemy.x, enemy.z, enemy.radius)) continue
      const [dx, dz] = away(hero.x, hero.z, enemy)
      ctx.hit(enemy, this.p.damage! * boost.damageScale, dx, dz, this.p.knockback!, 'strong')
      boostLightning(ctx, enemy, boost, dx, dz)
      ctx.puffs.burst(new THREE.Vector3(enemy.x, hero.y + 0.6, enemy.z), 4, 1)
    }
    this.turn.position.set(hero.x, hero.y + 0.2, hero.z)
    this.turn.rotation.y = facing
    this.turn.visible = true
    this.life = 0.35
    ctx.shake(0.15)
  }

  update(dt: number): void {
    if (this.life <= 0) return
    this.life -= dt
    const t = 1 - this.life / 0.35
    this.fan.scale.setScalar(0.6 + t * this.p.range!)
    this.material.opacity = Math.max(0, 1 - t) * 0.8
    this.turn.visible = this.life > 0
  }

  dispose(): void {
    this.turn.removeFromParent()
    this.fan.geometry.dispose()
    this.material.dispose()
  }
}

/** 발드르의 화살 (겨우살이 가지): 가장 먼 적 쪽으로 가지를 던져 길 위의 적을 모두 꿰뚫는다. */
class Pierce implements Action {
  private readonly mesh: THREE.Mesh
  private readonly dir = new THREE.Vector3()
  private travelled = -1
  private boost = NO_BOOST
  private readonly struck = new Set<CombatTarget>()

  constructor(
    private readonly p: Readonly<Record<string, number>>,
    fx: THREE.Object3D,
  ) {
    this.mesh = voxelMesh(mistletoe(), { voxelSize: RELIC_VOXEL * 1.2, pivot: [4.5, 6, 1.5] })
    this.mesh.visible = false
    fx.add(this.mesh)
  }

  get busy(): boolean {
    return this.travelled >= 0
  }

  fire(ctx: SkillContext, _cue: Cue, boost: Boost): void {
    const hero = ctx.hero.object.position
    let target: CombatTarget | null = null
    let best = -1
    for (const enemy of enemiesWithin(ctx.enemies, hero.x, hero.z, this.p.range!)) {
      const d = Math.hypot(enemy.x - hero.x, enemy.z - hero.z)
      if (d > best) {
        best = d
        target = enemy
      }
    }
    if (!target) return
    this.boost = boost
    this.dir.set(target.x - hero.x, 0, target.z - hero.z).normalize()
    this.mesh.position.set(hero.x, hero.y + 1.1, hero.z)
    this.mesh.rotation.set(Math.PI / 2, 0, -Math.atan2(this.dir.x, this.dir.z))
    this.mesh.visible = true
    this.travelled = 0
    this.struck.clear()
  }

  update(dt: number, ctx: SkillContext): void {
    if (this.travelled < 0) return
    const step = this.p.speed! * dt
    this.mesh.position.addScaledVector(this.dir, step)
    this.travelled += step
    const p = this.mesh.position
    for (const enemy of ctx.enemies) {
      if (!enemy.alive || this.struck.has(enemy)) continue
      if (Math.hypot(enemy.x - p.x, enemy.z - p.z) > enemy.radius + this.p.hitRadius!) continue
      this.struck.add(enemy)
      ctx.hit(enemy, this.p.damage! * this.boost.damageScale, this.dir.x, this.dir.z, this.p.knockback!, 'strong')
      boostLightning(ctx, enemy, this.boost, this.dir.x, this.dir.z)
      ctx.puffs.burst(new THREE.Vector3(enemy.x, p.y, enemy.z), 6, 1.4)
    }
    if (this.travelled >= this.p.range! + 2) {
      this.mesh.visible = false
      this.travelled = -1
    }
  }

  dispose(): void {
    this.mesh.removeFromParent()
  }
}

export function createAction(def: ActionDef, fx: THREE.Object3D): Action {
  switch (def.kind) {
    case 'hammerThrow':
      return new HammerThrow(def.params, fx)
    case 'quake':
      return new Quake(def.params, fx)
    case 'ingotThrow':
      return new IngotThrow(def.params, fx)
    case 'decoy':
      return new Decoy(def.params, fx)
    case 'flameSweep':
      return new FlameSweep(def.params, fx)
    case 'pierce':
      return new Pierce(def.params, fx)
  }
}

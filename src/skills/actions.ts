import * as THREE from 'three'

import type { ActionDef, ActionLook, AuraDef } from '../data/schema'
import type { CombatTarget } from '../game/PlayerCombat'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { voxelMesh } from '../voxel/mesher'
import { inArc } from '../combat/arc'
import { LOOK_MODELS } from '../voxel/models/looks'
import { RELIC_VOXEL } from '../voxel/models/relics'
import { buildHeroModel } from '../world/heroModel'
import { makeMissile, MISSILE_CHIPS, type Missile, QuakeLook, turnMissile } from './actionLooks'
import { shadowRig } from './ClassPassives'
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
  /** 연출 색을 유물 주인 신의 색으로 바꾼다 (분신·불꽃처럼 색이 신을 드러내는 것만) */
  tint?(hex: number): void
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

/** 떼어 낸 모습의 모양(geometry)을 GPU에서 내린다. 유물을 뺐다 낄 때마다 쌓이지 않게 (재질은 공용이라 두고) */
function disposeGeometries(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose()
  })
}

/** 망치 투척: 대상 쪽으로 날아가며 닿는 적을 모두 때리고, 손으로 돌아오며 한 번 더 때린다. (모습: 도는 망치, 곧게 나는 창) */
class HammerThrow implements Action {
  private readonly missile: Missile
  private readonly mesh: THREE.Object3D
  private phase: 'ready' | 'out' | 'back' = 'ready'
  private readonly dir = new THREE.Vector3()
  private travelled = 0
  private distance = 0
  private boost = NO_BOOST
  private readonly hitThisLeg = new Set<CombatTarget>()

  constructor(
    private readonly p: Readonly<Record<string, number>>,
    fx: THREE.Object3D,
    look: ActionLook,
  ) {
    this.missile = makeMissile(look, fx)
    this.mesh = this.missile.holder
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
    if (this.phase === 'out') {
      turnMissile(this.missile, this.dir.x, this.dir.z, dt)
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
      // 창은 돌아올 때 손 쪽을 보고 난다
      turnMissile(this.missile, this.missile.spin === 'none' ? to.x : this.dir.x, this.missile.spin === 'none' ? to.z : this.dir.z, dt)
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
    disposeGeometries(this.mesh)
  }
}

/** 땅 내리찍기: 주변을 모두 때리고 멀리 밀어낸다. 고리에 덧붙는 것은 모습마다 다르다 (actionLooks.ts의 QuakeLook) */
class Quake implements Action {
  readonly busy = false
  private readonly ring: THREE.Mesh
  private readonly material: THREE.MeshBasicMaterial
  private readonly look: QuakeLook
  private ringLife = 0

  constructor(
    private readonly p: Readonly<Record<string, number>>,
    fx: THREE.Object3D,
    look: ActionLook<'quake'>,
  ) {
    this.look = new QuakeLook(look, fx)
    this.material = new THREE.MeshBasicMaterial({ color: this.look.color, transparent: true, depthWrite: false })
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
    ctx.puffs.burst(hero, this.look.look === 'boar' ? 40 : 28, 4)
    this.look.fire(ctx, this.p.radius!)
    ctx.shake(0.3)
  }

  update(dt: number): void {
    // 겹물결: 첫 고리가 지나간 뒤 한 번 더
    if (this.look.update(dt)) {
      this.ringLife = 0.3
      this.ring.visible = true
    }
    if (this.ringLife <= 0) return
    this.ringLife -= dt
    const t = 1 - this.ringLife / 0.3
    this.ring.scale.setScalar(0.5 + t * this.p.radius!)
    this.material.opacity = Math.max(0, 1 - t)
    this.ring.visible = this.ringLife > 0
  }

  dispose(): void {
    this.ring.removeFromParent()
    this.ring.geometry.dispose()
    this.material.dispose()
    this.look.dispose()
  }
}

interface Ingot {
  missile: Missile
  target: CombatTarget
  boost: Boost
}

/** 쇳덩이 되던지기: 때린 쪽에 가장 가까운 적에게 달군 쇳덩이를 던진다. (모습: 쇳덩이·달 원반·물방울·돌·칼) */
class IngotThrow implements Action {
  readonly busy = false
  private readonly ingots: Ingot[] = []

  constructor(
    private readonly p: Readonly<Record<string, number>>,
    private readonly fx: THREE.Object3D,
    private readonly look: ActionLook,
  ) {}

  fire(ctx: SkillContext, cue: Cue, boost: Boost): void {
    const hero = ctx.hero.object.position
    const from = cue.from ?? hero
    const target = nearestEnemy(ctx.enemies, from.x, from.z, 3) ?? nearestEnemy(ctx.enemies, hero.x, hero.z, 12)
    if (target) {
      const missile = makeMissile(this.look, this.fx)
      missile.holder.position.set(hero.x, hero.y + 1.2, hero.z)
      missile.holder.visible = true
      this.ingots.push({ missile, target, boost })
    }
    ctx.puffs.burst(new THREE.Vector3(hero.x, hero.y + 1, hero.z), 6, 1.2)
  }

  update(dt: number, ctx: SkillContext): void {
    for (let i = this.ingots.length - 1; i >= 0; i--) {
      const ingot = this.ingots[i]!
      const p = ingot.missile.holder.position
      const to = new THREE.Vector3(ingot.target.x - p.x, 0, ingot.target.z - p.z)
      const dist = to.length()
      turnMissile(ingot.missile, to.x, to.z, dt)
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
        const chips = MISSILE_CHIPS[this.look]
        if (chips) ctx.chips(p, chips, 12, 0.6, 0.1)
        ctx.shake(0.15)
        this.remove(i)
        continue
      }
      p.addScaledVector(to.divideScalar(dist), Math.min(dist, this.p.speed! * dt))
    }
  }

  private remove(index: number): void {
    const [ingot] = this.ingots.splice(index, 1)
    if (!ingot) return
    ingot.missile.holder.removeFromParent()
    disposeGeometries(ingot.missile.holder)
  }

  dispose(): void {
    while (this.ingots.length > 0) this.remove(0)
  }
}

/**
 * 환영 분신: 제자리에 분신을 남긴다. 적은 분신을 쫓고, 분신은 사라질 때 터진다.
 * 모습: ghost 주인공을 닮은 반투명 분신(로키), shade 두건 쓴 그림자 연기(하데스, 사라질 때 보라 연기)
 */
class Decoy implements Action {
  private readonly material = new THREE.MeshBasicMaterial({ color: 0x8fe07a, transparent: true, opacity: 0.55, depthWrite: false })
  private readonly decoy: { root: THREE.Object3D }
  private life = 0
  private boost = NO_BOOST
  /** 분신을 세운 곳 (유물을 빼면 적이 더는 분신을 쫓지 않게 치운다) */
  private ctx: SkillContext | null = null

  tint(hex: number): void {
    this.material.color.setHex(hex)
  }

  constructor(
    private readonly p: Readonly<Record<string, number>>,
    fx: THREE.Object3D,
    private readonly look: ActionLook,
  ) {
    this.decoy = look === 'shade' ? shadowRig(this.material) : buildHeroModel()
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
    this.ctx = ctx
    ctx.puffs.burst(hero, 10, 1.5)
    if (this.look === 'shade') ctx.chips(hero, [0x2a1a3a, 0x8a5fd0], 14, 0.5, 0.12)
  }

  update(dt: number, ctx: SkillContext): void {
    if (this.life <= 0) return
    this.life -= dt
    // 끝나 갈수록 빠르게 깜빡인다. 그림자는 깜빡이지 않고 일렁이며 옅어진다
    if (this.look === 'shade') this.material.opacity = 0.35 + Math.sin(this.life * 9) * 0.15
    else this.material.opacity = (this.life < 1 ? Math.sin(this.life * 40) > 0 : true) ? 0.55 : 0.2
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
    if (this.look === 'shade') ctx.chips(p, [0x2a1a3a, 0x8a5fd0, 0x5a3a8a], 24, 1.2, 0.14)
    ctx.shake(0.12)
  }

  dispose(): void {
    // 분신이 떠 있는 채로 유물을 빼면(가방에 넣기·바꿔 끼기·제작) 적이 보이지 않는 분신을 쫓지 않게
    if (this.life > 0) this.ctx?.setDecoy(null)
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

  tint(hex: number): void {
    this.material.color.setHex(hex)
  }

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

/** 길게 뻗는 것 (여의봉·햇빛): 주인공 자리에서 끝이 뻗어 나간다 */
function stretchMesh(look: 'pole' | 'beam', fx: THREE.Object3D): { holder: THREE.Group; body: THREE.Object3D; material?: THREE.MeshBasicMaterial } {
  const holder = new THREE.Group()
  let body: THREE.Object3D
  let material: THREE.MeshBasicMaterial | undefined
  if (look === 'pole') {
    const grid = LOOK_MODELS.wukongStaff!()
    // 길이 1m짜리로 맞춰 두고 z로 늘린다 (끝이 원점)
    const mesh = voxelMesh(grid, { voxelSize: RELIC_VOXEL * 1.4, pivot: [grid.sizeX / 2, grid.sizeY / 2, 0] })
    mesh.scale.z = 1 / (grid.sizeZ * RELIC_VOXEL * 1.4)
    body = new THREE.Group().add(mesh)
  } else {
    material = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85, depthWrite: false })
    const geometry = new THREE.BoxGeometry(0.34, 0.34, 1)
    geometry.translate(0, 0, 0.5)
    const mesh = new THREE.Mesh(geometry, material)
    mesh.layers.set(EFFECT_LAYER)
    mesh.renderOrder = 12
    body = mesh
  }
  holder.add(body)
  holder.visible = false
  fx.add(holder)
  return { holder, body, ...(material ? { material } : {}) }
}

/**
 * 꿰뚫기: 가장 먼 적 쪽으로 던져 길 위의 적을 모두 꿰뚫는다.
 * 모습: branch 겨우살이 가지(발드르의 화살), bolt 번개 창과 번개 줄기, arrow 은빛 화살, pole 쭉 늘어나는 여의봉, beam 곧게 뻗는 햇빛
 */
class Pierce implements Action {
  private readonly missile: Missile | null = null
  private readonly stretch: ReturnType<typeof stretchMesh> | null = null
  private readonly dir = new THREE.Vector3()
  private readonly origin = new THREE.Vector3()
  private readonly tip = new THREE.Vector3()
  private travelled = -1
  /** 다 뻗은 뒤 사라지기까지 (늘어나는 것만) */
  private fade = 0
  private boost = NO_BOOST
  private readonly struck = new Set<CombatTarget>()

  constructor(
    private readonly p: Readonly<Record<string, number>>,
    fx: THREE.Object3D,
    private readonly look: ActionLook,
  ) {
    if (look === 'pole' || look === 'beam') this.stretch = stretchMesh(look, fx)
    else this.missile = makeMissile(look, fx)
  }

  get busy(): boolean {
    return this.travelled >= 0 || this.fade > 0
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
    this.origin.set(hero.x, hero.y + 1.1, hero.z)
    this.tip.copy(this.origin)
    const shown = this.missile?.holder ?? this.stretch!.holder
    shown.position.copy(this.origin)
    shown.rotation.y = Math.atan2(this.dir.x, this.dir.z)
    shown.visible = true
    if (this.stretch) this.stretch.body.scale.z = 0.01
    if (this.stretch?.material) this.stretch.material.opacity = 0.85
    this.travelled = 0
    this.fade = 0
    this.struck.clear()
    // 번개 창: 던지는 순간 끝까지 번개 줄기가 먼저 그어진다
    if (this.look === 'bolt') ctx.lightning.strike(this.origin.clone(), this.origin.clone().addScaledVector(this.dir, this.p.range!), 0.12, 0.3)
  }

  update(dt: number, ctx: SkillContext): void {
    if (this.fade > 0) {
      this.fade -= dt
      if (this.stretch?.material) this.stretch.material.opacity = Math.max(0, this.fade / 0.25) * 0.85
      else if (this.stretch) this.stretch.body.scale.z = Math.max(0.01, this.stretch.body.scale.z * (1 - dt * 12))
      if (this.fade <= 0) this.stretch!.holder.visible = false
      return
    }
    if (this.travelled < 0) return
    const step = this.p.speed! * dt
    this.travelled += step
    this.tip.addScaledVector(this.dir, step)
    if (this.missile) {
      this.missile.holder.position.copy(this.tip)
      turnMissile(this.missile, this.dir.x, this.dir.z, dt)
    } else this.stretch!.body.scale.z = this.travelled
    const p = this.tip
    for (const enemy of ctx.enemies) {
      if (!enemy.alive || this.struck.has(enemy)) continue
      if (Math.hypot(enemy.x - p.x, enemy.z - p.z) > enemy.radius + this.p.hitRadius!) continue
      this.struck.add(enemy)
      ctx.hit(enemy, this.p.damage! * this.boost.damageScale, this.dir.x, this.dir.z, this.p.knockback!, 'strong')
      boostLightning(ctx, enemy, this.boost, this.dir.x, this.dir.z)
      ctx.puffs.burst(new THREE.Vector3(enemy.x, p.y, enemy.z), 6, 1.4)
      const chips = MISSILE_CHIPS[this.look]
      if (chips) ctx.chips(new THREE.Vector3(enemy.x, p.y, enemy.z), chips, 6, 0.4, 0.08)
    }
    if (this.travelled >= this.p.range! + 2) {
      this.travelled = -1
      if (this.missile) this.missile.holder.visible = false
      else this.fade = 0.25
    }
  }

  dispose(): void {
    const holder = this.missile?.holder ?? this.stretch?.holder
    holder?.removeFromParent()
    if (holder) disposeGeometries(holder)
    this.stretch?.material?.dispose()
  }
}

export function createAction(def: ActionDef, fx: THREE.Object3D): Action {
  switch (def.kind) {
    case 'hammerThrow':
      return new HammerThrow(def.params, fx, def.look)
    case 'quake':
      return new Quake(def.params, fx, def.look as ActionLook<'quake'>)
    case 'ingotThrow':
      return new IngotThrow(def.params, fx, def.look)
    case 'decoy':
      return new Decoy(def.params, fx, def.look)
    case 'flameSweep':
      return new FlameSweep(def.params, fx)
    case 'pierce':
      return new Pierce(def.params, fx, def.look)
  }
}

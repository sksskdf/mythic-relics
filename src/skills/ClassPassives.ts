import * as THREE from 'three'

import { SKY_COLORS } from '../art/palette'
import { atLevel } from '../data/check'
import type { ClassPassive, CompanionLook, OrbitShape } from '../data/classKit'
import type { CombatTarget } from '../game/PlayerCombat'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { godDef } from '../relics/data'
import { voxelMesh } from '../voxel/mesher'
import { boar, hound, raven } from '../voxel/models/beasts'
import { HERO_VOXEL } from '../voxel/models/hero'
import { buildHeroModel, type HeroRig } from '../world/heroModel'
import { enemiesWithin, nearestEnemy, type SkillContext } from './Skill'

/** 동료 하나: 곁을 따르다 적에게 달려들어 치고 돌아온다 */
interface Companion {
  root: THREE.Object3D
  /** 날아다니는가 (까마귀) */
  flying: boolean
  timer: number
  dash: { target: CombatTarget; t: number; from: THREE.Vector3 } | null
}

type CompanionSpec = NonNullable<ClassPassive['companions']>

const DASH_TIME = 0.16
const RETURN_SPEED = 9
/** 저주·불꽃 길 피해가 들어가는 간격 (초): 숫자가 매 프레임 뜨지 않게 */
const TICK = 0.5
/** 발자국 조각 모양 (폭 1m, 신화마다 폭은 크기로 바꾼다). 모든 조각이 같이 쓴다 */
const TRAIL_GEOMETRY = new THREE.BoxGeometry(1, 0.06, 1)

/** 하늘에서 내리치는 것의 색 (번개는 번개 연출) */

/** 분신 모습: 반투명한 주인공 */
export function shadowRig(material: THREE.Material): HeroRig {
  const rig = buildHeroModel()
  rig.root.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.material = material
      o.castShadow = false
    }
    o.layers.set(EFFECT_LAYER)
  })
  return rig
}

/** 동료의 몸: 짐승은 복셀 모델, 나머지는 반투명한 분신 */
export function companionBody(look: CompanionLook, color: string, material: THREE.Material): { root: THREE.Object3D; flying: boolean } {
  const tint = new THREE.Color(color).getHex()
  const beast = look === 'raven' ? raven(tint) : look === 'boar' ? boar(tint) : look === 'hound' ? hound(tint) : null
  if (!beast) return { root: shadowRig(material).root, flying: false }
  const root = new THREE.Group()
  const mesh = voxelMesh(beast, { voxelSize: HERO_VOXEL * (look === 'boar' ? 1.6 : 1.4), pivot: [beast.sizeX / 2, 0, beast.sizeZ / 2] })
  mesh.castShadow = true
  root.add(mesh)
  return { root, flying: look === 'raven' }
}

export function orbMesh(shape: OrbitShape, color: number): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false })
  const geometry =
    shape === 'ring'
      ? new THREE.TorusGeometry(0.22, 0.06, 6, 16)
      : shape === 'mirror'
        ? new THREE.CircleGeometry(0.24, 12)
        : shape === 'flame'
          ? new THREE.ConeGeometry(0.14, 0.4, 6)
          : new THREE.BoxGeometry(shape === 'bead' ? 0.18 : 0.26, shape === 'bead' ? 0.24 : 0.26, shape === 'bead' ? 0.18 : 0.26)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.layers.set(EFFECT_LAYER)
  mesh.renderOrder = 12
  return mesh
}

/**
 * 프레임마다 도는 발현 패시브 부품 (E6-09). 기본 공격에 붙는 번개·칼날 폭풍은 DamageSystem에 있다.
 * 어느 부품을 얼마나 쓸지는 gods.json의 passive가 정한다. 부품끼리 섞어 쓸 수 있다.
 * - 하늘에서 내리치기, 동료·분신, 도는 것, 파동, 꽃핌(회복), 버팀: 시간에 따라
 * - 연사, 저주: 기본 공격이 맞을 때 (onBasicHit)
 * - 불꽃 길: 걸은 만큼
 */
export class ClassPassives {
  /** 이 묶음이 돌리는 패시브와 단계 (빌린 힘, E237). 없으면 고른 신화(주신)의 것 */
  bound: { passive: ClassPassive; level: number } | null = null
  private skyTimer = 0
  private pulseTimer = 0
  private bloomTimer = 0
  private guardCooldown = 0
  private readonly companions: Companion[] = []
  /** 발현 순간 사방으로 흩어지는 그림자들 */
  private readonly scatter: { root: THREE.Object3D; dir: THREE.Vector3; t: number }[] = []
  private readonly orbs: THREE.Mesh[] = []
  private orbitAngle = 0
  private orbitKey = ''
  private readonly orbitCooldown = new Map<CombatTarget, number>()
  private readonly cursed = new Map<CombatTarget, { left: number; tick: number }>()
  private readonly trail: { mesh: THREE.Mesh; x: number; z: number; life: number }[] = []
  private readonly trailLast = new THREE.Vector2(NaN, NaN)
  private trailTick = 0
  private readonly pulseRing: THREE.Mesh
  private readonly pulseMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  private pulseLife = 0
  private pulseRadius = 1
  private companionKey = ''
  private readonly materials = new Map<string, THREE.MeshBasicMaterial>()

  constructor(private readonly fx: THREE.Object3D) {
    this.pulseRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 48), this.pulseMaterial)
    this.pulseRing.rotation.x = -Math.PI / 2
    this.pulseRing.layers.set(EFFECT_LAYER)
    this.pulseRing.renderOrder = 12
    this.pulseRing.visible = false
    fx.add(this.pulseRing)
  }

  // ── 점검용 ──
  get companionCount(): number {
    return this.companions.length
  }
  get orbCount(): number {
    return this.orbs.length
  }
  get curseCount(): number {
    return this.cursed.size
  }
  get trailLength(): number {
    return this.trail.length
  }

  private material(color: string, opacity = 0.72): THREE.MeshBasicMaterial {
    const key = `${color}|${opacity}`
    let m = this.materials.get(key)
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
      this.materials.set(key, m)
    }
    return m
  }

  /** 발현·승급 순간 (분신을 쓰는 클래스): count개가 사방으로 흩어지며 사라진다 */
  burst(ctx: SkillContext, count: number, look: CompanionLook = 'shadow', color = '#3f9a4e'): void {
    const hero = ctx.hero.object.position
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const { root } = companionBody(look, color, this.material(color))
      root.position.copy(hero)
      root.rotation.y = a
      this.fx.add(root)
      this.scatter.push({ root, dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), t: 0 })
    }
  }

  /** 돌릴 패시브와 단계: 빌린 힘이면 그것, 아니면 주신의 것 */
  private use(ctx: SkillContext): { passive: ClassPassive | null; level: number } {
    return this.bound ?? { passive: ctx.manifested ? godDef(ctx.manifested).passive : null, level: ctx.level }
  }

  update(dt: number, ctx: SkillContext): void {
    this.updateScatter(dt)
    const { passive, level } = this.use(ctx)
    const on = (p: { minLevel: number } | undefined): p is NonNullable<typeof p> => !!p && level >= p.minLevel
    const hero = ctx.hero.object.position

    // 하늘에서 내리치기
    const sky = passive?.skyStrike
    if (on(sky)) {
      this.skyTimer -= dt
      if (this.skyTimer <= 0) {
        this.skyTimer = atLevel(sky.interval, level)
        const near = enemiesWithin(ctx.enemies, hero.x, hero.z, sky.radius * ctx.area)
          .sort(() => Math.random() - 0.5)
          .slice(0, atLevel(sky.targets, level))
        for (const enemy of near) {
          const at = new THREE.Vector3(enemy.x, hero.y, enemy.z)
          if (sky.style === 'lightning') ctx.lightning.fromSky(at, 0.16)
          else {
            ctx.flash(at, SKY_COLORS[sky.style], 1)
            ctx.puffs.burst(at, 5, 1.2)
          }
          ctx.hit(enemy, atLevel(sky.damage, level), 0, 0, 1, sky.style === 'lightning' ? 'thunder' : 'normal', 'sky')
        }
      }
    }

    // 동료·분신
    const comp = passive?.companions
    const want = on(comp) ? atLevel(comp.counts, level) : 0
    const key = comp ? `${comp.look}|${comp.color}` : ''
    if (key !== this.companionKey) {
      while (this.companions.length > 0) this.removeCompanion()
      this.companionKey = key
    }
    while (this.companions.length > want) this.removeCompanion()
    while (comp && this.companions.length < want) this.addCompanion(ctx, comp)
    if (comp) this.companions.forEach((c, i) => this.updateCompanion(c, i, dt, ctx, comp, level))

    // 도는 것
    const orbit = passive?.orbit
    const orbCount = on(orbit) ? atLevel(orbit.count, level) : 0
    const orbKey = orbit ? `${orbit.shape}|${orbit.color}|${orbCount}` : ''
    if (orbKey !== this.orbitKey) {
      for (const m of this.orbs.splice(0)) m.removeFromParent()
      for (let i = 0; i < orbCount; i++) {
        const mesh = orbMesh(orbit!.shape, new THREE.Color(orbit!.color).getHex())
        this.fx.add(mesh)
        this.orbs.push(mesh)
      }
      this.orbitKey = orbKey
    }
    if (on(orbit) && this.orbs.length > 0) {
      this.orbitAngle += dt * orbit.speed
      for (const [enemy, left] of this.orbitCooldown) left - dt <= 0 ? this.orbitCooldown.delete(enemy) : this.orbitCooldown.set(enemy, left - dt)
      this.orbs.forEach((mesh, i) => {
        const a = this.orbitAngle + (i / this.orbs.length) * Math.PI * 2
        mesh.position.set(hero.x + Math.sin(a) * orbit.radius, hero.y + 1 + Math.sin(a * 2) * 0.15, hero.z + Math.cos(a) * orbit.radius)
        mesh.rotation.y = a
        for (const enemy of enemiesWithin(ctx.enemies, mesh.position.x, mesh.position.z, 0.45)) {
          if (this.orbitCooldown.has(enemy)) continue
          this.orbitCooldown.set(enemy, orbit.hitInterval)
          const dx = enemy.x - hero.x
          const dz = enemy.z - hero.z
          const len = Math.hypot(dx, dz) || 1
          ctx.hit(enemy, atLevel(orbit.damage, level), dx / len, dz / len, 2, 'normal', 'orbit')
        }
      })
    }

    // 파동
    const pulse = passive?.pulse
    if (on(pulse)) {
      this.pulseTimer -= dt
      if (this.pulseTimer <= 0) {
        this.pulseTimer = atLevel(pulse.interval, level)
        const radius = atLevel(pulse.radius, level) * ctx.area
        for (const enemy of enemiesWithin(ctx.enemies, hero.x, hero.z, radius)) {
          const dx = enemy.x - hero.x
          const dz = enemy.z - hero.z
          const len = Math.hypot(dx, dz) || 1
          ctx.hit(enemy, atLevel(pulse.damage, level), dx / len, dz / len, pulse.knockback, 'normal', 'pulse')
        }
        this.pulseMaterial.color.set(pulse.color)
        this.pulseRadius = radius
        this.pulseLife = 0.4
        this.pulseRing.visible = true
      }
    }
    if (this.pulseLife > 0) {
      this.pulseLife -= dt
      const t = 1 - Math.max(0, this.pulseLife) / 0.4
      this.pulseRing.position.set(hero.x, hero.y + 0.12, hero.z)
      this.pulseRing.scale.setScalar(0.4 + t * this.pulseRadius)
      this.pulseMaterial.opacity = (1 - t) * 0.8
      this.pulseRing.visible = this.pulseLife > 0
    }

    // 꽃핌: 시간마다 회복
    const bloom = passive?.bloom
    if (on(bloom)) {
      this.bloomTimer -= dt
      if (this.bloomTimer <= 0) {
        this.bloomTimer = bloom.interval
        if (ctx.heroHp() < 1) {
          ctx.heal(atLevel(bloom.heal, level))
          ctx.flash(hero.clone(), bloom.color, 1)
        }
      }
    }

    // 버팀: 위험할 때 한 번 크게 회복
    const guard = passive?.guard
    this.guardCooldown = Math.max(0, this.guardCooldown - dt)
    if (on(guard) && this.guardCooldown <= 0 && ctx.heroHp() > 0 && ctx.heroHp() < guard.threshold) {
      this.guardCooldown = guard.cooldown
      ctx.heal(atLevel(guard.heal, level))
      ctx.flash(hero.clone(), guard.color, 3)
      ctx.puffs.burst(hero, 14, 2)
    }

    // 저주: 걸린 적이 TICK마다 피해
    const curse = passive?.curse
    for (const [enemy, state] of this.cursed) {
      if (!enemy.alive || !on(curse)) {
        this.cursed.delete(enemy)
        continue
      }
      state.left -= dt
      state.tick -= dt
      if (state.tick <= 0) {
        state.tick = TICK
        ctx.hit(enemy, atLevel(curse.dps, level) * TICK, 0, 0, 0, 'normal', 'dot')
        ctx.puffs.burst(new THREE.Vector3(enemy.x, hero.y + 1.2, enemy.z), 2, 0.5)
      }
      if (state.left <= 0) this.cursed.delete(enemy)
    }

    // 불꽃 길
    this.updateTrail(dt, ctx, passive, level)
  }

  /** 기본 공격이 맞았다: 연사(다른 적에게도 날아감), 저주 걸기 */
  onBasicHit(targets: readonly CombatTarget[], ctx: SkillContext): void {
    const { passive, level } = this.use(ctx)
    const volley = passive?.volley
    if (volley && level >= volley.minLevel && targets.length > 0) {
      const hero = ctx.hero.object.position
      const others = enemiesWithin(ctx.enemies, hero.x, hero.z, volley.range)
        .filter((e) => !targets.includes(e))
        .sort((a, b) => Math.hypot(a.x - hero.x, a.z - hero.z) - Math.hypot(b.x - hero.x, b.z - hero.z))
        .slice(0, atLevel(volley.count, level))
      const from = new THREE.Vector3(hero.x, hero.y + 1.3, hero.z)
      for (const enemy of others) {
        ctx.shots.fire(from, new THREE.Vector3(enemy.x, hero.y + 0.9, enemy.z), new THREE.Color(volley.color).getHex())
        const dx = enemy.x - hero.x
        const dz = enemy.z - hero.z
        const len = Math.hypot(dx, dz) || 1
        ctx.hit(enemy, atLevel(volley.damage, level), dx / len, dz / len, 1, 'normal')
      }
    }
    const curse = passive?.curse
    if (curse && level >= curse.minLevel) {
      // 이미 걸린 적은 시간만 늘린다 (다시 걸 때마다 틱을 처음부터 세면 계속 맞는 적에게는 피해가 안 들어간다)
      for (const t of targets) {
        if (!t.alive) continue
        const state = this.cursed.get(t)
        if (state) state.left = curse.duration
        else this.cursed.set(t, { left: curse.duration, tick: TICK })
      }
    }
  }

  /** 적이 쓰러졌다: 저주가 옆 적에게 옮는다 (spreadMinLevel부터) */
  onKill(target: CombatTarget, ctx: SkillContext): void {
    const { passive, level } = this.use(ctx)
    const curse = passive?.curse
    if (!curse || level < curse.spreadMinLevel || !this.cursed.has(target)) return
    this.cursed.delete(target)
    const next = nearestEnemy(
      ctx.enemies.filter((e) => e !== target && !this.cursed.has(e)),
      target.x,
      target.z,
      4,
    )
    if (next) this.cursed.set(next, { left: curse.duration, tick: TICK })
  }

  private updateTrail(dt: number, ctx: SkillContext, passive: ClassPassive | null, level: number): void {
    const trail = passive?.trail
    const hero = ctx.hero.object.position
    for (let i = this.trail.length - 1; i >= 0; i--) {
      const seg = this.trail[i]!
      seg.life -= dt
      ;(seg.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, seg.life / (trail?.life ?? 1)) * 0.75
      if (seg.life <= 0) {
        seg.mesh.removeFromParent()
        ;(seg.mesh.material as THREE.Material).dispose()
        this.trail.splice(i, 1)
      }
    }
    if (!trail || level < trail.minLevel) return
    if (ctx.hero.isMoving && !(Math.hypot(hero.x - this.trailLast.x, hero.z - this.trailLast.y) < 0.6)) {
      this.trailLast.set(hero.x, hero.z)
      const mesh = new THREE.Mesh(TRAIL_GEOMETRY, this.material(trail.color, 0.75).clone())
      mesh.scale.set(trail.width, 1, trail.width)
      mesh.position.set(hero.x, hero.y + 0.05, hero.z)
      mesh.layers.set(EFFECT_LAYER)
      this.fx.add(mesh)
      this.trail.push({ mesh, x: hero.x, z: hero.z, life: trail.life })
    }
    this.trailTick -= dt
    if (this.trailTick > 0) return
    this.trailTick = TICK
    const struck = new Set<CombatTarget>()
    for (const seg of this.trail) for (const enemy of enemiesWithin(ctx.enemies, seg.x, seg.z, trail.width / 2 + 0.2)) struck.add(enemy)
    for (const enemy of struck) ctx.hit(enemy, atLevel(trail.dps, level) * TICK, 0, 0, 0, 'normal', 'dot')
  }

  private updateScatter(dt: number): void {
    for (let i = this.scatter.length - 1; i >= 0; i--) {
      const s = this.scatter[i]!
      s.t += dt
      s.root.position.addScaledVector(s.dir, dt * 7 * Math.max(0, 1 - s.t))
      s.root.scale.setScalar(Math.max(0.05, 1 - s.t * 1.2))
      if (s.t >= 0.8) {
        s.root.removeFromParent()
        this.scatter.splice(i, 1)
      }
    }
  }

  private addCompanion(ctx: SkillContext, spec: CompanionSpec): void {
    const { root, flying } = companionBody(spec.look, spec.color, this.material(spec.color))
    const hero = ctx.hero.object.position
    root.position.copy(hero)
    this.fx.add(root)
    ctx.puffs.burst(hero, 8, 1.4)
    this.companions.push({ root, flying, timer: 0.4 + this.companions.length * 0.35, dash: null })
  }

  private removeCompanion(): void {
    this.companions.pop()?.root.removeFromParent()
  }

  private updateCompanion(c: Companion, index: number, dt: number, ctx: SkillContext, p: CompanionSpec, level: number): void {
    const root = c.root
    const hero = ctx.hero
    const at = hero.object.position
    const lift = c.flying ? 1.7 : 0
    if (c.dash) {
      const d = c.dash
      d.t += dt
      const k = Math.min(1, d.t / DASH_TIME)
      root.position.set(d.from.x + (d.target.x - d.from.x) * k * 0.85, at.y + lift * (1 - k * 0.6), d.from.z + (d.target.z - d.from.z) * k * 0.85)
      root.rotation.y = Math.atan2(d.target.x - d.from.x, d.target.z - d.from.z)
      if (k >= 1) {
        this.strike(d.target, root.position, ctx, p, level)
        c.dash = null
      }
      return
    }
    // 곁의 자리: 주인공 뒤쪽 좌우로 늘어선다
    const spread = (index - (this.companions.length - 1) / 2) * 1.15
    const facing = hero.facing + Math.PI * 0.75 + spread
    const wantX = at.x + Math.sin(facing) * 1.6
    const wantZ = at.z + Math.cos(facing) * 1.6
    const dx = wantX - root.position.x
    const dz = wantZ - root.position.z
    const dist = Math.hypot(dx, dz)
    if (dist > 0.05) {
      const step = Math.min(dist, RETURN_SPEED * dt)
      root.position.x += (dx / dist) * step
      root.position.z += (dz / dist) * step
    }
    if (dist > 8) root.position.set(wantX, at.y, wantZ)
    root.position.y = at.y + lift + (c.flying ? Math.sin(performance.now() / 200 + index) * 0.15 : 0)
    root.rotation.y = hero.facing
    c.timer -= dt
    if (c.timer > 0) return
    c.timer = p.interval
    const target = nearestEnemy(ctx.enemies, at.x, at.z, p.range)
    if (target) c.dash = { target, t: 0, from: root.position.clone() }
  }

  /** 동료의 일격. burstMinLevel부터 터진다 */
  private strike(target: CombatTarget, from: THREE.Vector3, ctx: SkillContext, p: CompanionSpec, level: number): void {
    const dx = target.x - from.x
    const dz = target.z - from.z
    const len = Math.hypot(dx, dz) || 1
    const tint = new THREE.Color(p.color).getHex()
    ctx.slashes.spawn(from, Math.atan2(dx, dz), 1.4, 0.9, false, tint)
    if (target.alive) ctx.hit(target, atLevel(p.damage, level), dx / len, dz / len, p.look === 'boar' ? 6 : 2, 'normal', 'companion')
    ctx.sound('clone', target.x, target.z)
    if (level < p.burstMinLevel) return
    ctx.puffs.burst(new THREE.Vector3(target.x, from.y + 0.5, target.z), 6, 1.5)
    for (const enemy of enemiesWithin(ctx.enemies, target.x, target.z, p.burstRadius)) {
      const ex = enemy.x - target.x
      const ez = enemy.z - target.z
      const el = Math.hypot(ex, ez) || 1
      ctx.hit(enemy, p.burstDamage, ex / el, ez / el, 3, 'normal', 'companion')
    }
  }

  dispose(): void {
    while (this.companions.length > 0) this.removeCompanion()
    for (const m of this.orbs.splice(0)) m.removeFromParent()
    for (const s of this.trail.splice(0)) {
      s.mesh.removeFromParent()
      ;(s.mesh.material as THREE.Material).dispose()
    }
    for (const s of this.scatter.splice(0)) s.root.removeFromParent()
    this.pulseRing.removeFromParent()
    this.pulseRing.geometry.dispose()
    this.pulseMaterial.dispose()
    for (const m of this.materials.values()) m.dispose()
  }
}

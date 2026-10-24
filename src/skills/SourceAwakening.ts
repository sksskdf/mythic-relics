import * as THREE from 'three'

import { SOURCE_COLORS } from '../art/palette'
import { AWAKENING, RESONANCE_PER, zeroSources } from '../data/awakening'
import type { SourceId } from '../data/schema'
import type { CombatTarget } from '../game/PlayerCombat'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { enemiesWithin, type SkillContext } from './Skill'

const RING_LIFE = 0.35
const BLADE_LIFE = 0.45

/**
 * 원천 각성 (E14-02, DESIGN.md 6.2): 장비의 원천 수치가 문턱을 넘은 원천마다 싸우는 방식이 바뀐다.
 * - 불꽃: 기본 공격 몇 번마다 폭발 (3단계는 한 번 더 번진다)
 * - 사냥: 처치하면 빨라짐, 처치 때 충격, 이어 잡을수록 피해가 오름
 * - 바람: 걸은 만큼 다음 기본 공격이 세짐, 걷는 동안 피함, 걷는 자리에 칼날
 * - 바위: 맞으면 보호막, 깨지면 반격, 서 있을수록 받는 피해가 줄어듦
 * 빨라짐·피해 배율은 값으로 내놓고(Game이 전투·이동에 곱한다), 피해는 ctx.hit로 준다.
 */
export class SourceAwakening {
  /** 원천마다 각성 단계 0~3 (빌드 상태의 awakening) */
  levels: Readonly<Record<SourceId, number>> = zeroSources()
  /** 공명 (모든 각성 효과의 세기) */
  resonance = 0
  /** 최대 생명 (보호막 크기) */
  maxHp = 100
  /** 점검용: 원천마다 터진 수 */
  readonly fired: Record<SourceId, number> = zeroSources()

  private hits = 0
  private haste = 0
  private streak = 0
  private streakLeft = 0
  private charge = 0
  private bladeWalk = 0
  /** 지금 보호막 남은 양과 다시 생기기까지 */
  shield = 0
  private shieldCooldown = 0
  private standing = 0
  private shieldRing: THREE.Mesh | null = null
  private readonly rings: { mesh: THREE.Mesh; life: number; radius: number; follow: boolean }[] = []
  private readonly materials = new Map<string, THREE.MeshBasicMaterial>()

  constructor(private readonly fx: THREE.Object3D) {}

  private get power(): number {
    return 1 + this.resonance * RESONANCE_PER
  }

  /** 기본 공격에 곱하는 배율: 바람 1단계 (걸은 만큼) */
  get basicScale(): number {
    return this.levels.wind >= 1 ? 1 + this.charge * this.power : 1
  }

  /** 모든 피해에 곱하는 배율: 사냥 3단계 (이어 잡은 수) */
  get damageScale(): number {
    return this.levels.hunt >= 3 ? 1 + this.streak * AWAKENING.hunt.streak.per * this.power : 1
  }

  /** 공격 속도·이동 속도 배율: 사냥 1단계 (처치한 뒤 잠깐) */
  get attackSpeed(): number {
    return this.haste > 0 ? 1 + AWAKENING.hunt.haste.attackSpeed * this.power : 1
  }
  get moveSpeed(): number {
    return this.haste > 0 ? 1 + AWAKENING.hunt.haste.moveSpeed * this.power : 1
  }

  /** 받는 피해 배율: 바위 3단계 (서 있던 시간) */
  get takenScale(): number {
    if (this.levels.stone < 3) return 1
    const b = AWAKENING.stone.brace
    return 1 - Math.min(b.max, Math.max(0, this.standing - b.after) * b.perSecond) * Math.min(1.5, this.power)
  }

  private material(color: string, opacity = 0.7): THREE.MeshBasicMaterial {
    const key = `${color}|${opacity}`
    let m = this.materials.get(key)
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })
      this.materials.set(key, m)
    }
    return m
  }

  update(dt: number, ctx: SkillContext): void {
    this.haste = Math.max(0, this.haste - dt)
    if (this.streakLeft > 0) {
      this.streakLeft -= dt
      if (this.streakLeft <= 0) this.streak = 0
    }
    this.shieldCooldown = Math.max(0, this.shieldCooldown - dt)
    this.standing = ctx.hero.isMoving ? 0 : this.standing + dt
    if (this.levels.stone < 1) this.shield = 0
    if (this.levels.wind < 1) this.charge = 0
    this.updateShieldRing(ctx)
    const hero = ctx.hero.object.position
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!
      r.life -= dt
      const t = 1 - Math.max(0, r.life) / RING_LIFE
      if (r.follow) r.mesh.position.set(hero.x, hero.y + 0.12, hero.z)
      r.mesh.scale.setScalar(0.3 + t * r.radius)
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.75
      if (r.life <= 0) {
        r.mesh.removeFromParent()
        ;(r.mesh.material as THREE.Material).dispose()
        this.rings.splice(i, 1)
      }
    }
  }

  /** 기본 공격이 맞았다: 불꽃 연타 폭발, 바람 충전을 쓴다 */
  onBasicHit(targets: readonly CombatTarget[], ctx: SkillContext): void {
    this.charge = 0
    const level = this.levels.flame
    if (level < 1) return
    const first = targets.find((t) => t.alive) ?? targets[0]
    if (!first) return
    const f = AWAKENING.flame
    this.hits++
    if (this.hits < f.every[level - 1]!) return
    this.hits = 0
    const struck = this.burst('flame', first.x, first.z, f.radius[level - 1]!, f.damage[level - 1]!, f.knockback, ctx)
    if (level >= 3 && struck.length > 0) {
      const far = struck.reduce((a, b) => (Math.hypot(b.x - first.x, b.z - first.z) > Math.hypot(a.x - first.x, a.z - first.z) ? b : a))
      this.burst('flame', far.x, far.z, f.spread.radius, f.spread.damage, f.knockback, ctx)
    }
  }

  /** 적을 쓰러뜨렸다: 사냥 */
  onKill(target: CombatTarget, ctx: SkillContext): void {
    const level = this.levels.hunt
    if (level < 1) return
    const h = AWAKENING.hunt
    this.haste = h.haste.time
    if (level >= 2) this.burst('hunt', target.x, target.z, h.shock.radius, h.shock.damage, h.shock.knockback, ctx)
    if (level >= 3) {
      this.streak = Math.min(h.streak.max, this.streak + 1)
      this.streakLeft = h.streak.window
    }
    this.fired.hunt++
  }

  /** 걸었다: 바람 충전, 칼날 */
  onWalk(distance: number, ctx: SkillContext): void {
    const level = this.levels.wind
    if (level < 1) return
    const w = AWAKENING.wind
    this.charge = Math.min(w.charge.max, this.charge + distance * w.charge.perMeter)
    if (level < 3) return
    this.bladeWalk += distance
    if (this.bladeWalk < w.blade.every) return
    this.bladeWalk = 0
    const p = ctx.hero.object.position
    if (enemiesWithin(ctx.enemies, p.x, p.z, w.blade.radius).length === 0) return
    this.burst('wind', p.x, p.z, w.blade.radius, w.blade.damage, 2, ctx, BLADE_LIFE)
  }

  /** 맞기 직전: 바람 회피, 바위 보호막. 실제로 받을 피해를 돌려준다 */
  beforeHeroHit(damage: number, ctx: SkillContext): number {
    if (this.levels.wind >= 2 && ctx.hero.isMoving && Math.random() < Math.min(0.6, AWAKENING.wind.dodge * this.power)) {
      this.fired.wind++
      ctx.puffs.burst(ctx.hero.object.position, 4, 1)
      return 0
    }
    if (this.levels.stone < 1) return damage
    const s = AWAKENING.stone
    let left = damage
    if (this.shield > 0) {
      const absorbed = Math.min(this.shield, left)
      this.shield -= absorbed
      left -= absorbed
      if (this.shield <= 0 && this.levels.stone >= 2) {
        const p = ctx.hero.object.position
        this.burst('stone', p.x, p.z, s.burst.radius, s.burst.damage, s.burst.knockback, ctx, RING_LIFE, true)
      }
    }
    if (this.shield <= 0 && this.shieldCooldown <= 0) {
      this.shield = this.maxHp * s.shield.share * this.power
      this.shieldCooldown = s.shield.cooldown
      this.fired.stone++
    }
    return left
  }

  /** 그 자리에서 터지는 원 하나: 둘레 적을 치고 고리를 띄운다. 맞은 적들을 돌려준다 */
  private burst(source: SourceId, x: number, z: number, radius: number, damage: number, knockback: number, ctx: SkillContext, life = RING_LIFE, follow = false): CombatTarget[] {
    const near = enemiesWithin(ctx.enemies, x, z, radius * ctx.area)
    for (const enemy of near) {
      const dx = enemy.x - x
      const dz = enemy.z - z
      const len = Math.hypot(dx, dz) || 1
      ctx.hit(enemy, damage * this.power, dx / len, dz / len, knockback, 'normal', 'other')
    }
    const color = SOURCE_COLORS[source]![0]
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 36), this.material(color).clone())
    mesh.rotation.x = -Math.PI / 2
    mesh.layers.set(EFFECT_LAYER)
    mesh.renderOrder = 12
    mesh.position.set(x, ctx.hero.object.position.y + 0.12, z)
    this.fx.add(mesh)
    this.rings.push({ mesh, life, radius: radius * ctx.area, follow })
    if (source === 'flame') {
      ctx.flash(new THREE.Vector3(x, ctx.hero.object.position.y, z), color, 1)
      ctx.puffs.burst(new THREE.Vector3(x, ctx.hero.object.position.y + 0.4, z), 4, 1)
    }
    if (source !== 'hunt') this.fired[source]++
    return near
  }

  /** 보호막이 있는 동안 발밑에 바위색 고리 */
  private updateShieldRing(ctx: SkillContext): void {
    if (this.shield <= 0) {
      this.shieldRing?.removeFromParent()
      return
    }
    if (!this.shieldRing) {
      this.shieldRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 32), this.material(SOURCE_COLORS.stone![2], 0.6))
      this.shieldRing.rotation.x = -Math.PI / 2
      this.shieldRing.layers.set(EFFECT_LAYER)
      this.shieldRing.renderOrder = 11
    }
    if (!this.shieldRing.parent) this.fx.add(this.shieldRing)
    const p = ctx.hero.object.position
    this.shieldRing.position.set(p.x, p.y + 0.1, p.z)
  }
}

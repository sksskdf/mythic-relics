import * as THREE from 'three'

import type { ClassPassive } from '../data/schema'
import type { CombatTarget } from '../game/PlayerCombat'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { godDef } from '../relics/data'
import { buildHeroModel, type HeroRig } from '../world/heroModel'
import { enemiesWithin, nearestEnemy, type SkillContext } from './Skill'

/** 분신 한 몸: 곁을 따르다 적에게 달려들어 베고 돌아온다 */
interface Clone {
  rig: HeroRig
  /** 주인공 곁의 자리 (각도) */
  angle: number
  timer: number
  /** 달려드는 중이면 대상과 남은 시간 */
  dash: { target: CombatTarget; t: number; from: THREE.Vector3 } | null
}

type ShadowSpec = NonNullable<ClassPassive['shadowClones']>

const DASH_TIME = 0.16
const RETURN_SPEED = 9

/** 분신 모습: 짙은 초록 그림자 */
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

/**
 * 프레임마다 도는 발현 패시브 (E6). 기본 공격에 붙는 패시브(번개, 칼날 폭풍)는 DamageSystem에 있다.
 * - 폭풍 (천둥, Lv3~): 주변 적에게 저절로 번개가 떨어진다
 * - 그림자 분신 (변신술사): 레벨만큼 분신이 곁을 따르며 가까운 적에게 달려들어 벤다
 */
export class ClassPassives {
  private stormTimer = 0
  private readonly clones: Clone[] = []
  /** 발현 순간 사방으로 흩어지는 그림자들 */
  private readonly scatter: { rig: HeroRig; dir: THREE.Vector3; t: number }[] = []
  private readonly material = new THREE.MeshBasicMaterial({ color: 0x3f9a4e, transparent: true, opacity: 0.72, depthWrite: false })

  constructor(private readonly fx: THREE.Object3D) {}

  /** 지금 곁에 선 분신 수 (점검용) */
  get cloneCount(): number {
    return this.clones.length
  }

  /** 발현·승급 순간 (변신술사): 그림자 분신 count개가 사방으로 흩어지며 사라진다 */
  burst(ctx: SkillContext, count: number): void {
    const hero = ctx.hero.object.position
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2
      const rig = shadowRig(this.material)
      rig.root.position.copy(hero)
      rig.root.rotation.y = a
      this.fx.add(rig.root)
      this.scatter.push({ rig, dir: new THREE.Vector3(Math.sin(a), 0, Math.cos(a)), t: 0 })
    }
  }

  update(dt: number, ctx: SkillContext): void {
    for (let i = this.scatter.length - 1; i >= 0; i--) {
      const s = this.scatter[i]!
      s.t += dt
      s.rig.root.position.addScaledVector(s.dir, dt * 7 * Math.max(0, 1 - s.t))
      s.rig.root.scale.setScalar(Math.max(0.05, 1 - s.t * 1.2))
      if (s.t >= 0.8) {
        s.rig.root.removeFromParent()
        this.scatter.splice(i, 1)
      }
    }
    const passive = ctx.manifested ? godDef(ctx.manifested).passive : null
    const level = ctx.level
    // 폭풍
    const storm = passive?.storm
    if (storm && level >= storm.minLevel) {
      this.stormTimer -= dt
      if (this.stormTimer <= 0) {
        this.stormTimer = storm.interval
        const hero = ctx.hero.object.position
        const near = enemiesWithin(ctx.enemies, hero.x, hero.z, storm.radius)
          .sort(() => Math.random() - 0.5)
          .slice(0, storm.targets)
        for (const enemy of near) {
          ctx.lightning.fromSky(new THREE.Vector3(enemy.x, hero.y, enemy.z), 0.16)
          ctx.hit(enemy, storm.damage, 0, 0, 1, 'thunder')
        }
      }
    }
    // 그림자 분신
    const shadow = passive?.shadowClones
    const want = shadow && level > 0 ? shadow.counts[Math.min(3, level - 1)]! : 0
    while (this.clones.length > want) this.removeClone()
    while (this.clones.length < want) this.addClone(ctx)
    if (!shadow) return
    this.clones.forEach((clone, i) => {
      clone.angle = Math.PI * 0.75 + (i - (this.clones.length - 1) / 2) * 1.15
      this.updateClone(clone, i, dt, ctx, shadow, level)
    })
  }

  private addClone(ctx: SkillContext): void {
    const rig = shadowRig(this.material)
    const hero = ctx.hero.object.position
    rig.root.position.copy(hero)
    this.fx.add(rig.root)
    ctx.puffs.burst(hero, 8, 1.4)
    this.clones.push({ rig, angle: 0, timer: 0.4 + this.clones.length * 0.35, dash: null })
  }

  private removeClone(): void {
    const clone = this.clones.pop()
    clone?.rig.root.removeFromParent()
  }

  private updateClone(
    clone: Clone,
    index: number,
    dt: number,
    ctx: SkillContext,
    p: ShadowSpec,
    level: number,
  ): void {
    const root = clone.rig.root
    const hero = ctx.hero
    const at = hero.object.position
    if (clone.dash) {
      const d = clone.dash
      d.t += dt
      const k = Math.min(1, d.t / DASH_TIME)
      root.position.set(d.from.x + (d.target.x - d.from.x) * k * 0.85, at.y, d.from.z + (d.target.z - d.from.z) * k * 0.85)
      root.rotation.y = Math.atan2(d.target.x - d.from.x, d.target.z - d.from.z)
      if (k >= 1) {
        this.strike(d.target, root.position, ctx, p, level)
        clone.dash = null
      }
      return
    }
    // 곁의 자리로 돌아온다: 주인공 뒤쪽 좌우에 선다
    const facing = hero.facing + clone.angle
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
    root.position.y = at.y
    root.rotation.y = hero.facing
    // 숨 쉬듯 흔들리는 그림자
    root.scale.setScalar(0.95 + Math.sin(performance.now() / 300 + index) * 0.03)
    clone.timer -= dt
    if (clone.timer > 0) return
    clone.timer = p.interval
    const target = nearestEnemy(ctx.enemies, at.x, at.z, p.range)
    if (!target) return
    clone.dash = { target, t: 0, from: root.position.clone() }
  }

  /** 분신의 일격. burstMinLevel부터 초록 불꽃으로 터진다 */
  private strike(target: CombatTarget, from: THREE.Vector3, ctx: SkillContext, p: ShadowSpec, level: number): void {
    const dx = target.x - from.x
    const dz = target.z - from.z
    const len = Math.hypot(dx, dz) || 1
    ctx.slashes.spawn(from, Math.atan2(dx, dz), 1.4, 0.9, false, 0x5fd06a)
    if (target.alive) ctx.hit(target, p.damage, dx / len, dz / len, 2, 'normal')
    ctx.sound('clone', target.x, target.z)
    if (level < p.burstMinLevel) return
    const at = new THREE.Vector3(target.x, from.y + 0.5, target.z)
    ctx.puffs.burst(at, 6, 1.5)
    for (const enemy of enemiesWithin(ctx.enemies, target.x, target.z, p.burstRadius)) {
      const ex = enemy.x - target.x
      const ez = enemy.z - target.z
      const el = Math.hypot(ex, ez) || 1
      ctx.hit(enemy, p.burstDamage, ex / el, ez / el, 3, 'normal')
    }
  }

  dispose(): void {
    while (this.clones.length > 0) this.removeClone()
    this.material.dispose()
  }
}

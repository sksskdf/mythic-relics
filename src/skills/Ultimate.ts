import * as THREE from 'three'

import type { CompanionLook, RainStyle, SkyStyle, UltimateDef } from '../data/classKit'
import type { CombatTarget } from '../game/PlayerCombat'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { companionBody } from './ClassPassives'
import { enemiesWithin, type SkillContext } from './Skill'

/**
 * 궁극기 (E6-09): 신위 게이지가 가득 차고 쓸 만한 때가 오면 저절로 나간다.
 * 종류 다섯(하늘 폭격·군단·난무·파도·비)에 클래스마다 이름·색·숫자·모양을 gods.json에서 준다. (DESIGN.md 5.1.1)
 */
export interface Ultimate {
  readonly active: boolean
  /** 지금 쓰면 좋은 때인가: reach 안에 적 셋 이상이 모였거나, 거인 왕이 가까이 있다. */
  worthUsing(ctx: SkillContext, bossNear: boolean): boolean
  start(ctx: SkillContext): void
  update(dt: number, ctx: SkillContext): void
}

const SKY_COLORS: Record<SkyStyle, number> = { lightning: 0x9fe3ff, sun: 0xffd27a, moon: 0xd8e4ff, stone: 0xa89a80, water: 0x6fc3ff, fire: 0xff8a3a }

function away(fromX: number, fromZ: number, to: CombatTarget): [number, number] {
  const dx = to.x - fromX
  const dz = to.z - fromZ
  const len = Math.hypot(dx, dz) || 1
  return [dx / len, dz / len]
}

abstract class Base implements Ultimate {
  protected time = -1

  constructor(protected readonly def: UltimateDef) {}

  get active(): boolean {
    return this.time >= 0
  }

  worthUsing(ctx: SkillContext, bossNear: boolean): boolean {
    const hero = ctx.hero.object.position
    return bossNear || enemiesWithin(ctx.enemies, hero.x, hero.z, this.def.reach).length >= 3
  }

  start(ctx: SkillContext): void {
    this.time = 0
    const hero = ctx.hero.object.position
    ctx.flash(hero.clone(), this.def.color, 3)
    ctx.shake(0.35)
    if (this.def.heal) ctx.heal(this.def.heal)
    this.begin(ctx)
  }

  protected abstract begin(ctx: SkillContext): void
  abstract update(dt: number, ctx: SkillContext): void
}

/** 하늘 폭격: count번, interval 간격으로 둘레의 적에게 차례로 내리꽂는다 (묠니르의 심판 등) */
class SkyBarrage extends Base {
  private remaining = 0
  private timer = 0
  private index = 0

  protected begin(ctx: SkillContext): void {
    this.remaining = this.def.count
    this.timer = 0.25
    this.index = 0
    const hero = ctx.hero.object.position
    if (this.def.style === 'lightning') ctx.lightning.fromSky(hero.clone(), 0.3)
    ctx.puffs.burst(hero, 20, 3)
    ctx.sound('ultimate')
  }

  update(dt: number, ctx: SkillContext): void {
    if (this.time < 0) return
    this.timer -= dt
    if (this.timer > 0) return
    this.timer = this.def.interval
    this.remaining -= 1
    if (this.remaining < 0) {
      this.time = -1
      return
    }
    const hero = ctx.hero.object.position
    const targets = enemiesWithin(ctx.enemies, hero.x, hero.z, this.def.reach + 2)
    const target = targets[this.index++ % Math.max(1, targets.length)]
    const point = target ? new THREE.Vector3(target.x, hero.y, target.z) : new THREE.Vector3(hero.x + (Math.random() - 0.5) * 10, hero.y, hero.z + (Math.random() - 0.5) * 10)
    const style = (this.def.style ?? 'lightning') as SkyStyle
    if (style === 'lightning') ctx.lightning.fromSky(point, 0.24)
    else ctx.flash(point, SKY_COLORS[style], 2)
    ctx.puffs.burst(point, 8, 2)
    ctx.shake(0.22)
    ctx.sound('thunder', point.x, point.z)
    for (const enemy of enemiesWithin(ctx.enemies, point.x, point.z, this.def.radius)) {
      const [dx, dz] = away(point.x, point.z, enemy)
      ctx.hit(enemy, this.def.damage, dx, dz, 2, style === 'lightning' ? 'thunder' : 'strong')
    }
  }
}

/** 군단: 분신·동료 count개가 흩어졌다가 저마다 적에게 달려들어 터진다 (환영 군단 등) */
class Legion extends Base {
  private readonly material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.72, depthWrite: false })
  private readonly legion: { root: THREE.Object3D; from: THREE.Vector3; to: THREE.Vector3; target: CombatTarget | null; t: number; done: boolean }[] = []

  protected begin(ctx: SkillContext): void {
    this.material.color.set(this.def.color)
    const hero = ctx.hero.object.position
    const targets = enemiesWithin(ctx.enemies, hero.x, hero.z, this.def.reach + 2)
    for (let i = 0; i < this.def.count; i++) {
      const a = (i / this.def.count) * Math.PI * 2
      const { root } = companionBody((this.def.style ?? 'shadow') as CompanionLook, this.def.color, this.material)
      root.position.copy(hero)
      ctx.fx.add(root)
      const to = new THREE.Vector3(hero.x + Math.sin(a) * 2.2, hero.y, hero.z + Math.cos(a) * 2.2)
      this.legion.push({ root, from: hero.clone(), to, target: targets[i % Math.max(1, targets.length)] ?? null, t: -i * this.def.interval, done: false })
    }
    ctx.puffs.burst(hero, 24, 3)
    ctx.sound('legion')
  }

  update(dt: number, ctx: SkillContext): void {
    if (this.time < 0) return
    this.time += dt
    for (const c of this.legion) {
      if (c.done) continue
      c.t += dt
      if (c.t < 0) continue
      // 0~0.25초: 흩어짐, 0.45~0.7초: 달려듦
      if (c.t < 0.25) c.root.position.lerpVectors(c.from, c.to, c.t / 0.25)
      else if (c.t >= 0.45) {
        const k = Math.min(1, (c.t - 0.45) / 0.25)
        const goal = c.target?.alive ? new THREE.Vector3(c.target.x, c.to.y, c.target.z) : c.to.clone().add(c.to.clone().sub(c.from).multiplyScalar(1.5))
        c.root.position.lerpVectors(c.to, goal, k)
        c.root.rotation.y = Math.atan2(goal.x - c.to.x, goal.z - c.to.z)
        if (k >= 1) this.blast(c.root.position, ctx, c)
      }
    }
    if (this.legion.every((c) => c.done)) {
      for (const c of this.legion) c.root.removeFromParent()
      this.legion.length = 0
      this.time = -1
    }
  }

  private blast(at: THREE.Vector3, ctx: SkillContext, c: { done: boolean; root: THREE.Object3D }): void {
    c.done = true
    c.root.visible = false
    ctx.puffs.burst(at, 14, 2.5)
    ctx.slashes.spawn(at, Math.random() * Math.PI * 2, 2, 1.4, true, new THREE.Color(this.def.color).getHex())
    ctx.shake(0.18)
    for (const enemy of enemiesWithin(ctx.enemies, at.x, at.z, this.def.radius)) {
      const [dx, dz] = away(at.x, at.z, enemy)
      ctx.hit(enemy, this.def.damage, dx, dz, 6, 'strong')
    }
  }
}

/** 난무: count번, interval 간격으로 둘레(radius)의 적을 쉼 없이 벤다 (육비난무 등) */
class BladeDance extends Base {
  private remaining = 0
  private timer = 0

  protected begin(ctx: SkillContext): void {
    const hero = ctx.hero.object.position
    const tint = new THREE.Color(this.def.color).getHex()
    for (let i = 0; i < 6; i++) ctx.slashes.spawn(hero, (i / 6) * Math.PI * 2, 3.2, 0.6, true, tint)
    ctx.puffs.burst(hero, 16, 3)
    ctx.sound('bladeDance')
    this.remaining = this.def.count
    this.timer = 0
  }

  update(dt: number, ctx: SkillContext): void {
    if (this.time < 0) return
    this.timer -= dt
    if (this.timer > 0) return
    this.timer = this.def.interval
    if (this.remaining-- <= 0) {
      this.time = -1
      return
    }
    const hero = ctx.hero.object.position
    const near = enemiesWithin(ctx.enemies, hero.x, hero.z, this.def.radius)
    const enemy = near[Math.floor(Math.random() * near.length)]
    const angle = Math.random() * Math.PI * 2
    const tint = new THREE.Color(this.def.color).getHex()
    if (!enemy) {
      ctx.slashes.spawn(hero, angle, 2.4, 0.5, false, tint)
      return
    }
    ctx.slashes.spawn(new THREE.Vector3(enemy.x, hero.y, enemy.z), angle, 1.6, 0.8, true, tint)
    const [dx, dz] = away(hero.x, hero.z, enemy)
    ctx.hit(enemy, this.def.damage, dx, dz, 1.5, 'normal')
    ctx.sound('blade', enemy.x, enemy.z)
  }
}

/** 파도: count겹의 고리가 interval 간격으로 radius까지 퍼지며 지나가는 적을 친다 (해일·지진 등) */
class Wave extends Base {
  private rings: { mesh: THREE.Mesh; t: number; hit: Set<CombatTarget> }[] = []
  private spawned = 0
  private timer = 0

  protected begin(ctx: SkillContext): void {
    this.spawned = 0
    this.timer = 0
    ctx.puffs.burst(ctx.hero.object.position, 24, 4)
    ctx.sound('quake')
  }

  update(dt: number, ctx: SkillContext): void {
    if (this.time < 0) return
    const hero = ctx.hero.object.position
    this.timer -= dt
    if (this.spawned < this.def.count && this.timer <= 0) {
      this.timer = this.def.interval
      this.spawned += 1
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), new THREE.MeshBasicMaterial({ color: this.def.color, transparent: true, depthWrite: false, side: THREE.DoubleSide }))
      mesh.rotation.x = -Math.PI / 2
      mesh.layers.set(EFFECT_LAYER)
      mesh.renderOrder = 12
      ctx.fx.add(mesh)
      this.rings.push({ mesh, t: 0, hit: new Set() })
      ctx.shake(0.25)
    }
    for (const ring of this.rings) {
      ring.t += dt
      const k = Math.min(1, ring.t / 0.55)
      const radius = 0.5 + k * this.def.radius
      ring.mesh.position.set(hero.x, hero.y + 0.15, hero.z)
      ring.mesh.scale.setScalar(radius)
      ;(ring.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - k
      for (const enemy of enemiesWithin(ctx.enemies, hero.x, hero.z, radius)) {
        if (ring.hit.has(enemy)) continue
        ring.hit.add(enemy)
        const [dx, dz] = away(hero.x, hero.z, enemy)
        ctx.hit(enemy, this.def.damage, dx, dz, 8, 'strong')
      }
    }
    for (const ring of this.rings.filter((r) => r.t >= 0.55)) {
      ring.mesh.removeFromParent()
      ring.mesh.geometry.dispose()
    }
    this.rings = this.rings.filter((r) => r.t < 0.55)
    if (this.spawned >= this.def.count && this.rings.length === 0) this.time = -1
  }
}

/** 비: count개가 interval 간격으로 둘레의 적 위로 쏟아진다 (화살 비·창 비·불비 등) */
class Rain extends Base {
  private remaining = 0
  private timer = 0

  protected begin(ctx: SkillContext): void {
    this.remaining = this.def.count
    this.timer = 0.2
    ctx.sound('ultimate')
  }

  update(dt: number, ctx: SkillContext): void {
    if (this.time < 0) return
    this.timer -= dt
    if (this.timer > 0) return
    this.timer = this.def.interval
    if (this.remaining-- <= 0) {
      this.time = -1
      return
    }
    const hero = ctx.hero.object.position
    const near = enemiesWithin(ctx.enemies, hero.x, hero.z, this.def.reach + 2)
    const target = near[Math.floor(Math.random() * near.length)]
    const jitter = () => (Math.random() - 0.5) * 1.2
    const point = target
      ? new THREE.Vector3(target.x + jitter(), hero.y, target.z + jitter())
      : new THREE.Vector3(hero.x + (Math.random() - 0.5) * 8, hero.y, hero.z + (Math.random() - 0.5) * 8)
    const color = new THREE.Color(this.def.color).getHex()
    ctx.shots.fire(new THREE.Vector3(point.x - 1.5, point.y + 7, point.z - 1), point, color, 0.15)
    ctx.puffs.burst(point, (this.def.style as RainStyle) === 'stone' ? 8 : 4, 1.2)
    for (const enemy of enemiesWithin(ctx.enemies, point.x, point.z, this.def.radius)) {
      const [dx, dz] = away(point.x, point.z, enemy)
      ctx.hit(enemy, this.def.damage, dx, dz, 2, 'normal')
    }
  }
}

/** 신 데이터의 궁극기 → 궁극기 */
export function createUltimate(def: UltimateDef): Ultimate {
  switch (def.kind) {
    case 'skyBarrage':
      return new SkyBarrage(def)
    case 'legion':
      return new Legion(def)
    case 'bladeDance':
      return new BladeDance(def)
    case 'wave':
      return new Wave(def)
    case 'rain':
      return new Rain(def)
  }
}

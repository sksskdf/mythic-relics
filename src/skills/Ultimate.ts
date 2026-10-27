import * as THREE from 'three'

import { SKY_COLORS } from '../art/palette'
import type { BladeStyle, CompanionLook, RainStyle, SkyStyle, UltimateDef, WaveStyle } from '../data/classKit'
import type { CombatTarget } from '../game/PlayerCombat'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { voxelMesh } from '../voxel/mesher'
import { mjolnir, RELIC_VOXEL } from '../voxel/models/relics'
import { companionBody } from './ClassPassives'
import { enemiesWithin, type SkillContext } from './Skill'

/**
 * 궁극기 (E6-09): 신위 게이지가 가득 차고 쓸 만한 때가 오면 저절로 나간다.
 * 종류 다섯(하늘 폭격·군단·난무·파도·비)에 클래스마다 이름·색·숫자·모양을 gods.json에서 준다. (DESIGN.md 5.1.1)
 * 종류+모양은 신화마다 다르다 (E18, ART.md 9장).
 */
export interface Ultimate {
  readonly active: boolean
  /** 지금 쓰면 좋은 때인가: reach 안에 적 셋 이상이 모였거나, 거인 왕이 가까이 있다. */
  worthUsing(ctx: SkillContext, bossNear: boolean): boolean
  start(ctx: SkillContext): void
  update(dt: number, ctx: SkillContext): void
}


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

/** 떨어지는 망치 (묠니르의 심판): 하늘에서 내리꽂혀 땅에 박혔다가 사라진다 */
interface Falling {
  mesh: THREE.Object3D
  to: THREE.Vector3
  t: number
}

/**
 * 하늘 폭격: count번, interval 간격으로 둘레의 적에게 차례로 내리꽂는다 (묠니르의 심판 등)
 * 모양: lightning 번개, hammer 번개 두른 망치가 떨어짐, storm 북 울림 고리와 번개 셋, 그 밖에는 그 색 빛기둥
 */
class SkyBarrage extends Base {
  private remaining = 0
  private timer = 0
  private index = 0
  private readonly falling: Falling[] = []

  protected begin(ctx: SkillContext): void {
    this.remaining = this.def.count
    this.timer = 0.25
    this.index = 0
    const hero = ctx.hero.object.position
    if (this.def.style === 'lightning' || this.def.style === 'hammer') ctx.lightning.fromSky(hero.clone(), 0.3)
    if (this.def.style === 'storm') for (let i = 0; i < 6; i++) ctx.slashes.spawn(hero, (i / 6) * Math.PI * 2, this.def.reach * 0.6, 0.5, true, SKY_COLORS.storm)
    ctx.puffs.burst(hero, 20, 3)
    ctx.sound('ultimate')
  }

  update(dt: number, ctx: SkillContext): void {
    this.updateFalling(dt, ctx)
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
    else if (style === 'hammer') this.dropHammer(point, ctx)
    else if (style === 'storm') {
      for (let i = 0; i < 3; i++) {
        const a = Math.random() * Math.PI * 2
        ctx.lightning.fromSky(new THREE.Vector3(point.x + Math.sin(a) * 0.9, point.y, point.z + Math.cos(a) * 0.9), 0.12)
      }
      ctx.slashes.spawn(point, 0, this.def.radius, Math.PI, false, SKY_COLORS.storm)
    } else ctx.flash(point, SKY_COLORS[style], 2)
    ctx.puffs.burst(point, 8, 2)
    ctx.shake(0.22)
    ctx.sound('thunder', point.x, point.z)
    const thunder = style === 'lightning' || style === 'hammer' || style === 'storm'
    for (const enemy of enemiesWithin(ctx.enemies, point.x, point.z, this.def.radius)) {
      const [dx, dz] = away(point.x, point.z, enemy)
      ctx.hit(enemy, this.def.damage, dx, dz, 2, thunder ? 'thunder' : 'strong')
    }
  }

  /** 번개와 함께 망치가 위에서 내리꽂힌다 (판정은 그 자리에서 바로, 망치는 연출) */
  private dropHammer(point: THREE.Vector3, ctx: SkillContext): void {
    ctx.lightning.fromSky(point, 0.18)
    const mesh = voxelMesh(mjolnir(), { voxelSize: RELIC_VOXEL * 2.2, pivot: [4.5, 0, 2.5] })
    // 머리가 아래로
    mesh.rotation.x = Math.PI
    const holder = new THREE.Group().add(mesh)
    holder.position.set(point.x, point.y + 6, point.z)
    ctx.fx.add(holder)
    this.falling.push({ mesh: holder, to: point.clone(), t: 0 })
  }

  private updateFalling(dt: number, ctx: SkillContext): void {
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i]!
      f.t += dt
      // 0.12초에 땅까지, 0.3초 박혀 있다가 사라진다
      const k = Math.min(1, f.t / 0.12)
      f.mesh.position.y = f.to.y + 6 * (1 - k) + 0.9
      if (k >= 1 && f.t - dt < 0.12) ctx.chips(f.to, [0x9aa4ae, 0x7fd4ff], 8, 0.6, 0.1)
      if (f.t > 0.45) {
        f.mesh.removeFromParent()
        f.mesh.traverse((o) => {
          if (o instanceof THREE.Mesh) o.geometry.dispose()
        })
        this.falling.splice(i, 1)
      }
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

/**
 * 난무: count번, interval 간격으로 둘레(radius)의 적을 쉼 없이 벤다 (육비난무 등)
 * 모양: six 여섯 칼이 엇갈려 벤다(벨 때마다 칼자국 둘), fire 불꽃 바퀴가 돌며 벨 때마다 불티
 */
class BladeDance extends Base {
  private remaining = 0
  private timer = 0

  protected begin(ctx: SkillContext): void {
    const hero = ctx.hero.object.position
    const tint = new THREE.Color(this.def.color).getHex()
    const style = this.def.style as BladeStyle
    for (let i = 0; i < 6; i++) ctx.slashes.spawn(hero, (i / 6) * Math.PI * 2, 3.2, 0.6, true, tint)
    if (style === 'fire') {
      ctx.slashes.spawn(hero, 0, this.def.radius, Math.PI, true, 0xffb02a)
      ctx.chips(hero, [0xff7ab8, 0xffb02a, 0xff4a2a], 24, 1, 0.12)
    }
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
    const at = new THREE.Vector3(enemy.x, hero.y, enemy.z)
    ctx.slashes.spawn(at, angle, 1.6, 0.8, true, tint)
    if (this.def.style === 'six') ctx.slashes.spawn(at, angle + Math.PI / 2, 1.6, 0.8, false, tint)
    else ctx.chips(at, [0xffb02a, 0xff7ab8], 5, 0.6, 0.08)
    const [dx, dz] = away(hero.x, hero.z, enemy)
    ctx.hit(enemy, this.def.damage, dx, dz, 1.5, 'normal')
    ctx.sound('blade', enemy.x, enemy.z)
  }
}

/** 물결 모양별 덧붙임: 조각 색, 고리 대신 원반, 솟는 물벽 */
const WAVE_CHIPS: Readonly<Partial<Record<WaveStyle, readonly number[]>>> = {
  bloom: [0xffb8d8, 0xffe08a, 0xffffff],
  tide: [0x6fc3ff, 0xbfe9ff],
  spirit: [0x9fe0c0, 0xe6fff2],
}

/**
 * 파도: count겹의 고리가 interval 간격으로 radius까지 퍼지며 지나가는 적을 친다 (해일·지진 등)
 * 모양: bloom 꽃잎이 날리는 고리, tide 높은 물벽, ripple 가는 고리가 둘씩, night 어둠 원반이 번짐, gale 고리를 따라 칼바람, spirit 혼령이 위로 솟음
 */
class Wave extends Base {
  private rings: { mesh: THREE.Mesh; t: number; hit: Set<CombatTarget> }[] = []
  private spawned = 0
  private timer = 0

  private get style(): WaveStyle {
    return this.def.style as WaveStyle
  }

  protected begin(ctx: SkillContext): void {
    this.spawned = 0
    this.timer = 0
    ctx.puffs.burst(ctx.hero.object.position, 24, 4)
    if (this.style === 'spirit') ctx.flash(ctx.hero.object.position.clone(), this.def.color, 2)
    ctx.sound('quake')
  }

  private ringMesh(): THREE.Mesh {
    const material = new THREE.MeshBasicMaterial({ color: this.def.color, transparent: true, depthWrite: false, side: THREE.DoubleSide })
    const geometry =
      this.style === 'tide'
        ? new THREE.CylinderGeometry(1, 1, 1.4, 40, 1, true).translate(0, 0.7, 0)
        : this.style === 'night'
          ? new THREE.CircleGeometry(1, 40)
          : new THREE.RingGeometry(this.style === 'ripple' ? 0.92 : 0.8, 1, 48)
    const mesh = new THREE.Mesh(geometry, material)
    if (this.style !== 'tide') mesh.rotation.x = -Math.PI / 2
    if (this.style === 'night') material.color.lerp(new THREE.Color(0x0a0c20), 0.5)
    mesh.layers.set(EFFECT_LAYER)
    mesh.renderOrder = 12
    return mesh
  }

  update(dt: number, ctx: SkillContext): void {
    if (this.time < 0) return
    const hero = ctx.hero.object.position
    this.timer -= dt
    if (this.spawned < this.def.count && this.timer <= 0) {
      this.timer = this.def.interval
      this.spawned += 1
      const echoes = this.style === 'ripple' ? 2 : 1
      for (let e = 0; e < echoes; e++) {
        const mesh = this.ringMesh()
        ctx.fx.add(mesh)
        this.rings.push({ mesh, t: -e * 0.12, hit: new Set() })
      }
      const chips = WAVE_CHIPS[this.style]
      if (chips) ctx.chips(hero, chips, 16, this.style === 'spirit' ? 2 : 1, 0.12)
      if (this.style === 'gale') for (let i = 0; i < 6; i++) ctx.slashes.spawn(hero, (i / 6) * Math.PI * 2 + this.spawned, this.def.radius * 0.8, 0.35, true, new THREE.Color(this.def.color).getHex())
      ctx.shake(0.25)
    }
    for (const ring of this.rings) {
      ring.t += dt
      if (ring.t < 0) continue
      const k = Math.min(1, ring.t / 0.55)
      const radius = 0.5 + k * this.def.radius
      ring.mesh.position.set(hero.x, hero.y + 0.15, hero.z)
      // 물벽은 세운 원통이라 높이(y)가 낮아지고, 나머지는 눕힌 고리라 x·y가 반지름
      ring.mesh.scale.set(radius, this.style === 'tide' ? 1 - k * 0.6 : radius, radius)
      ;(ring.mesh.material as THREE.MeshBasicMaterial).opacity = (this.style === 'night' ? 0.7 : this.style === 'tide' ? 0.55 : 1) * (1 - k)
      for (const enemy of enemiesWithin(ctx.enemies, hero.x, hero.z, radius)) {
        if (ring.hit.has(enemy)) continue
        ring.hit.add(enemy)
        const [dx, dz] = away(hero.x, hero.z, enemy)
        ctx.hit(enemy, this.def.damage / (this.style === 'ripple' ? 2 : 1), dx, dz, 8, 'strong')
      }
    }
    for (const ring of this.rings.filter((r) => r.t >= 0.55)) {
      ring.mesh.removeFromParent()
      ring.mesh.geometry.dispose()
      ;(ring.mesh.material as THREE.Material).dispose()
    }
    this.rings = this.rings.filter((r) => r.t < 0.55)
    if (this.spawned >= this.def.count && this.rings.length === 0) this.time = -1
  }
}

/** 비 모양별로 맞은 자리에 튀는 조각 */
const RAIN_CHIPS: Readonly<Partial<Record<RainStyle, readonly number[]>>> = {
  stone: [0xa89a80, 0x7a6a52],
  foxfire: [0x5fa8ff, 0x9fd0ff],
  star: [0xf0e6ff, 0xffffff],
  petal: [0xffb8d8, 0xffffff],
  fire: [0xffcf40, 0xff9a3c],
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
    const style = this.def.style as RainStyle
    // 창은 곧게 내리꽂히고, 화살은 비스듬히, 돌·도깨비불은 무겁게 떨어진다
    const slant = style === 'spear' ? 0.2 : style === 'arrow' ? 2 : 1.5
    ctx.shots.fire(new THREE.Vector3(point.x - slant, point.y + 7, point.z - slant * 0.6), point, color, style === 'stone' || style === 'foxfire' ? 0.22 : 0.15)
    ctx.puffs.burst(point, style === 'stone' ? 8 : 4, 1.2)
    const chips = RAIN_CHIPS[style]
    if (chips) ctx.chips(point, chips, style === 'foxfire' ? 6 : 4, style === 'foxfire' ? 1.4 : 0.5, 0.1)
    if (style === 'fire') ctx.flash(point, this.def.color, 1)
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

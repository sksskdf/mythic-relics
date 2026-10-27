import * as THREE from 'three'

import { SKY_COLORS } from '../art/palette'
import { type Echo, echoEvery } from '../build/BuildState'
import { atLevel } from '../data/check'
import type { CombatTarget } from '../game/PlayerCombat'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { type God, godDef } from '../relics/data'
import { companionBody, orbMesh } from './ClassPassives'
import { enemiesWithin, nearestEnemy, type SkillContext } from './Skill'

/** 메아리 동료가 달려드는 시간과 사라지는 시간 */
const GHOST_DASH = 0.22
const GHOST_FADE = 0.3
/** 메아리 구슬이 한 바퀴 도는 시간 */
const ORB_TURN = 1.2
/** 메아리 저주 길이 */
const CURSE_TIME = 2
/** 지속 피해가 들어가는 간격 (초) */
const TICK = 0.5
/** 메아리 파동 넓이: 그 패시브 1단계 넓이의 비율 */
const PULSE_SHARE = 0.7

/** 장면에서 빼고, 이것만 쓰는 형상이면 GPU에서도 해제한다 (터질 때마다 새로 만들므로) */
function release(object: THREE.Object3D, owned: boolean): void {
  object.removeFromParent()
  if (!owned) return
  object.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose()
  })
}

/**
 * 상시 효과의 메아리 (E12-03, DESIGN.md 4.2.1).
 * 고르지 않은 열린 신화마다, 그 신화 고유 패시브 부품이 가끔 한 번 터진다.
 * 동료·도는 것도 잠깐 나타나 한 번 치고 사라진다. 여러 신화를 열어도 화면이 어지럽지 않게 모두 한 번짜리다.
 */
export class MythEchoes {
  /** 지금 도는 메아리 (빌드 상태의 echoes) */
  list: readonly Echo[] = []
  /** 점검용: 지금까지 터진 수 */
  fired = 0

  private readonly timers = new Map<God, number>()
  private readonly hits = new Map<God, number>()
  /** owned: 이 메아리만 쓰는 형상이라 사라질 때 해제한다 (그림자 분신은 주인공과 형상을 함께 쓴다) */
  private readonly ghosts: { root: THREE.Object3D; target: CombatTarget; from: THREE.Vector3; t: number; damage: number; color: number; owned: boolean }[] = []
  private readonly orbs: { mesh: THREE.Mesh; t: number; radius: number; damage: number; struck: Set<CombatTarget> }[] = []
  private readonly rings: { mesh: THREE.Mesh; life: number; radius: number }[] = []
  private readonly flames: { mesh: THREE.Mesh; x: number; z: number; life: number; full: number; dps: number; width: number }[] = []
  private readonly dots = new Map<CombatTarget, { left: number; tick: number; dps: number }>()
  private flameTick = 0
  private readonly materials = new Map<string, THREE.MeshBasicMaterial>()

  constructor(private readonly fx: THREE.Object3D) {}

  private material(color: string, opacity = 0.6): THREE.MeshBasicMaterial {
    const key = `${color}|${opacity}`
    let m = this.materials.get(key)
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide })
      this.materials.set(key, m)
    }
    return m
  }

  update(dt: number, ctx: SkillContext): void {
    const hero = ctx.hero.object.position
    for (const echo of this.list) {
      const always = godDef(echo.god).always
      const { trigger } = always.echo
      if (trigger !== 'seconds' && trigger !== 'walking') continue
      if (trigger === 'walking' && !ctx.hero.isMoving) continue
      // 처음 열린 신화끼리 한꺼번에 터지지 않게 간격 안에서 흩어 둔다
      const every = echoEvery(always.echo.every, trigger, echo.stage)
      const left = (this.timers.get(echo.god) ?? every * Math.random()) - dt
      if (left > 0) {
        this.timers.set(echo.god, left)
        continue
      }
      // 칠 적이 없으면 기다렸다가 적이 오면 바로 터진다
      if (this.fire(echo.god, ctx)) this.timers.set(echo.god, every)
      else this.timers.set(echo.god, 0)
    }
    this.updateGhosts(dt, ctx)
    this.updateOrbs(dt, ctx, hero)
    this.updateRings(dt, hero)
    this.updateFlames(dt, ctx)
    this.updateDots(dt, ctx)
    // 닫힌(또는 고른) 신화의 타이머는 지운다
    for (const god of this.timers.keys()) if (!this.list.some((e) => e.god === god)) this.timers.delete(god)
  }

  /** 기본 공격이 맞았다: 공격 수·확률로 터지는 메아리 */
  onBasicHit(targets: readonly CombatTarget[], ctx: SkillContext): void {
    const first = targets.find((t) => t.alive)
    if (!first) return
    for (const echo of this.list) {
      const always = godDef(echo.god).always
      const { trigger } = always.echo
      const every = echoEvery(always.echo.every, trigger, echo.stage)
      if (trigger === 'hits') {
        const count = (this.hits.get(echo.god) ?? 0) + 1
        if (count < every) {
          this.hits.set(echo.god, count)
          continue
        }
        this.hits.set(echo.god, 0)
        this.fire(echo.god, ctx, first)
      } else if (trigger === 'chance' && Math.random() < every) this.fire(echo.god, ctx, first)
    }
  }

  /** 그 신화의 메아리 한 번. 칠 적이 없어 못 터졌으면 false */
  private fire(god: God, ctx: SkillContext, first?: CombatTarget): boolean {
    const def = godDef(god)
    const { part, damage } = def.always.echo
    const passive = def.passive
    const hero = ctx.hero.object.position
    const dirTo = (t: { x: number; z: number }) => {
      const dx = t.x - hero.x
      const dz = t.z - hero.z
      const len = Math.hypot(dx, dz) || 1
      return [dx / len, dz / len] as const
    }
    switch (part) {
      case 'skyStrike': {
        const sky = passive.skyStrike!
        const near = enemiesWithin(ctx.enemies, hero.x, hero.z, sky.radius * ctx.area)
        const enemy = near[Math.floor(Math.random() * near.length)]
        if (!enemy) return false
        const at = new THREE.Vector3(enemy.x, hero.y, enemy.z)
        if (sky.style === 'lightning') ctx.lightning.fromSky(at, 0.1)
        else {
          ctx.flash(at, SKY_COLORS[sky.style], 1)
          ctx.puffs.burst(at, 3, 1)
        }
        ctx.hit(enemy, damage, 0, 0, 1, sky.style === 'lightning' ? 'thunder' : 'normal', 'sky')
        break
      }
      case 'companions': {
        const comp = passive.companions!
        const target = nearestEnemy(ctx.enemies, hero.x, hero.z, comp.range)
        if (!target) return false
        const { root } = companionBody(comp.look, comp.color, this.material(comp.color, 0.55))
        const side = Math.random() < 0.5 ? -1 : 1
        root.position.set(hero.x + Math.sin(ctx.hero.facing + side * 1.6) * 1.2, hero.y, hero.z + Math.cos(ctx.hero.facing + side * 1.6) * 1.2)
        this.fx.add(root)
        ctx.puffs.burst(root.position, 5, 1)
        const owned = comp.look === 'raven' || comp.look === 'boar' || comp.look === 'hound'
        this.ghosts.push({ root, target, from: root.position.clone(), t: 0, damage, color: new THREE.Color(comp.color).getHex(), owned })
        break
      }
      case 'orbit': {
        const orbit = passive.orbit!
        if (enemiesWithin(ctx.enemies, hero.x, hero.z, orbit.radius + 1).length === 0) return false
        const mesh = orbMesh(orbit.shape, new THREE.Color(orbit.color).getHex())
        this.fx.add(mesh)
        this.orbs.push({ mesh, t: 0, radius: orbit.radius, damage, struck: new Set() })
        break
      }
      case 'pulse': {
        const pulse = passive.pulse!
        const radius = atLevel(pulse.radius, 1) * PULSE_SHARE * ctx.area
        const near = enemiesWithin(ctx.enemies, hero.x, hero.z, radius)
        if (near.length === 0) return false
        for (const enemy of near) {
          const [dx, dz] = dirTo(enemy)
          ctx.hit(enemy, damage, dx, dz, pulse.knockback * 0.5, 'normal', 'pulse')
        }
        const mesh = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), this.material(pulse.color, 0.7).clone())
        mesh.rotation.x = -Math.PI / 2
        mesh.layers.set(EFFECT_LAYER)
        mesh.renderOrder = 12
        this.fx.add(mesh)
        this.rings.push({ mesh, life: 0.35, radius })
        break
      }
      case 'trail': {
        const trail = passive.trail!
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(trail.width, 0.06, trail.width), this.material(trail.color, 0.7).clone())
        mesh.position.set(hero.x, hero.y + 0.05, hero.z)
        mesh.layers.set(EFFECT_LAYER)
        this.fx.add(mesh)
        this.flames.push({ mesh, x: hero.x, z: hero.z, life: trail.life, full: trail.life, dps: damage, width: trail.width })
        break
      }
      case 'basicLightning': {
        if (!first?.alive) return false
        ctx.lightning.strike(new THREE.Vector3(hero.x, hero.y + 1.6, hero.z), new THREE.Vector3(first.x, hero.y + 0.8, first.z), 0.05, 0.1)
        const [dx, dz] = dirTo(first)
        ctx.hit(first, damage, dx, dz, 0, 'thunder')
        break
      }
      case 'volley': {
        const volley = passive.volley!
        const target =
          enemiesWithin(ctx.enemies, hero.x, hero.z, volley.range)
            .filter((e) => e !== first)
            .sort((a, b) => Math.hypot(a.x - hero.x, a.z - hero.z) - Math.hypot(b.x - hero.x, b.z - hero.z))[0] ?? first
        if (!target?.alive) return false
        ctx.shots.fire(new THREE.Vector3(hero.x, hero.y + 1.3, hero.z), new THREE.Vector3(target.x, hero.y + 0.9, target.z), new THREE.Color(volley.color).getHex())
        const [dx, dz] = dirTo(target)
        ctx.hit(target, damage, dx, dz, 1, 'normal')
        break
      }
      case 'curse': {
        if (!first?.alive) return false
        const state = this.dots.get(first)
        if (state) state.left = CURSE_TIME
        else this.dots.set(first, { left: CURSE_TIME, tick: TICK, dps: damage })
        ctx.puffs.burst(new THREE.Vector3(first.x, hero.y + 1.2, first.z), 3, 0.6)
        break
      }
      case 'bladeStorm': {
        const storm = passive.bladeStorm!
        const near = enemiesWithin(ctx.enemies, hero.x, hero.z, storm.radius)
        const enemy = near[Math.floor(Math.random() * near.length)] ?? first
        if (!enemy?.alive) return false
        const tint = storm.color ? new THREE.Color(storm.color).getHex() : 0xff4a5a
        ctx.slashes.spawn(new THREE.Vector3(enemy.x, hero.y, enemy.z), Math.random() * Math.PI * 2, 1, 0.7, false, tint)
        const [dx, dz] = dirTo(enemy)
        ctx.hit(enemy, damage, dx, dz, 1, 'normal')
        break
      }
    }
    this.fired += 1
    return true
  }

  private updateGhosts(dt: number, ctx: SkillContext): void {
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i]!
      g.t += dt
      if (g.t < GHOST_DASH) {
        const k = g.t / GHOST_DASH
        g.root.position.set(g.from.x + (g.target.x - g.from.x) * k * 0.85, g.from.y, g.from.z + (g.target.z - g.from.z) * k * 0.85)
        g.root.rotation.y = Math.atan2(g.target.x - g.from.x, g.target.z - g.from.z)
        continue
      }
      if (g.damage > 0) {
        const dx = g.target.x - g.root.position.x
        const dz = g.target.z - g.root.position.z
        const len = Math.hypot(dx, dz) || 1
        ctx.slashes.spawn(g.root.position, Math.atan2(dx, dz), 1.2, 0.8, false, g.color)
        if (g.target.alive) ctx.hit(g.target, g.damage, dx / len, dz / len, 2, 'normal', 'companion')
        ctx.sound('clone', g.target.x, g.target.z)
        g.damage = 0
      }
      const fade = (g.t - GHOST_DASH) / GHOST_FADE
      g.root.scale.setScalar(Math.max(0.05, 1 - fade))
      if (fade >= 1) {
        release(g.root, g.owned)
        this.ghosts.splice(i, 1)
      }
    }
  }

  private updateOrbs(dt: number, ctx: SkillContext, hero: THREE.Vector3): void {
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i]!
      o.t += dt
      const a = (o.t / ORB_TURN) * Math.PI * 2
      o.mesh.position.set(hero.x + Math.sin(a) * o.radius, hero.y + 1, hero.z + Math.cos(a) * o.radius)
      o.mesh.rotation.y = a
      for (const enemy of enemiesWithin(ctx.enemies, o.mesh.position.x, o.mesh.position.z, 0.5)) {
        if (o.struck.has(enemy)) continue
        o.struck.add(enemy)
        const dx = enemy.x - hero.x
        const dz = enemy.z - hero.z
        const len = Math.hypot(dx, dz) || 1
        ctx.hit(enemy, o.damage, dx / len, dz / len, 1.5, 'normal', 'orbit')
      }
      if (o.t >= ORB_TURN) {
        release(o.mesh, true)
        ;(o.mesh.material as THREE.Material).dispose()
        this.orbs.splice(i, 1)
      }
    }
  }

  private updateRings(dt: number, hero: THREE.Vector3): void {
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]!
      r.life -= dt
      const t = 1 - Math.max(0, r.life) / 0.35
      r.mesh.position.set(hero.x, hero.y + 0.12, hero.z)
      r.mesh.scale.setScalar(0.4 + t * r.radius)
      ;(r.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - t) * 0.7
      if (r.life <= 0) {
        release(r.mesh, true)
        ;(r.mesh.material as THREE.Material).dispose()
        this.rings.splice(i, 1)
      }
    }
  }

  private updateFlames(dt: number, ctx: SkillContext): void {
    for (let i = this.flames.length - 1; i >= 0; i--) {
      const f = this.flames[i]!
      f.life -= dt
      ;(f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life / f.full) * 0.7
      if (f.life <= 0) {
        release(f.mesh, true)
        ;(f.mesh.material as THREE.Material).dispose()
        this.flames.splice(i, 1)
      }
    }
    this.flameTick -= dt
    if (this.flameTick > 0) return
    this.flameTick = TICK
    for (const f of this.flames) for (const enemy of enemiesWithin(ctx.enemies, f.x, f.z, f.width / 2 + 0.2)) ctx.hit(enemy, f.dps * TICK, 0, 0, 0, 'normal', 'dot')
  }

  private updateDots(dt: number, ctx: SkillContext): void {
    for (const [enemy, state] of this.dots) {
      if (!enemy.alive) {
        this.dots.delete(enemy)
        continue
      }
      state.left -= dt
      state.tick -= dt
      if (state.tick <= 0) {
        state.tick = TICK
        ctx.hit(enemy, state.dps * TICK, 0, 0, 0, 'normal', 'dot')
      }
      if (state.left <= 0) this.dots.delete(enemy)
    }
  }

  dispose(): void {
    for (const g of this.ghosts.splice(0)) release(g.root, g.owned)
    for (const o of this.orbs.splice(0)) release(o.mesh, true)
    for (const r of this.rings.splice(0)) release(r.mesh, true)
    for (const f of this.flames.splice(0)) release(f.mesh, true)
    this.dots.clear()
    for (const m of this.materials.values()) m.dispose()
  }
}

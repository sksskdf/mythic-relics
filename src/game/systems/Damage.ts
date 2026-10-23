import * as THREE from 'three'

import { godDef } from '../../relics/data'
import type { DamageStyle } from '../../ui/DamageNumbers'
import { heightAt } from '../../world/terrain'
import type { GameContext } from '../context'
import type { CombatTarget, HitReport } from '../PlayerCombat'

/** 신위 게이지: 스킬로 맞힐 때, 쓰러뜨릴 때 차오르는 양 */
const DIVINE_PER_SKILL_HIT = 0.01
const DIVINE_PER_KILL = 0.05

/**
 * 피해 처리: 주인공이 주는 피해(배율, 숫자, 신위 게이지)와 받는 피해.
 * 대상을 쓰러뜨리면 targetKilled, 주인공이 맞으면 heroHurt를 보낸다.
 */
export class DamageSystem {
  private readonly scratch = new THREE.Vector3()

  constructor(private readonly ctx: GameContext) {}

  /** 기본 공격과 스킬에 공통으로 곱하는 피해 배율 */
  scale(_style: DamageStyle | 'basic'): number {
    return this.ctx.build.state.damageScale
  }

  /** 스킬로 적에게 피해를 준다. 배율, 피해 숫자, 신위 게이지를 함께 처리한다. */
  deal(target: CombatTarget, damage: number, dirX: number, dirZ: number, knockback: number, style: DamageStyle): void {
    if (!target.alive) return
    const { combat, numbers, build, bus } = this.ctx
    const state = build.state
    const dealt = target.takeHit(damage * state.damageScale, dirX, dirZ, knockback * state.modifiers.knockbackDealt)
    if (dealt > 0 && !target.alive) bus.emit('targetKilled', { target })
    if (dealt <= 0) return
    if (style === 'thunder') bus.emit('sound', { cue: 'thunder', x: target.x, z: target.z })
    this.scratch.set(target.x, heightAt(target.x, target.z) + target.radius * 3, target.z)
    numbers.show(this.scratch, dealt, style)
    combat.addDivine(DIVINE_PER_SKILL_HIT + (target.alive ? 0 : DIVINE_PER_KILL))
  }

  /** 기본 공격이 맞았다: 피해 숫자, 유물 연타 연동, 발현 패시브(번개) */
  onHeroHits(hits: HitReport[]): void {
    const { combat, numbers, powers, progress, hero, fx, feel, view, bus, skills } = this.ctx
    for (const hit of hits) {
      const { x, z, radius } = hit.target
      // 거인 키는 몸 반지름의 약 3배
      this.scratch.set(x, heightAt(x, z) + radius * 3, z)
      numbers.show(this.scratch, hit.damage, hit.strong ? 'strong' : 'normal')
      if (!hit.target.alive) {
        combat.addDivine(DIVINE_PER_KILL)
        bus.emit('targetKilled', { target: hit.target })
      }
    }
    if (hits.length === 0) return
    bus.emit('basicHits', { targets: hits.map((h) => h.target) })
    powers.classPassives.onBasicHit(
      hits.map((h) => h.target),
      skills,
    )
    powers.onBasicHit(
      {
        targets: hits.map((h) => h.target),
        comboIndex: Math.max(0, combat.combo.index),
        comboLength: combat.combo.swings.length,
        finisher: hits[0]!.strong,
      },
      skills,
    )
    // 발현 패시브: 처음 맞은 적에게 번개가 함께 떨어지고(천둥의 신), 레벨이 차면 옮겨 붙는다(천둥군주).
    const first = hits[0]!.target
    const manifested = this.ctx.build.chosen
    const passive = manifested ? godDef(manifested).passive : null
    if (manifested && passive?.basicLightning && first.alive) {
      const finisher = hits[0]!.strong
      const p = hero.object.position
      const from = new THREE.Vector3(p.x, p.y + 1.6, p.z)
      fx.lightning.strike(from, new THREE.Vector3(first.x, p.y + 0.8, first.z), 0.08, 0.12)
      const dx = first.x - p.x
      const dz = first.z - p.z
      const len = Math.hypot(dx, dz) || 1
      const bolt = passive.basicLightning
      this.deal(first, finisher ? bolt.finisherDamage : bolt.damage, dx / len, dz / len, 0, 'thunder')
      const chain = passive.chainLightning
      const level = progress.level(manifested)
      if (chain && level >= chain.minLevel) {
        const jumps = level >= 4 && chain.topJumps ? chain.topJumps : chain.jumps
        this.chainLightning(first, finisher ? chain.finisherDamage : chain.damage, jumps, chain.range)
      }
    }
    // 발현 패시브: 칼날 폭풍 (아수라왕). 등의 팔들이 가까운 적들에게 차례로 칼을 휘두른다.
    const storm = passive?.bladeStorm
    if (manifested && storm) {
      const level = progress.level(manifested)
      const blades = Math.round(storm.base + storm.perLevel * (level - 1))
      const p = hero.object.position
      const near = this.ctx.encounter.alive.filter((e) => Math.hypot(e.x - p.x, e.z - p.z) < storm.radius)
      for (let i = 0; i < blades && near.length > 0; i++) {
        const enemy = near[i % near.length]!
        const dx = enemy.x - p.x
        const dz = enemy.z - p.z
        const len = Math.hypot(dx, dz) || 1
        // 칼 색: 데이터의 color (없으면 검붉은 두 색을 번갈아)
        const tint = storm.color ? new THREE.Color(storm.color).getHex() : 0xff4a5a
        fx.slashes.spawn(new THREE.Vector3(enemy.x, heightAt(enemy.x, enemy.z), enemy.z), Math.random() * Math.PI * 2, 1 + Math.random() * 0.4, 0.8, false, i % 2 ? tint : new THREE.Color(tint).multiplyScalar(0.6).getHex())
        bus.emit('sound', { cue: 'blade', x: enemy.x, z: enemy.z })
        this.deal(enemy, storm.damage, dx / len, dz / len, 1.5, 'normal')
      }
    }
    const strong = hits.some((h) => h.strong)
    bus.emit('sound', { cue: strong ? 'hitStrong' : 'hit', x: first.x, z: first.z })
    feel.stop(strong ? 0.09 : 0.045)
    view.shake(strong ? 0.14 : 0.05)
  }

  /** 연쇄 번개 (천둥군주): 번개가 가까운 적에게 차례로 옮겨 붙는다. */
  private chainLightning(from: CombatTarget, damage: number, jumps: number, range: number): void {
    const struck = new Set<CombatTarget>([from])
    let current = from
    for (let i = 0; i < jumps; i++) {
      let next: CombatTarget | null = null
      let best = range
      for (const enemy of this.ctx.encounter.alive) {
        if (struck.has(enemy)) continue
        const dist = Math.hypot(enemy.x - current.x, enemy.z - current.z)
        if (dist < best) {
          best = dist
          next = enemy
        }
      }
      if (!next) return
      const y = heightAt(current.x, current.z) + 1
      this.ctx.fx.lightning.strike(
        new THREE.Vector3(current.x, y, current.z),
        new THREE.Vector3(next.x, heightAt(next.x, next.z) + 1, next.z),
        0.07,
        0.14,
      )
      const dx = next.x - current.x
      const dz = next.z - current.z
      this.deal(next, damage, dx / (best || 1), dz / (best || 1), 1, 'thunder')
      struck.add(next)
      current = next
    }
  }

  /** 거인의 공격이 주인공에게 닿았다. 유물(야른그레이프르)이 먼저 끼어들 수 있다. */
  hitHero(damage: number, fromX: number, fromZ: number, knockback: number): void {
    const { combat, powers, skills, feel, view, numbers, hero, bus } = this.ctx
    if (!combat.canBeHit) return
    const reduced = powers.beforeHeroHit(damage, fromX, fromZ, skills)
    const dealt = combat.takeHit(reduced, fromX, fromZ, knockback)
    if (dealt <= 0) return
    feel.stop(0.05)
    view.shake(0.18)
    const position = hero.object.position
    numbers.show(this.scratch.copy(position).setY(position.y + 2), dealt, 'hurt')
    bus.emit('heroHurt', { damage: dealt })
  }
}

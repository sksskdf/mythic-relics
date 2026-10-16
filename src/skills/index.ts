import type * as THREE from 'three'

import type { RelicDef } from '../data/schema'
import type { CombatTarget } from '../game/PlayerCombat'
import { type Action, type Aura, type Boost, createAction, createAura, type Cue } from './actions'
import { type BasicHit, enemiesWithin, type RelicEffect, type SkillContext } from './Skill'

/**
 * 유물 데이터로 만드는 효과. 유물 1개 = 지속 효과 + 행동 연동 효과 (DESIGN.md 8.3)
 * - 지속 효과: modifiers(상시 수치)와 aura(매 프레임 도는 효과)
 * - 행동 연동 효과: charge(무엇으로 충전되나)가 다 차면 release(언제 터지나)에 action(무엇을 하나)이 나간다.
 *   재사용 대기시간은 없고, 동작이 끝나기 전(busy)에는 충전도 쌓이지 않는다.
 */
export class DataRelicEffect implements RelicEffect {
  readonly relic: string
  readonly modifiers: RelicDef['passive']['modifiers']
  private progress = 0
  private readonly aura: Aura | null
  private readonly action: Action

  constructor(
    private readonly def: RelicDef,
    fx: THREE.Object3D,
  ) {
    this.relic = def.id
    this.modifiers = def.passive.modifiers
    this.aura = def.passive.aura ? createAura(def.passive.aura) : null
    this.action = createAction(def.trigger.action, fx)
    // 시간으로 차는 효과(맞을 때 터지는 방어 효과)는 끼자마자 쓸 수 있다.
    if (def.trigger.charge.by === 'time') this.progress = 1
  }

  get charge(): number {
    return this.progress
  }

  private get trigger() {
    return this.def.trigger
  }

  /** 충전을 더한다. 동작 중에는 쌓이지 않는다. */
  private add(amount: number): void {
    if (this.action.busy) return
    this.progress = Math.min(1, this.progress + amount)
  }

  private ready(): boolean {
    return this.progress >= 1 && !this.action.busy
  }

  /** 발현한 신과 클래스 레벨에 맞는 세진 정도 */
  private boost(ctx: SkillContext): Boost {
    const out: Boost = { damageScale: 1, lightning: null }
    for (const b of this.trigger.bonus) {
      if (ctx.manifested !== b.manifested || ctx.level < b.minLevel) continue
      out.damageScale *= b.damageScale
      if (b.lightning !== undefined) out.lightning = (out.lightning ?? 0) + b.lightning
    }
    return out
  }

  private fire(ctx: SkillContext, cue: Cue): void {
    this.progress = 0
    this.action.fire(ctx, cue, this.boost(ctx))
  }

  update(dt: number, ctx: SkillContext): void {
    this.aura?.update(dt, ctx)
    this.action.update(dt, ctx)
    const { charge, release } = this.trigger
    if (charge.by === 'time') this.add(dt / charge.seconds)
    if (release.on !== 'full' || !this.ready()) return
    const hero = ctx.hero.object.position
    // 아무도 없는 곳에서 터지면 헛것이 되므로 적이 가까이 올 때까지 기다린다.
    if (release.enemyWithin !== undefined && enemiesWithin(ctx.enemies, hero.x, hero.z, release.enemyWithin).length === 0) return
    this.fire(ctx, {})
  }

  onBasicHit(hit: BasicHit, ctx: SkillContext): void {
    const { charge, release } = this.trigger
    if (charge.by === 'combo' && !this.action.busy) this.progress = hit.finisher ? 1 : (hit.comboIndex + 1) / hit.comboLength
    if (release.on === 'basicHit' && this.ready()) this.fire(ctx, hit.targets[0] ? { target: hit.targets[0] } : {})
  }

  onKill(_target: CombatTarget): void {
    const { charge } = this.trigger
    if (charge.by === 'kill') this.add(1 / charge.count)
  }

  onWalk(distance: number): void {
    const { charge } = this.trigger
    if (charge.by === 'walk') this.add(distance / charge.meters)
  }

  beforeHeroHit(damage: number, fromX: number, fromZ: number, ctx: SkillContext): number {
    const { release } = this.trigger
    if (release.on !== 'heroHit' || !this.ready()) return damage
    this.fire(ctx, { from: { x: fromX, z: fromZ } })
    return damage * release.absorb
  }

  dispose(): void {
    this.action.dispose()
  }
}

/** 유물에 딸린 효과를 만든다. */
export function createEffect(def: RelicDef, fx: THREE.Object3D): RelicEffect {
  return new DataRelicEffect(def, fx)
}

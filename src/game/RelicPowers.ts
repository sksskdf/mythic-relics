import type * as THREE from 'three'

import { relicDef, type RelicId } from '../relics/data'
import { Loadout, type LoadoutState } from '../relics/Loadout'
import { createEffect } from '../skills'
import { type BasicHit, type Modifiers, NO_MODIFIERS, type RelicEffect, type SkillContext } from '../skills/Skill'
import type { CombatTarget } from './PlayerCombat'
import { ThunderJudgement } from '../skills/Ultimate'
import type { HudSlot } from '../ui/Hud'
import { pixelIcon } from '../ui/pixelIcon'

/** 장착이 바뀐 결과: 발현이 새로 일어났거나 풀렸는지 */
export interface LoadoutChange {
  before: LoadoutState
  after: LoadoutState
}

/**
 * 장착한 유물이 주는 힘을 모아 관리한다.
 * - 유물 1개 = 지속 효과 + 행동 연동 효과 (가호 상태에서도 붙는다, DESIGN.md 8.3)
 * - 같은 신 유물 3개 이상이면 발현: 궁극기와 패시브가 붙는다
 */
export class RelicPowers {
  readonly loadout = new Loadout()
  readonly effects: (RelicEffect | null)[]
  readonly ultimate = new ThunderJudgement()
  state: LoadoutState
  private readonly icons = new Map<RelicId, string>()

  constructor(private readonly fx: THREE.Object3D) {
    this.effects = this.loadout.slots.map(() => null)
    this.state = this.loadout.state
  }

  get manifested() {
    return this.state.manifested
  }

  /** 빈 칸이 있는가 */
  get hasFreeSlot(): boolean {
    return this.loadout.slots.includes(null)
  }

  equip(id: RelicId): LoadoutChange | null {
    const slot = this.loadout.equip(id)
    if (slot < 0 || this.effects[slot]) return null
    this.effects[slot] = createEffect(relicDef(id), this.fx)
    return this.refresh()
  }

  unequip(slot: number): { relic: RelicId; change: LoadoutChange } | null {
    const relic = this.loadout.unequip(slot)
    if (!relic) return null
    this.effects[slot]?.dispose()
    this.effects[slot] = null
    return { relic, change: this.refresh() }
  }

  /** 칸의 유물을 가방에 넣는다. (유물 화면) */
  stow(slot: number): LoadoutChange | null {
    if (!this.loadout.stow(slot)) return null
    this.effects[slot]?.dispose()
    this.effects[slot] = null
    return this.refresh()
  }

  /** 가방의 유물을 칸에 끼운다. 칸에 있던 유물은 가방으로 간다. (유물 화면) */
  wield(id: RelicId, slot: number): LoadoutChange | null {
    if (!this.loadout.bag.includes(id)) return null
    this.effects[slot]?.dispose()
    this.loadout.wield(id, slot)
    this.effects[slot] = createEffect(relicDef(id), this.fx)
    return this.refresh()
  }

  /** 끼고 있는 유물들의 지속 효과 수치를 곱한 값 */
  get modifiers(): Modifiers {
    const out = { ...NO_MODIFIERS }
    for (const effect of this.effects) {
      for (const [key, value] of Object.entries(effect?.modifiers ?? {}) as [keyof Modifiers, number][]) out[key] *= value
    }
    return out
  }

  update(dt: number, ctx: SkillContext): void {
    for (const effect of this.effects) effect?.update(dt, ctx)
    this.ultimate.update(dt, ctx)
  }

  /** 기본 공격이 맞았다. (연타 연동: 묠니르, 다음 타격 강화: 메긴교르드) */
  onBasicHit(hit: BasicHit, ctx: SkillContext): void {
    for (const effect of this.effects) effect?.onBasicHit?.(hit, ctx)
  }

  /** 적을 쓰러뜨렸다. (처치 연동: 메긴교르드) */
  onKill(target: CombatTarget, ctx: SkillContext): void {
    for (const effect of this.effects) effect?.onKill?.(target, ctx)
  }

  /** 주인공이 걸었다. (이동 연동: 변신의 가면) */
  onWalk(distance: number, ctx: SkillContext): void {
    for (const effect of this.effects) effect?.onWalk?.(distance, ctx)
  }

  /** 맞기 직전에 유물이 끼어들 기회를 준다. (피격 연동: 야른그레이프르) */
  beforeHeroHit(damage: number, fromX: number, fromZ: number, ctx: SkillContext): number {
    let result = damage
    for (const effect of this.effects) {
      if (effect?.beforeHeroHit) result = effect.beforeHeroHit(result, fromX, fromZ, ctx)
    }
    return result
  }

  hudSlots(): HudSlot[] {
    return this.loadout.slots.map((id, i) => {
      const effect = this.effects[i]
      return {
        icon: id ? this.icon(id) : null,
        charge: effect ? Math.max(0, Math.min(1, effect.charge)) : 0,
      }
    })
  }

  private icon(id: RelicId): string {
    let icon = this.icons.get(id)
    if (!icon) {
      icon = pixelIcon(relicDef(id).icon, relicDef(id).colors)
      this.icons.set(id, icon)
    }
    return icon
  }

  private refresh(): LoadoutChange {
    const before = this.state
    this.state = this.loadout.state
    return { before, after: this.state }
  }
}

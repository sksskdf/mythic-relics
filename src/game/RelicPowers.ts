import type * as THREE from 'three'

import { type God, godDef, relicDef, type RelicId } from '../relics/data'
import { Loadout } from '../gear/Loadout'
import type { LoadoutState } from '../myth/manifest'
import { createEffect } from '../skills'
import type { BasicHit, RelicEffect, SkillContext } from '../skills/Skill'
import type { CombatTarget } from './PlayerCombat'
import { ClassPassives } from '../skills/ClassPassives'
import { MythEchoes } from '../skills/MythEchoes'
import { createUltimate, type Ultimate } from '../skills/Ultimate'
import type { HudSlot } from '../ui/Hud'
import { pixelIcon } from '../ui/pixelIcon'
import { relicIconRows } from '../relics/model'

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
  /** 궁극기들 (신마다 하나, 처음 발현할 때 만든다): 발현한 신의 것만 새로 나가고, 이미 나간 것은 끝까지 돈다 */
  private readonly ultimates = new Map<God, Ultimate>()
  /** 프레임마다 도는 발현 패시브 부품 (src/skills/ClassPassives.ts) */
  readonly classPassives: ClassPassives
  /** 상시 효과의 메아리: 고르지 않은 열린 신화들 (src/skills/MythEchoes.ts) */
  readonly echoes: MythEchoes
  state: LoadoutState
  private readonly icons = new Map<RelicId, string>()

  constructor(private readonly fx: THREE.Object3D) {
    this.effects = this.loadout.slots.map(() => null)
    this.state = this.loadout.state
    this.classPassives = new ClassPassives(fx)
    this.echoes = new MythEchoes(fx)
  }

  /** 지금 발현한 신의 궁극기 (발현하지 않았으면 null) */
  get ultimate(): Ultimate | null {
    const god = this.manifested
    if (!god) return null
    let u = this.ultimates.get(god)
    if (!u) {
      u = createUltimate(godDef(god).ultimate)
      this.ultimates.set(god, u)
    }
    return u
  }

  /** 궁극기 중 하나라도 도는 중인가 */
  get ultimateActive(): boolean {
    return [...this.ultimates.values()].some((u) => u.active)
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

  update(dt: number, ctx: SkillContext): void {
    for (const effect of this.effects) effect?.update(dt, ctx)
    for (const u of this.ultimates.values()) u.update(dt, ctx)
    this.classPassives.update(dt, ctx)
    this.echoes.update(dt, ctx)
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
      const { rows, colors } = relicIconRows(relicDef(id))
      icon = pixelIcon(rows, colors)
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

import type * as THREE from 'three'

import { type God, godDef, isRelicId, relicDef, type RelicId } from '../relics/data'
import { emptySlots, powerRelic, type PowerSlots } from '../data/powers'
import { effectScale, RELIC_STAGES } from '../gear/mythRelic'
import { craft, melt } from '../gear/forge'
import { Loadout } from '../gear/Loadout'
import type { LoadoutState } from '../myth/manifest'
import { slotsPantheon } from '../myth/pantheon'
import { createEffect } from '../skills'
import type { BasicHit, RelicEffect, SkillContext } from '../skills/Skill'
import type { CombatTarget } from './PlayerCombat'
import type { ClassPassive } from '../data/classKit'
import { ClassPassives } from '../skills/ClassPassives'
import { SourceAwakening } from '../skills/SourceAwakening'
import { createUltimate, type Ultimate } from '../skills/Ultimate'
import { type HudSlot, SKILL_SLOTS } from '../ui/Hud'
import { pixelIcon } from '../ui/pixelIcon'
import { relicIconRows } from '../relics/model'

/** 장착이 바뀐 결과: 발현이 새로 일어났거나 풀렸는지 */
export interface LoadoutChange {
  before: LoadoutState
  after: LoadoutState
}

/**
 * 칸에 끼운 힘을 전투에서 돌린다 (재미 재설계 P2: 전투의 원천은 `ctx.mythPowers`의 칸이다).
 * - 유물 힘(`relic:<id>`) = 그 유물의 지속 효과 + 행동 연동 효과 (DESIGN.md 8.3). 칸에 있을 때만 깨어난다:
 *   유물표에 켰는지, 그 신이 자리에 있는지는 보지 않는다 (유물표는 수집 기록일 뿐이다)
 * - 칸의 궁극기가 궁극기, 칸의 패시브 힘들이 패시브
 */
export class RelicPowers {
  readonly loadout = new Loadout()
  /** 도는 칸 (맹세를 건 동안은 줄어든 칸): `setSlots`가 정한다. 빌드(`Build`)도 여기서 읽는다 */
  slots: PowerSlots = emptySlots()
  /** 유물마다 효과: 칸에 끼운 유물 힘과 유물표에 켠 유물 (만든 차례). 도는 것은 칸에 든 것뿐이다 */
  readonly effects = new Map<RelicId, RelicEffect>()
  /** 궁극기들 (신마다 하나, 처음 발현할 때 만든다): 발현한 신의 것만 새로 나가고, 이미 나간 것은 끝까지 돈다 */
  private readonly ultimates = new Map<God, Ultimate>()
  /** 발현 순간의 연출을 위한 패시브 묶음 (E302부터 패시브 자체는 칸마다의 묶음이 돌린다) */
  readonly classPassives: ClassPassives
  /** 칸의 패시브 힘마다 따로 돌린다 (타이머·동료가 섞이지 않게) */
  private readonly lentPassives: ClassPassives[] = []
  /** 대장간에서 올릴 수 있는 유물 단계 (데모 2, 엔딩 뒤 4. 게임이 정한다) */
  maxStage: () => number = () => RELIC_STAGES

  /** 유물의 힘(지속·행동 효과)은 그 유물 힘이 칸에 있을 때만 깨어난다 */
  awake(id: string | null): boolean {
    return !!id && this.slotted.has(id)
  }

  /** 칸에 든 유물 힘의 유물들 (칸의 차례) */
  get slottedRelics(): readonly RelicId[] {
    return this.slottedList
  }
  private slottedList: RelicId[] = []
  private readonly slotted = new Set<string>()

  /**
   * 도는 칸을 바꾼다. 칸의 유물 힘마다 효과를 만들고(유물표에 없어도), 자리 셋을 칸에서 다시 읽는다.
   * 무기의 신이 바뀌면 바뀐 것을 돌려준다 (발현 연출)
   */
  setSlots(next: PowerSlots): LoadoutChange {
    this.slots = { weapon: next.weapon, ultimate: next.ultimate, auras: [...next.auras] }
    this.slottedList = this.slots.auras.flatMap((id) => powerRelic(id) ?? [])
    this.slotted.clear()
    for (const id of this.slottedList) {
      this.slotted.add(id)
      this.light(id)
    }
    this.loadout.pantheon = slotsPantheon(this.slots)
    this.refreshStages()
    return this.refresh()
  }

  /** 지금 도는 유물 효과 (잠든 유물은 뺀다). 프레임마다 부르니 배열을 다시 쓴다 */
  private get live(): readonly RelicEffect[] {
    const out = this.liveList
    out.length = 0
    for (const [id, effect] of this.effects) if (this.awake(id)) out.push(effect)
    return out
  }
  private readonly liveList: RelicEffect[] = []

  /** 그 유물의 효과 (켜지 않았으면 없음) */
  effectOf(id: RelicId): RelicEffect | null {
    return this.effects.get(id) ?? null
  }

  /** 원천 각성 (src/skills/SourceAwakening.ts, E14-02) */
  readonly awakening: SourceAwakening
  state: LoadoutState
  private readonly icons = new Map<RelicId, string>()

  constructor(private readonly fx: THREE.Object3D) {
    this.state = this.loadout.state
    this.classPassives = new ClassPassives(fx)
    // 신의 자리 셋 (E302): 패시브는 숨 칸마다 따로 돈다. 이 묶음은 발현 순간의 흩어지는 분신(burst)만 쓴다
    this.classPassives.bound = { passive: { damageScale: 1, attackSpeed: 1 }, level: 0 }
    this.awakening = new SourceAwakening(fx)
  }

  /** 칸의 궁극기 (비었으면 null): 자리 셋의 심장은 칸의 궁극기의 신이다 */
  get ultimate(): Ultimate | null {
    const god = this.loadout.pantheon.heart
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

  /**
   * 칸의 패시브 힘을 돌린다: 힘마다 그 부품만 든 패시브를 그 신 단계로.
   * 힘이 바뀌면 그 자리의 동료·도는 것은 부품이 다시 만든다
   */
  setLent(list: readonly { passive: ClassPassive; level: number }[]): void {
    while (this.lentPassives.length > list.length) this.lentPassives.pop()!.dispose()
    while (this.lentPassives.length < list.length) this.lentPassives.push(new ClassPassives(this.fx))
    list.forEach((l, i) => (this.lentPassives[i]!.bound = l))
  }

  /** 도는 패시브 묶음 모두: 연출 묶음 다음에 숨 칸 */
  get allPassives(): readonly ClassPassives[] {
    return [this.classPassives, ...this.lentPassives]
  }

  /** 빈 칸이 있는가 */
  get hasFreeSlot(): boolean {
    return this.loadout.slots.includes(null)
  }

  /** 일반 장비를 그 부위의 빈 칸에 끼운다 (없으면 가방), 신화의 유물은 유물표에 켠다. 칸·유물표가 바뀌었으면 바뀐 것을 돌려준다 */
  equip(id: string): LoadoutChange | null {
    if (isRelicId(id)) {
      if (!this.loadout.light(id)) return null
      this.light(id)
      return this.refresh()
    }
    return this.loadout.equip(id) < 0 ? null : this.refresh()
  }

  /** 유물표에서 끈다 (개발 도구). 그 유물 힘이 칸에 남아 있으면 효과는 그대로 돈다 */
  unlight(id: RelicId): LoadoutChange | null {
    if (!this.loadout.unlight(id)) return null
    if (!this.slotted.has(id)) {
      this.effects.get(id)?.dispose()
      this.effects.delete(id)
    }
    return this.refresh()
  }

  /** 그 유물의 효과를 만든다 (이미 있으면 그대로) */
  private light(id: RelicId): void {
    if (this.effects.has(id)) return
    const effect = createEffect(relicDef(id), this.fx)
    effect.stageScale = effectScale(id, this.loadout.stage(id), null)
    this.effects.set(id, effect)
  }

  /** 대장간에서 만든다(올린다) (E13-05). 처음 만들면 유물표에 켜고, 단계가 오르면 피해 배율을 맞춘다 */
  forge(god: God): (NonNullable<ReturnType<typeof craft>> & { change: LoadoutChange }) | null {
    const made = craft(this.loadout, god, this.maxStage())
    if (!made) return null
    if (made.stage === 1) this.light(made.relic)
    else this.refreshStages()
    return { ...made, change: this.refresh() }
  }

  /** 일반 장비를 녹여 원형으로 (E13-07-3 → E303-04). 바뀐 것도 돌려준다 */
  melt(id: string): (NonNullable<ReturnType<typeof melt>> & { change: LoadoutChange }) | null {
    const done = melt(this.loadout, id)
    return done ? { ...done, change: this.refresh() } : null
  }

  /** 유물 단계가 바뀌었다: 유물 효과의 피해 배율을 다시 맞춘다 (한 신에 모아도 덤은 없다) */
  refreshStages(): void {
    for (const [id, effect] of this.effects) effect.stageScale = effectScale(id, this.loadout.stage(id), null)
  }

  /** 칸의 장비를 뺀다 (땅에 버릴 때) */
  unequip(slot: number): { id: string; change: LoadoutChange } | null {
    const id = this.loadout.unequip(slot)
    return id ? { id, change: this.refresh() } : null
  }

  /** 칸의 장비를 가방에 넣는다. (장비 화면) */
  stow(slot: number): LoadoutChange | null {
    return this.loadout.stow(slot) ? this.refresh() : null
  }

  /** 가방의 장비를 칸에 끼운다. 칸에 있던 것은 가방으로 간다. (장비 화면) */
  wield(id: string, slot: number): LoadoutChange | null {
    return this.loadout.wield(id, slot) !== null || this.loadout.slots[slot] === id ? this.refresh() : null
  }

  update(dt: number, ctx: SkillContext): void {
    for (const effect of this.live) effect.update(dt, ctx)
    for (const u of this.ultimates.values()) u.update(dt, ctx)
    for (const p of this.allPassives) p.update(dt, ctx)
    this.awakening.update(dt, ctx)
  }

  /** 기본 공격이 맞았다. (연타 연동: 묠니르, 다음 타격 강화: 메긴교르드) */
  onBasicHit(hit: BasicHit, ctx: SkillContext): void {
    for (const effect of this.live) effect.onBasicHit?.(hit, ctx)
  }

  /** 적을 쓰러뜨렸다. (처치 연동: 메긴교르드) */
  onKill(target: CombatTarget, ctx: SkillContext): void {
    for (const effect of this.live) effect.onKill?.(target, ctx)
    this.awakening.onKill(target, ctx)
  }

  /** 주인공이 걸었다. (이동 연동: 변신의 가면) */
  onWalk(distance: number, ctx: SkillContext): void {
    for (const effect of this.live) effect.onWalk?.(distance, ctx)
    this.awakening.onWalk(distance, ctx)
  }

  /**
   * 맞기 직전에 유물이 끼어들 기회를 준다. (피격 연동: 야른그레이프르)
   * 탄 동안(E241, asleep)은 유물이 쉬어 터지지도 막지도 않는다. 바람 각성의 피하기는 몸놀림이라 그대로
   */
  beforeHeroHit(damage: number, fromX: number, fromZ: number, ctx: SkillContext, asleep = false): number {
    let result = damage
    for (const effect of asleep ? [] : this.live) {
      if (effect.beforeHeroHit) result = effect.beforeHeroHit(result, fromX, fromZ, ctx)
    }
    return result > 0 ? this.awakening.beforeHeroHit(result, ctx) : result
  }

  /**
   * HUD 칸 넷: 칸에 든 유물 힘부터(칸의 차례), 남으면 유물표에 켰지만 칸에 없는 유물을 잠든 것으로. relic은 그 칸의 유물.
   * 도는 힘은 여섯까지라 유물 힘이 넷을 넘으면 넘친 것은 HUD 칸 없이 돈다
   */
  hudSlots(): HudSlot[] {
    const order = [...this.slottedList, ...this.loadout.lit.filter((id) => !this.slotted.has(id))].slice(0, SKILL_SLOTS)
    const out: HudSlot[] = order.map((id) => {
      const effect = this.effects.get(id)
      return { icon: this.icon(id), charge: effect ? Math.max(0, Math.min(1, effect.charge)) : 0, relic: id, asleep: !this.awake(id) }
    })
    while (out.length < SKILL_SLOTS) out.push({ icon: null, charge: 0, relic: null })
    return out
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

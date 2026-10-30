import type * as THREE from 'three'

import { type God, godDef, isRelicId, relicDef, type RelicId } from '../relics/data'
import { effectScale, RELIC_STAGES, relicAwake } from '../gear/mythRelic'
import { craft, melt } from '../gear/forge'
import { Loadout } from '../gear/Loadout'
import type { LoadoutState } from '../myth/manifest'
import { focusGod, inPantheon, type Pantheon } from '../myth/pantheon'
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
 * 유물표에 켠 유물이 주는 힘을 모아 관리한다 (E303-04: 유물은 장비 칸을 떠났다).
 * - 유물 1개 = 지속 효과 + 행동 연동 효과 (DESIGN.md 8.3). 그 신이 자리에 들었을 때만 깨어난다 (E21-04 → E302)
 * - 심장의 신이 궁극기, 숨의 신들이 패시브 (E302)
 */
export class RelicPowers {
  readonly loadout = new Loadout()
  /** 유물표에 켠 유물마다 효과 (켠 차례) */
  readonly effects = new Map<RelicId, RelicEffect>()
  /** 궁극기들 (신마다 하나, 처음 발현할 때 만든다): 발현한 신의 것만 새로 나가고, 이미 나간 것은 끝까지 돈다 */
  private readonly ultimates = new Map<God, Ultimate>()
  /** 발현 순간의 연출을 위한 패시브 묶음 (E302부터 패시브 자체는 숨 칸 묶음이 돌린다) */
  readonly classPassives: ClassPassives
  /** 숨 칸 (E302): 숨의 신마다 따로 돌린다 (타이머·동료가 섞이지 않게) */
  private readonly lentPassives: ClassPassives[] = []
  /** 대장간에서 올릴 수 있는 유물 단계 (데모 2, 엔딩 뒤 4. 게임이 정한다) */
  maxStage: () => number = () => RELIC_STAGES

  /** 유물의 힘(지속·행동 효과)은 그 신이 자리에 들었을 때만 깨어난다 (E21-04 → E302) */
  awake(id: string | null): boolean {
    return !!id && isRelicId(id) && relicAwake(id, null, this.awakeGods)
  }

  /** 유물이 깨어나는 신: 자리 셋에 든 신과, 조각 2를 모은 깨우는 신 (E238). 자리나 깨우는 신이 바뀔 때만 다시 센다 (프레임마다 부른다) */
  get awakeGods(): readonly God[] {
    const { pantheon, waking } = this.loadout
    if (pantheon !== this.godsFor || waking !== this.godsWaking || pantheon.breath.length !== this.godsBreath) {
      const gods = [pantheon.hand, pantheon.heart, ...pantheon.breath].filter((g): g is God => g !== null)
      if (waking && !inPantheon(pantheon, waking)) gods.push(waking)
      this.gods = gods
      this.godsFor = pantheon
      this.godsWaking = waking
      this.godsBreath = pantheon.breath.length
    }
    return this.gods
  }
  private gods: readonly God[] = []
  private godsFor: Pantheon | null = null
  private godsWaking: God | null = null
  private godsBreath = -1

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

  /** 심장에 낀 신의 궁극기 (비었으면 null) */
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

  /** 신의 자리 셋을 바꾼다 (E302). 손의 신이 바뀌면 바뀐 것을 돌려준다 (발현 연출) */
  setPantheon(next: Pantheon): LoadoutChange | null {
    this.loadout.pantheon = next
    // 한 신에 몰면 그 신 유물의 효과가 한 단계 위로 돈다 (E21-04의 고른 신화 → 몰기)
    this.refreshStages()
    return this.refresh()
  }

  /**
   * 빌린 힘을 돌린다 (E237): 빌린 신마다 그 신의 대표 패시브를 그 신 단계로.
   * 신이 바뀌면 그 자리의 동료·도는 것은 부품이 다시 만든다
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

  /** 유물표에서 끈다 (개발 도구) */
  unlight(id: RelicId): LoadoutChange | null {
    if (!this.loadout.unlight(id)) return null
    this.effects.get(id)?.dispose()
    this.effects.delete(id)
    return this.refresh()
  }

  /** 켠 유물의 효과를 만든다 */
  private light(id: RelicId): void {
    if (this.effects.has(id)) return
    const effect = createEffect(relicDef(id), this.fx)
    effect.stageScale = effectScale(id, this.loadout.stage(id), focusGod(this.loadout.pantheon))
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

  /** 유물 단계나 자리 셋이 바뀌었다: 켠 유물 효과의 피해 배율을 다시 맞춘다 */
  refreshStages(): void {
    for (const [id, effect] of this.effects) effect.stageScale = effectScale(id, this.loadout.stage(id), focusGod(this.loadout.pantheon))
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

  /** 맞기 직전에 유물이 끼어들 기회를 준다. (피격 연동: 야른그레이프르) */
  beforeHeroHit(damage: number, fromX: number, fromZ: number, ctx: SkillContext): number {
    let result = damage
    for (const effect of this.live) {
      if (effect.beforeHeroHit) result = effect.beforeHeroHit(result, fromX, fromZ, ctx)
    }
    return result > 0 ? this.awakening.beforeHeroHit(result, ctx) : result
  }

  /** HUD 칸 넷: 깨어난 유물부터 켠 차례로 (충전이 보이는 것은 유물뿐이다). relic은 그 칸의 유물 */
  hudSlots(): HudSlot[] {
    const lit = this.loadout.lit
    const order = [...lit.filter((id) => this.awake(id)), ...lit.filter((id) => !this.awake(id))].slice(0, SKILL_SLOTS)
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

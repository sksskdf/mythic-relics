import type { AttackStyle } from '../combat/styles'
import { awakeningLevel } from '../data/awakening'
import { NO_RULES, type TrialRules } from '../data/trials'
import { type EchoTrigger, type MythAlways, STAT_KINDS, type StatKind } from '../data/mythAlways'
import { SOURCE_IDS, type SourceId } from '../data/schema'
import { relicSource } from '../gear/mythRelic'
import { PER_PROMOTION } from '../myth/ClassProgress'
import { type God, godDef, relicDef, type RelicId } from '../relics/data'
import { type Modifiers, NO_MODIFIERS } from '../skills/Skill'

/**
 * 빌드 상태 (E11-04, DESIGN.md 4.6).
 * 힘은 "열린 신화 + 고른 신화 + 장비 + 원천"을 모은 이 한 곳에서 계산한다.
 * - 고른 신화(지금은 발현한 신)는 추가 효과: 패시브·궁극기·공격 리듬
 * - 열린 신화는 모두 상시 효과(E12-03, DESIGN.md 4.2.1): 고르지 않은 신화의 메아리, 모든 열린 신화의 수치
 * - 장비 = 유물과 일반 장비, 원천 = 장비의 원천 수치 (E14에서 각성)
 */

/** 빌드 상태를 만드는 재료 */
export interface BuildInputs {
  /** 열린 신화와 개방 단계 (1~4) */
  open: ReadonlyMap<God, number>
  /** 고른 신화 (지금은 발현한 신 하나, 없으면 빈 목록) */
  chosen: readonly God[]
  /** 칸에 낀 유물 (빈 칸과 일반 장비는 null) */
  gear: readonly (RelicId | null)[]
  /** 칸에 낀 일반 장비 (E13-02): 수치는 상시 효과 수치와 같은 종류끼리 더한다 */
  gearItems?: readonly { stats: readonly { kind: StatKind; value: number }[]; source: { id: SourceId; value: number } }[]
  /** 유물 단계 (E13-03, 없으면 1) */
  stage?: (id: RelicId) => number
  /** 영구 원천 숙련 (E14-04): 장비의 원천 수치에 더해진다 */
  sourceMastery?: (source: SourceId) => number
  /** 올린 개방 단계의 합 */
  promotions: number
  /** 시련 보상 (E16): 수치 종류마다 더한다 */
  bonus?: Partial<Record<StatKind, number>>
  /** 균열의 축복이 올린 각성 단계 (E17, 원천마다) */
  awakenBonus?: Partial<Record<SourceId, number>>
  /** 성좌판에서 밝힌 별 (E17): 그 신화의 상시 효과가 한 단계 위 */
  starred?: ReadonlySet<God>
  /** 시련 중 제약 (E16): 고른 신화 없이·최대 생명·이동 속도 등. 장비 칸 제한은 재료를 모을 때 거른다 */
  rules?: TrialRules
}

/** 기본 최대 생명 */
export const BASE_HP = 100
/** 상시 효과 단계의 끝: 4단계 신화에 그 신화 유물을 끼면 5 */
export const TOP_STAGE = 5

/**
 * 열린 신화 하나의 상시 효과가 작동하는 단계: 개방 단계, 그 신화 유물을 끼면 한 단계 위 (DESIGN.md 4.2.1),
 * 성좌판에서 그 신의 별을 밝혔으면 또 한 단계 위 (E17-04)
 */
export function alwaysStage(level: number, wearsRelic: boolean, starred = false): number {
  return level <= 0 ? 0 : Math.min(TOP_STAGE, level + (wearsRelic ? 1 : 0) + (starred ? 1 : 0))
}

/** 그 단계의 메아리 간격 (공격 수·초·확률). 1단계 every[0], 2~4단계 every[1], 5단계는 한 번 더 자주 */
export function echoEvery(every: readonly [number, number], trigger: EchoTrigger, stage: number): number {
  if (stage <= 1) return every[0]
  if (stage < TOP_STAGE) return every[1]
  if (trigger === 'hits') return Math.max(2, every[1] - 1)
  if (trigger === 'chance') return Math.min(0.9, every[1] * 1.2)
  return every[1] * 0.8
}

/** 그 단계의 수치 (3단계 value[0], 4단계 value[1], 5단계 ×1.5, 그 아래는 0) */
export function statAt(stat: MythAlways['stat'], stage: number): number {
  if (stage < 3) return 0
  if (stage === 3) return stat.value[0]
  return stat.value[1] * (stage >= TOP_STAGE ? 1.5 : 1)
}

/** 메아리 하나: 고르지 않은 열린 신화마다 */
export interface Echo {
  god: God
  stage: number
}

/** 빌드 상태: 능력치와 걸린 힘 */
export interface BuildState {
  /** 지금 고른 신화 (궁극기·패시브·공격 모션을 정한다) */
  chosen: God | null
  /** 고른 신화의 개방 단계 (없으면 0) */
  level: number
  /** 기본 공격과 스킬에 공통으로 곱하는 피해 배율 */
  damageScale: number
  /** 장비한 유물들의 지속 효과 수치를 곱한 값 */
  modifiers: Modifiers
  /** 받는 피해 배율 */
  damageTaken: number
  /** 이동 속도 배율 */
  moveSpeed: number
  /** 공격 속도 배율 (고른 신화의 리듬) */
  attackSpeed: number
  /** 기본 공격 모션 */
  attack: AttackStyle
  /** 상시 효과: 고르지 않은 열린 신화의 메아리 */
  echoes: readonly Echo[]
  /** 상시 효과 수치: 모든 열린 신화의 같은 종류 수치를 더한 값 (없으면 0) */
  stats: Readonly<Record<StatKind, number>>
  /** 최대 생명 */
  maxHp: number
  /** 시련 제약: 생명이 차오르지 않는다, 궁극기를 쓸 수 없다 (E16) */
  noHeal: boolean
  noUltimate: boolean
  /** 원천 수치: 일반 장비와 유물(단계마다 +2~+5)의 합 + 원천 숙련 (E14) */
  sources: Readonly<Record<SourceId, number>>
  /** 원천 각성 단계 0~3 (문턱 5/10/20, E14-02) */
  awakening: Readonly<Record<SourceId, number>>
  /** 공명: 네 원천 숙련의 최솟값 (E14-04). 모든 각성 효과가 그만큼 세진다 */
  resonance: number
}

/** 장비한 유물들의 지속 효과 수치를 곱한다 */
export function gearModifiers(gear: readonly (RelicId | null)[]): Modifiers {
  const out = { ...NO_MODIFIERS }
  for (const id of gear) {
    if (!id) continue
    for (const [key, value] of Object.entries(relicDef(id).passive.modifiers) as [keyof Modifiers, number][]) out[key] *= value
  }
  return out
}

/** 재료에서 빌드 상태를 계산한다. (부수 효과 없음) */
export function computeBuild(inputs: BuildInputs): BuildState {
  const rules = inputs.rules ?? NO_RULES
  const chosen = rules.noMyth ? null : (inputs.chosen[0] ?? null)
  const god = chosen ? godDef(chosen) : null
  // 상시 효과: 같은 종류 수치는 더하고, 다른 종류끼리는 아래에서 곱한다
  const worn = new Set(inputs.gear.filter((id): id is RelicId => id !== null).map((id) => relicDef(id).god))
  const stats = Object.fromEntries(STAT_KINDS.map((k) => [k, 0])) as Record<StatKind, number>
  const echoes: Echo[] = []
  for (const [id, level] of inputs.open) {
    const stage = alwaysStage(level, worn.has(id), inputs.starred?.has(id) ?? false)
    if (stage <= 0) continue
    const always = godDef(id).always
    stats[always.stat.kind] += statAt(always.stat, stage)
    // 고른 신화는 패시브 전체가 돌아 메아리를 따로 내지 않는다
    if (id !== chosen) echoes.push({ god: id, stage })
  }
  // 일반 장비 수치 (E13-02)와 원천 수치
  const sources = Object.fromEntries(SOURCE_IDS.map((s) => [s, 0])) as Record<SourceId, number>
  for (const item of inputs.gearItems ?? []) {
    for (const s of item.stats) stats[s.kind] += s.value
    sources[item.source.id] += item.source.value
  }
  for (const id of inputs.gear) {
    if (!id) continue
    const source = relicSource(id, inputs.stage?.(id) ?? 1)
    sources[source.id] += source.value
  }
  for (const s of SOURCE_IDS) sources[s] += inputs.sourceMastery?.(s) ?? 0
  for (const [kind, value] of Object.entries(inputs.bonus ?? {}) as [StatKind, number][]) stats[kind] += value
  const awakening = Object.fromEntries(SOURCE_IDS.map((s) => [s, Math.min(3, awakeningLevel(sources[s]) + (inputs.awakenBonus?.[s] ?? 0))])) as Record<SourceId, number>
  const resonance = Math.min(...SOURCE_IDS.map((s) => inputs.sourceMastery?.(s) ?? 0))
  let damageScale = (1 + inputs.promotions * PER_PROMOTION.damage) * (1 + stats.damage)
  if (god) {
    // 고른 신화의 패시브 (천둥의 신: 거인 특효)
    damageScale *= god.passive.damageScale
  }
  const modifiers = gearModifiers(inputs.gear)
  return {
    chosen,
    level: chosen ? (inputs.open.get(chosen) ?? 0) : 0,
    damageScale,
    modifiers,
    // 받는 피해 줄이기를 많이 겹쳐도 0이나 음수(맞으면 회복)가 되지 않게
    damageTaken: modifiers.damageTaken * Math.max(0.1, 1 + stats.damageTaken),
    moveSpeed: modifiers.moveSpeed * (1 + stats.moveSpeed) * rules.moveScale,
    attackSpeed: (god ? god.passive.attackSpeed : 1) * (1 + stats.attackSpeed),
    attack: god ? god.attack : 'blade',
    echoes,
    stats,
    sources,
    awakening,
    resonance,
    maxHp: Math.round((BASE_HP + inputs.promotions * PER_PROMOTION.maxHp + stats.maxHp) * (1 + stats.maxHpPct) * rules.maxHpScale),
    noHeal: rules.noHeal,
    noUltimate: rules.noUltimate,
  }
}

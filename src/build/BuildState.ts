import type { AttackStyle } from '../combat/styles'
import { awakeningLevel } from '../data/awakening'
import { NO_RULES, type OathRules } from '../data/oaths'
import { type MythAlways, STAT_KINDS, type StatKind } from '../data/mythAlways'
import { SOURCE_IDS, type SourceId } from '../data/schema'
import { relicAwake } from '../gear/mythRelic'
import { PER_LIT, PER_OPENED, PER_PROMOTION } from '../myth/ClassProgress'
import { type God, godDef, relicDef, type RelicId } from '../relics/data'
import { type Modifiers, NO_MODIFIERS } from '../skills/Skill'
import { FLAME, renownMultiplier } from '../data/cycle'
import { type DamageLayer, layerProduct } from './layers'

/**
 * 빌드 상태 (E11-04, DESIGN.md 4.6).
 * 힘은 "열린 신화 + 고른 신화 + 장비 + 원천"을 모은 이 한 곳에서 계산한다.
 * - 고른 신화(지금은 발현한 신)는 추가 효과: 패시브·궁극기·공격 리듬
 * - 열린 신화는 하나마다 최대 생명 +5, 유물표에 켠 칸은 하나마다 모든 피해 +1% (E303-04)
 * - 승급(신화 단계)은 큰 걸음(E21-01): 한 번마다 모든 피해 ×1.35, 최대 생명 +25%
 * - 장비 = 일반 장비(유물은 E303-04에서 유물표로, 기본 수치·원천 없음), 원천 = 장비의 원천 수치 (E14에서 각성, 원천 숙련은 E21-05에서 없앰)
 * - 성좌판에서 별을 밝힌 신화는 그 신화의 수치를 낸다 (엔딩 뒤, E17)
 */

/** 빌드 상태를 만드는 재료 */
export interface BuildInputs {
  /** 열린 신화와 개방 단계 (1~4) */
  open: ReadonlyMap<God, number>
  /** 손에 낀 신 (E302): 공격 동작·리듬·피해 배율. 없으면 낡은 검 */
  hand: God | null
  /** 자리 셋(손·심장·숨)에 든 신들 (E302): 그 신의 유물이 깨어난다 */
  present?: readonly God[]
  /** 깨우는 중인 신 (E238): 조각 2부터 그 신의 유물이 깨어난다. 자리에는 들지 않는다 */
  waking?: God | null
  /** 유물표에 켠 유물 (E303-04): 그 신이 자리에 들면 지속 효과가 깨어난다 */
  gear: readonly (RelicId | null)[]
  /** 유물표에 켠 칸 수 (유물 + 고유 효과): 하나마다 모든 피해 +1% */
  lit?: number
  /** 칸에 낀 일반 장비 (E13-02): 수치는 상시 효과 수치와 같은 종류끼리 더한다 */
  gearItems?: readonly GearItemStats[]
  /** 유물 단계 (E13-03, 없으면 1) */
  stage?: (id: RelicId) => number
  /** 올린 개방 단계의 합 */
  promotions: number
  /** 시련 보상(E16)·수련 마디(E236)·균열의 축복(E17): 출처마다 수치 종류별로 더한다 */
  bonus?: Partial<Record<BonusFrom, Partial<Record<StatKind, number>>>>
  /** 균열의 축복이 올린 각성 단계 (E17, 원천마다) */
  awakenBonus?: Partial<Record<SourceId, number>>
  /** 성좌판에서 밝힌 별 (E17): 그 신화의 상시 효과가 한 단계 위 */
  starred?: ReadonlySet<God>
  /** 누적 명성 (E304): 배율 1 + 0.1·√명성을 곱한다 */
  renown?: number
  /** 정복한 장의 수 (E305-02): 명성 배율의 지수 */
  conquered?: number
  /** 원천 불씨 (E304): 원천마다 고른 횟수. 원천 +2씩과 원천마다 다른 배율 */
  flames?: Partial<Record<SourceId, number>>
  /** 시련 중 제약 (E16): 고른 신화 없이·최대 생명·이동 속도 등. 장비 칸 제한은 재료를 모을 때 거른다 */
  rules?: OathRules
}

/** 일반 장비 하나의 수치와 원천 */
export interface GearItemStats {
  stats: readonly { kind: StatKind; value: number }[]
  source: { id: SourceId; value: number }
}

/** 더하는 수치의 출처 (층 이름과 같다) */
export type BonusFrom = 'oaths' | 'training' | 'blessings'
const BONUS_FROM: readonly BonusFrom[] = ['oaths', 'training', 'blessings']

/** 기본 최대 생명 */
export const BASE_HP = 100
/** 별 수치 단계의 끝: 4단계 신화에 그 신화 유물을 끼면 5 */
export const TOP_STAGE = 5

/**
 * 별을 밝힌 신화의 수치가 작동하는 단계 (E17-04, E21에서 성좌판만): 개방 단계 + 별 하나,
 * 그 신화 유물을 끼면 한 단계 위
 */
export function alwaysStage(level: number, wearsRelic: boolean, starred = false): number {
  return level <= 0 ? 0 : Math.min(TOP_STAGE, level + (wearsRelic ? 1 : 0) + (starred ? 1 : 0))
}

/** 그 단계의 수치 (3단계 value[0], 4단계 value[1], 5단계 ×1.5, 그 아래는 0) */
export function statAt(stat: MythAlways['stat'], stage: number): number {
  if (stage < 3) return 0
  if (stage === 3) return stat.value[0]
  return stat.value[1] * (stage >= TOP_STAGE ? 1.5 : 1)
}

/** 빌드 상태: 능력치와 걸린 힘 */
export interface BuildState {
  /** 손에 낀 신 (E302): 공격 동작·리듬을 정한다 */
  chosen: God | null
  /** 손 말고 자리에 든 신들 (E302): 심장·숨 */
  borrowed: readonly God[]
  /** 손에 낀 신의 단계 (없으면 0) */
  level: number
  /** 기본 공격과 스킬에 공통으로 곱하는 피해 배율 (= 층 목록의 곱) */
  damageScale: number
  /** 피해 배율의 층 목록 (E301-01): 어디서 얼마나 오는지 */
  layers: readonly DamageLayer[]
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
  /** 열린 신화 수 (하나마다 최대 생명 +5) */
  collected: number
  /** 유물표에 켠 칸 수 (하나마다 모든 피해 +1%, E303-04) */
  lit: number
  /** 수치: 일반 장비·시련 보상·별을 밝힌 신화의 같은 종류 수치를 더한 값 (없으면 0) */
  stats: Readonly<Record<StatKind, number>>
  /** 최대 생명 */
  maxHp: number
  /** 시련 제약: 생명이 차오르지 않는다, 궁극기를 쓸 수 없다 (E16) */
  noHeal: boolean
  noUltimate: boolean
  /** 원천 수치: 일반 장비와 유물(단계마다 +2~+5)의 합 (E14, E21-05에서 원천 숙련을 없앰) */
  sources: Readonly<Record<SourceId, number>>
  /** 원천 각성 단계 0~3 (문턱 5/10/20, E14-02) */
  awakening: Readonly<Record<SourceId, number>>
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
  const chosen = inputs.hand
  const god = chosen ? godDef(chosen) : null
  // 수치: 같은 종류는 더하고, 다른 종류끼리는 아래에서 곱한다
  const worn = new Set(inputs.gear.filter((id): id is RelicId => id !== null).map((id) => relicDef(id).god))
  const stats = Object.fromEntries(STAT_KINDS.map((k) => [k, 0])) as Record<StatKind, number>
  const layers: DamageLayer[] = []
  /** 덧셈 층 하나: 그 출처의 수치를 더하고 피해 몫을 층으로 남긴다 */
  const addFrom = (id: DamageLayer['id'], add: (into: Record<StatKind, number>) => void) => {
    const before = stats.damage
    add(stats)
    layers.push({ id, kind: 'add', value: stats.damage - before })
  }
  let collected = 0
  addFrom('stars', () => {
    for (const [id, level] of inputs.open) {
      if (level <= 0) continue
      collected += 1
      // 별을 밝힌 신화만 그 신화의 수치를 낸다 (성좌판, 엔딩 뒤)
      if (inputs.starred?.has(id)) stats[godDef(id).always.stat.kind] += statAt(godDef(id).always.stat, alwaysStage(level, worn.has(id), true))
    }
  })
  // 일반 장비 수치 (E13-02)와 원천 수치
  const sources = Object.fromEntries(SOURCE_IDS.map((s) => [s, 0])) as Record<SourceId, number>
  const addItems = (items: readonly GearItemStats[] | undefined) => {
    for (const item of items ?? []) {
      for (const s of item.stats) stats[s.kind] += s.value
      sources[item.source.id] += item.source.value
    }
  }
  addFrom('gear', () => addItems(inputs.gearItems))
  // 원천 불씨 (E304): 원천마다 +2
  const flames = inputs.flames ?? {}
  for (const s of SOURCE_IDS) sources[s] += (flames[s] ?? 0) * FLAME.points
  for (const from of BONUS_FROM) {
    addFrom(from, () => {
      for (const [kind, value] of Object.entries(inputs.bonus?.[from] ?? {}) as [StatKind, number][]) stats[kind] += value
    })
  }
  const awakening = Object.fromEntries(SOURCE_IDS.map((s) => [s, Math.min(3, awakeningLevel(sources[s]) + (inputs.awakenBonus?.[s] ?? 0))])) as Record<SourceId, number>
  // 신화 단계(큰 걸음)는 곱하고, 유물표는 다른 피해 수치와 더한다. 고른 신화의 패시브(천둥의 신: 거인 특효)는 곱한다
  layers.unshift({ id: 'promotion', kind: 'mul', value: PER_PROMOTION.damage ** inputs.promotions })
  layers.push({ id: 'collection', kind: 'add', value: (inputs.lit ?? 0) * PER_LIT })
  layers.push({ id: 'myth', kind: 'mul', value: god ? god.passive.damageScale : 1 })
  // 원정 (E304): 명성 배율, 불꽃 불씨의 피해
  const renown = renownMultiplier(inputs.renown ?? 0)
  layers.push({ id: 'renown', kind: 'mul', value: renown })
  // 장 정복 (E305-02): 명성 배율 M을 M^(1 + 0.1·정복)으로. 늘어난 몫만 따로 한 층
  layers.push({ id: 'conquest', kind: 'mul', value: renownMultiplier(inputs.renown ?? 0, inputs.conquered ?? 0) / renown })
  layers.push({ id: 'flames', kind: 'mul', value: FLAME.flame.damage ** (flames.flame ?? 0) })
  const damageScale = layerProduct(layers)
  // 유물의 지속 효과는 그 신이 자리에 들었을 때만 깨어난다 (E21-04 → E302). 시련으로 신화를 막아도 자리는 그대로 본다
  const present = inputs.present ?? (inputs.hand ? [inputs.hand] : [])
  const borrowed = present.filter((g) => g !== inputs.hand)
  const lent = inputs.waking ? [...present, inputs.waking] : present
  const modifiers = gearModifiers(inputs.gear.map((id) => (id && relicAwake(id, inputs.hand, lent) ? id : null)))
  return {
    chosen,
    borrowed,
    level: chosen ? (inputs.open.get(chosen) ?? 0) : 0,
    damageScale,
    layers,
    modifiers,
    // 받는 피해 줄이기를 많이 겹쳐도 0이나 음수(맞으면 회복)가 되지 않게
    damageTaken: modifiers.damageTaken * Math.max(0.1, 1 + stats.damageTaken) * FLAME.stone.taken ** (flames.stone ?? 0),
    moveSpeed: modifiers.moveSpeed * (1 + stats.moveSpeed) * rules.moveScale * FLAME.wind.speed ** (flames.wind ?? 0),
    attackSpeed: (god ? god.passive.attackSpeed : 1) * (1 + stats.attackSpeed) * FLAME.wind.speed ** (flames.wind ?? 0),
    attack: god ? god.attack : 'blade',
    collected,
    lit: inputs.lit ?? 0,
    stats,
    sources,
    awakening,
    maxHp: Math.round((BASE_HP + collected * PER_OPENED.maxHp + stats.maxHp) * (1 + inputs.promotions * PER_PROMOTION.maxHpPct + stats.maxHpPct) * rules.maxHpScale * FLAME.stone.maxHp ** (flames.stone ?? 0)),
    noHeal: rules.noHeal,
    noUltimate: rules.noUltimate,
  }
}

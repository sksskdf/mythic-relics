import type { AttackStyle } from '../combat/styles'
import { MASTERY_DAMAGE, PER_PROMOTION } from '../myth/ClassProgress'
import { type God, godDef, relicDef, type RelicId, type Source } from '../relics/data'
import { type Modifiers, NO_MODIFIERS } from '../skills/Skill'

/**
 * 빌드 상태 (E11-04, DESIGN.md 4.6).
 * 힘은 "열린 신화 + 고른 신화 + 장비 + 원천"을 모은 이 한 곳에서 계산한다.
 * 지금은 1차 스프린트 규칙 그대로 옮겨 같은 값을 낸다:
 * - 고른 신화 = 발현한 신, 장비 = 유물 칸, 원천 = 원천 숙련, 순환 성장 배율 (E14에서 없앰)
 * E12(상시·추가 효과)·E13(일반 장비)·E14(원천 각성)에서 재료와 계산이 늘어난다.
 */

/** 빌드 상태를 만드는 재료 */
export interface BuildInputs {
  /** 열린 신화와 개방 단계 (1~4) */
  open: ReadonlyMap<God, number>
  /** 고른 신화 (지금은 발현한 신 하나, 없으면 빈 목록) */
  chosen: readonly God[]
  /** 장비 (지금은 유물 칸, 빈 칸은 null) */
  gear: readonly (RelicId | null)[]
  /** 원천 숙련 */
  mastery: (source: Source) => number
  /** 올린 개방 단계의 합 */
  promotions: number
  /** 순환 성장 배율 (불꽃·바위·바람 단련) */
  cycle: { damage: number; damageTaken: number; moveSpeed: number }
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
  /** 순환 성장까지 곱한 받는 피해 배율 */
  damageTaken: number
  /** 순환 성장까지 곱한 이동 속도 배율 */
  moveSpeed: number
  /** 공격 속도 배율 (고른 신화의 리듬) */
  attackSpeed: number
  /** 기본 공격 모션 */
  attack: AttackStyle
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
  const chosen = inputs.chosen[0] ?? null
  const god = chosen ? godDef(chosen) : null
  let damageScale = 1 + inputs.promotions * PER_PROMOTION.damage
  if (god) {
    // 고른 신화의 패시브 (천둥의 신: 거인 특효)
    damageScale *= god.passive.damageScale
    // 원천 숙련: 고른 신화와 같은 원천의 올린 단계만큼
    damageScale *= 1 + inputs.mastery(god.source) * MASTERY_DAMAGE
  }
  damageScale *= inputs.cycle.damage
  const modifiers = gearModifiers(inputs.gear)
  return {
    chosen,
    level: chosen ? (inputs.open.get(chosen) ?? 0) : 0,
    damageScale,
    modifiers,
    damageTaken: modifiers.damageTaken * inputs.cycle.damageTaken,
    moveSpeed: modifiers.moveSpeed * inputs.cycle.moveSpeed,
    attackSpeed: god ? god.passive.attackSpeed : 1,
    attack: god ? god.attack : 'blade',
  }
}

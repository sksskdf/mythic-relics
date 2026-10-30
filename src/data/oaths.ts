import type { StatKind } from './mythAlways'

/**
 * 맹세 (E305-01, `CYCLE.md` 3.4): 원정 하나에 거는 제약. 그 원정에서 장 보스나 수호자를 이기면 지킨 것이고, 그 제약과 짝을 이룬 것이 영구히 세진다.
 * 귀환 2부터 다시 떠날 때 「맹세 없음」과 함께 고른다. 데모는 셋, 엔딩 뒤에 다섯이 더 열린다(옛 시련 여덟을 옮김).
 * 결계 판은 없다: 제약은 원정 내내 걸리고, 지키지 못한 채 귀환하면 벌 없이 풀린다
 */
export const OATH_IDS = ['silence', 'emptyHand', 'alone', 'noHeal', 'crowd', 'timed', 'glass', 'slow'] as const
export type OathId = (typeof OATH_IDS)[number]

/** 데모에서 고르는 맹세 셋 */
export const DEMO_OATHS: readonly OathId[] = ['silence', 'emptyHand', 'alone']

export interface OathDef {
  id: OathId
  name: string
  /** 제약 (짧게) */
  rule: string
  /** 지키면 영구히 얻는 것. 수치가 아니면(홀로: 숨 칸) kind 없이 글만 */
  reward: { kind?: StatKind; value: number; text: string }
  /** 엔딩 뒤에 열린다 */
  after?: boolean
}

export const OATHS: Readonly<Record<OathId, OathDef>> = {
  silence: { id: 'silence', name: '침묵의 맹세', rule: '궁극기를 쓸 수 없다', reward: { kind: 'ultCharge', value: 0.3, text: '심장 게이지 충전 +30%' } },
  emptyHand: { id: 'emptyHand', name: '빈 손의 맹세', rule: '손 칸을 비우고 낡은 검으로 싸운다', reward: { kind: 'attackSpeed', value: 0.1, text: '모든 무기 동작 빠르기 +10%' } },
  alone: { id: 'alone', name: '홀로의 맹세', rule: '숨 칸 하나만 돈다', reward: { value: 1, text: '숨 칸 +1' } },
  noHeal: { id: 'noHeal', name: '마른 샘의 맹세', rule: '생명이 차오르지 않는다', reward: { kind: 'healOnKill', value: 3, text: '처치할 때 생명 +3' }, after: true },
  crowd: { id: 'crowd', name: '두 배의 무리의 맹세', rule: '무리마다 적이 두 배로 선다', reward: { kind: 'areaSize', value: 0.1, text: '범위 +10%' }, after: true },
  timed: { id: 'timed', name: '타는 모래시계의 맹세', rule: '떠난 지 10분 안에 지켜야 한다', reward: { kind: 'damage', value: 0.05, text: '모든 피해 +5%' }, after: true },
  glass: { id: 'glass', name: '유리 몸의 맹세', rule: '최대 생명이 절반이다', reward: { kind: 'maxHp', value: 40, text: '최대 생명 +40' }, after: true },
  slow: { id: 'slow', name: '무거운 발의 맹세', rule: '이동 속도가 30% 느리다', reward: { kind: 'moveSpeed', value: 0.06, text: '이동 속도 +6%' }, after: true },
}

/** 맹세 수치 (E306 `/balance-pass`에서 맞춘다) */
export const OATH = {
  /** 이 귀환 횟수부터 다시 떠날 때 맹세를 고른다 */
  unlock: 2,
  /** 기록의 기준 (초): 이보다 빨리 지킬수록 명성이 더 붙는다 */
  par: 480,
  /** 지킨 기록이 모두 기준 안이면 명성 +5% (맹세마다 나눠 쌓는다) */
  renown: 0.05,
  /** 타는 모래시계: 떠난 뒤 이 초 안에 지켜야 한다 */
  timed: 600,
  /** 두 배의 무리: 무리 크기 배율 */
  crowd: 2,
} as const

/** 맹세를 건 동안의 빌드 규칙 (빌드 상태가 덮어쓴다) */
export interface OathRules {
  /** 손 칸을 비운다 (낡은 검) */
  emptyHand: boolean
  /** 도는 숨 칸 수 (null이면 제한 없음) */
  breath: number | null
  noHeal: boolean
  maxHpScale: number
  moveScale: number
  noUltimate: boolean
}

export const NO_RULES: OathRules = { emptyHand: false, breath: null, noHeal: false, maxHpScale: 1, moveScale: 1, noUltimate: false }

/** 그 맹세의 빌드 규칙 (무리·시간 제한은 빌드가 아니라 원정 쪽에서 본다) */
export function oathRules(id: OathId | null): OathRules {
  switch (id) {
    case 'silence':
      return { ...NO_RULES, noUltimate: true }
    case 'emptyHand':
      return { ...NO_RULES, emptyHand: true }
    case 'alone':
      return { ...NO_RULES, breath: 1 }
    case 'noHeal':
      return { ...NO_RULES, noHeal: true }
    case 'glass':
      return { ...NO_RULES, maxHpScale: 0.5 }
    case 'slow':
      return { ...NO_RULES, moveScale: 0.7 }
    default:
      return NO_RULES
  }
}

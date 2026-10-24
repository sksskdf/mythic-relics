import type { StatKind } from './mythAlways'

/**
 * 시련 (E16-01, DESIGN.md 5.3): 전설에 제약을 건 변형. 깨면 그 제약과 이어진 것이 영구히 세진다.
 * 위협 3단계에 열리고, 아무 필드 성소에서나 고른 신화의 전설(없거나 「신화 없이」면 우트가르드 원정)로 치른다.
 * 난이도는 다섯이고, 제약마다 깬 가장 높은 난이도만큼 보상이 쌓인다.
 */
export const TRIAL_IDS = ['noMyth', 'fewSlots', 'noHeal', 'crowd', 'timed', 'glass', 'slow', 'noUltimate'] as const
export type TrialId = (typeof TRIAL_IDS)[number]

export interface TrialDef {
  id: TrialId
  name: string
  /** 제약 (짧게) */
  rule: string
  /** 보상: 그 제약과 이어진 수치, 깬 난이도 하나마다 */
  reward: { kind: StatKind; per: number; text: string }
  /** 결계 안 적의 피해에 더 곱하는 값 (회복이 막힌 시련은 적을 조금 약하게) */
  enemyDamage?: number
}

export const TRIALS: Readonly<Record<TrialId, TrialDef>> = {
  noMyth: { id: 'noMyth', name: '신 없는 싸움', rule: '고른 신화 없이 싸운다', reward: { kind: 'basicDamage', per: 0.04, text: '기본 공격 피해' } },
  fewSlots: { id: 'fewSlots', name: '세 칸의 짐', rule: '장비는 무기·몸·장신구 하나만', reward: { kind: 'damage', per: 0.02, text: '모든 피해' } },
  noHeal: { id: 'noHeal', name: '마른 샘', rule: '생명이 차오르지 않는다', reward: { kind: 'healOnKill', per: 1, text: '처치할 때 생명' }, enemyDamage: 0.65 },
  crowd: { id: 'crowd', name: '두 배의 무리', rule: '결계에 적이 두 배로 몰려온다', reward: { kind: 'areaSize', per: 0.03, text: '범위' } },
  timed: { id: 'timed', name: '타는 모래시계', rule: '정한 시간 안에 끝내야 한다', reward: { kind: 'attackSpeed', per: 0.02, text: '공격 속도' } },
  glass: { id: 'glass', name: '유리 몸', rule: '최대 생명이 절반이다', reward: { kind: 'maxHp', per: 10, text: '최대 생명' } },
  slow: { id: 'slow', name: '무거운 발', rule: '이동 속도가 30% 느리다', reward: { kind: 'moveSpeed', per: 0.02, text: '이동 속도' } },
  noUltimate: { id: 'noUltimate', name: '침묵한 신', rule: '궁극기를 쓸 수 없다', reward: { kind: 'ultCharge', per: 0.04, text: '신위 충전' } },
}

/** 난이도 1~5: 결계 안 적의 생명력·피해 배율 (위협 단계 배율에 곱한다) */
export const TRIAL_LEVELS = 5
export const TRIAL_DIFFICULTY = {
  hp: [1, 1.3, 1.7, 2.2, 2.8],
  damage: [1, 1.15, 1.3, 1.5, 1.75],
} as const

/** 「타는 모래시계」의 시간 제한 (초, 난이도마다) */
export const TRIAL_TIME = [150, 130, 110, 95, 80] as const

/** 시련이 열리는 위협 단계 (올라가 본 단계) */
export const TRIAL_UNLOCK_THREAT = 3

/** 기록의 기준 시간 (초). 이보다 빠를수록 균열 보상 배율이 커진다 */
export const TRIAL_PAR = 90

/** 깬 난이도의 합으로 열리는 것 */
export const TRIAL_MILESTONES = [
  { at: 4, name: '시련의 맛', text: '시련 보상 ×1.25' },
  { at: 12, name: '열린 성소', text: '어느 신화권 성소에서나 전설에 들어간다' },
  { at: 24, name: '시련의 이름', text: '균열 보상 +10% (E17)' },
] as const

/** 제약을 건 동안의 빌드 규칙 (빌드 상태가 덮어쓴다) */
export interface TrialRules {
  noMyth: boolean
  /** 쓸 수 있는 장비 칸 (null이면 모두) */
  slots: readonly number[] | null
  noHeal: boolean
  maxHpScale: number
  moveScale: number
  noUltimate: boolean
}

export const NO_RULES: TrialRules = { noMyth: false, slots: null, noHeal: false, maxHpScale: 1, moveScale: 1, noUltimate: false }

/** 그 시련의 빌드 규칙 */
export function trialRules(id: TrialId | null): TrialRules {
  switch (id) {
    case 'noMyth':
      return { ...NO_RULES, noMyth: true }
    case 'fewSlots':
      // 무기(0)·몸(2)·장신구 하나(5)
      return { ...NO_RULES, slots: [0, 2, 5] }
    case 'noHeal':
      return { ...NO_RULES, noHeal: true }
    case 'glass':
      return { ...NO_RULES, maxHpScale: 0.5 }
    case 'slow':
      return { ...NO_RULES, moveScale: 0.7 }
    case 'noUltimate':
      return { ...NO_RULES, noUltimate: true }
    default:
      return NO_RULES
  }
}

import type { SourceId } from './schema'

/**
 * 원정 순환의 수치 (E304, `DESIGN.md` 5.3): 명성 식·명성 배율·갈래·새 불길·귀환 횟수 자동화를 한곳에.
 * 수치는 E306 `/balance-pass`에서 맞춘다
 */

/** 명성 배율 M = 1 + per × √(누적 명성). 목표 첫 귀환 ×1.45, 둘째 ×1.9, 셋째 ×2.5, 넷째 ×3 */
export const RENOWN = {
  per: 0.1,
  /** 한 원정 몫 = base × 가장 깊이 닿은 장 × (1 + boss × 그 원정에서 이긴 수호자·장 보스 수) */
  base: 10,
  boss: 0.5,
} as const

/**
 * 장 정복 (E305-02, `DESIGN.md` 5.5): 장 보스(거인 왕·키마이라)를 이길 때마다 숨 칸 +1, 신 단계 상한 +1, 명성 지수 +0.1.
 * 신 단계 상한은 처음 2에서 정복마다 오르고 데모 끝은 3이다(키마이라의 몫은 엔딩 뒤 4단계에서 쓰인다)
 */
export const CONQUEST = { breath: 1, levelCap: 1, renownExp: 0.1 } as const
/** 장을 하나도 정복하지 않았을 때의 신 단계 상한 */
export const LEVEL_CAP_BASE = 2

/** 명성 배율의 지수: 정복한 장마다 0.1씩 (1 → 1.1 → 1.2) */
export const renownExponent = (conquered: number): number => 1 + CONQUEST.renownExp * Math.max(0, conquered)

/** 누적 명성의 배율 (장을 정복할수록 지수가 붙는다) */
export function renownMultiplier(renown: number, conquered = 0): number {
  return (1 + RENOWN.per * Math.sqrt(Math.max(0, renown))) ** renownExponent(conquered)
}

/** 한 원정의 명성: 가장 깊이 닿은 장(1부터)과 그 원정에서 이긴 수호자·장 보스 수 */
export function renownFor(deepestChapter: number, bossesBeaten: number): number {
  return Math.round(RENOWN.base * Math.max(1, deepestChapter) * (1 + RENOWN.boss * Math.max(0, bossesBeaten)))
}

/** 귀환할 때 고르는 갈래: 승천(자리에 든 신 하나 +1단계) 또는 원천 불씨 넷 가운데 하나 */
export type BranchPick = { kind: 'ascend'; god: string } | { kind: 'flame'; source: SourceId }

/** 원천 불씨 한 번에 더하는 원천 수치와 따로 붙는 배율 (`DESIGN.md` 6.3) */
export const FLAME = {
  points: 2,
  /** 불씨 하나마다: 불꽃 피해 ×1.10, 바위 생명 ×1.15·받는 피해 ×0.95, 바람 공격·이동 ×1.06, 사냥 명성 ×1.25 */
  flame: { damage: 1.1 },
  stone: { maxHp: 1.15, taken: 0.95 },
  wind: { speed: 1.06 },
  hunt: { renown: 1.25 },
} as const

/** 원정을 떠난 뒤 이 초가 지나야 귀환할 수 있다 (떠나자마자 다시 귀환 카드가 뜨지 않게) */
export const RETURN_MIN_SECONDS = 120
/**
 * 원정이 무르익어야 귀환한다: 이번 원정의 기세 레벨(수련 깨달음)이 이만큼은 되어야 귀환 카드가 뜬다 (E306 D9: 귀환 번호마다).
 * n번째 귀환에 필요한 기세 레벨, 표 끝을 넘으면 마지막 값. 뒤 원정일수록 처치가 빠르고 출발점(⅓·½)도 붙어 8에 일찍 닿으니
 * 문턱을 올려 원정 길이를 `TIMELINE.md` 4장(18·15·18·24분)에 맞춘다. 옛 신 경험치 막대(1500·3000)가 맡던 박자를 기세가 맡는다.
 * E306-02 첫 바퀴: [8, 12, 14, 16]에서 봇 귀환이 12.9·19.2·28.7·37.1분(목표 14·26·40·59)이라 둘째부터 올림.
 * 둘째 바퀴: [8, 16, 16, 20](땅 세기를 한 번 더 올린 탐색)에서 귀환 1이 요르문간드 뒤 1.5분(목표 3.1분), 거인 왕이 귀환 2 뒤 4.6분(목표 8.2분),
 * 귀환 4가 키마이라 뒤 4분(목표 3.1분)이라 [9, 17, 17, 19]. 표는 줄지 않는다(tests/expedition.test.ts)
 */
export const RETURN_MIN_LEVEL: readonly number[] = [9, 17, 17, 19]
/** 엔딩을 본 뒤의 귀환 문턱 (깊이 순환은 그대로 빠르게) */
export const RETURN_MIN_LEVEL_AFTER_ENDING = 8

/** returnNo번째 귀환(1부터)에 필요한 기세 레벨. 엔딩 뒤에는 RETURN_MIN_LEVEL_AFTER_ENDING */
export function returnMinLevel(returnNo: number, afterEnding = false): number {
  if (afterEnding) return RETURN_MIN_LEVEL_AFTER_ENDING
  return RETURN_MIN_LEVEL[Math.min(RETURN_MIN_LEVEL.length - 1, Math.max(0, returnNo - 1))]!
}

/** 새 불길: 다시 떠난 뒤 이 초 동안 장비 드랍 배율 */
export const NEW_FIRE = { seconds: 120, drop: 3 } as const

/**
 * 귀환을 알리는 때 (목표 한 줄이 「화로에서 원정을 마친다」로, E306 D10: `DESIGN.md` 5.3): 첫 귀환 뒤로, 귀환 문턱을 넘었고,
 * 지난 기세 레벨에서 quietLevel초가 지났거나(기세가 느려짐) 받을 배율이 지금의 gain배를 넘으면. 목표가 합치기인 동안은 알리지 않는다
 */
export const RETURN_SIGNAL = { quietLevel: 180, gain: 1.25 } as const

/** 귀환 횟수가 여는 자동화 (`DESIGN.md` 5.3) */
export const AUTOMATION = {
  /** 이 횟수부터 수련 마디를 지난 원정 차례대로 저절로 다시 찍는다 */
  retake: 1,
  /** 가보 칸 수: 귀환 횟수 → 칸 */
  heirloom: [0, 1, 1, 2] as readonly number[],
  /** 자동 합치기: 이 횟수부터 그 등급 */
  autoMerge: { good: 2, rare: 3 } as const,
  /** 기세 출발점: 귀환 횟수 → 지난 원정 최고 경험치의 몫 */
  head: [0, 0, 1 / 3, 1 / 2] as readonly number[],
  /** 엔딩을 봤으면 귀환 횟수를 이만큼은 친다 (자동화를 유지, `expedition.count`는 그대로, E305-03) */
  endingReturns: 3,
  /** 자동 줍기 (엔딩 뒤): 장비·재료를 이만큼 주운 뒤 열리고, 둘레 이 거리(m) 안의 장비를 걸어가지 않아도 줍는다. 재료 유물은 어디서나 */
  pickup: { need: 20, radius: 5 },
} as const

/** 귀환 횟수 n일 때 (표 끝을 넘으면 마지막 값) */
export const atCount = <T>(table: readonly T[], n: number): T => table[Math.min(table.length - 1, Math.max(0, n))]!

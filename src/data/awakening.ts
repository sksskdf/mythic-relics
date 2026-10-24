import { SOURCE_IDS, type SourceId } from './schema'

/**
 * 원천 각성 (E14-01, DESIGN.md 6.2).
 * 원천마다 장비의 원천 수치 합(+ 원천 숙련)이 문턱을 넘을 때마다 각성이 한 단계씩 열린다. 단계는 쌓인다(2단계면 1단계 효과도 돈다).
 * 7칸을 한 원천에 몰면 23 안팎(영웅 장비 +3 × 6 + 4단계 유물 +5)이라 3단계에 닿고, 둘로 나누면 둘 다 2단계쯤에 머문다.
 * 피해 수치는 기본 공격 한 번(10~13)에 견준 값이고, 빌드 피해 배율이 곱해진다.
 */

/** 각성 문턱: 5 / 10 / 20 */
export const AWAKEN_AT: readonly number[] = [5, 10, 20]

/** 원천 수치 합 → 각성 단계 0~3 */
export function awakeningLevel(total: number): number {
  let level = 0
  for (const at of AWAKEN_AT) if (total >= at) level++
  return level
}

/** 공명 1마다 모든 각성 효과의 세기 +5% (E14-04, 네 원천 숙련의 최솟값) */
export const RESONANCE_PER = 0.05

export const AWAKENING = {
  /** 불꽃 (때릴수록): 연타 끝에 폭발 → 커짐 → 번진다 */
  flame: {
    /** 기본 공격 몇 번마다 터지나 (단계 1·2·3) */
    every: [6, 5, 4],
    radius: [2, 3, 3],
    damage: [10, 16, 16],
    knockback: 4,
    /** 3단계: 폭발에 맞은 적 가운데 가장 먼 적 자리에서 한 번 더 */
    spread: { radius: 2.2, damage: 10 },
  },
  /** 사냥 (쓰러뜨릴수록): 처치하면 빨라짐 → 처치 때 충격 → 연속 처치 보너스 */
  hunt: {
    haste: { time: 2.5, attackSpeed: 0.2, moveSpeed: 0.1 },
    shock: { radius: 2.6, damage: 12, knockback: 6 },
    /** 3초 안에 이어 잡을 때마다 피해 +4%, 10겹까지 */
    streak: { window: 3, per: 0.04, max: 10 },
  },
  /** 바람 (걸을수록): 걸은 만큼 다음 공격이 셈 → 걷는 동안 피함 → 걷는 자리에 바람 칼날 */
  wind: {
    /** 1m마다 다음 기본 공격 피해 +6%, +60%까지 (치면 사라진다) */
    charge: { perMeter: 0.06, max: 0.6 },
    /** 걷는 동안 맞을 때 피할 확률 */
    dodge: 0.3,
    /** 1.6m 걸을 때마다 그 자리에 칼날 */
    blade: { every: 1.6, radius: 1.5, damage: 6 },
  },
  /** 바위 (버틸수록): 맞으면 보호막 → 보호막이 깨지며 반격 → 오래 서 있을수록 단단해짐 */
  stone: {
    /** 맞으면 최대 생명의 8% 보호막 (6초에 한 번) */
    shield: { share: 0.08, cooldown: 6 },
    burst: { radius: 3, damage: 20, knockback: 9 },
    /** 1.5초 넘게 서 있으면 초마다 받는 피해 −4%, −20%까지 */
    brace: { after: 1.5, perSecond: 0.04, max: 0.2 },
  },
} as const

/** 정보 화면에 쓰는 짧은 설명 (단계 1·2·3) */
export const AWAKENING_TEXT: Readonly<Record<SourceId, readonly [string, string, string]>> = {
  flame: ['기본 공격 6번마다 작은 폭발', '폭발이 커지고 5번마다', '4번마다, 폭발이 한 번 더 번진다'],
  hunt: ['처치하면 잠깐 빨라진다', '처치할 때 둘레에 충격', '이어 잡을수록 피해 +4% (10겹)'],
  wind: ['걸은 만큼 다음 공격이 세진다 (+60%까지)', '걷는 동안 30% 확률로 피한다', '걷는 자리에 바람 칼날'],
  stone: ['맞으면 보호막 (6초마다)', '보호막이 깨지면 둘레에 반격', '오래 서 있을수록 받는 피해 −20%까지'],
}

/** 원천마다 0으로 채운 기록 */
export const zeroSources = (): Record<SourceId, number> => Object.fromEntries(SOURCE_IDS.map((s) => [s, 0])) as Record<SourceId, number>

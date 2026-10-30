import type { Grade } from './gearData'

/**
 * 세계 위협 단계 (E14-03, DESIGN.md 9.4).
 * 세계 전체에 걸리는 난이도 1~10. 적이 세지고, 정예가 늘고, 장비 등급과 재료가 좋아진다.
 * 층마다 배율은 곱으로 쌓되 폭은 작게 둔다 (적도 같이 커져 "지난 단계가 쉬워짐"으로 느끼게).
 * 다음 단계는 지금 열린 가장 높은 단계에서 지역 보스(신화 보스)를 이기면 열린다. 고르기는 마을 촌장.
 */
export const THREAT_MAX = 10
/** 한계를 깬 뒤의 끝 (E17-01): 사실상 없음 */
export const THREAT_LIMITLESS = 99
/** 한계를 깨는 신화권: 이 다섯의 보스를 모두 10단계에서 이기면 */
export const LIMIT_REALMS = ['norse', 'greek', 'china', 'japan', 'korea'] as const
/** 신화권 이름 (화면 글) */
export const REALM_NAMES: Readonly<Record<string, string>> = { norse: '북유럽', greek: '그리스', china: '중국', japan: '일본', korea: '한국' }

export const THREAT = {
  /** 단계가 하나 오를 때마다 적 생명력 ×1.2, 피해 ×1.1 */
  hp: 1.2,
  damage: 1.1,
  /** 단계마다 무리에 정예가 섞일 확률 +3%p */
  elite: 0.03,
  /** 단계마다 좋음 이상 등급이 나올 몫 ×1.25 (흔함이 그만큼 줄어든다) */
  grade: 1.25,
  /** 단계마다 재료가 하나 더 나올 확률 +10%p (같은 것 하나 더) */
  material: 0.1,
  /** 단계마다 장비가 떨어질 확률 ×1.08 */
  gearDrop: 1.08,
} as const

/** 그 단계의 적 배율 */
export function threatScale(level: number): { hp: number; damage: number } {
  const n = Math.max(0, Math.min(THREAT_LIMITLESS, level) - 1)
  return { hp: THREAT.hp ** n, damage: THREAT.damage ** n }
}

/** 그 단계의 정예 확률 (기본 확률에 더한다) */
export const threatElite = (base: number, level: number): number => Math.min(0.9, base + THREAT.elite * (Math.max(1, level) - 1))

/** 그 단계의 등급 확률: 좋음·희귀·영웅 몫을 늘리고 흔함에서 뺀다 (합은 1) */
export function threatGrades(chances: Readonly<Record<Grade, number>>, level: number): Record<Grade, number> {
  const k = THREAT.grade ** (Math.max(1, level) - 1)
  // 높은 등급부터 채우고, 남는 몫에서 좋음, 그 나머지가 흔함
  const legend = Math.min(0.1, chances.legend * k)
  const hero = Math.min(0.2, chances.hero * k)
  const rare = Math.min(0.4, chances.rare * k)
  const good = Math.min(1 - legend - hero - rare, chances.good * k)
  return { common: Math.max(0, 1 - good - rare - hero - legend), good, rare, hero, legend }
}

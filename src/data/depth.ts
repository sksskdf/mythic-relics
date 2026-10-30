import type { Grade } from './gearData'

/**
 * 깊이 (E305-03, `CYCLE.md` 3.5·7장, 옛 위협 단계 E14-03). 엔딩 뒤 장치다.
 * 세계 전체에 걸리는 난이도 1~10. 적이 세지고, 정예가 늘고, 장비 등급과 재료가 좋아진다.
 * 층마다 배율은 곱으로 쌓되 폭은 작게 둔다 (적도 같이 커져 "지난 깊이가 쉬워짐"으로 느끼게).
 * 귀환 카드에서 다음 원정의 깊이를 「그대로」나 「+1」로 고른다 (마을 촌장과 보스 문은 없앴다).
 */
export const DEPTH_LIMIT = 10
/** 한계를 깬 뒤의 끝: 사실상 없음 */
export const DEPTH_LIMITLESS = 99

export const DEPTH = {
  /** 깊이가 하나 오를 때마다 적 생명력 ×1.2, 피해 ×1.1 */
  hp: 1.2,
  damage: 1.1,
  /** 깊이마다 무리에 정예가 섞일 확률 +3%p */
  elite: 0.03,
  /** 깊이마다 좋음 이상 등급이 나올 몫 ×1.25 (흔함이 그만큼 줄어든다) */
  grade: 1.25,
  /** 깊이마다 재료가 하나 더 나올 확률 +10%p (같은 것 하나 더) */
  material: 0.1,
  /** 깊이마다 장비가 떨어질 확률 ×1.08 */
  gearDrop: 1.08,
} as const

/** 그 깊이의 적 배율 */
export function depthScale(level: number): { hp: number; damage: number } {
  const n = Math.max(0, Math.min(DEPTH_LIMITLESS, level) - 1)
  return { hp: DEPTH.hp ** n, damage: DEPTH.damage ** n }
}

/** 그 깊이의 정예 확률 (기본 확률에 더한다) */
export const depthElite = (base: number, level: number): number => Math.min(0.9, base + DEPTH.elite * (Math.max(1, level) - 1))

/**
 * 그 깊이의 등급 확률: 좋음·희귀·영웅 몫을 늘리고 흔함에서 뺀다 (합은 1).
 * 지금 장비 등급을 끌어올리는 길은 땅 자리와 이것 하나다. 적 등급(보통·정예·보스)별 등급 표로 나눌 자리 (E307)
 */
export function depthGrades(chances: Readonly<Record<Grade, number>>, level: number): Record<Grade, number> {
  const k = DEPTH.grade ** (Math.max(1, level) - 1)
  // 높은 등급부터 채우고, 남는 몫에서 좋음, 그 나머지가 흔함
  const legend = Math.min(0.1, chances.legend * k)
  const hero = Math.min(0.2, chances.hero * k)
  const rare = Math.min(0.4, chances.rare * k)
  const good = Math.min(1 - legend - hero - rare, chances.good * k)
  return { common: Math.max(0, 1 - good - rare - hero - legend), good, rare, hero, legend }
}

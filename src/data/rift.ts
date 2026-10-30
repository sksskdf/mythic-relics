/**
 * 균열 (E17, DESIGN.md 9.4).
 * - 균열: 들어갈 때마다 1층부터. 층의 적을 모두 쓰러뜨리면 다음 층 문이 열린다. 나오거나 쓰러지면 끝
 * - 깊이 기록·재료만 남는다 (축복·성좌판은 E305-03에서 걷었다: 원정 안의 성장은 수련이 맡는다)
 */

/** 층이 깊어질 때마다 적 생명력 ×1.12, 피해 ×1.06 (위협 RIFT_BASE_THREAT단계 배율에 곱한다) */
export const RIFT_SCALE = { hp: 1.12, damage: 1.06 } as const
/** 균열 1층의 세기: 고른 위협 단계와 상관없이 위협 5단계. 10층쯤에서 위협 10단계와 비슷해진다 (생명력 ×2.07 × 2.77 ≈ ×5.7) */
export const RIFT_BASE_THREAT = 5

export function riftScale(depth: number): { hp: number; damage: number } {
  const n = Math.max(0, depth - 1)
  return { hp: RIFT_SCALE.hp ** n, damage: RIFT_SCALE.damage ** n }
}

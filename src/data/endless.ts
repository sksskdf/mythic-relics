/**
 * 끝없는 원정 (E17 균열 → E305-03, DESIGN.md 9.4).
 * - 한계를 깬 뒤 마을에서 나선다. 나설 때마다 1층부터. 층의 적을 모두 쓰러뜨리면 다음 층 문이 열린다. 나오거나 쓰러지면 끝
 * - 깊이 기록·재료만 남는다 (축복·성좌판은 E305-03에서 걷었다: 원정 안의 성장은 수련이 맡는다)
 */

/** 층이 깊어질 때마다 적 생명력 ×1.12, 피해 ×1.06 (깊이 ENDLESS_BASE_DEPTH의 배율에 곱한다) */
export const ENDLESS_SCALE = { hp: 1.12, damage: 1.06 } as const
/** 끝없는 원정 1층의 세기: 고른 깊이와 상관없이 깊이 5. 10층쯤에서 깊이 10과 비슷해진다 (생명력 ×2.07 × 2.77 ≈ ×5.7) */
export const ENDLESS_BASE_DEPTH = 5

export function endlessScale(depth: number): { hp: number; damage: number } {
  const n = Math.max(0, depth - 1)
  return { hp: ENDLESS_SCALE.hp ** n, damage: ENDLESS_SCALE.damage ** n }
}

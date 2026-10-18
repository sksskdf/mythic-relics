/** 화면 위의 점 (CSS 픽셀) */
export interface ScreenPoint {
  x: number
  y: number
}

/** 화면에 비친 땅의 유물 하나: 발밑(base)에서 떠 있는 모델 위(top)까지 */
export interface ScreenItem<T> {
  item: T
  base: ScreenPoint
  top: ScreenPoint
}

/** 점에서 선분까지의 거리 */
function distanceToSegment(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

/**
 * 커서 아래의 땅 유물 (설명 카드용). 땅 위의 한 점이 아니라 화면에 보이는 모양(발밑 ~ 떠 있는 모델)과
 * 커서의 화면 거리로 고른다. 지형 높이나 확대 정도와 상관없이 보이는 곳에 올리면 뜬다. 가장 가까운 것 하나.
 */
export function itemUnderPointer<T>(items: readonly ScreenItem<T>[], pointer: ScreenPoint, radius: number): T | null {
  let best: T | null = null
  let bestDistance = radius
  for (const it of items) {
    const d = distanceToSegment(pointer, it.base, it.top)
    if (d <= bestDistance) {
      bestDistance = d
      best = it.item
    }
  }
  return best
}

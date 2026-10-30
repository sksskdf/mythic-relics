import { clampToRects, inRect, type Rect } from '../data/world'

/** 땅 위의 원형 충돌체 (x, z 평면) */
export interface CircleCollider {
  x: number
  z: number
  radius: number
}

export interface Point2 {
  x: number
  z: number
}

/** 원형 충돌체에 겹친 점을 바깥으로 밀어낸다. 반지름 radius만큼 떨어뜨린다. */
export function pushOut(point: Point2, radius: number, colliders: readonly CircleCollider[]): Point2 {
  let { x, z } = point
  // 여러 충돌체가 붙어 있을 때를 위해 몇 번 반복한다.
  for (let iteration = 0; iteration < 3; iteration++) {
    let moved = false
    for (const c of colliders) {
      const dx = x - c.x
      const dz = z - c.z
      const minDist = c.radius + radius
      const distSq = dx * dx + dz * dz
      if (distSq >= minDist * minDist) continue
      const dist = Math.sqrt(distSq)
      if (dist < 1e-6) {
        x = c.x + minDist
      } else {
        const push = (minDist - dist) / dist
        x += dx * push
        z += dz * push
      }
      moved = true
    }
    if (!moved) break
  }
  return { x, z }
}

/** 점을 맵 경계 안으로 넣는다. */
export function clampToBounds(point: Point2, halfExtent: number): Point2 {
  return {
    x: Math.max(-halfExtent, Math.min(halfExtent, point.x)),
    z: Math.max(-halfExtent, Math.min(halfExtent, point.z)),
  }
}

/**
 * 움직일 수 있는 곳 (E19): 땅의 네모와 이웃으로 가는 통로 네모들의 합. 지금 땅의 지역 안 좌표.
 * reach는 원점에서 가장 먼 가장자리까지의 거리로, 길찾기 격자가 덮어야 하는 반 폭이다.
 */
export interface WalkArea {
  readonly rects: readonly Rect[]
  readonly reach: number
}

/** 네모들로 움직일 수 있는 곳을 만든다 */
export function walkArea(rects: readonly Rect[]): WalkArea {
  let reach = 0
  for (const r of rects) reach = Math.max(reach, Math.abs(r.minX), Math.abs(r.maxX), Math.abs(r.minZ), Math.abs(r.maxZ))
  return { rects, reach }
}

/** 가운데가 원점인 네모 하나 (끝없는 원정 층·점검용) */
export function squareArea(halfExtent: number): WalkArea {
  return walkArea([{ minX: -halfExtent, maxX: halfExtent, minZ: -halfExtent, maxZ: halfExtent }])
}

/** 점을 움직일 수 있는 곳 안으로 넣는다 (가장자리에서 inset만큼 안쪽) */
export function clampToArea(point: Point2, area: WalkArea, inset = 0): Point2 {
  return clampToRects(area.rects, point.x, point.z, inset)
}

/** 점이 움직일 수 있는 곳 안인가 (가장자리에서 inset만큼 안쪽) */
export function inArea(area: WalkArea, x: number, z: number, inset = 0): boolean {
  return area.rects.some((r) => inRect(r, x, z, -inset))
}

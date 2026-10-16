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

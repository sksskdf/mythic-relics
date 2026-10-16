/** 방향 각도 규칙: 0이면 +z(앞), 값이 커지면 +x 쪽으로 돈다. (facingAngle과 같다) */
export function angleTo(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ)
}

/** 두 각도의 차이를 -π~π 사이로 돌려준다. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/**
 * 부채꼴 공격 범위 안에 대상(원)이 들어오는지 확인한다.
 * - origin: 공격자 위치, facing: 바라보는 각도
 * - range: 부채꼴 반지름, halfAngle: 부채꼴 절반 각도
 * - 대상은 반지름이 있어서, 몸통 일부만 걸쳐도 맞는다.
 */
export function inArc(
  originX: number,
  originZ: number,
  facing: number,
  range: number,
  halfAngle: number,
  targetX: number,
  targetZ: number,
  targetRadius: number,
): boolean {
  const dist = Math.hypot(targetX - originX, targetZ - originZ)
  if (dist > range + targetRadius) return false
  if (dist <= targetRadius) return true
  const allowance = Math.asin(Math.min(1, targetRadius / dist))
  return Math.abs(angleDiff(angleTo(originX, originZ, targetX, targetZ), facing)) <= halfAngle + allowance
}

/** 원형 범위 안에 대상이 들어오는지 확인한다. */
export function inCircle(cx: number, cz: number, radius: number, targetX: number, targetZ: number, targetRadius: number): boolean {
  return Math.hypot(targetX - cx, targetZ - cz) <= radius + targetRadius
}

/** 퍼져 나가는 고리(충격파)의 띠 안에 대상이 있는지 확인한다. */
export function inRing(cx: number, cz: number, radius: number, width: number, targetX: number, targetZ: number, targetRadius: number): boolean {
  const d = Math.hypot(targetX - cx, targetZ - cz)
  return Math.abs(d - radius) <= width / 2 + targetRadius
}

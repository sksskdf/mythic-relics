/** 한 프레임에 넘겨줄 최대 시간. 탭이 멈췄다 돌아와도 물리가 튀지 않게 막는다. */
export const MAX_FRAME_DELTA = 0.1

/** 이전 프레임과의 시간 차(초)를 계산한다. */
export function frameDelta(previousMs: number, nowMs: number): number {
  const delta = (nowMs - previousMs) / 1000
  if (!Number.isFinite(delta) || delta < 0) return 0
  return Math.min(delta, MAX_FRAME_DELTA)
}

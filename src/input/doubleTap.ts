/** 두 번 누름으로 치는 간격(초)과 거리(CSS 픽셀) */
export const DOUBLE_TAP = { seconds: 0.35, pixels: 40 }

/**
 * 같은 자리를 짧은 간격으로 두 번 눌렀는지 알아낸다.
 * 세 번째 누름은 다시 첫 누름으로 친다. (두 번 누름이 겹쳐 이어지지 않게)
 */
export class DoubleTapDetector {
  private last: { time: number; x: number; y: number } | null = null

  /** 누를 때마다 부른다. 바로 앞 누름과 함께 두 번 누름이면 true */
  press(time: number, x: number, y: number): boolean {
    const last = this.last
    const isDouble =
      last !== null && time - last.time <= DOUBLE_TAP.seconds && Math.hypot(x - last.x, y - last.y) <= DOUBLE_TAP.pixels
    this.last = isDouble ? null : { time, x, y }
    return isDouble
  }
}

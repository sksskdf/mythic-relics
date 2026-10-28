/**
 * 손가락 몸짓 알아보기 (E235, 휴대폰). 좌표는 화면의 CSS 픽셀이다.
 * - 톡: 짧게 누르고 거의 움직이지 않고 뗀다 → 컴퓨터의 클릭과 같다 (적이면 공격, 땅이면 그곳까지)
 * - 끌기: 누른 자리에 떠다니는 조이스틱이 생기고, 손잡이 쪽으로 걷는다. 원은 뗄 때까지 그 자리에 있고, 손잡이만 원 안에서 움직인다
 *   (원이 손가락을 따라오면 패드가 움직여 보인다는 사용자 의견, 2026-10-28)
 * - 두 손가락: 벌리고 오므려 확대·축소. 두 손가락을 댄 뒤로는 손을 다 뗄 때까지 걷거나 톡이 되지 않는다
 */

/** 이만큼(px) 넘게 끌면 톡이 아니라 조이스틱이다 */
export const DRAG_START = 12
/** 조이스틱 원의 반지름(px). 손잡이는 이 밖으로 나가지 않는다 */
export const STICK_RADIUS = 48
/** 손잡이가 가운데에서 이만큼(px) 안이면 서 있는다 */
export const STICK_DEAD = 8
/** 이보다 오래 누르면 톡이 아니다 (초) */
export const TAP_SECONDS = 0.35

export interface Point {
  x: number
  y: number
}

/** 조이스틱: 원의 가운데와, 가운데에서 손잡이까지 (반지름 안으로 자른 것) */
export interface Stick {
  x: number
  y: number
  dx: number
  dy: number
}

interface Finger {
  x: number
  y: number
  startX: number
  startY: number
  start: number
}

export class TouchGestures {
  private readonly fingers = new Map<number, Finger>()
  /** 조이스틱을 잡은 손가락과 원의 가운데 */
  private stickId: number | null = null
  private readonly origin = { x: 0, y: 0 }
  /** 두 손가락을 댈 때의 거리 (0이면 확대·축소 중이 아니다) */
  private pinchFrom = 0
  /** 두 손가락을 댄 뒤: 손을 다 뗄 때까지 걷기·톡을 하지 않는다 */
  private spent = false
  private tapped: Point | null = null

  /** primary: 다른 손가락이 하나도 닿지 않은 채 처음 댄 손가락 (브라우저의 isPrimary). 남은 손가락이 있으면 뗀 것을 놓친 것이라 버린다 */
  down(id: number, x: number, y: number, t: number, primary = false): void {
    if (primary) this.reset()
    this.fingers.set(id, { x, y, startX: x, startY: y, start: t })
    if (this.fingers.size >= 2) {
      this.stickId = null
      this.spent = true
      this.pinchFrom = this.spread()
    }
  }

  move(id: number, x: number, y: number): void {
    const finger = this.fingers.get(id)
    if (!finger) return
    finger.x = x
    finger.y = y
    if (this.stickId === null && !this.spent && this.fingers.size === 1 && Math.hypot(x - finger.startX, y - finger.startY) > DRAG_START) {
      this.stickId = id
      this.origin.x = finger.startX
      this.origin.y = finger.startY
    }
  }

  up(id: number, t: number): void {
    const finger = this.fingers.get(id)
    if (!finger) return
    this.fingers.delete(id)
    const still = Math.hypot(finger.x - finger.startX, finger.y - finger.startY) <= DRAG_START
    if (!this.spent && this.stickId === null && still && t - finger.start <= TAP_SECONDS) this.tapped = { x: finger.x, y: finger.y }
    this.release(id)
  }

  /** 손가락을 잃었다 (브라우저가 가져감): 톡 없이 뗀 것으로 친다 */
  cancel(id: number): void {
    if (this.fingers.delete(id)) this.release(id)
  }

  /** 지금 조이스틱 (없으면 null). 손가락이 원 밖에 있어도 손잡이는 원 가장자리에 둔다 */
  get stick(): Stick | null {
    const finger = this.stickId === null ? null : this.fingers.get(this.stickId)
    if (!finger) return null
    const dx = finger.x - this.origin.x
    const dy = finger.y - this.origin.y
    const k = Math.min(1, STICK_RADIUS / (Math.hypot(dx, dy) || 1))
    return { x: this.origin.x, y: this.origin.y, dx: dx * k, dy: dy * k }
  }

  /** 두 손가락 거리가 처음의 몇 배인가 (확대·축소 중이 아니면 null) */
  get pinch(): number | null {
    return this.pinchFrom > 0 && this.fingers.size >= 2 ? this.spread() / this.pinchFrom : null
  }

  /** 막 톡 누른 자리 (한 번만 읽힌다) */
  takeTap(): Point | null {
    const tap = this.tapped
    this.tapped = null
    return tap
  }

  /** 프레임이 끝났다: 이 프레임에 읽지 않은 톡은 버린다 (멈춘 동안·장면 중에 누른 것이 나중에 지시가 되지 않게) */
  endFrame(): void {
    this.tapped = null
  }

  /** 손가락을 모두 잊는다 (창이 가려지거나 포커스를 잃어 뗀 것을 못 받을 수 있을 때) */
  reset(): void {
    this.fingers.clear()
    this.stickId = null
    this.pinchFrom = 0
    this.spent = false
    this.tapped = null
  }

  private release(id: number): void {
    if (id === this.stickId) this.stickId = null
    if (this.fingers.size < 2) this.pinchFrom = 0
    if (this.fingers.size === 0) this.spent = false
  }

  /** 처음 두 손가락 사이의 거리 */
  private spread(): number {
    const [a, b] = [...this.fingers.values()]
    return a && b ? Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) : 0
  }
}

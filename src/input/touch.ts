/**
 * 손가락 몸짓 알아보기 (E235, 휴대폰). 좌표는 화면의 CSS 픽셀이다.
 * - 톡: 짧게 누르고 거의 움직이지 않고 뗀다 → 컴퓨터의 클릭과 같다 (적이면 공격, 땅이면 그곳까지)
 * - 끌기: 누른 자리에 떠다니는 조이스틱이 생기고, 손잡이 쪽으로 걷는다. 원은 뗄 때까지 그 자리에 있고, 손잡이만 원 안에서 움직인다
 *   (원이 손가락을 따라오면 패드가 움직여 보인다는 사용자 의견, 2026-10-28). 원 밖으로 멀리 끌면 탈것에 오른다 (E241, `stretch`)
 * - 두 손가락: 벌리고 오므려 확대·축소. 둘째 손가락이 닿는 것만으로는 확대가 아니다 (E307, 사용자 의견 「터치 여러 번 했을 때
 *   간헐적으로 확대된다」): 두 손가락이 저마다 움직여 사이 거리가 문턱을 넘게 바뀐 뒤에야 확대로 잠긴다. 잠기기 전에 짧게 닿았다 뗀
 *   손가락은 톡이고, 조이스틱을 쥔 동안의 둘째 손가락은 톡으로만 받는다 (걷기가 끊기지 않는다. 다만 두 손가락이 거의 함께 닿았으면
 *   첫 손가락이 먼저 끌려 조이스틱이 됐어도 확대로 잠길 수 있다). 확대로 잠긴 뒤로는 손을 다 뗄 때까지 걷거나 톡이 되지 않는다
 * - 쉬는 손가락 곁에서 끌기: 먼저 닿아 제자리에 얹혀 있는 손가락(쥔 손, 길게 누른 엄지)이 있어도, 다른 손가락을 원 가장자리 넘게
 *   끌면 그 손가락이 조이스틱을 잡는다 (화면이 죽은 것처럼 보이지 않게). 둘 다 움직이는 두 손가락은 그 전에 확대로 잠긴다
 */

/** 이만큼(px) 넘게 끌면 톡이 아니라 조이스틱이다 */
export const DRAG_START = 12
/** 조이스틱 원의 반지름(px). 손잡이는 이 밖으로 나가지 않는다 */
export const STICK_RADIUS = 48
/** 손잡이가 가운데에서 이만큼(px) 안이면 서 있는다 */
export const STICK_DEAD = 8
/** 이보다 오래 누르면 톡이 아니다 (초) */
export const TAP_SECONDS = 0.35
/** 두 손가락 사이 거리가 처음보다 이만큼(px) 넘게, 그리고 PINCH_START_RATIO 넘게 바뀌어야 확대·축소로 잠근다 (E307) */
export const PINCH_START_PX = 24
/** 두 손가락 사이 거리가 처음의 이 비율 넘게 바뀌어야 한다 (멀리 떨어진 두 엄지일수록 더 많이 움직여야 한다) */
export const PINCH_START_RATIO = 0.08
/** 두 접점이 이보다(px) 가까우면 손가락 하나가 둘로 잡힌 것으로 본다: 그 흔들림은 확대·축소가 아니다 */
export const PINCH_MIN_SPREAD = 40
/** 두 손가락이 이 시간(초) 안에 이어 닿았으면 함께 댄 것이다: 첫 손가락이 그새 조이스틱이 됐어도 확대·축소로 잠길 수 있다 */
export const PINCH_JOIN_SECONDS = 0.25

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
  /** 손가락 수가 마지막으로 바뀐 때의 자리 (두 손가락이 저마다 움직였는지 여기서 잰다) */
  baseX: number
  baseY: number
}

/** 손가락이 그 자리에서 이만큼 벗어났나 */
const beyond = (finger: Finger, fromX: number, fromY: number, px: number) => Math.hypot(finger.x - fromX, finger.y - fromY) > px

export class TouchGestures {
  private readonly fingers = new Map<number, Finger>()
  /** 조이스틱을 잡은 손가락과 원의 가운데 */
  private stickId: number | null = null
  private readonly origin = { x: 0, y: 0 }
  /** 두 손가락 사이의 처음 거리. 손가락 수가 바뀔 때마다, 그리고 확대로 잠기는 순간에 다시 잰다 (0이면 손가락이 둘이 아니다) */
  private pinchFrom = 0
  /** 지금 두 손가락이 확대·축소로 잠겼나. 손가락 수가 바뀌면 풀리고, 다시 문턱을 넘어야 잠긴다 */
  private zooming = false
  /** 확대·축소로 잠긴 횟수 (`pinchCount`) */
  private locks = 0
  /** 확대·축소를 한 뒤: 손을 다 뗄 때까지 걷기·톡을 하지 않는다 */
  private spent = false
  private tapped: Point | null = null

  /** primary: 다른 손가락이 하나도 닿지 않은 채 처음 댄 손가락 (브라우저의 isPrimary). 남은 손가락이 있으면 뗀 것을 놓친 것이라 버린다 */
  down(id: number, x: number, y: number, t: number, primary = false): void {
    if (primary) this.reset()
    this.fingers.set(id, { x, y, startX: x, startY: y, start: t, baseX: x, baseY: y })
    this.measure()
  }

  move(id: number, x: number, y: number): void {
    const finger = this.fingers.get(id)
    if (!finger) return
    finger.x = x
    finger.y = y
    if (this.fingers.size > 1 && !this.zooming && this.pinched()) this.lock()
    else this.grab(id, finger)
  }

  up(id: number, t: number): void {
    const finger = this.fingers.get(id)
    if (!finger) return
    this.fingers.delete(id)
    // 조이스틱을 쥔 손가락만 아니면 톡이다: 조이스틱을 쥔 채 다른 손가락으로 누른 것도, 겹쳐 누른 두 엄지도 (E307)
    const still = !beyond(finger, finger.startX, finger.startY, DRAG_START)
    if (!this.spent && id !== this.stickId && still && t - finger.start <= TAP_SECONDS) this.tapped = { x: finger.x, y: finger.y }
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

  /**
   * 조이스틱 손가락이 원의 가운데에서 얼마나 멀리 끌렸나 (원 반지름의 배, 손잡이를 자르기 전 손가락 자리로).
   * 조이스틱을 잡지 않았으면 0. 멀리 끌면 탈것에 오른다 (E241)
   */
  get stretch(): number {
    const finger = this.stickId === null ? null : this.fingers.get(this.stickId)
    if (!finger) return 0
    return Math.hypot(finger.x - this.origin.x, finger.y - this.origin.y) / STICK_RADIUS
  }

  /** 두 손가락 거리가 확대·축소로 잠긴 순간의 몇 배인가 (잠기지 않았으면 null) */
  get pinch(): number | null {
    return this.zooming ? this.spread() / this.pinchFrom : null
  }

  /**
   * 확대·축소로 잠긴 횟수. 값이 달라졌으면 새로 잠긴 것이라 `pinch`의 기준(1배)이 그때의 거리다:
   * 읽는 쪽은 처음 시야를 다시 잰다 (세 손가락에서 하나를 떼도 남은 둘의 거리로 튀지 않게, E307)
   */
  get pinchCount(): number {
    return this.locks
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
    this.zooming = false
    this.spent = false
    this.tapped = null
  }

  private release(id: number): void {
    if (id === this.stickId) this.stickId = null
    this.measure()
    if (this.fingers.size === 0) this.spent = false
  }

  /**
   * 누른 자리에서 끌린 손가락이 조이스틱을 잡는다 (원의 가운데는 누른 자리).
   * - 하나뿐인 손가락이면 DRAG_START 넘게 끌렸을 때
   * - 다른 손가락이 닿아 있으면 그 손가락들이 쉬고 있고(`resting`), 이 손가락은 원 가장자리(STICK_RADIUS) 넘게 끌렸을 때 (E307).
   *   가장자리까지 기다리는 것은 확대·축소에 먼저 기회를 주려는 것이다: 벌리고 오므리는 두 손가락은 한쪽이 여기까지 오기 전에
   *   다른 쪽도 DRAG_START를 넘어 확대로 잠긴다. 그렇게 잡은 조이스틱도 뗄 때까지 확대로 넘어가지 않는다 (`pinched`)
   */
  private grab(id: number, finger: Finger): void {
    if (this.stickId !== null || this.spent) return
    const alone = this.fingers.size === 1
    if (!beyond(finger, finger.startX, finger.startY, alone ? DRAG_START : STICK_RADIUS)) return
    for (const other of this.fingers.values()) if (other !== finger && !this.resting(other, finger)) return
    this.stickId = id
    this.origin.x = finger.startX
    this.origin.y = finger.startY
  }

  /**
   * 그 손가락은 끄는 손가락 곁에서 쉬고 있나: 따로 닿았고(함께 댄 두 손가락은 확대·축소를 하려는 것이다) 제자리에 있다.
   * 화면에 얹힌 엄지나 휴대폰을 쥔 손이 닿은 것이다
   */
  private resting(other: Finger, dragging: Finger): boolean {
    return Math.abs(other.start - dragging.start) > PINCH_JOIN_SECONDS && !beyond(other, other.baseX, other.baseY, DRAG_START)
  }

  /** 손가락 수가 바뀌었다: 확대·축소를 풀고, 두 손가락 사이의 처음 거리와 저마다의 자리를 다시 잰다 */
  private measure(): void {
    this.zooming = false
    this.pinchFrom = this.fingers.size >= 2 ? this.spread() : 0
    for (const finger of this.fingers.values()) {
      finger.baseX = finger.x
      finger.baseY = finger.y
    }
  }

  /**
   * 두 손가락이 확대·축소라고 할 만큼 벌어지거나 좁혀졌나 (E307).
   * - 조이스틱을 쥔 동안의 둘째 손가락은 톡일 뿐이다 (걷는 엄지가 움직여 거리가 바뀌는 것은 확대가 아니다).
   *   두 손가락이 거의 함께 닿았을 때만 빼고: 벌리려던 첫 손가락이 둘째가 닿기 전에 조금 끌려 조이스틱이 된 것이다
   * - 너무 가까운 두 접점은 손가락 하나가 둘로 잡힌 것이다
   * - 둘 다 움직여야 한다: 한 손가락을 대고 쉬는 채 다른 손가락으로 톡하거나 끄는 것은 확대가 아니다 (멀리 끌면 조이스틱이다, `grab`)
   */
  private pinched(): boolean {
    const [a, b] = this.pair()
    if (!a || !b || this.pinchFrom < PINCH_MIN_SPREAD) return false
    if (this.stickId !== null && Math.abs(a.start - b.start) > PINCH_JOIN_SECONDS) return false
    if (!beyond(a, a.baseX, a.baseY, DRAG_START) || !beyond(b, b.baseX, b.baseY, DRAG_START)) return false
    const change = Math.abs(this.spread() - this.pinchFrom)
    return change > PINCH_START_PX && change > this.pinchFrom * PINCH_START_RATIO
  }

  /** 확대·축소로 잠근다 (쥐고 있던 조이스틱은 놓는다). 잠긴 순간의 거리부터 잰다 (문턱을 넘은 만큼 시야가 한 번에 튀지 않게) */
  private lock(): void {
    this.zooming = true
    this.spent = true
    this.stickId = null
    this.pinchFrom = this.spread()
    this.locks += 1
  }

  /** 처음 두 손가락 */
  private pair(): (Finger | undefined)[] {
    return [...this.fingers.values()]
  }

  /** 처음 두 손가락 사이의 거리 */
  private spread(): number {
    const [a, b] = this.pair()
    return a && b ? Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) : 0
  }
}

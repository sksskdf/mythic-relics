/**
 * 다른 손가락이 닿아 있는 동안 누른 단추 (E307 손 QA).
 * 브라우저는 손가락 하나가 혼자 눌렀다 뗀 톡에만 click을 낸다. 조이스틱을 쥔 채, 또는 엄지를 화면에 얹은 채 다른 손가락으로 누른
 * 단추에는 pointerdown·pointerup만 오고 click은 오지 않는다 (크로미움의 진짜 두 손가락으로 확인: 먼저 닿은 손가락이든 나중 손가락이든,
 * 닿아 있는 동안 다른 손가락이 한 번이라도 함께 닿았으면 click이 없다. 아이폰 사파리도 한 손가락 톡만 click으로 바꾼다).
 * 메뉴 단추·초상·작은 지도, 정보 화면의 탭·닫기·행동 단추, 고르는 카드의 단추는 모두 click을 듣는다.
 * 단추마다 고치지 않고 여기 한 곳에서 그 톡의 click을 대신 낸다. 혼자 누른 손가락에는 손대지 않는다 (브라우저가 내는 click 그대로).
 * 오래 얹혀 있던 손가락(쥔 손, 쉬는 엄지)은 떼어도 누른 것이 아니다: 그 아래 단추가 눌리지 않는다.
 * 게임 화면의 톡·조이스틱(`touch.ts`)과는 따로 돈다: 그쪽은 포인터 사건을 직접 읽는다
 */

import { TAP_SECONDS } from './touch'

/** 누른 자리에서 이만큼(px) 안에서 떼어야 누른 것이다 (더 끌면 브라우저도 톡으로 치지 않는다) */
export const PRESS_SLOP = 12
/**
 * 이보다 오래(초) 닿아 있던 손가락은 누른 것이 아니다: 화면에 얹어 둔 엄지·휴대폰을 쥔 손이 단추 위에 있다가 떨어질 때
 * 그 단추가 눌리지 않게 (게임 화면의 톡과 같은 문턱)
 */
export const PRESS_SECONDS = TAP_SECONDS
/**
 * 대신 낸 click 뒤 이 시간(초) 안에 같은 자리(ECHO_PX 안)로 온 브라우저의 click은 같은 톡의 것이다: 두 번 눌리지 않게 버린다.
 * 브라우저가 톡을 click으로 바꾸는 데 걸리는 시간(두 번 누르기를 기다릴 때 0.35초쯤)보다 길게 잡는다
 */
export const ECHO_SECONDS = 0.5
export const ECHO_PX = 40

interface Press<T> {
  target: T
  x: number
  y: number
  /** 닿은 때 (초) */
  start: number
  /** 닿아 있는 동안 다른 손가락이 함께 닿은 적이 있다 (브라우저가 click을 내지 않는다) */
  shared: boolean
  /** 같은 자리를 함께 누른 다른 접점이 이미 눌렀다: 이 접점은 또 누르지 않는다 */
  spent: boolean
}

/** 닿아 있는 손가락들과, 그 가운데 브라우저가 click을 내지 않을 누름 (DOM 없음. T는 누른 것) */
export class FingerPresses<T> {
  private readonly held = new Map<number, Press<T>>()
  /** 마지막으로 대신 낸 click */
  private last: { id: number; x: number; y: number; t: number } | null = null

  /** 손가락이 닿았다 (t초). primary: 다른 손가락이 하나도 없이 처음 닿은 손가락 (그때 남아 있는 것은 뗀 것을 놓친 것이라 잊는다) */
  down(id: number, target: T, x: number, y: number, t: number, primary = false): void {
    if (primary) this.held.clear()
    const shared = this.held.size > 0
    for (const other of this.held.values()) other.shared = true
    this.held.set(id, { target, x, y, start: t, shared, spent: false })
  }

  /**
   * 손가락을 뗐다 (t초). 브라우저가 click을 내지 않을 누름이면 그 누른 것: 닿아 있는 동안 다른 손가락이 함께 닿았고,
   * 누른 자리에서 `PRESS_SECONDS` 안에 뗐다. 혼자 눌렀다 뗀 손가락, 끌린 손가락, 오래 얹혀 있던 손가락은 null.
   * 같은 자리(ECHO_PX 안)를 함께 누르고 있는 다른 접점은 이 누름에 든 것으로 친다:
   * 단추 하나를 두 손가락으로(또는 엄지 하나가 두 접점으로 잡혀) 눌러도 한 번만 눌린다
   */
  up(id: number, x: number, y: number, t: number): T | null {
    const press = this.held.get(id)
    if (!press) return null
    this.held.delete(id)
    if (press.spent || !press.shared || t - press.start > PRESS_SECONDS || Math.hypot(x - press.x, y - press.y) > PRESS_SLOP) return null
    for (const other of this.held.values()) if (Math.hypot(other.x - press.x, other.y - press.y) <= ECHO_PX) other.spent = true
    return press.target
  }

  /** 손가락을 잃었다 (브라우저가 밀기·확대로 가져감): 누른 것이 아니다 */
  cancel(id: number): void {
    this.held.delete(id)
  }

  /** 손가락을 모두 잊는다 (창이 가려져 뗀 것을 못 받을 수 있을 때) */
  reset(): void {
    this.held.clear()
  }

  /** 그 손가락의 click을 대신 냈다 */
  made(id: number, x: number, y: number, t: number): void {
    this.last = { id, x, y, t }
  }

  /**
   * 브라우저가 낸 click이 방금 대신 낸 click과 같은 톡의 것인가 (그런 브라우저가 있다면 두 번 눌린다). 한 번만 참이다.
   * id: 그 click을 낸 포인터 (모르면 undefined). 다른 손가락의 click은 같은 톡이 아니다
   */
  echo(x: number, y: number, t: number, id?: number): boolean {
    const last = this.last
    if (!last || t - last.t > ECHO_SECONDS) return false
    if (id !== undefined && id !== last.id) return false
    if (Math.hypot(x - last.x, y - last.y) > ECHO_PX) return false
    this.last = null
    return true
  }
}

/** 손가락 톡 대신 낸 click들 */
const made = new WeakSet<Event>()

/** 그 click은 손가락 톡 대신 낸 것인가. 코드가 낸 click(봇·점검 스크립트)과 가른다: 사람 손이라 고르는 카드의 잠금을 그대로 받는다 */
export function isFingerClick(e: Event): boolean {
  return made.has(e)
}

/**
 * 창에 귀를 건다 (한 번, 시작할 때). 손가락(`pointerType: touch`)만 본다.
 * click은 그 pointerup이 단추들을 다 거친 뒤(창의 bubble)에 낸다: 브라우저의 차례(pointerup → click)와 같게.
 * 받는 것은 뗀 자리의 요소다. 누른 요소와 이어져 있을 때만 낸다 (누르는 사이 그 자리에 뜬 다른 창·카드를 누른 것이 되지 않게)
 */
export function listenFingerClicks(): void {
  const presses = new FingerPresses<Element>()
  const now = () => performance.now() / 1000
  /** 방금 뗀, click을 대신 낼 누름 */
  let lifted: { id: number; from: Element } | null = null
  addEventListener('pointerdown', (e) => e.pointerType === 'touch' && e.target instanceof Element && presses.down(e.pointerId, e.target, e.clientX, e.clientY, now(), e.isPrimary), true)
  addEventListener('pointercancel', (e) => e.pointerType === 'touch' && presses.cancel(e.pointerId), true)
  addEventListener(
    'pointerup',
    (e) => {
      if (e.pointerType !== 'touch') return
      const from = presses.up(e.pointerId, e.clientX, e.clientY, now())
      lifted = from && { id: e.pointerId, from }
    },
    true,
  )
  addEventListener('pointerup', (e) => {
    if (lifted?.id !== e.pointerId) return
    const { from } = lifted
    lifted = null
    const at = document.elementFromPoint(e.clientX, e.clientY)
    // 눌 수 없는 단추에는 브라우저도 click을 내지 않는다
    if (!at || at.closest(':disabled')) return
    if (from.isConnected && from !== at && !from.contains(at) && !at.contains(from)) return
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, composed: true, view: window, detail: 1, clientX: e.clientX, clientY: e.clientY, screenX: e.screenX, screenY: e.screenY })
    made.add(click)
    presses.made(e.pointerId, e.clientX, e.clientY, now())
    at.dispatchEvent(click)
  })
  // 같은 톡에 브라우저도 click을 냈다면(여기서 본 브라우저들은 내지 않는다) 그 click은 누구도 듣기 전에 버린다
  addEventListener(
    'click',
    (e) => {
      if (!e.isTrusted || !presses.echo(e.clientX, e.clientY, now(), (e as Partial<PointerEvent>).pointerId)) return
      e.stopImmediatePropagation()
      e.preventDefault()
    },
    true,
  )
  const forget = () => {
    presses.reset()
    lifted = null
  }
  addEventListener('blur', forget)
  addEventListener('pagehide', forget)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && forget())
}

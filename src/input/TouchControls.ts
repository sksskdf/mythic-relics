import '../ui/touch.css'

import { MOUNT } from '../data/mount'
import { STICK_DEAD, TouchGestures } from './touch'

/**
 * 게임 화면을 덮는 창의 클래스 (E307). 모두 `hidden`으로 여닫고, 뜨는 순간에 쥐고 있던 조이스틱을 놓는다 (`coverOpened`).
 * - pausing: 게임을 멈추는 것 (대화 장면·정보 화면·일시 정지 창·두 갈래 카드). 떠 있는 동안은 게임 화면에 닿은 손가락도 받지 않는다
 * - passing: 멈추지 않지만 걸어 나가면 고른 것으로 치고 닫히는 카드 (맹세 출발 카드: 걸어 나가면 「맹세 없이」).
 *   쥔 채로 뜨면 읽기도 전에 닫히니 놓는다. 뜬 뒤에 새로 쥐면 걷는다
 * 귀환 카드(`pick-card return-card`)는 넣지 않는다: 화로에 들어서면 저절로 뜨고 걸어 나가면 닫히는 카드라, 놓으면 조이스틱으로
 * 화로를 지나가기만 해도 그 자리에 서고(탄 채면 내린다) 「아직」을 눌러야 한다. 톡으로 걷는 걸음처럼 그대로 지나가게 둔다
 */
export const COVER_CLASSES = {
  pausing: ['dialog', 'menu', 'pause', 'swap-card'],
  passing: ['oath-card'],
} as const

/** 그 클래스의 창이 떠 있다 */
const shown = (classes: readonly string[]) => classes.map((c) => `.${c}:not([hidden])`).join(', ')
const PAUSING = shown(COVER_CLASSES.pausing)
const COVERS = shown([...COVER_CLASSES.pausing, ...COVER_CLASSES.passing])

/** `hidden`이 바뀐 요소 하나 (MutationRecord에서 쓰는 것만) */
export interface HiddenChange {
  target: unknown
  /** 바뀌기 전 `hidden` 속성의 값. null이면 없었다 (보이고 있었다) */
  oldValue: string | null
}

/**
 * 게임 화면을 덮는 창이 막 떴나: 숨어 있다가(`hidden`이 있었다) 지금 보이는 창이 있다.
 * 이미 떠 있는 창에 `hidden = false`를 또 넣은 것은 뜬 것이 아니다 (그 뒤에 새로 쥔 조이스틱을 놓치지 않게)
 */
export function coverOpened(changes: readonly HiddenChange[]): boolean {
  return changes.some(({ target, oldValue }) => {
    const el = target as Pick<HTMLElement, 'hidden' | 'matches'>
    return oldValue !== null && !el.hidden && el.matches(COVERS)
  })
}

/**
 * 휴대폰 조작 (E235): 게임 화면(캔버스)에 닿은 손가락을 몸짓으로 읽고, 떠다니는 조이스틱을 그린다.
 * 무엇을 할지(걷기·공격·확대)는 PlayerInput이 프레임마다 읽어 정한다. 마우스는 Input이 그대로 받는다.
 * 대화 장면·정보 화면·일시 정지 창·두 갈래 카드·맹세 출발 카드가 뜨면 쥐고 있던 조이스틱을 놓고 원을 숨긴다 (E307):
 * 손가락을 쥔 채여도 원이 그 창 위에 남지 않고, 뗐다 다시 대야 걷는다 (`COVER_CLASSES`)
 */
export class TouchControls {
  readonly gestures = new TouchGestures()
  private readonly ring = document.createElement('div')
  private readonly knob = document.createElement('div')

  constructor(
    element: HTMLElement,
    parent: HTMLElement,
    private readonly now: () => number = () => performance.now() / 1000,
  ) {
    this.ring.className = 'stick'
    this.ring.hidden = true
    this.knob.className = 'stick__knob'
    this.ring.appendChild(this.knob)
    parent.appendChild(this.ring)

    element.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return
      e.preventDefault()
      // 게임을 멈춘 창이 떠 있으면 받지 않는다 (두 갈래 카드 옆 빈 곳에 손가락을 대도 원이 뜨지 않고, 고른 뒤에 혼자 걷지 않게)
      if (parent.querySelector(PAUSING)) return
      this.gestures.down(e.pointerId, e.clientX, e.clientY, this.now(), e.isPrimary)
      this.draw()
    })
    // 아이폰 사파리: 게임 화면을 길게 누르거나 톡에 이어 누르고 있으면 뜨는 돋보기·글자 선택을 막는다 (E307).
    // 포인터 사건은 touchstart를 막아도 그대로 온다 (조이스틱·톡·두 손가락은 포인터 사건으로 읽는다). 막히는 것은 이 캔버스의
    // 흉내 마우스 사건과 click뿐이고, 캔버스는 click을 쓰지 않는다. HUD·창의 단추는 제 요소가 받아 영향이 없다
    element.addEventListener('touchstart', (e) => e.cancelable && e.preventDefault(), { passive: false })
    // 앱을 바꾸거나 시스템 몸짓으로 창이 가려지면 뗀 것을 못 받을 수 있다: 손가락을 모두 잊어 혼자 걷거나 몸짓이 꼬이지 않게
    const forget = () => {
      this.gestures.reset()
      this.draw()
    }
    // 게임 화면을 덮는 창이 뜨는 순간에도 잊는다 (E307). 창은 모두 parent 아래에서 hidden으로 여닫는다
    new MutationObserver((records) => coverOpened(records) && forget()).observe(parent, { subtree: true, attributes: true, attributeFilter: ['hidden'], attributeOldValue: true })
    addEventListener('blur', forget)
    addEventListener('pagehide', forget)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') forget()
    })
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'touch') return
      this.gestures.move(e.pointerId, e.clientX, e.clientY)
      this.draw()
    })
    addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'touch') return
      this.gestures.up(e.pointerId, this.now())
      this.draw()
    })
    addEventListener('pointercancel', (e) => {
      if (e.pointerType !== 'touch') return
      this.gestures.cancel(e.pointerId)
      this.draw()
    })
  }

  /** 걷는 방향 (화면 픽셀, 길이는 조이스틱 반지름 이하). 조이스틱을 잡지 않았거나 가운데 근처면 null */
  get direction(): { dx: number; dy: number } | null {
    const stick = this.gestures.stick
    if (!stick || Math.hypot(stick.dx, stick.dy) < STICK_DEAD) return null
    return { dx: stick.dx, dy: stick.dy }
  }

  /** 조이스틱을 잡고 있나 (가운데에 두고 있어도) */
  get holding(): boolean {
    return this.gestures.stick !== null
  }

  /** 손가락을 원 반지름의 MOUNT.stickFar배보다 멀리 끌었나 (E241: 탈것에 오른다) */
  get far(): boolean {
    return this.gestures.stretch > MOUNT.stickFar
  }

  takeTap(): { x: number; y: number } | null {
    return this.gestures.takeTap()
  }

  private draw(): void {
    const stick = this.gestures.stick
    this.ring.hidden = !stick
    // 멀리 끈 동안은 원이 달리는 모양으로 (E241)
    this.ring.classList.toggle('is-far', this.far)
    if (!stick) return
    this.ring.style.left = `${stick.x}px`
    this.ring.style.top = `${stick.y}px`
    this.knob.style.transform = `translate(${stick.dx}px, ${stick.dy}px)`
  }
}

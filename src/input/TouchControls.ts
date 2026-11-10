import '../ui/touch.css'

import { MOUNT } from '../data/mount'
import { STICK_DEAD, TouchGestures } from './touch'

/**
 * 휴대폰 조작 (E235): 게임 화면(캔버스)에 닿은 손가락을 몸짓으로 읽고, 떠다니는 조이스틱을 그린다.
 * 무엇을 할지(걷기·공격·확대)는 PlayerInput이 프레임마다 읽어 정한다. 마우스는 Input이 그대로 받는다.
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

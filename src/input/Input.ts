import { type Action, type Bindings, DEFAULT_BINDINGS, mouseCode, resolveAction } from './bindings'

/** 이벤트의 button(바뀐 버튼)이 buttons(지금 눌린 버튼들)에서 차지하는 자리. 왼쪽 1·오른쪽 2·가운데 4·뒤로 8·앞으로 16 */
const BUTTON_BITS = [1, 4, 2, 8, 16]

/**
 * pointermove가 버튼이 바뀐 것을 실어 왔는가 (겹쳐 누름). button이 -1이면 바뀐 것이 없다.
 * 바뀐 버튼이 지금 눌려 있으면 누름, 아니면 뗌
 */
export function chordChange(button: number, buttons: number): 'press' | 'release' | null {
  const bit = BUTTON_BITS[button]
  if (bit === undefined) return null
  return buttons & bit ? 'press' : 'release'
}

/**
 * 키보드·마우스 입력을 모아 동작 단위 상태로 바꾼다.
 * 프레임마다 isDown/wasPressed로 읽고, 프레임 끝에 endFrame()을 부른다.
 */
export class Input {
  /** 캔버스 기준 포인터 위치 (CSS 픽셀) */
  readonly pointer = { x: 0, y: 0, inside: false }

  private readonly held = new Set<Action>()
  private readonly pressed = new Set<Action>()
  /** 동작마다 지금 눌려 있는 입력 이름 (왼쪽·오른쪽 버튼을 함께 누를 때를 위해) */
  private readonly heldCodes = new Map<Action, Set<string>>()

  constructor(
    private readonly element: HTMLElement,
    private readonly bindings: Bindings = DEFAULT_BINDINGS,
    /** 손가락은 받지 않는다 (휴대폰은 TouchControls가 몸짓으로 읽는다, E235) */
    private readonly ignoreTouch = false,
  ) {
    const mine = (e: PointerEvent) => !(this.ignoreTouch && e.pointerType === 'touch')
    element.addEventListener('contextmenu', (e) => e.preventDefault())
    element.addEventListener('pointerdown', (e) => {
      if (!mine(e)) return
      this.updatePointer(e)
      this.press(mouseCode(e.button))
    })
    window.addEventListener('pointerup', (e) => mine(e) && this.release(mouseCode(e.button)))
    window.addEventListener('pointermove', (e) => {
      if (!mine(e)) return
      this.updatePointer(e)
      // 다른 버튼을 누른 채 바꾼 버튼은 pointerdown·pointerup 없이 pointermove로 온다
      const change = chordChange(e.button, e.buttons)
      if (change === 'release') this.release(mouseCode(e.button))
      else if (change === 'press' && e.target instanceof Node && element.contains(e.target)) this.press(mouseCode(e.button))
    })
    // 브라우저가 포인터를 거두면(창 밖 끌기 등) 눌린 버튼을 모두 놓는다
    window.addEventListener('pointercancel', (e) => {
      if (!mine(e)) return
      for (const button of [0, 1, 2, 3, 4]) this.release(mouseCode(button))
    })
    // 커서가 게임 화면이나 창 밖으로 나가면 마지막 위치를 가리키지 않는다
    element.addEventListener('pointerleave', () => (this.pointer.inside = false))
    window.addEventListener('blur', () => (this.pointer.inside = false))
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      if (resolveAction(this.bindings, e.code)) e.preventDefault()
      this.press(e.code)
    })
    window.addEventListener('keyup', (e) => this.release(e.code))
    window.addEventListener('blur', () => {
      this.held.clear()
      this.heldCodes.clear()
    })
  }

  isDown(action: Action): boolean {
    return this.held.has(action)
  }

  wasPressed(action: Action): boolean {
    return this.pressed.has(action)
  }

  /** 프레임 끝에 함께 비울 것 (휴대폰의 톡, E235) */
  readonly frameEnd: (() => void)[] = []

  endFrame(): void {
    this.pressed.clear()
    for (const end of this.frameEnd) end()
  }

  private press(code: string): void {
    const action = resolveAction(this.bindings, code)
    if (!action) return
    if (!this.held.has(action)) this.pressed.add(action)
    this.held.add(action)
    const codes = this.heldCodes.get(action) ?? new Set<string>()
    codes.add(code)
    this.heldCodes.set(action, codes)
  }

  private release(code: string): void {
    const action = resolveAction(this.bindings, code)
    if (!action) return
    const codes = this.heldCodes.get(action)
    codes?.delete(code)
    if (!codes || codes.size === 0) this.held.delete(action)
  }

  private updatePointer(e: PointerEvent): void {
    const rect = this.element.getBoundingClientRect()
    this.pointer.x = e.clientX - rect.left
    this.pointer.y = e.clientY - rect.top
    this.pointer.inside =
      this.pointer.x >= 0 && this.pointer.y >= 0 && this.pointer.x <= rect.width && this.pointer.y <= rect.height
  }
}

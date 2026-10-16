import { type Action, type Bindings, DEFAULT_BINDINGS, mouseCode, resolveAction } from './bindings'

/**
 * 키보드·마우스 입력을 모아 동작 단위 상태로 바꾼다.
 * 프레임마다 isDown/wasPressed로 읽고, 프레임 끝에 endFrame()을 부른다.
 */
export class Input {
  /** 캔버스 기준 포인터 위치 (CSS 픽셀) */
  readonly pointer = { x: 0, y: 0, inside: false }

  private readonly held = new Set<Action>()
  private readonly pressed = new Set<Action>()

  constructor(
    private readonly element: HTMLElement,
    private readonly bindings: Bindings = DEFAULT_BINDINGS,
  ) {
    element.addEventListener('contextmenu', (e) => e.preventDefault())
    element.addEventListener('pointerdown', (e) => {
      this.updatePointer(e)
      this.press(mouseCode(e.button))
    })
    window.addEventListener('pointerup', (e) => this.release(mouseCode(e.button)))
    window.addEventListener('pointermove', (e) => this.updatePointer(e))
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      if (resolveAction(this.bindings, e.code)) e.preventDefault()
      this.press(e.code)
    })
    window.addEventListener('keyup', (e) => this.release(e.code))
    window.addEventListener('blur', () => this.held.clear())
  }

  isDown(action: Action): boolean {
    return this.held.has(action)
  }

  wasPressed(action: Action): boolean {
    return this.pressed.has(action)
  }

  endFrame(): void {
    this.pressed.clear()
  }

  private press(code: string): void {
    const action = resolveAction(this.bindings, code)
    if (!action) return
    if (!this.held.has(action)) this.pressed.add(action)
    this.held.add(action)
  }

  private release(code: string): void {
    const action = resolveAction(this.bindings, code)
    if (action) this.held.delete(action)
  }

  private updatePointer(e: PointerEvent): void {
    const rect = this.element.getBoundingClientRect()
    this.pointer.x = e.clientX - rect.left
    this.pointer.y = e.clientY - rect.top
    this.pointer.inside =
      this.pointer.x >= 0 && this.pointer.y >= 0 && this.pointer.x <= rect.width && this.pointer.y <= rect.height
  }
}

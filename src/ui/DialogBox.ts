/** 1초에 써지는 글자 수 */
const CHARS_PER_SECOND = 28

/**
 * 대화 상자 (E12-10, DESIGN.md 9.5). 화면 아래에 말하는 사람 이름과 대사를 띄우고 글자를 한 자씩 쓴다.
 * 화면 어디든 한 번 누르면 써지던 글이 바로 완성되고, 한 번 더 누르면 다음 줄로 넘어간다.
 * 대화 중에는 화면 전체를 덮어 클릭이 게임(이동 지시)으로 새지 않는다.
 */
export class DialogBox {
  readonly root: HTMLElement
  private readonly name: HTMLElement
  private readonly text: HTMLElement
  private readonly next: HTMLElement
  private readonly skip: HTMLButtonElement
  private line = ''
  private shown = 0
  /** 다음 줄로 넘어가라 (글이 다 써진 뒤 누름) */
  onAdvance: () => void = () => {}
  /** 건너뛰기 단추 */
  onSkip: () => void = () => {}

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'dialog'
    this.root.hidden = true
    const box = document.createElement('div')
    box.className = 'dialog__box'
    this.name = document.createElement('div')
    this.name.className = 'dialog__name'
    this.text = document.createElement('div')
    this.text.className = 'dialog__text'
    this.next = document.createElement('div')
    this.next.className = 'dialog__next'
    this.next.textContent = '▼'
    box.append(this.name, this.text, this.next)
    this.skip = document.createElement('button')
    this.skip.className = 'dialog__skip'
    this.skip.textContent = '건너뛰기'
    this.skip.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      e.preventDefault()
      this.onSkip()
    })
    this.root.append(box, this.skip)
    this.root.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      e.preventDefault()
      this.press()
    })
    parent.append(this.root)
  }

  /** 아직 글을 쓰는 중인가 */
  get typing(): boolean {
    return this.shown < [...this.line].length
  }

  /** 대화 상자를 연다. skippable이면 건너뛰기 단추를 보인다 (한 번 본 장면) */
  open(skippable: boolean): void {
    this.root.hidden = false
    this.skip.hidden = !skippable
  }

  close(): void {
    this.root.hidden = true
  }

  /** 새 줄을 쓰기 시작한다 */
  say(name: string, line: string): void {
    this.name.textContent = name
    this.line = line
    this.shown = 0
    this.render()
  }

  /** 누름: 쓰는 중이면 바로 완성, 다 썼으면 다음 줄 */
  press(): void {
    if (this.typing) {
      this.shown = [...this.line].length
      this.render()
    } else this.onAdvance()
  }

  update(dt: number): void {
    if (this.root.hidden || !this.typing) return
    const before = Math.floor(this.shown)
    this.shown = Math.min([...this.line].length, this.shown + dt * CHARS_PER_SECOND)
    if (Math.floor(this.shown) !== before) this.render()
  }

  /** 지금 보이는 글 (점검용) */
  get visibleText(): string {
    return this.text.textContent ?? ''
  }

  private render(): void {
    this.text.textContent = [...this.line].slice(0, Math.floor(this.shown)).join('')
    this.next.hidden = this.typing
  }
}

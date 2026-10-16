import './title.css'

export interface TitleOptions {
  /** 이어 할 저장이 있는가 */
  hasSave: boolean
  onContinue(): void
  onNewGame(): void
}

/**
 * 시작 화면. 게임 장면을 배경으로 제목과 단추 한두 개만 띄운다. (텍스트 최소화)
 * - 저장이 없으면: [시작]
 * - 저장이 있으면: [이어 하기] [새로 하기]. 새로 하기는 진행 상황이 지워지므로 한 번 더 눌러야 한다.
 */
export class TitleScreen {
  readonly root: HTMLElement
  private confirmTimer = 0

  constructor(parent: HTMLElement, options: TitleOptions) {
    this.root = document.createElement('div')
    this.root.className = 'title'
    this.root.innerHTML = `
      <div class="title__logo">
        <div class="title__rune" aria-hidden="true">ᛗ</div>
        <h1 class="title__name">MYTHIC<br />RELICS</h1>
        <p class="title__tag">신들이 사라진 세계</p>
      </div>
      <div class="title__menu"></div>
      <p class="title__build">PROTOTYPE</p>
    `
    const menu = this.root.querySelector<HTMLElement>('.title__menu')!
    if (options.hasSave) {
      menu.append(
        this.button('이어 하기', 'title__button--primary', () => this.close(options.onContinue)),
        this.newGameButton(options.onNewGame),
      )
    } else {
      menu.append(this.button('시작', 'title__button--primary', () => this.close(options.onContinue)))
    }
    parent.appendChild(this.root)
    requestAnimationFrame(() => this.root.classList.add('is-shown'))
  }

  /** 진행 상황을 지우는 단추라, 처음 누르면 확인 상태로 바뀌고 한 번 더 눌러야 실행한다. */
  private newGameButton(onNewGame: () => void): HTMLButtonElement {
    const button = this.button('새로 하기', 'title__button--new', () => {
      if (button.classList.contains('is-confirm')) {
        this.close(onNewGame)
        return
      }
      button.classList.add('is-confirm')
      button.textContent = '한 번 더 누르면 처음부터'
      window.clearTimeout(this.confirmTimer)
      this.confirmTimer = window.setTimeout(() => {
        button.classList.remove('is-confirm')
        button.textContent = '새로 하기'
      }, 3000)
    })
    return button
  }

  private button(label: string, modifier: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `title__button ${modifier}`
    button.textContent = label
    button.addEventListener('click', onClick)
    return button
  }

  private close(then: () => void): void {
    this.root.classList.remove('is-shown')
    this.root.classList.add('is-leaving')
    then()
    window.setTimeout(() => this.root.remove(), 600)
  }
}

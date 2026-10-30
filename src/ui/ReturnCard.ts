import './blessing.css'
import './return.css'

/** 귀환 카드의 갈래 하나 */
export interface ReturnBranch {
  id: string
  name: string
  text: string
  /** 신이나 원천의 색 */
  color: string
}

/** 귀환 카드에 보일 것 */
export interface ReturnView {
  /** 이번 원정 (1부터) */
  count: number
  gain: number
  now: number
  next: number
  /** 이번 원정 시간과 지난 기록 (분:초 글) */
  time: string
  last: string | null
  keeps: string
  clears: string
  branches: readonly ReturnBranch[]
}

/**
 * 귀환 카드 (E304, `CYCLE.md` 3.2): 받을 명성·다음 배율·원정 시간과 지난 기록·남는 것과 지워지는 것·갈래.
 * 갈래를 누르는 것이 곧 귀환이다. 「아직」을 누르면 닫힌다. 틀은 균열의 축복 고르기(`BlessingPicker`)를 빌린다
 */
export class ReturnCard {
  private readonly root = document.createElement('div')

  constructor(parent: HTMLElement) {
    this.root.className = 'blessing return-card'
    this.root.hidden = true
    parent.append(this.root)
  }

  get open(): boolean {
    return !this.root.hidden
  }

  show(view: ReturnView, pick: (id: string) => void, later: () => void): void {
    const el = (tag: string, cls: string, text = '') => {
      const e = document.createElement(tag)
      e.className = cls
      if (text) e.textContent = text
      return e
    }
    this.root.replaceChildren()
    this.root.append(el('div', 'blessing__title', `원정 ${view.count}을 마친다`))
    const mult = el('div', 'return-card__mult')
    mult.append(el('b', '', `×${view.now.toFixed(2)} → ×${view.next.toFixed(2)}`), el('small', '', `명성 +${view.gain}`))
    this.root.append(mult)
    this.root.append(el('div', 'return-card__line', `이번 원정 ${view.time}${view.last ? ` · 지난 원정 ${view.last}` : ''}`))
    this.root.append(el('div', 'return-card__line is-keep', `남는 것: ${view.keeps}`))
    this.root.append(el('div', 'return-card__line is-clear', `지워지는 것: ${view.clears}`))
    this.root.append(el('div', 'return-card__ask', '하나를 골라 돌아간다'))
    const row = el('div', 'blessing__row')
    for (const b of view.branches) {
      const card = el('button', 'blessing__card') as HTMLButtonElement
      card.type = 'button'
      card.style.setProperty('--god', b.color)
      card.append(el('b', '', b.name), el('small', '', b.text))
      card.addEventListener('click', (e) => {
        e.stopPropagation()
        this.root.hidden = true
        pick(b.id)
      })
      row.append(card)
    }
    this.root.append(row)
    const no = el('button', 'ui-btn return-card__later', '아직') as HTMLButtonElement
    no.type = 'button'
    no.addEventListener('click', (e) => {
      e.stopPropagation()
      this.root.hidden = true
      later()
    })
    this.root.append(no)
    this.root.hidden = false
  }

  hide(): void {
    this.root.hidden = true
  }
}

import './blessing.css'
import './return.css'

/** 출발 카드에 보일 맹세 하나 */
export interface OathChoice {
  id: string
  name: string
  rule: string
  reward: string
  /** 지킨 적이 있다 */
  kept: boolean
  /** 가장 빨리 지킨 기록 (분:초 글, 없으면 null) */
  best: string | null
}

export interface OathView {
  oaths: readonly OathChoice[]
}

/**
 * 출발 카드 (E305-01, `CYCLE.md` 3.4): 귀환하고 다시 떠날 때 「맹세 없음」 또는 맹세 하나를 고른다.
 * 고르는 것이 곧 출발이다. 틀은 귀환 카드와 같다
 */
export class OathCard {
  private readonly root = document.createElement('div')

  constructor(parent: HTMLElement) {
    this.root.className = 'blessing return-card oath-card'
    this.root.hidden = true
    parent.append(this.root)
  }

  get open(): boolean {
    return !this.root.hidden
  }

  show(view: OathView, pick: (id: string | null) => void): void {
    const el = (tag: string, cls: string, text = '') => {
      const e = document.createElement(tag)
      e.className = cls
      if (text) e.textContent = text
      return e
    }
    this.root.replaceChildren()
    this.root.append(el('div', 'blessing__title', '맹세를 걸고 떠난다'))
    this.root.append(el('div', 'return-card__ask', '그 원정에서 장 보스나 수호자를 이기면 지킨다'))
    const row = el('div', 'blessing__row')
    const choose = (id: string | null) => (e: Event) => {
      e.stopPropagation()
      this.root.hidden = true
      pick(id)
    }
    for (const o of view.oaths) {
      const card = el('button', `blessing__card${o.kept ? ' is-kept' : ''}`) as HTMLButtonElement
      card.type = 'button'
      card.style.setProperty('--god', 'var(--c-gilt)')
      card.append(el('b', '', o.name), el('small', '', o.rule), el('small', 'oath-card__reward', o.kept ? `지킴${o.best ? ` · ${o.best}` : ''}` : o.reward))
      card.addEventListener('click', choose(o.id))
      row.append(card)
    }
    this.root.append(row)
    const no = el('button', 'ui-btn return-card__later', '맹세 없이') as HTMLButtonElement
    no.type = 'button'
    no.addEventListener('click', choose(null))
    this.root.append(no)
    this.root.hidden = false
  }

  hide(): void {
    this.root.hidden = true
  }
}

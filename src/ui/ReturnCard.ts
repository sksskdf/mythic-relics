import './pickCard.css'
import './return.css'
import { josa } from './josa'
import { PickCardGuard } from './pickGate'

/** 귀환 카드의 갈래 하나 */
export interface ReturnBranch {
  id: string
  name: string
  text: string
  /** 신이나 원천의 색 */
  color: string
  /** 지난 귀환에서 고른 갈래 (엔딩 뒤 자동화, 맨 앞에 「지난번 그대로」) */
  again?: boolean
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
  /** 다음 원정의 깊이 (엔딩 뒤에만): 지금 깊이와 끝. 「그대로 / +1」 알약 둘, 기본은 그대로 */
  depth?: { now: number; max: number }
}

/**
 * 귀환 카드 (E304, `DESIGN.md` 5.3): 받을 명성·다음 배율·원정 시간과 지난 기록·남는 것과 지워지는 것·갈래.
 * 갈래를 누르는 것이 곧 귀환이다. 「아직」을 누르면 닫힌다. 틀은 고르는 카드(`pickCard.css`)를 쓴다.
 * 엔딩 뒤에는 갈래 위에 다음 원정의 깊이 「그대로 / +1」 (E305-03, D9). 고른 깊이는 갈래를 누를 때 함께 넘긴다.
 * 화로에 들어선 프레임에 뜨고 귀환은 되돌릴 수 없으니, 뜬 직후의 누름은 받지 않는다 (`pickGate.ts`, E307)
 */
export class ReturnCard {
  private readonly root = document.createElement('div')
  private readonly guard = new PickCardGuard(this.root)

  constructor(parent: HTMLElement) {
    this.root.className = 'pick-card return-card'
    this.root.hidden = true
    parent.append(this.root)
  }

  get open(): boolean {
    return !this.root.hidden
  }

  show(view: ReturnView, pick: (id: string, depth?: number) => void, later: () => void): void {
    const el = (tag: string, cls: string, text = '') => {
      const e = document.createElement(tag)
      e.className = cls
      if (text) e.textContent = text
      return e
    }
    this.root.replaceChildren()
    this.root.append(el('div', 'pick-card__title', `${josa(`원정 ${view.count}`, '을')} 마친다`))
    const mult = el('div', 'return-card__mult')
    mult.append(el('b', '', `×${view.now.toFixed(2)} → ×${view.next.toFixed(2)}`), el('small', '', `명성 +${view.gain}`))
    this.root.append(mult)
    this.root.append(el('div', 'return-card__line', `이번 원정 ${view.time}${view.last ? ` · 지난 원정 ${view.last}` : ''}`))
    this.root.append(el('div', 'return-card__line is-keep', `남는 것: ${view.keeps}`))
    this.root.append(el('div', 'return-card__line is-clear', `지워지는 것: ${view.clears}`))
    // 다음 원정의 깊이 (엔딩 뒤): 고른 알약이 켜진다
    let depth = view.depth?.now
    if (view.depth) {
      const { now, max } = view.depth
      const pills = el('div', 'return-card__depth')
      const choices: [number, string][] = [
        [now, `그대로 · 깊이 ${now}`],
        [now + 1, `+1 · 깊이 ${now + 1}`],
      ]
      for (const [level, label] of choices) {
        const pill = el('button', `ui-pill${level === depth ? ' is-on' : ''}`, label) as HTMLButtonElement
        pill.type = 'button'
        pill.dataset.depth = String(level)
        pill.disabled = level > max
        this.guard.on(pill, () => {
          depth = level
          for (const p of pills.children) p.classList.toggle('is-on', p === pill)
        })
        pills.append(pill)
      }
      this.root.append(pills)
    }
    this.root.append(el('div', 'return-card__ask', '하나를 골라 돌아간다'))
    const row = el('div', 'pick-card__row')
    for (const b of view.branches) {
      const card = el('button', 'pick-card__card') as HTMLButtonElement
      card.type = 'button'
      card.style.setProperty('--god', b.color)
      if (b.again) card.append(el('small', 'return-card__again', '지난번 그대로'))
      card.append(el('b', '', b.name), el('small', '', b.text))
      this.guard.on(card, () => {
        this.guard.close()
        pick(b.id, depth)
      })
      row.append(card)
    }
    this.root.append(row)
    const no = el('button', 'ui-btn return-card__later', '아직') as HTMLButtonElement
    no.type = 'button'
    this.guard.on(no, () => {
      this.guard.close()
      later()
    })
    this.root.append(no)
    this.guard.open()
  }

  hide(): void {
    this.guard.close()
  }
}

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
  /** 받을 명성과 지금·다음 배율 (엔딩 뒤에만 보인다, P6: 엔딩 전에는 고르는 것도 배율도 없이 칸 하나 더) */
  renown?: { gain: number; now: number; next: number }
  /** 도는 힘의 칸: 지금 → 귀환 뒤 (엔딩 전 귀환의 머리 보상, P6) */
  slots?: { now: number; next: number }
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
 * 귀환 카드 (E304, `DESIGN.md` 5.3): 원정 시간과 지난 기록·남는 것과 지워지는 것·갈래.
 * 엔딩 전(P6)은 고르는 것 없이 도는 힘 칸 하나 더와 단추 하나, 엔딩 뒤는 받을 명성·다음 배율과 승천·불씨 갈래.
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
    if (view.renown) {
      const mult = el('div', 'return-card__mult')
      mult.append(el('b', '', `×${view.renown.now.toFixed(2)} → ×${view.renown.next.toFixed(2)}`), el('small', '', `명성 +${view.renown.gain}`))
      this.root.append(mult)
    }
    if (view.slots) {
      const slots = el('div', 'return-card__mult')
      slots.append(
        el('b', '', view.slots.next > view.slots.now ? `도는 힘 칸 ${view.slots.now} → ${view.slots.next}` : `도는 힘 칸 ${view.slots.now}`),
        el('small', '', view.slots.next > view.slots.now ? '칸 하나 더' : '칸이 모두 열렸다'),
      )
      this.root.append(slots)
    }
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
    // 갈래가 하나뿐이면(엔딩 전) 고르는 것 없이 그 단추로 돌아간다
    this.root.append(el('div', 'return-card__ask', view.branches.length > 1 ? '하나를 골라 돌아간다' : '돌아가면 그 자리에서 다시 떠난다'))
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

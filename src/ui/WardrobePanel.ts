import { LOOK_SLOTS, lookDef, type LookSlot, SLOT_NAMES } from '../looks/catalog'
import type { LookChoice, Outfit, Wardrobe } from '../looks/outfit'
import { pixelIcon } from './pixelIcon'
import './wardrobe.css'

/** 비워 둘 수 있는 칸 (기본 모험가도 아무것도 걸치지 않는 칸) */
const OPTIONAL: ReadonlySet<LookSlot> = new Set(['face', 'waist', 'cape', 'aura'])

/** 보관함 단추의 옷걸이 그림 */
const HANGER_ICON = {
  rows: [
    '............',
    '.....aa.....',
    '....a..a....',
    '.......a....',
    '......a.....',
    '.....aa.....',
    '....abba....',
    '...abbbba...',
    '..abbbbbba..',
    '.abbbbbbbba.',
    '.aaaaaaaaaa.',
    '............',
  ],
  colors: { a: '#e9eef5', b: '#5b7fb8' },
}

export interface WardrobeHost {
  readonly wardrobe: Wardrobe
  /** 장착 상태가 정하는 모습 ("자동"일 때 입는 것) */
  readonly autoOutfit: Outfit
  choose(slot: LookSlot, choice: LookChoice): void
}

/**
 * 외형 보관함 화면. (E3-07) 오른쪽 위 옷걸이 단추로 연다.
 * 칸마다 "자동"(장착을 따름), 얻은 외형, 비우기 중에서 고른다. 모습만 바뀌고 능력은 그대로다.
 * 정보 화면이라 짧은 이름을 쓴다. 전투 화면에는 단추 하나만 남긴다.
 */
export class WardrobePanel {
  readonly button: HTMLButtonElement
  private readonly panel: HTMLElement
  private readonly list: HTMLElement

  constructor(
    parent: HTMLElement,
    private readonly host: WardrobeHost,
  ) {
    this.button = document.createElement('button')
    this.button.type = 'button'
    this.button.className = 'wardrobe-button'
    this.button.setAttribute('aria-label', '외형 보관함')
    this.button.style.backgroundImage = `url(${pixelIcon(HANGER_ICON.rows, HANGER_ICON.colors)})`
    this.button.addEventListener('click', () => this.toggle())

    this.panel = document.createElement('aside')
    this.panel.className = 'wardrobe'
    this.panel.hidden = true
    this.panel.innerHTML = `<header class="wardrobe__head"><b>외형 보관함</b><button type="button" class="wardrobe__close" aria-label="닫기">×</button></header>
      <p class="wardrobe__hint">모습만 바뀌고 능력은 그대로입니다. "자동"은 낀 유물과 발현을 따릅니다.</p>`
    this.panel.querySelector('.wardrobe__close')!.addEventListener('click', () => this.toggle(false))
    this.list = document.createElement('div')
    this.list.className = 'wardrobe__list'
    this.panel.append(this.list)
    // 보관함 위의 휠이 게임 확대·축소로 가지 않게 한다.
    this.panel.addEventListener('wheel', (e) => e.stopPropagation())
    parent.append(this.button, this.panel)
  }

  get open(): boolean {
    return !this.panel.hidden
  }

  toggle(open = !this.open): void {
    this.panel.hidden = !open
    this.button.classList.toggle('is-open', open)
    if (open) {
      this.button.classList.remove('has-new')
      this.render()
    }
  }

  /** 새 외형을 얻었다: 단추에 표시 */
  markNew(): void {
    if (!this.open) this.button.classList.add('has-new')
  }

  /** 모습이 바뀌었다: 열려 있으면 다시 그린다. */
  refresh(): void {
    if (this.open) this.render()
  }

  private render(): void {
    const { wardrobe, autoOutfit } = this.host
    this.list.replaceChildren()
    for (const slot of LOOK_SLOTS) {
      const options = wardrobe.options(slot)
      if (options.length === 0 && !OPTIONAL.has(slot)) continue
      const row = document.createElement('section')
      row.className = 'wardrobe__slot'
      const title = document.createElement('h4')
      title.textContent = SLOT_NAMES[slot]
      row.append(title)
      const chips = document.createElement('div')
      chips.className = 'wardrobe__chips'
      const current = wardrobe.choice(slot)
      const auto = autoOutfit[slot]
      const add = (label: string, choice: LookChoice, extra = '') => {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = `wardrobe__chip${extra}`
        chip.textContent = label
        chip.classList.toggle('is-on', current === choice)
        chip.addEventListener('click', () => {
          this.host.choose(slot, choice)
          this.render()
        })
        chips.append(chip)
      }
      add(`자동 · ${auto ? lookDef(auto).name : '없음'}`, 'auto', ' wardrobe__chip--auto')
      for (const id of options) add(lookDef(id).name, id)
      if (OPTIONAL.has(slot)) add('비우기', null)
      row.append(chips)
      this.list.append(row)
    }
  }
}

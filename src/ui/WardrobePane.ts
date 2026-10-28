import { touchUi } from '../input/device'
import { lookDef, type LookSlot, SLOT_NAMES } from '../looks/catalog'
import type { LookChoice, Outfit, Wardrobe } from '../looks/outfit'
import { HeroPreview } from './HeroPreview'
import { glyph } from './sigils'

/** 비워 둘 수 있는 칸 (기본 모험가도 아무것도 걸치지 않는 칸) */
const OPTIONAL: ReadonlySet<LookSlot> = new Set(['face', 'waist', 'cape'])

/** 미리 보기 둘레의 칸 배치: 왼쪽은 위에서부터 머리·얼굴·몸·허리, 오른쪽은 팔·다리·무기·망토, 기운은 아래 */
const LEFT: readonly LookSlot[] = ['head', 'face', 'torso', 'waist']
const RIGHT: readonly LookSlot[] = ['arms', 'legs', 'weapon', 'cape']

export interface WardrobeHost {
  readonly wardrobe: Wardrobe
  /** 장착 상태가 정하는 모습 ("자동"일 때 입는 것) */
  readonly autoOutfit: Outfit
  choose(slot: LookSlot, choice: LookChoice): void
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/**
 * 외형 보관함. (E3-07) 정보 화면의 "외형" 탭.
 * 가운데에 지금 모습을 돌려 보여 주고, 몸 둘레에 부위별 칸을 둔다. 칸을 누르면 아래에 고를 수 있는 외형이 나오고,
 * 외형에 커서를 올리면 입혀 본 모습을 미리 보여 준다. 모습만 바뀌고 능력은 그대로다.
 */
export class WardrobePane {
  private readonly preview = new HeroPreview()
  private selected: LookSlot = 'head'

  constructor(
    private readonly host: WardrobeHost,
    /** 올리거나 누르면 힌트를 띄운다 (정보 화면의 말풍선) */
    private readonly hintOn: (target: HTMLElement, text: string) => void,
  ) {}

  /** 지금 입은 모습 (보관함 선택까지 적용) */
  private get dressed(): Outfit {
    return this.host.wardrobe.dress(this.host.autoOutfit)
  }

  render(container: HTMLElement): void {
    container.replaceChildren()
    const pane = el('div', 'wardrobe')
    const dressed = this.dressed
    this.preview.wear(dressed)

    const doll = el('div', 'wardrobe__doll')
    const column = (slots: readonly LookSlot[], side: string) => {
      const col = el('div', `wardrobe__col wardrobe__col--${side}`)
      for (const slot of slots) col.append(this.slotBox(slot, dressed, container))
      return col
    }
    const stage = el('div', 'wardrobe__stage')
    stage.append(this.preview.canvas)
    stage.append(this.slotBox('mark', dressed, container))
    doll.append(column(LEFT, 'left'), stage, column(RIGHT, 'right'))
    pane.append(doll)

    // 고른 칸의 외형들. 표식은 발현한 신을 따르므로 고를 것이 없다.
    const { wardrobe, autoOutfit } = this.host
    const options = el('section', 'wardrobe__options')
    const chips = el('div', 'wardrobe__chips')
    const current = wardrobe.choice(this.selected)
    const auto = autoOutfit[this.selected]
    const add = (label: string | null, choice: LookChoice, icon?: 'auto' | 'none', hint?: string) => {
      const chip = el('button', 'ui-pill wardrobe__chip')
      chip.type = 'button'
      if (icon) {
        const i = el('img', '')
        i.src = glyph(icon)
        i.alt = ''
        chip.append(i)
      }
      if (label) chip.append(label)
      chip.classList.toggle('is-on', current === choice)
      // 커서를 올리면 입혀 본다.
      chip.addEventListener('pointerenter', () => this.preview.wear({ ...dressed, [this.selected]: choice === 'auto' ? auto : choice }))
      chip.addEventListener('pointerleave', () => this.preview.wear(this.dressed))
      chip.addEventListener('click', () => {
        this.host.choose(this.selected, choice)
        this.render(container)
      })
      if (hint) this.hintOn(chip, hint)
      chips.append(chip)
    }
    if (this.selected !== 'mark') {
      add(auto ? lookDef(auto).name : null, 'auto', 'auto', '장착을 따른다')
      for (const id of wardrobe.options(this.selected)) if (id !== auto || current !== 'auto') add(lookDef(id).name, id)
      if (OPTIONAL.has(this.selected)) add(null, null, 'none', '비우기')
    }
    options.append(
      el('div', 'wardrobe__options-label', this.selected === 'mark' ? '표식은 지금 신화가 정한다' : `${SLOT_NAMES[this.selected]}: ${touchUi() ? '누르면 입혀 보고 고른다' : '커서를 올리면 입혀 보고, 누르면 고른다'}`),
      chips,
    )
    pane.append(options)
    container.append(pane)
    this.preview.start()
  }

  /** 부위 칸: 부위 이름(작게)과 지금 입은 외형. 직접 고른 칸은 금빛 점, 표식은 자물쇠 */
  private slotBox(slot: LookSlot, dressed: Outfit, container: HTMLElement): HTMLElement {
    const choice = this.host.wardrobe.choice(slot)
    const id = dressed[slot]
    const mark = slot === 'mark'
    const box = el('button', `wardrobe__slot${slot === this.selected ? ' is-selected' : ''}${choice !== 'auto' ? ' is-fixed' : ''}${mark ? ' is-mark' : ''}`)
    box.type = 'button'
    box.append(el('span', 'wardrobe__slot-name', SLOT_NAMES[slot]))
    box.append(el('span', 'wardrobe__slot-look', id ? lookDef(id).name : '—'))
    if (mark) {
      const lock = el('img', 'wardrobe__lock')
      lock.src = glyph('lock', '#8d98a6', '#222a36')
      lock.alt = ''
      box.append(lock)
      this.hintOn(box, id ? '지금 신화의 표식' : '신화가 열리면 새겨진다')
    }
    box.addEventListener('click', () => {
      this.selected = slot
      this.render(container)
    })
    return box
  }
}

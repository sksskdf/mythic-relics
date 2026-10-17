import { LOOK_SLOTS, lookDef, type LookSlot, SLOT_NAMES } from '../looks/catalog'
import type { LookChoice, Outfit, Wardrobe } from '../looks/outfit'

/** 비워 둘 수 있는 칸 (기본 모험가도 아무것도 걸치지 않는 칸) */
const OPTIONAL: ReadonlySet<LookSlot> = new Set(['face', 'waist', 'cape', 'aura'])

export interface WardrobeHost {
  readonly wardrobe: Wardrobe
  /** 장착 상태가 정하는 모습 ("자동"일 때 입는 것) */
  readonly autoOutfit: Outfit
  choose(slot: LookSlot, choice: LookChoice): void
}

/**
 * 외형 보관함. (E3-07) 정보 화면의 "외형" 탭에 그린다.
 * 칸마다 "자동"(장착을 따름), 얻은 외형, 비우기 중에서 고른다. 모습만 바뀌고 능력은 그대로다.
 */
export class WardrobePane {
  constructor(private readonly host: WardrobeHost) {}

  render(container: HTMLElement): void {
    const { wardrobe, autoOutfit } = this.host
    const pane = document.createElement('div')
    pane.className = 'wardrobe'
    const hint = document.createElement('p')
    hint.className = 'menu__muted'
    hint.textContent = '모습만 바뀌고 능력은 그대로입니다. "자동"은 낀 유물과 발현을 따릅니다.'
    pane.append(hint)
    for (const slot of LOOK_SLOTS) {
      const options = wardrobe.options(slot)
      if (options.length === 0 && !OPTIONAL.has(slot)) continue
      const row = document.createElement('section')
      row.className = 'wardrobe__slot'
      const title = document.createElement('h4')
      title.className = 'menu__label'
      title.textContent = SLOT_NAMES[slot]
      row.append(title)
      const chips = document.createElement('div')
      chips.className = 'wardrobe__chips'
      const current = wardrobe.choice(slot)
      const auto = autoOutfit[slot]
      const add = (label: string, choice: LookChoice, extra = '') => {
        const chip = document.createElement('button')
        chip.type = 'button'
        chip.className = `menu__chip${extra}`
        chip.textContent = label
        chip.classList.toggle('is-on', current === choice)
        chip.addEventListener('click', () => {
          this.host.choose(slot, choice)
          container.replaceChildren()
          this.render(container)
        })
        chips.append(chip)
      }
      add(`자동 · ${auto ? lookDef(auto).name : '없음'}`, 'auto', ' menu__chip--auto')
      for (const id of options) add(lookDef(id).name, id)
      if (OPTIONAL.has(slot)) add('비우기', null)
      row.append(chips)
      pane.append(row)
    }
    container.append(pane)
  }
}

import { GRADE_COLORS } from '../../art/palette'
import { SLOT_PARTS } from '../../data/gearData'
import { BAG_SIZE } from '../../gear/Loadout'
import type { SourceId } from '../../data/schema'
import { materialName } from '../../gear/materials'
import { nextGrade, PROTOTYPE_VALUE } from '../../gear/merge'
import { GEAR, gearName } from '../../gear/roll'
import { godDef, isRelicId, relicDef } from '../../relics/data'
import { classIcon } from '../classIcons'
import { gearCard, gearIcon } from '../gearCard'
import { josa } from '../josa'
import { relicCard, relicIcon } from '../relicCard'
import { glyph, unknownSigil } from '../sigils'
import { el, img, type TabContext } from './dom'

/** 장비 탭 (E13): 지금 신화, 칸 7과 가방, 고른 칸·커서를 올린 것의 설명 카드, 대장간, 재료 */
export class RelicsTab {
  /** 고른 칸 */
  selectedSlot = 0
  /** 커서를 올린 가방 장비 */
  hovered: string | null = null
  /** 휴대폰에서 한 번 누른 가방 유물: 한 번 더 누르면 낀다 (E235) */
  private picked: string | null = null

  constructor(private readonly ctx: TabContext) {}

  render(body: HTMLElement): void {
    const { host } = this.ctx
    // 창을 다시 열거나 탭을 옮기면 한 번 누른 것은 잊는다 (한 번만 눌러 끼지 않게)
    this.picked = null
    const layout = el('div', 'menu-relics')
    const left = el('div', 'menu-relics__left')
    const detail = el('div', 'menu-relics__detail')

    // 지금 상태: 고른 신화는 크게, 잠든 유물(다른 신화의 것)은 작게. 신의 색 문장으로만 보여 준다.
    const state = el('div', 'menu-relics__state')
    const { manifested, blessings } = host.loadout
    if (manifested) {
      const god = godDef(manifested)
      const badge = el('span', 'menu-relics__manifest', god.title)
      badge.style.setProperty('--god', god.color)
      badge.prepend(img(classIcon(god.name)))
      this.ctx.hintOn(badge, `${god.name}의 신화 개방`)
      state.append(badge)
    }
    for (const g of blessings) {
      const god = godDef(g)
      const chip = el('span', 'menu-relics__blessing')
      chip.style.setProperty('--god', god.color)
      chip.append(img(classIcon(god.name)))
      this.ctx.hintOn(chip, `${god.name}의 유물\n그 신이 자리에 있으면 유물의 힘이 깨어난다.`)
      state.append(chip)
    }
    left.append(state)

    // 장비 칸 7개 (E13): 무기·머리·몸·손·발·장신구 둘. 유물도 자기 부위 칸을 차지한다
    const slots = el('div', 'menu-relics__slots')
    host.slots.forEach((id, i) => {
      const b = el('button', `menu-relics__slot${i === this.selectedSlot ? ' is-selected' : ''}`)
      b.type = 'button'
      const part = GEAR.parts[SLOT_PARTS[i]!].name
      b.dataset.n = part
      this.paintItem(b, id)
      b.setAttribute('aria-label', id ? this.itemName(id) : `빈 ${part} 칸`)
      b.addEventListener('click', () => {
        this.selectedSlot = i
        this.hovered = null
        this.ctx.render()
      })
      slots.append(b)
    })
    left.append(slots)

    // 고른 칸: 가방에 넣기, 발밑에 내려놓기 (그림 단추)
    const selected = host.slots[this.selectedSlot] ?? null
    const actions = el('div', 'menu-relics__actions')
    const action = (name: 'bag' | 'drop', label: string, run: () => void) => {
      const b = el('button', 'ui-btn menu-relics__action')
      b.type = 'button'
      b.setAttribute('aria-label', label)
      // 가방이 찼으면 가방에 넣지 못한다 (E303: 12칸)
      b.disabled = !selected || (name === 'bag' && host.bag.length >= BAG_SIZE)
      b.append(img(glyph(name)))
      b.addEventListener('click', run)
      this.ctx.hintOn(b, label)
      actions.append(b)
    }
    action('bag', '가방에 넣기', () => host.stow(this.selectedSlot))
    action('drop', '발밑에 내려놓기', () => host.drop(this.selectedSlot))
    left.append(actions)

    // 가방: 누르면 그 부위 칸에 낀다 (고른 칸이 맞는 부위면 그 칸, 아니면 비어 있는 칸부터)
    const bag = el('div', 'menu-relics__bag')
    bag.style.backgroundImage = `url(${glyph('bag', '#222a36', '#141a24')})`
    // 합칠 수 있는 셋 (E303): 그 칸이 빛난다
    const mergeable = new Set(host.mergeable().flat())
    for (const id of host.bag) {
      const b = el('button', `menu-relics__item${mergeable.has(id) ? ' is-mergeable' : ''}`)
      b.type = 'button'
      this.paintItem(b, id)
      b.setAttribute('aria-label', this.itemName(id))
      b.addEventListener('pointerenter', () => {
        this.hovered = id
        this.renderDetail(detail)
      })
      let finger = false
      b.addEventListener('pointerdown', (e) => (finger = e.pointerType === 'touch'))
      b.addEventListener('click', () => {
        // 손가락에는 커서가 없다: 처음 누르면 설명 카드만 보이고, 같은 것을 한 번 더 누르면 낀다 (E235). 마우스는 한 번에 낀다
        if (finger && this.picked !== id) {
          this.picked = id
          this.hovered = id
          this.renderDetail(detail)
          return
        }
        this.picked = null
        this.hovered = null
        const slot = this.wieldSlot(id)
        if (slot === undefined) return
        this.selectedSlot = slot
        host.wield(id, slot)
      })
      bag.append(b)
    }
    left.append(bag)

    // 대장간 (E13-05): 마을에서만 벼린다
    left.append(this.forgePanel())

    // 재료 (E13-03: 재료가 된 유물, E13-04 재료)
    if (host.materials.size > 0) {
      const mats = el('div', 'menu-relics__materials')
      mats.append(el('b', '', '재료'))
      for (const [id, n] of host.materials) mats.append(el('span', '', `${materialName(id)} ×${n}`))
      left.append(mats)
    }

    layout.append(left, detail)
    body.append(layout)
    this.renderDetail(detail)
  }

  /** 오른쪽: 고른 칸이나 커서를 올린 가방 유물의 설명 카드 (바꿔 끼면 어떻게 되는지 포함) */
  private renderDetail(detail: HTMLElement): void {
    const { host } = this.ctx
    detail.replaceChildren()
    const id = this.hovered ?? host.slots[this.selectedSlot] ?? null
    if (!id) {
      detail.append(img(unknownSigil('#2a3240'), 'menu-relics__empty'))
      return
    }
    const gear = host.gearOf(id)
    if (gear) {
      // 같은 부위에 지금 낀 일반 장비와 비교한다
      const wornId = host.slotsFor(id).map((i) => host.slots[i]).find((x) => x && x !== id && host.gearOf(x))
      const totals = Object.fromEntries(host.sources.rows().map((r) => [r.id, r.total])) as Record<SourceId, number>
      detail.append(gearCard(gear, wornId ? host.gearOf(wornId) : null, totals))
      const group = host.mergeable().find((g) => g.includes(id))
      if (group) detail.append(this.mergeBox(group))
      const b = el('button', 'menu-relics__salvage')
      b.type = 'button'
      b.append(img(glyph('salvage')), '녹이기')
      this.ctx.hintOn(b, `녹이면 원형 ${PROTOTYPE_VALUE[gear.grade]}개가 된다 (등급이 하나 오를 때마다 셋 배)`)
      b.addEventListener('click', () => {
        this.hovered = null
        host.melt(id)
      })
      detail.append(b)
      return
    }
    if (isRelicId(id)) detail.append(relicCard(relicDef(id), host.cardContext(id)))
  }

  /** 합치기 상자 (E303): 셋의 그림 → 결과 등급, 「합치기」 단추 */
  private mergeBox(group: readonly string[]): HTMLElement {
    const { host } = this.ctx
    const items = group.map((id) => host.gearOf(id)!).filter(Boolean)
    const next = nextGrade(items[0]!.grade)!
    const box = el('section', 'menu-merge')
    box.style.setProperty('--god', GRADE_COLORS[next])
    const row = el('div', 'menu-merge__row')
    for (const item of items) {
      const icon = el('span', 'menu-merge__icon')
      icon.style.backgroundImage = `url(${gearIcon(item)})`
      icon.style.setProperty('--god', GRADE_COLORS[item.grade])
      row.append(icon)
    }
    row.append(el('b', 'menu-merge__arrow', `→ ${GEAR.grades[next].name}`))
    box.append(row)
    const note = next === 'hero' ? '고유 효과 하나가 붙는다' : next === 'legend' ? '고유 효과 둘 (하나는 물려받음)' : '가장 좋은 수치 하나를 이어받는다'
    box.append(el('small', '', note))
    const b = el('button', 'ui-btn menu-merge__go', '합치기')
    b.type = 'button'
    b.addEventListener('click', () => {
      this.hovered = null
      host.merge(group)
    })
    box.append(b)
    return box
  }

  /** 가방의 것을 누르면 낄 칸: 고른 칸이 맞는 부위면 그 칸, 아니면 비어 있는 맞는 칸부터 */
  private wieldSlot(id: string): number | undefined {
    const fits = this.ctx.host.slotsFor(id)
    return fits.includes(this.selectedSlot) ? this.selectedSlot : (fits.find((i) => this.ctx.host.slots[i] === null) ?? fits[0])
  }

  /** 대장간 칸: 신화마다 다음 제작과 모자란 재료, 「벼리기」 단추 (마을에서만 켜짐) */
  private forgePanel(): HTMLElement {
    const { forge } = this.ctx.host
    const box = el('section', 'menu-forge')
    const here = forge.here()
    box.append(el('b', '', '대장간'), el('small', '', here ? '장 보스의 재료와 신화권 재료로 신화의 유물을 벼린다' : '마을 대장장이에게 가면 벼릴 수 있다'))
    const gods = forge.gods()
    if (gods.length === 0) box.append(el('p', 'menu-forge__empty', '신화를 열거나 재료를 모으면 여기에 제작법이 보인다'))
    for (const god of gods) {
      const next = forge.next(god)
      const def = godDef(god)
      const row = el('div', 'menu-forge__row')
      row.style.setProperty('--god', def.color)
      if (!next) {
        row.append(el('span', 'menu-forge__name', `${def.name} · 4단계 완성`))
        box.append(row)
        continue
      }
      const ready = next.materials.every((m) => m.have >= m.need)
      row.append(el('span', 'menu-forge__name', next.stage === 1 ? `${next.name} 만들기` : `${josa(next.name, '으로')} 올리기`))
      const needs = el('span', 'menu-forge__needs')
      for (const m of next.materials) needs.append(el('span', m.have >= m.need ? 'is-ok' : 'is-short', `${m.name} ${Math.min(m.have, m.need)}/${m.need}`))
      row.append(needs)
      const b = el('button', 'menu-forge__make', '벼리기')
      b.type = 'button'
      b.disabled = !here || !ready
      if (here && ready) b.addEventListener('click', () => forge.make(god) && this.ctx.render())
      row.append(b)
      box.append(row)
    }
    return box
  }

  /** 칸·가방 단추에 그림: 유물은 유물 그림과 신의 색, 일반 장비는 장비 그림과 등급 색 */
  private paintItem(b: HTMLElement, id: string | null): void {
    if (!id) return
    b.classList.add('is-filled')
    const gear = this.ctx.host.gearOf(id)
    if (gear) {
      b.classList.add('is-gear')
      b.style.setProperty('--god', GRADE_COLORS[gear.grade])
      b.dataset.grade = gear.grade
      b.style.backgroundImage = `url(${gearIcon(gear)})`
      return
    }
    b.style.backgroundImage = `url(${relicIcon(relicDef(id))})`
    b.style.setProperty('--god', godDef(relicDef(id).god).color)
  }

  private itemName(id: string): string {
    const gear = this.ctx.host.gearOf(id)
    return gear ? gearName(gear) : relicDef(id).name
  }
}

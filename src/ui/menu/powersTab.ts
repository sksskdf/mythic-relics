import { REALM_NAMES } from '../../data/classKit'
import { power, type PowerId } from '../../data/powers'
import { type God, godDef } from '../../relics/data'
import { classIcon } from '../classIcons'
import { WardrobePane } from '../WardrobePane'
import { el, img, type TabContext } from './dom'
import { combosLitBy, combosOf, comboRows, type ComboView, KIND_LABELS, LOCKED_LINE, ownedGroups, type PowerTabState, slotCells, slotMove } from './powersView'

/** 힘 탭 안의 두 보기: 힘(칸·가진 힘·조합)과 외형 */
export type PowersView = 'slots' | 'looks'

/**
 * 신의 이름 곁의 작은 글: 「북유럽의 신」. 신화권이 없는 숨겨진 신화(아수라왕, realm `hidden`)는 「숨겨진 신」:
 * 그 묶음의 이름 「히든」은 개발 패널에서만 쓴다
 */
export function godCaption(god: God): string {
  const { realm } = godDef(god)
  return realm === 'hidden' ? '숨겨진 신' : `${REALM_NAMES[realm]}의 신`
}

/** 빈 칸의 설명 */
const EMPTY_HINT = '아래 가진 힘을 눌러 끼운다'

/**
 * 힘 탭 (재미 재설계 P7, 옛 신 탭: 탭 id는 옛 저장 그대로 `gods`). 「힘 · 외형」 알약 둘로 나눈다.
 * 힘: 맨 위에 칸(무기 1 · 궁극기 1 · 도는 힘 N, 잠긴 칸 하나), 그 아래 가진 힘(종류별, 신 이름 작게, 끼운 것 표시),
 * 맨 아래 조합(켜진 것, 하나만 더 끼우면 켜지는 것과 남은 재료). 칸이나 가진 힘을 누르면 그 줄 바로 아래에 그 힘의 설명 카드가 펴지고,
 * 카드의 단추로 끼우고 빼고 바꾼다 (바꾸면 곧바로 전투에 맞춘다: 게임 쪽 `RelicSystem.syncPowers`). 규칙은 `powersView.ts`.
 * 외형은 `WardrobePane`을 따로 둔 칸에 그린다
 */
export class PowersTab {
  /** 눌러 본 힘 (없으면 카드 없음)과 누른 곳: 카드는 그 자리 바로 아래에 편다 (휴대폰에서 아래로 밀지 않아도 보이게) */
  selected: PowerId | null = null
  private from: 'slots' | 'list' = 'list'
  /** 보고 있는 쪽 */
  view: PowersView = 'slots'
  /** 새 외형을 얻었다: 「외형」 알약에 표시 (외형을 보면 지운다) */
  looksNew = false
  private readonly wardrobe: WardrobePane

  constructor(private readonly ctx: TabContext) {
    this.wardrobe = new WardrobePane(ctx.host.wardrobe, (target, text) => ctx.hintOn(target, text))
  }

  private get state(): PowerTabState {
    return this.ctx.host.powers.state()
  }

  /** 그 힘을 눌렀다: 같은 힘이면 카드를 접고, 아니면 그 자리 아래에 편다 */
  private select(id: PowerId, from: 'slots' | 'list'): void {
    if (this.selected === id && this.from === from) this.selected = null
    else {
      this.selected = id
      this.from = from
    }
    this.ctx.render()
    // 펴진 카드가 화면 아래에 걸리면 보이게 밀어 준다 (2026-11-22 손 QA, 393×659: 카드의 단추가 화면 밖에 있었다)
    if (this.selected) this.card?.scrollIntoView?.({ block: 'nearest' })
  }

  /** 마지막으로 그린 설명 카드 */
  private card: HTMLElement | null = null

  /** 맨 위 칸 줄 */
  private slotRow(): HTMLElement {
    const row = el('section', 'menu-powers__slots')
    for (const cell of slotCells(this.state)) {
      const label = KIND_LABELS[cell.kind]
      if (cell.locked) {
        const box = el('div', 'menu-powers__slot is-locked')
        box.append(el('small', '', label), el('span', '', LOCKED_LINE))
        this.ctx.hintOn(box, `잠긴 칸\n${LOCKED_LINE}`)
        row.append(box)
        continue
      }
      const p = cell.id ? power(cell.id) : undefined
      if (!p) {
        const box = el('div', 'menu-powers__slot is-empty')
        box.append(el('small', '', label), el('span', '', cell.kind === 'weapon' ? '맨손' : '빈 칸'))
        this.ctx.hintOn(box, `${label} 칸\n${EMPTY_HINT}`)
        row.append(box)
        continue
      }
      const def = godDef(p.god)
      const b = el('button', `menu-powers__slot${this.selected === p.id && this.from === 'slots' ? ' is-selected' : ''}`)
      b.type = 'button'
      b.dataset.power = p.id
      b.style.setProperty('--god', def.color)
      b.append(el('small', '', label), el('b', '', p.name))
      b.addEventListener('click', () => this.select(p.id, 'slots'))
      row.append(b)
    }
    return row
  }

  /** 가진 힘 목록 (종류별). 눌러 본 힘이 이 목록에 있으면 그 힘 바로 아랫줄에 카드 */
  private ownedList(): HTMLElement[] {
    const out: HTMLElement[] = []
    const groups = ownedGroups(this.state)
    if (groups.length === 0) {
      const empty = el('section', 'menu-powers__group')
      empty.append(el('p', 'menu-powers__empty', '신의 흔적에 서면 그 신이 힘 셋을 내민다. 고른 힘은 영구히 내 것이다'))
      return [empty]
    }
    for (const g of groups) {
      const box = el('section', 'menu-powers__group')
      box.append(el('div', 'menu-powers__head', `${g.label} · ${g.items.length}`))
      const list = el('div', 'menu-powers__list')
      for (const item of g.items) {
        const p = power(item.id)!
        const def = godDef(p.god)
        const b = el('button', `menu-powers__item${item.slotted ? ' is-slotted' : ''}${this.selected === item.id && this.from === 'list' ? ' is-selected' : ''}`)
        b.type = 'button'
        b.dataset.power = item.id
        b.style.setProperty('--god', def.color)
        const words = el('span', 'menu-powers__words')
        words.append(el('b', '', p.name), el('small', '', def.name))
        b.append(words)
        if (item.slotted) b.append(el('span', 'ui-tag ui-tag--solid menu-powers__tag', '끼움'))
        b.addEventListener('click', () => this.select(item.id, 'list'))
        list.append(b)
        // 눌러 본 힘의 카드는 그 힘 바로 다음 줄에 편다 (한 줄을 다 쓰고, 옆 칸은 `grid-auto-flow: dense`가 앞줄에 채운다)
        if (this.from === 'list' && this.selected === item.id) list.append(this.powerCard(item.id))
      }
      box.append(list)
      out.push(box)
    }
    return out
  }

  /** 끼우기·빼기·바꾸기를 하고 다시 그린다. 실패하면 그대로 */
  private act(run: () => boolean): void {
    if (run()) this.ctx.render()
  }

  /** 카드의 행동 단추 */
  private button(label: string, run: () => boolean, extra = ''): HTMLButtonElement {
    const b = el('button', `menu-power__act${extra}`, label)
    b.type = 'button'
    b.addEventListener('click', () => this.act(run))
    return b
  }

  /** 힘 하나의 설명 카드: 이름·종류·신, 한 줄, 켜질 조합, 끼우기·빼기·바꾸기 */
  private powerCard(id: PowerId): HTMLElement {
    const host = this.ctx.host.powers
    const state = this.state
    const p = power(id)!
    const def = godDef(p.god)
    const card = el('section', 'menu-power')
    this.card = card
    card.style.setProperty('--god', def.color)
    const head = el('div', 'menu-power__head')
    head.append(img(classIcon(def.name), 'menu-power__emblem'))
    const name = el('div', 'menu-power__name')
    name.append(el('b', '', p.name), el('small', '', `${KIND_LABELS[p.kind]} · ${def.name} · ${godCaption(p.god)}${host.awake(p.god) ? ' · 깨어난 신' : ''}`))
    head.append(name)
    card.append(head, el('p', 'menu-power__line', p.line))

    // 켜질 조합: 이 힘이 재료인 것마다 함께 끼울 재료와 그 재료를 가졌는지
    for (const combo of combosOf(id)) {
      const other = combo.needs.find((n) => n !== id)!
      const o = power(other)!
      const lit = comboRows(state).lit.some((c) => c.id === combo.id)
      const have = state.owned.includes(other)
      const box = el('div', `menu-power__combo${lit ? ' is-lit' : ''}`)
      box.append(el('b', '', `조합 · ${combo.name}${lit ? ' · 켜짐' : ''}`), el('small', '', combo.line))
      box.append(el('small', 'menu-power__with', `함께: ${o.name} (${godDef(o.god).name}) · ${have ? (lit ? '끼움' : '가졌다') : '아직 없다'}`))
      card.append(box)
    }

    const move = slotMove(state, id)
    const dos = el('div', 'menu-power__dos')
    if (move) {
      const lights = (out: PowerId | null) => combosLitBy(state, id, out).map((c) => c.name)
      const note = (text: string) => dos.append(el('p', 'menu-power__note', text))
      if (move.kind === 'slot') {
        const on = lights(null)
        dos.append(this.button('끼우기', () => host.slot(id)))
        if (on.length) note(`끼우면 켜진다: ${on.join(' · ')}`)
      } else if (move.kind === 'replace') {
        dos.append(this.button('끼우기', () => host.slot(id)))
        note(`${KIND_LABELS[p.kind]} 칸: ${power(move.out)?.name ?? ''} → ${p.name}`)
      } else if (move.kind === 'choose') {
        note('도는 힘 칸이 다 찼다 · 바꿀 칸을 누른다')
        for (const out of move.choices) {
          const o = power(out)!
          const on = lights(out)
          const b = this.button(`${o.name} 대신${on.length ? ` · ${on.join(' · ')} 켜짐` : ''}`, () => host.swap(out, id), ' is-swap')
          b.style.setProperty('--god', godDef(o.god).color)
          dos.append(b)
        }
      } else if (move.kind === 'unslot') {
        dos.append(this.button('빼기', () => host.unslot(id)))
        const off = comboRows(state).lit.filter((c) => c.parts.some((x) => x.id === id)).map((c) => c.name)
        if (off.length) note(`빼면 꺼진다: ${off.join(' · ')}`)
      } else note(`끼워져 있다 · 다른 ${KIND_LABELS[p.kind]}를 끼우면 바뀐다`)
    }
    card.append(dos)
    return card
  }

  /** 조합 줄: 켜진 것, 하나만 더 끼우면 켜지는 것과 그 남은 재료 */
  private comboBox(): HTMLElement {
    const { lit, near } = comboRows(this.state)
    const box = el('section', 'menu-powers__combos')
    box.append(el('div', 'menu-powers__head', '조합'))
    const row = (c: ComboView, on: boolean) => {
      const line = el('div', `menu-powers__combo${on ? ' is-lit' : ''}`)
      line.append(el('b', '', `${c.name}${on ? ' · 켜짐' : ''}`), el('small', '', c.line))
      const parts = el('div', 'menu-powers__parts')
      for (const part of c.parts) {
        const chip = el('span', `menu-powers__part${part.slotted ? ' is-slotted' : part.have ? ' is-have' : ''}`, `${part.name} · ${part.slotted ? '끼움' : part.have ? '가졌다' : `${part.god}의 흔적·빛에서`}`)
        chip.style.setProperty('--god', part.color)
        parts.append(chip)
      }
      line.append(parts)
      box.append(line)
    }
    for (const c of lit) row(c, true)
    for (const c of near) row(c, false)
    if (lit.length === 0 && near.length === 0) box.append(el('p', 'menu-powers__empty', '정해진 두 힘이 함께 칸에 있으면 조합이 켜진다'))
    return box
  }

  /** 「힘 · 외형」 알약 */
  private views(): HTMLElement {
    const row = el('div', 'menu-gods__views')
    for (const [id, label] of [['slots', '힘'], ['looks', '외형']] as const) {
      const pill = el('button', `ui-pill${this.view === id ? ' is-on' : ''}${id === 'looks' && this.looksNew ? ' is-new' : ''}`, label)
      pill.type = 'button'
      pill.addEventListener('click', () => {
        this.view = id
        this.ctx.render()
      })
      row.append(pill)
    }
    return row
  }

  render(body: HTMLElement): void {
    const wrap = el('div', 'menu-powers')
    if (this.view === 'looks') this.looksNew = false
    wrap.append(this.views())
    if (this.view === 'looks') {
      const pane = el('div', 'menu-gods__looks')
      wrap.append(pane)
      body.append(wrap)
      this.wardrobe.render(pane)
      return
    }
    // 가진 힘이 아니게 된 것(개발 지름길로 지움)은 카드를 접는다
    if (this.selected && !this.state.owned.includes(this.selected)) this.selected = null
    // 칸에서 눌러 본 힘을 뺐으면 카드는 가진 힘 목록 쪽으로 옮긴다
    if (this.selected && this.from === 'slots' && !slotCells(this.state).some((c) => c.id === this.selected)) this.from = 'list'
    wrap.append(this.slotRow())
    if (this.selected && this.from === 'slots') wrap.append(this.powerCard(this.selected))
    wrap.append(...this.ownedList(), this.comboBox())
    body.append(wrap)
  }
}

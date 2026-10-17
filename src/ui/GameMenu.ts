import { DATA } from '../data'
import type { TreeClass } from '../data/schema'
import { MAX_LEVEL } from '../progress/ClassProgress'
import type { ClassProgress } from '../progress/ClassProgress'
import { godDef, relicDef, type RelicId } from '../relics/data'
import type { LoadoutState } from '../relics/Loadout'
import { josa } from './josa'
import { pixelIcon } from './pixelIcon'
import { relicCard, relicIcon } from './relicCard'
import { type WardrobeHost, WardrobePane } from './WardrobePane'
import './menu.css'

export type MenuTab = 'relics' | 'classes' | 'looks'

const TABS: readonly [MenuTab, string][] = [
  ['relics', '유물'],
  ['classes', '클래스'],
  ['looks', '외형'],
]

/** 메뉴 단추 그림: 펼친 책 */
const BOOK_ICON = {
  rows: [
    '............',
    '............',
    '.aaaa..aaaa.',
    '.abbba.abbb.',
    '.abbbbabbbb.',
    '.abbbbabbbb.',
    '.abbbbabbbb.',
    '.abbbbabbbb.',
    '.abbbbabbbb.',
    '.aaaaaaaaaa.',
    '.....aa.....',
    '............',
  ],
  colors: { a: '#e9eef5', b: '#5b7fb8' },
}

/** 메뉴가 게임에서 읽고 부르는 것 */
export interface MenuHost {
  readonly slots: readonly (RelicId | null)[]
  readonly bag: readonly RelicId[]
  readonly loadout: LoadoutState
  /** slot에 id를 끼우면(null이면 비우면) 어떻게 되는지 */
  preview(slot: number, id: RelicId | null): LoadoutState
  wield(id: RelicId, slot: number): void
  stow(slot: number): void
  drop(slot: number): void
  readonly progress: ClassProgress
  readonly wardrobe: WardrobeHost
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/** 발현·가호 상태를 한 줄로 */
function stateText(state: LoadoutState): string {
  const manifest = state.manifested ? `발현 ${godDef(state.manifested).title}` : '발현 없음'
  const blessings = state.blessings.map((g) => godDef(g).name)
  return blessings.length > 0 ? `${manifest} · 가호 ${blessings.join(', ')}` : manifest
}

/**
 * 정보 화면. (E4) HUD 오른쪽 위 책 단추로 연다. 열려 있는 동안 게임은 멈춘다.
 * - 유물: 장착 칸 4개와 가방, 눌러서 바꿔 끼기, 바꾸면 발현·가호가 어떻게 되는지 미리 보기
 * - 클래스: 지금 클래스의 레벨·경험치·다음 승급 조건, 원형 친화도, 클래스 트리
 * - 외형: 외형 보관함
 * 정보 화면이라 짧은 설명을 쓴다. (DESIGN.md 2장)
 */
export class GameMenu {
  readonly button: HTMLButtonElement
  private readonly window: HTMLElement
  private readonly body: HTMLElement
  private readonly tabButtons = new Map<MenuTab, HTMLButtonElement>()
  private readonly wardrobe: WardrobePane
  private tab: MenuTab = 'relics'
  /** 유물 화면에서 고른 칸 */
  private selectedSlot = 0
  /** 유물 화면에서 커서를 올린 가방 유물 */
  private hovered: RelicId | null = null
  /** 열고 닫을 때 (게임 멈춤) */
  onToggle: (open: boolean) => void = () => {}

  constructor(
    parent: HTMLElement,
    private readonly host: MenuHost,
  ) {
    this.button = el('button', 'menu-button')
    this.button.type = 'button'
    this.button.setAttribute('aria-label', '정보 화면')
    this.button.style.backgroundImage = `url(${pixelIcon(BOOK_ICON.rows, BOOK_ICON.colors)})`
    this.button.addEventListener('click', () => this.toggle())

    this.window = el('div', 'menu')
    this.window.hidden = true
    const frame = el('section', 'menu__frame')
    const head = el('header', 'menu__head')
    const tabs = el('nav', 'menu__tabs')
    for (const [id, label] of TABS) {
      const b = el('button', 'menu__tab', label)
      b.type = 'button'
      b.addEventListener('click', () => this.show(id))
      this.tabButtons.set(id, b)
      tabs.append(b)
    }
    const close = el('button', 'menu__close', '×')
    close.type = 'button'
    close.setAttribute('aria-label', '닫기')
    close.addEventListener('click', () => this.toggle(false))
    head.append(tabs, close)
    this.body = el('div', 'menu__body')
    frame.append(head, this.body)
    this.window.append(frame)
    // 바깥 어두운 곳을 누르면 닫는다.
    this.window.addEventListener('pointerdown', (e) => {
      if (e.target === this.window) this.toggle(false)
    })
    this.window.addEventListener('wheel', (e) => e.stopPropagation())
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) this.toggle(false)
    })
    this.wardrobe = new WardrobePane(host.wardrobe)
    parent.append(this.button, this.window)
  }

  get open(): boolean {
    return !this.window.hidden
  }

  get currentTab(): MenuTab {
    return this.tab
  }

  toggle(open = !this.open): void {
    if (open === this.open) return
    this.window.hidden = !open
    this.button.classList.toggle('is-open', open)
    if (open) this.render()
    this.onToggle(open)
  }

  /** 탭을 골라 연다. 유물 탭이면 칸을 함께 고를 수 있다. */
  show(tab: MenuTab, slot?: number): void {
    this.tab = tab
    if (tab === 'looks') this.button.classList.remove('has-new')
    if (slot !== undefined) this.selectedSlot = slot
    if (!this.open) this.toggle(true)
    else this.render()
  }

  /** 새 외형을 얻었다: 단추에 표시 */
  markNew(): void {
    if (!(this.open && this.tab === 'looks')) this.button.classList.add('has-new')
  }

  /** 게임 상태가 바뀌었다: 열려 있으면 다시 그린다. */
  refresh(): void {
    if (this.open) this.render()
  }

  private render(): void {
    for (const [id, b] of this.tabButtons) b.classList.toggle('is-on', id === this.tab)
    this.body.replaceChildren()
    if (this.tab === 'relics') this.renderRelics()
    else if (this.tab === 'classes') this.renderClasses()
    else this.wardrobe.render(this.body)
  }

  // ───────────────────────────── 유물 ─────────────────────────────

  private renderRelics(): void {
    const { host } = this
    const layout = el('div', 'menu-relics')
    const left = el('div', 'menu-relics__left')
    const detail = el('div', 'menu-relics__detail')

    left.append(el('h4', 'menu__label', '장착'))
    const slots = el('div', 'menu-relics__slots')
    host.slots.forEach((id, i) => {
      const b = el('button', `menu-relics__slot${i === this.selectedSlot ? ' is-selected' : ''}`)
      b.type = 'button'
      if (id) b.style.backgroundImage = `url(${relicIcon(relicDef(id))})`
      b.setAttribute('aria-label', id ? relicDef(id).name : `빈 칸 ${i + 1}`)
      b.addEventListener('click', () => {
        this.selectedSlot = i
        this.hovered = null
        this.render()
      })
      slots.append(b)
    })
    left.append(slots)

    const selected = host.slots[this.selectedSlot] ?? null
    const actions = el('div', 'menu-relics__actions')
    if (selected) {
      const stow = el('button', 'menu__chip', '가방에 넣기')
      stow.type = 'button'
      stow.addEventListener('click', () => host.stow(this.selectedSlot))
      const drop = el('button', 'menu__chip', '발밑에 내려놓기')
      drop.type = 'button'
      drop.addEventListener('click', () => host.drop(this.selectedSlot))
      actions.append(stow, drop)
    }
    left.append(actions)

    left.append(el('h4', 'menu__label', `가방 (${host.bag.length})`))
    const bag = el('div', 'menu-relics__bag')
    if (host.bag.length === 0) bag.append(el('p', 'menu__muted', '가방이 비어 있습니다. 칸이 꽉 찬 채 주운 유물이 여기 들어옵니다.'))
    for (const id of host.bag) {
      const b = el('button', 'menu-relics__item')
      b.type = 'button'
      b.style.backgroundImage = `url(${relicIcon(relicDef(id))})`
      b.setAttribute('aria-label', relicDef(id).name)
      b.addEventListener('pointerenter', () => {
        this.hovered = id
        this.renderDetail(detail)
      })
      b.addEventListener('click', () => {
        this.hovered = null
        host.wield(id, this.selectedSlot)
      })
      bag.append(b)
    }
    left.append(bag)

    left.append(el('h4', 'menu__label', '지금'))
    left.append(el('p', 'menu-relics__state', stateText(host.loadout)))

    layout.append(left, detail)
    this.body.append(layout)
    this.renderDetail(detail)
  }

  /** 오른쪽: 고른 칸이나 커서를 올린 유물의 설명 카드, 바꿔 끼면 어떻게 되는지 */
  private renderDetail(detail: HTMLElement): void {
    const { host } = this
    detail.replaceChildren()
    const id = this.hovered ?? host.slots[this.selectedSlot] ?? null
    if (!id) {
      detail.append(el('p', 'menu__muted', '빈 칸입니다. 가방의 유물을 누르면 이 칸에 낍니다.'))
      return
    }
    detail.append(relicCard(relicDef(id)))
    if (this.hovered) {
      const before = host.loadout
      const after = host.preview(this.selectedSlot, this.hovered)
      const box = el('div', 'menu-relics__preview')
      box.append(el('b', '', `${this.selectedSlot + 1}번 칸에 끼우면`))
      box.append(el('div', '', stateText(after)))
      if (before.manifested && before.manifested !== after.manifested) {
        box.append(el('div', 'menu-relics__warn', `${godDef(before.manifested).title} 발현이 풀립니다.`))
      } else if (after.manifested && before.manifested !== after.manifested) {
        box.append(el('div', 'menu-relics__good', `${josa(godDef(after.manifested).title, '으로')} 발현합니다.`))
      }
      detail.append(box)
    }
  }

  // ───────────────────────────── 클래스 ─────────────────────────────

  private renderClasses(): void {
    const { progress, loadout } = this.host
    const tree = DATA.classes
    const wrap = el('div', 'menu-classes')

    // 지금 클래스
    const now = el('section', 'menu-classes__now')
    const god = loadout.manifested
    if (god) {
      const def = godDef(god)
      const level = progress.level(god)
      now.style.setProperty('--god', def.color)
      now.append(el('div', 'menu-classes__title', `${progress.title(god)} · Lv${level}`))
      now.append(el('div', 'menu__muted', `${def.name} 발현`))
      if (level < MAX_LEVEL) {
        const bar = el('div', 'menu-classes__xp')
        const fill = el('div', 'menu-classes__xp-fill')
        fill.style.width = `${Math.round(progress.xpRatio(god) * 100)}%`
        bar.append(fill)
        now.append(bar)
        const next = def.titles[level]!
        const step = progress.readyToPromote(god)
          ? def.legend
            ? `성소에서 승급 전설 「${def.legend}」${josa(def.legend, '을').slice(def.legend.length)} 깨면 Lv${level + 1} ${next}`
            : `승급 전설이 아직 없습니다. (다음: Lv${level + 1} ${next})`
          : `${josa(def.name, '으로')} 발현한 채 적을 쓰러뜨려 경험치를 채우세요. (${Math.round(progress.xpRatio(god) * 100)}%)`
        now.append(el('p', 'menu-classes__next', `다음 승급: ${step}`))
      } else {
        now.append(el('p', 'menu-classes__next', '가장 높은 레벨입니다.'))
      }
    } else {
      now.append(el('div', 'menu-classes__title', '발현하지 않음'))
      now.append(el('p', 'menu-classes__next', '같은 신의 유물 3개를 끼면 그 신의 클래스가 발현합니다.'))
    }
    wrap.append(now)

    // 원형 친화도
    wrap.append(el('h4', 'menu__label', '원형 친화도 (승급할 때마다 그 원형이 오른다)'))
    const affinity = el('div', 'menu-classes__affinity')
    for (const a of tree.archetypes) {
      const value = progress.affinity(a.id)
      const chip = el('span', `menu-classes__aff${value > 0 ? ' is-on' : ''}`, `${a.name} ${value}`)
      affinity.append(chip)
    }
    wrap.append(affinity)

    // 클래스 트리
    const levelOf = (godId: string | undefined): number => (godId && progress.records.has(godId) ? progress.level(godId) : 0)
    const classChip = (c: TreeClass & { god?: string }, stage: string): HTMLElement => {
      const level = levelOf(c.god)
      const playable = c.god !== undefined
      const chip = el('span', `menu-tree__class${level > 0 ? ' is-owned' : playable ? ' is-playable' : ''}`)
      chip.textContent = level > 0 ? `${c.titles[level - 1]} Lv${level}` : c.titles[0]
      chip.title = playable ? `${c.name}` : `${c.name} (${stage} 제작)`
      return chip
    }

    wrap.append(el('h4', 'menu__label', '기본 클래스 (신화권별)'))
    const base = el('div', 'menu-tree')
    for (const myth of tree.mythologies) {
      const row = el('div', 'menu-tree__row')
      row.append(el('span', 'menu-tree__myth', myth.name))
      for (const c of myth.classes) row.append(classChip(c, myth.stage))
      base.append(row)
    }
    wrap.append(base)

    const count = (archetype: string, minLevel: number) =>
      tree.mythologies.flatMap((m) => m.classes).filter((c) => c.archetype === archetype && levelOf(c.god) >= minLevel).length
    wrap.append(el('h4', 'menu__label', '원형 상위 · 정점 (같은 원형 2개 Lv3 / 4개 모두 Lv4)'))
    const arche = el('div', 'menu-tree')
    for (const a of tree.archetypes) {
      const row = el('div', 'menu-tree__row')
      row.append(el('span', 'menu-tree__myth', a.name))
      const upper = count(a.id, 3)
      const apex = count(a.id, 4)
      row.append(el('span', `menu-tree__class${upper >= 2 ? ' is-owned' : ''}`, `${a.upper.name} ${Math.min(upper, 2)}/2`))
      row.append(el('span', `menu-tree__class${apex >= 4 ? ' is-owned' : ''}`, `${a.apex.name} ${apex}/4`))
      arche.append(row)
    }
    wrap.append(arche)

    wrap.append(el('h4', 'menu__label', '신화권 상위 (그 신화권 4개 모두 Lv3)'))
    const mythUpper = el('div', 'menu-tree')
    for (const m of tree.mythologies) {
      const done = m.classes.filter((c) => levelOf(c.god) >= 3).length
      const row = el('div', 'menu-tree__row')
      row.append(el('span', 'menu-tree__myth', m.name))
      row.append(el('span', `menu-tree__class${done >= 4 ? ' is-owned' : ''}`, `${m.upper.name} ${done}/4`))
      mythUpper.append(row)
    }
    wrap.append(mythUpper)

    wrap.append(el('h4', 'menu__label', '히든 클래스 (조건은 세계 곳곳의 단서로만 알려진다)'))
    const hidden = el('div', 'menu-tree__hidden')
    for (const h of tree.hidden) {
      const name = h.archetype ? tree.archetypes.find((a) => a.id === h.archetype)!.name : '가장 높은 친화도'
      hidden.append(el('span', 'menu-tree__class is-hidden', `??? · ${name}`))
    }
    wrap.append(hidden)
    this.body.append(wrap)
  }
}

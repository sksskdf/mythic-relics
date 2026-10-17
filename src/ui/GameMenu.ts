import { DATA } from '../data'
import { MAX_LEVEL } from '../progress/ClassProgress'
import type { ClassProgress } from '../progress/ClassProgress'
import { type God, godDef, relicDef, type RelicId } from '../relics/data'
import type { LoadoutState } from '../relics/Loadout'
import { relicCard, type RelicCardContext, relicIcon } from './relicCard'
import { classIcon } from './classIcons'
import { smallSigilRing } from './emblem'
import { archetypeSigil, glyph, unknownSigil } from './sigils'
import { type WardrobeHost, WardrobePane } from './WardrobePane'
import './menu.css'

export type MenuTab = 'status' | 'relics' | 'classes' | 'looks'

/** 탭은 그림으로만 보여 주고, 이름은 올렸을 때 힌트로 띄운다. */
const TABS: readonly [MenuTab, 'status' | 'relics' | 'classes' | 'looks', string][] = [
  ['status', 'status', '상태'],
  ['relics', 'relics', '유물'],
  ['classes', 'classes', '클래스'],
  ['looks', 'looks', '외형'],
]

/** 상태 탭에 넣을 지금의 능력치와 걸린 힘 */
export interface HeroStats {
  hp: number
  maxHp: number
  /** 주는 피해 배율 */
  damage: number
  /** 받는 피해 배율 */
  damageTaken: number
  moveSpeed: number
  knockbackDealt: number
  /** 받는 밀침 배율 (낮을수록 잘 버틴다) */
  knockbackTaken: number
  /** 신위 게이지 0~1 */
  divine: number
  /** 총 승급 횟수 */
  promotions: number
  /** 지금 걸린 힘: 발현, 가호, 낀 유물의 지속 효과 */
  powers: { kind: 'god' | 'relic'; name: string; color: string; label: string; what: string }[]
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
  /** 설명 카드에 넣을 지금 상태 */
  cardContext(id: RelicId, preview?: { before: LoadoutState; after: LoadoutState }): RelicCardContext
  stats(): HeroStats
}

/** 능력치 그림의 밝은 색과 어두운 색 */
const STAT_TINT: Partial<Record<Parameters<typeof glyph>[0], [string, string]>> = {
  heart: ['#ff9a90', '#d9473f'],
  sword: ['#e9eef5', '#8e98a3'],
  shield: ['#c9d6ea', '#5b6a8a'],
  boot: ['#e0b080', '#8a6040'],
  push: ['#9fe3ff', '#3f8aa8'],
  stand: ['#e9dcc0', '#8a8273'],
  divine: ['#ffe27a', '#c9a24a'],
  promote: ['#ffd27a', '#a8862e'],
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

function img(src: string, className = ''): HTMLImageElement {
  const i = el('img', className)
  i.src = src
  i.alt = ''
  return i
}

/** 레벨을 보석 점으로 (parts.css의 .ui-gems) */
function pips(level: number, max = MAX_LEVEL): HTMLElement {
  const box = el('span', 'ui-gems ui-gems--small menu-gems')
  for (let i = 1; i <= max; i++) box.append(el('i', i <= level ? 'is-on' : ''))
  return box
}

/**
 * 정보 화면. (E4) HUD 오른쪽 위 책 단추로 연다. 열려 있는 동안 게임은 멈춘다.
 * 글을 최소로 쓰고 그림·점·막대로 보여 준다. 자세한 말은 올리거나 누를 때 힌트로만 띄운다. (DESIGN.md 2.1, 10.5)
 * - 유물: 장착 칸 4개와 가방, 바꿔 끼기, 바꾸면 어떻게 되는지는 카드 안에서 미리 보기
 * - 클래스: 지금 클래스, 원형 문장, 발견한 만큼만 드러나는 신들의 지도
 * - 외형: 가운데 미리 보기와 몸 둘레의 부위 칸
 */
export class GameMenu {
  readonly button: HTMLButtonElement
  private readonly window: HTMLElement
  private readonly body: HTMLElement
  private readonly tabButtons = new Map<MenuTab, HTMLButtonElement>()
  private readonly wardrobe: WardrobePane
  private tab: MenuTab = 'status'
  /** 유물 화면에서 고른 칸 */
  private selectedSlot = 0
  /** 유물 화면에서 커서를 올린 가방 유물 */
  private hovered: RelicId | null = null
  /** 힌트 말풍선 */
  private readonly hint: HTMLElement
  /** 열고 닫을 때 (게임 멈춤) */
  onToggle: (open: boolean) => void = () => {}

  constructor(
    parent: HTMLElement,
    private readonly host: MenuHost,
  ) {
    this.button = el('button', 'menu-button')
    this.button.type = 'button'
    this.button.setAttribute('aria-label', '정보 화면')
    this.button.style.backgroundImage = `url(${smallSigilRing()})`
    this.button.addEventListener('click', () => this.toggle())

    this.window = el('div', 'menu')
    this.window.hidden = true
    const frame = el('section', 'menu__frame ui-panel')
    const head = el('header', 'menu__head')
    const tabs = el('nav', 'menu__tabs')
    this.hint = el('div', 'menu-hint')
    this.hint.hidden = true
    for (const [id, icon, label] of TABS) {
      const b = el('button', 'menu__tab')
      b.type = 'button'
      b.setAttribute('aria-label', label)
      b.append(img(glyph(icon)))
      b.addEventListener('click', () => this.show(id))
      this.hintOn(b, label)
      this.tabButtons.set(id, b)
      tabs.append(b)
    }
    const close = el('button', 'menu__close', '×')
    close.type = 'button'
    close.setAttribute('aria-label', '닫기')
    close.addEventListener('click', () => this.toggle(false))
    head.append(tabs, close)
    this.body = el('div', 'menu__body')
    frame.append(head, this.body, this.hint)
    this.window.append(frame)
    // 바깥 어두운 곳을 누르면 닫는다.
    this.window.addEventListener('pointerdown', (e) => {
      if (e.target === this.window) this.toggle(false)
    })
    this.window.addEventListener('wheel', (e) => e.stopPropagation())
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open) this.toggle(false)
    })
    this.body.addEventListener('scroll', () => (this.hint.hidden = true))
    this.wardrobe = new WardrobePane(host.wardrobe, (target, text) => this.hintOn(target, text))
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

  /** 커서를 올리거나(데스크톱) 누르면(터치) 힌트를 그 칸 근처에 띄운다. */
  private hintOn(target: HTMLElement, text: string | (() => string)): void {
    const show = () => {
      this.hint.textContent = typeof text === 'function' ? text() : text
      this.hint.hidden = false
      const frame = this.hint.parentElement!.getBoundingClientRect()
      const r = target.getBoundingClientRect()
      const width = this.hint.offsetWidth
      const left = Math.min(Math.max(8, r.left - frame.left + r.width / 2 - width / 2), frame.width - width - 8)
      const below = r.bottom - frame.top + 6
      const top = below + this.hint.offsetHeight > frame.height - 8 ? r.top - frame.top - this.hint.offsetHeight - 6 : below
      this.hint.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    }
    target.addEventListener('pointerenter', show)
    target.addEventListener('pointerleave', () => (this.hint.hidden = true))
    target.addEventListener('click', show)
  }

  private render(): void {
    this.hint.hidden = true
    for (const [id, b] of this.tabButtons) b.classList.toggle('is-on', id === this.tab)
    this.body.replaceChildren()
    if (this.tab === 'status') this.renderStatus()
    else if (this.tab === 'relics') this.renderRelics()
    else if (this.tab === 'classes') this.renderClasses()
    else this.wardrobe.render(this.body)
  }

  // ───────────────────────────── 상태 ─────────────────────────────

  /** 지금의 나: 왼쪽에 초상·칭호·레벨 보석·승급 막대, 오른쪽에 능력치와 걸린 힘 */
  private renderStatus(): void {
    const { host } = this
    const stats = host.stats()
    const layout = el('div', 'menu-status')

    const who = el('section', 'menu-status__who')
    const current = host.loadout.manifested
    const portrait = el('div', 'ui-portrait ui-portrait--large')
    if (current) {
      const god = godDef(current)
      const level = host.progress.level(current)
      who.style.setProperty('--god', god.color)
      portrait.style.setProperty('--glow', god.color)
      portrait.append(img(classIcon(god.name)))
      who.append(portrait, el('div', 'menu-status__title', host.progress.title(current)), el('div', 'menu-status__name', god.name))
      const gems = pips(level)
      gems.classList.remove('ui-gems--small')
      who.append(gems)
      if (level < MAX_LEVEL) {
        const bar = el('div', 'ui-bar ui-bar--thin menu-status__xp')
        bar.style.setProperty('--fill', god.color)
        bar.style.setProperty('--pct', host.progress.xpRatio(current).toFixed(3))
        this.hintOn(bar, `다음 승급까지 ${Math.round(host.progress.xpRatio(current) * 100)}%`)
        who.append(bar)
      }
    } else {
      portrait.classList.add('is-empty')
      portrait.append(img(unknownSigil()))
      who.append(portrait, el('div', 'menu-status__title', '이름 없는 모험가'))
      this.hintOn(portrait, '한 신의 유물이 모이면 그 신의 힘이 깨어난다.')
    }
    const tags = el('div', 'menu-status__tags')
    if (current) tags.append(el('span', 'ui-tag ui-tag--solid', '발현'))
    for (const g of host.loadout.blessings) {
      const tag = el('span', 'ui-tag', `${godDef(g).name}의 가호`)
      tag.style.setProperty('--tag', godDef(g).color)
      tags.append(tag)
    }
    who.append(tags)
    layout.append(who)

    const right = el('div', 'menu-status__right')
    const grid = el('div', 'menu-status__stats')
    const pct = (v: number) => `${v > 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)}%`
    const row = (icon: Parameters<typeof glyph>[0], name: string, value: string, hint: string, delta?: { text: string; good: boolean }) => {
      const r = el('div', 'menu-status__stat')
      r.append(img(glyph(icon, ...STAT_TINT[icon]!)), el('span', '', name), el('b', '', value))
      if (delta) {
        const tag = el('span', 'ui-tag', delta.text)
        tag.style.setProperty('--tag', delta.good ? 'var(--c-good)' : 'var(--c-bad)')
        r.append(tag)
      }
      this.hintOn(r, hint)
      grid.append(r)
    }
    const changed = (v: number, higherIsGood: boolean) => (Math.abs(v - 1) < 0.005 ? undefined : { text: pct(v), good: v > 1 === higherIsGood })
    row('heart', '생명', `${Math.round(stats.hp)} / ${stats.maxHp}`, '승급할 때마다 최대 생명이 늘어난다.')
    row('sword', '주는 피해', `×${stats.damage.toFixed(2)}`, '승급 횟수와 발현한 신의 힘', changed(stats.damage, true))
    row('shield', '받는 피해', `×${stats.damageTaken.toFixed(2)}`, '낀 유물의 지속 효과', changed(stats.damageTaken, false))
    row('boot', '이동 속도', `${Math.round(stats.moveSpeed * 100)}%`, '낀 유물의 지속 효과', changed(stats.moveSpeed, true))
    row('push', '밀쳐 내기', `×${stats.knockbackDealt.toFixed(2)}`, '내 공격이 적을 미는 힘', changed(stats.knockbackDealt, true))
    row('stand', '버티기', `×${stats.knockbackTaken.toFixed(2)}`, '내가 밀려나는 정도. 낮을수록 잘 버틴다.', changed(stats.knockbackTaken, false))
    row('divine', '신위', `${Math.round(stats.divine * 100)}%`, '스킬로 맞히고 쓰러뜨릴수록 차오른다. 가득 차면 궁극기.')
    row('promote', '승급', `${stats.promotions}회`, '승급할 때마다 모든 클래스의 기본 능력치가 오른다.')
    right.append(grid)

    if (stats.powers.length > 0) {
      const list = el('div', 'menu-status__powers')
      for (const p of stats.powers) {
        const line = el('div', 'menu-status__power')
        const chip = el('span', 'ui-chip')
        chip.style.setProperty('--glow', p.color)
        chip.append(img(p.kind === 'god' ? classIcon(p.name) : relicIcon(relicDef(p.name as RelicId))))
        line.append(chip, el('span', '', p.label), el('em', '', p.what))
        list.append(line)
      }
      right.append(list)
    }
    layout.append(right)
    this.body.append(layout)
  }

  // ───────────────────────────── 유물 ─────────────────────────────

  private renderRelics(): void {
    const { host } = this
    const layout = el('div', 'menu-relics')
    const left = el('div', 'menu-relics__left')
    const detail = el('div', 'menu-relics__detail')

    // 지금 상태: 발현한 신은 크게, 가호는 작게. 신의 색 문장으로만 보여 준다.
    const state = el('div', 'menu-relics__state')
    const { manifested, blessings } = host.loadout
    if (manifested) {
      const god = godDef(manifested)
      const badge = el('span', 'menu-relics__manifest', god.title)
      badge.style.setProperty('--god', god.color)
      badge.prepend(img(classIcon(god.name)))
      this.hintOn(badge, `${god.name} 발현`)
      state.append(badge)
    }
    for (const g of blessings) {
      const god = godDef(g)
      const chip = el('span', 'menu-relics__blessing')
      chip.style.setProperty('--god', god.color)
      chip.append(img(classIcon(god.name)))
      this.hintOn(chip, `${god.name}의 가호`)
      state.append(chip)
    }
    left.append(state)

    // 장착 칸 4개
    const slots = el('div', 'menu-relics__slots')
    host.slots.forEach((id, i) => {
      const b = el('button', `menu-relics__slot${i === this.selectedSlot ? ' is-selected' : ''}`)
      b.type = 'button'
      b.dataset.n = String(i + 1)
      if (id) {
        b.style.backgroundImage = `url(${relicIcon(relicDef(id))})`
        b.style.setProperty('--god', godDef(relicDef(id).god).color)
      }
      b.setAttribute('aria-label', id ? relicDef(id).name : `빈 칸 ${i + 1}`)
      b.addEventListener('click', () => {
        this.selectedSlot = i
        this.hovered = null
        this.render()
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
      b.disabled = !selected
      b.append(img(glyph(name)))
      b.addEventListener('click', run)
      this.hintOn(b, label)
      actions.append(b)
    }
    action('bag', '가방에 넣기', () => host.stow(this.selectedSlot))
    action('drop', '발밑에 내려놓기', () => host.drop(this.selectedSlot))
    left.append(actions)

    // 가방
    const bag = el('div', 'menu-relics__bag')
    bag.style.backgroundImage = `url(${glyph('bag', '#222a36', '#141a24')})`
    for (const id of host.bag) {
      const b = el('button', 'menu-relics__item')
      b.type = 'button'
      b.style.backgroundImage = `url(${relicIcon(relicDef(id))})`
      b.style.setProperty('--god', godDef(relicDef(id).god).color)
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

    layout.append(left, detail)
    this.body.append(layout)
    this.renderDetail(detail)
  }

  /** 오른쪽: 고른 칸이나 커서를 올린 가방 유물의 설명 카드 (바꿔 끼면 어떻게 되는지 포함) */
  private renderDetail(detail: HTMLElement): void {
    const { host } = this
    detail.replaceChildren()
    const id = this.hovered ?? host.slots[this.selectedSlot] ?? null
    if (!id) {
      detail.append(img(unknownSigil('#2a3240'), 'menu-relics__empty'))
      return
    }
    const preview = this.hovered ? { before: host.loadout, after: host.preview(this.selectedSlot, this.hovered) } : undefined
    detail.append(relicCard(relicDef(id), host.cardContext(id, preview)))
  }

  // ───────────────────────────── 클래스 ─────────────────────────────

  /**
   * 신들의 지도. 처음부터 모든 체계를 늘어놓지 않고, 발견한 만큼만 드러난다.
   * - 아는 땅(유물이 이 세계에 있는 신화권)은 신 넷이 자리로 보이고, 깨운 신은 칭호가, 나머지는 ?가 된다.
   * - 모르는 땅은 문장 하나(?)로만 보인다.
   * - 높은 자리(원형·신화권의 상위)는 그 길에 처음 발을 디딘 뒤에야 ?로 나타난다.
   * - 숨겨진 별은 이름 없이 흐리게 떠 있다.
   * 모든 ?는 올리거나 누르면 그 신화의 이야기로 된 힌트를 보여 준다.
   */
  private renderClasses(): void {
    const { progress, loadout } = this.host
    const tree = DATA.classes
    const wrap = el('div', 'menu-classes')
    const levelOf = (god: God | undefined): number => (god && progress.records.has(god) ? progress.level(god) : 0)

    // 지금 클래스: 문장, 칭호, 레벨 점, 경험치 막대, 승급 전설 두루마리
    const now = el('section', 'menu-classes__now')
    const current = loadout.manifested
    if (current) {
      const god = godDef(current)
      const level = progress.level(current)
      now.style.setProperty('--god', god.color)
      now.append(img(classIcon(god.name), 'menu-classes__emblem'))
      const info = el('div', 'menu-classes__info')
      const title = el('div', 'menu-classes__title', progress.title(current))
      title.append(pips(level))
      info.append(title)
      if (level < MAX_LEVEL) {
        const bar = el('div', 'ui-bar ui-bar--thin menu-classes__xp')
        bar.style.setProperty('--fill', god.color)
        bar.style.setProperty('--pct', progress.xpRatio(current).toFixed(3))
        info.append(bar)
      }
      now.append(info)
      if (level < MAX_LEVEL) {
        const ready = progress.readyToPromote(current)
        const scroll = el('span', `menu-classes__legend${ready ? ' is-ready' : ''}`)
        scroll.append(img(glyph('scroll', ready ? '#ffd27a' : '#5d6876', ready ? '#6b5622' : '#222a36')))
        const next = god.titles[level]!
        this.hintOn(
          scroll,
          ready
            ? god.legend
              ? `「${god.legend}」\n성소의 결계 안에서 증명하면 ${next}`
              : `다음 시련은 아직 이 세계에 없다.\n${next}`
            : `싸워서 이름을 더 떨쳐야 한다.\n${Math.round(progress.xpRatio(current) * 100)}%`,
        )
        now.append(scroll)
      }
    } else {
      now.classList.add('is-empty')
      now.append(img(unknownSigil(), 'menu-classes__emblem'))
      const info = el('div', 'menu-classes__info')
      info.append(el('div', 'menu-classes__title', '이름 없는 모험가'))
      now.append(info)
      this.hintOn(now, '한 신의 유물이 모이면 그 신의 힘이 깨어난다.')
    }
    wrap.append(now)

    // 원형 문장 10개: 친화도는 점으로
    const sigils = el('div', 'menu-classes__sigils')
    for (const a of tree.archetypes) {
      const value = progress.affinity(a.id)
      const known = tree.mythologies.some((m) => m.classes.some((c) => c.archetype === a.id && levelOf(c.god) > 0))
      const cell = el('span', `menu-classes__sigil${known ? ' is-known' : ''}`)
      cell.append(img(known ? archetypeSigil(a.id) : archetypeSigil(a.id, '#3a4558', '#222a36')))
      if (value > 0) cell.append(pips(Math.min(value, 4), 4))
      this.hintOn(cell, known ? `${a.name}\n친화도 ${value}` : '아직 이 힘을 모른다.')
      sigils.append(cell)
    }
    wrap.append(sigils)

    // 신들의 지도
    const node = (open: boolean, label: string, hint: string, extra = '', color?: string, icon?: string): HTMLElement => {
      const chip = el('button', `menu-tree__node${open ? ' is-open' : ''}${extra}`)
      chip.type = 'button'
      if (open) {
        if (icon) chip.append(img(icon))
        chip.append(label)
      }
      else chip.append(img(unknownSigil(extra.includes('is-near') ? '#8d98a6' : '#3a4558')))
      if (color) chip.style.setProperty('--god', color)
      chip.setAttribute('aria-label', open ? label : '알 수 없는 자리')
      this.hintOn(chip, hint)
      return chip
    }
    const map = el('div', 'menu-tree')
    const unknownLands = el('div', 'menu-tree__lands')
    for (const myth of tree.mythologies) {
      const near = myth.classes.some((c) => c.god !== undefined)
      const found = myth.classes.filter((c) => levelOf(c.god) > 0).length
      if (!near && found === 0) {
        // 모르는 땅: 문장 하나
        unknownLands.append(node(false, myth.name, '아직 닿지 않은 땅. 그곳에도 신들이 잠들어 있다.', ' is-land'))
        continue
      }
      const land = el('div', 'menu-tree__land')
      land.append(el('div', 'menu-tree__land-name', myth.name))
      const gods = el('div', 'menu-tree__gods')
      for (const c of myth.classes) {
        const level = levelOf(c.god)
        const color = c.god ? godDef(c.god).color : undefined
        const title = c.titles[Math.max(0, level - 1)]!
        gods.append(
          level > 0
            ? node(true, title, `${c.name}\n${c.hint}`, '', color, classIcon(c.name))
            : node(false, c.name, c.hint, c.god ? ' is-near' : ''),
        )
      }
      land.append(gods)
      // 신화권의 높은 자리: 그 땅의 신을 둘 이상 깨운 뒤에 나타난다.
      if (found >= 2) {
        const done = myth.classes.filter((c) => levelOf(c.god) >= 3).length
        land.append(node(done >= 4, myth.upper.name, myth.upper.hint, ' is-crown'))
      }
      map.append(land)
    }
    wrap.append(map)

    // 원형의 높은 자리: 그 원형의 신이 한 번이라도 승급한 뒤에 나타난다.
    const heights = el('div', 'menu-tree__heights')
    const count = (archetype: string, minLevel: number) =>
      tree.mythologies.flatMap((m) => m.classes).filter((c) => c.archetype === archetype && levelOf(c.god) >= minLevel).length
    for (const a of tree.archetypes) {
      if (count(a.id, 2) === 0) continue
      const upper = count(a.id, 3) >= 2
      const pair = el('span', 'menu-tree__height')
      pair.append(img(archetypeSigil(a.id)))
      pair.append(node(upper, a.upper.name, a.upper.hint))
      if (upper) pair.append(node(count(a.id, 4) >= 4, a.apex.name, a.apex.hint))
      heights.append(pair)
    }
    if (heights.childElementCount > 0) wrap.append(heights)
    if (unknownLands.childElementCount > 0) wrap.append(unknownLands)

    // 숨겨진 별
    const stars = el('div', 'menu-tree__stars')
    for (const h of tree.hidden) {
      const level = levelOf(h.god)
      const star = node(level > 0, h.titles[Math.max(0, level - 1)]!, level > 0 ? `${h.name}\n${h.hint}` : h.hint, ' is-star')
      if (level === 0) star.replaceChildren(el('span', 'menu-tree__star', '✦'))
      if (h.god && level > 0) star.style.setProperty('--god', godDef(h.god).color)
      stars.append(star)
    }
    wrap.append(stars)
    this.body.append(wrap)
  }
}

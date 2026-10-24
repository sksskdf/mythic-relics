import { DATA } from '../data'
import { GRADE_COLORS } from '../art/palette'
import { SLOT_PARTS } from '../data/gearData'
import { GEAR, type GearItem, gearName } from '../gear/roll'
import { gearCard } from './gearCard'
import { josa } from './josa'
import { materialName } from '../gear/materials'
import { MAX_LEVEL } from '../myth/ClassProgress'
import { alwaysLines } from '../myth/alwaysText'
import type { ClassProgress } from '../myth/ClassProgress'
import { AWAKEN_AT, AWAKENING_TEXT } from '../data/awakening'
import { THREAT_MAX } from '../data/threat'
import { allLevelGains, levelGains } from '../myth/levelGains'
import type { SourceId } from '../data/schema'
import { type God, godDef, relicDef, type RelicId } from '../relics/data'
import type { LoadoutState } from '../myth/manifest'
import { relicCard, type RelicCardContext, relicIcon } from './relicCard'
import { classIcon } from './classIcons'
import { smallSigilRing } from './emblem'
import { glyph, SOURCE_COLORS, sourceSigil, unknownSigil } from './sigils'
import { type WardrobeHost, WardrobePane } from './WardrobePane'
import './menu.css'

export type MenuTab = 'status' | 'sources' | 'relics' | 'classes' | 'looks'

/** 탭은 그림으로만 보여 주고, 이름은 올렸을 때 힌트로 띄운다. */
const TABS: readonly [MenuTab, Parameters<typeof glyph>[0], string][] = [
  ['status', 'status', '상태'],
  ['sources', 'cycle', '원천'],
  ['relics', 'relics', '장비'],
  ['classes', 'classes', '신화'],
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

/** 탭에 올리면 나오는 설명 */
const TAB_HINTS: Record<MenuTab, string> = {
  status: '상태\n지금 내 능력치와 걸려 있는 힘',
  sources: '원천\n장비의 원천이 쌓여 각성한 힘, 세계의 위협 단계, 손이 덜 가는 편의',
  relics: '유물\n낀 유물과 가방. 눌러서 바꿔 끼고, 바꾸면 어떻게 되는지 미리 본다',
  classes: '신화\n지금 신화의 개방 단계와 다음 단계로 가는 법, 만난 신들',
  looks: '외형\n부위마다 보이는 모습을 고른다',
}

/** 원천 탭의 ? 설명 */
const SOURCE_HELP = {
  awaken: '원천 각성\n장비마다 붙은 원천 수치와 원천 숙련을 더한 값이 5·10·20을 넘을 때마다 그 원천이 한 단계씩 깨어난다. 한 원천에 몰면 3단계, 나누면 두 원천이 2단계쯤.',
  threat: '위협 단계\n세계 전체의 난이도. 오를수록 적이 세지고 정예가 늘며, 장비 등급과 재료가 좋아진다. 열린 가장 높은 단계에서 지역 보스를 이기면 다음 단계가 열린다. 마을 촌장에게서 고른다.',
  branch: '원천 갈래\n처음 오르는 단계로 갈 때, 그동안 싸운 경험을 원천 하나에 부어 영구 숙련을 올린다. 숙련은 그 원천 수치에 더해진다.',
  resonance: '공명\n네 원천 숙련 가운데 가장 낮은 값. 1마다 모든 각성 효과가 5% 세진다. 골고루 키운 보상이다.',
  convenience: '편의\n같은 일을 여러 번 하면 손이 덜 가게 하나씩 열린다. 싸움은 그대로 내 몫이다.',
}

/** 원천 탭이 게임에서 읽고 부르는 것 */
export interface SourcesHost {
  /** 원천마다: 장비 합, 숙련, 합계, 각성 단계 */
  rows(): { id: SourceId; gear: number; mastery: number; total: number; level: number }[]
  readonly threat: { level: number; unlocked: number; reached: number; battle: number; pour: number; resonance: number }
  /** 단계를 고를 수 있는 곳인가 (마을) */
  here(): boolean
  choose(level: number): boolean
  advance(source: SourceId): boolean
  /** 편의: 이름, 설명, 열렸나, 진행 */
  conveniences(): { id: string; name: string; text: string; open: boolean; have: number; need: number }[]
  autoSalvage: boolean
  /** 성소 워프: 갈 수 있는 곳 (열리지 않았으면 빈 목록) */
  warps(): { id: string; name: string }[]
  warp(id: string): boolean
}

/** 신화권 이름 (숙련 안내) */
const REALM_NAME: Readonly<Record<string, string>> = { norse: '북유럽', greek: '그리스', china: '중국', japan: '일본', korea: '한국' }
/** 메뉴가 게임에서 읽고 부르는 것 */
export interface MenuHost {
  readonly slots: readonly (string | null)[]
  readonly bag: readonly string[]
  /** 일반 장비 내용 (id가 장비면) */
  gearOf(id: string): GearItem | undefined
  /** 장비·유물이 들어가는 칸들 */
  slotsFor(id: string): number[]
  /** 재료와 개수 */
  readonly materials: ReadonlyMap<string, number>
  /** 대장간 (E13-05) */
  readonly forge: {
    /** 지금 벼릴 수 있는 곳인가 (마을) */
    here(): boolean
    /** 대장간에 보일 신화들 (고른 신화, 열린 신화, 재료나 유물이 있는 신화) */
    gods(): God[]
    /** 그 신화의 다음 제작: 만들 것의 이름, 재료(가진 수/필요한 수), 바탕 장비 부위와 있는지. 다 올렸으면 null */
    next(god: God): { name: string; stage: number; materials: { name: string; have: number; need: number }[]; base?: { part: string; ok: boolean } } | null
    make(god: God): boolean
  }
  readonly loadout: LoadoutState
  /** slot에 id를 끼우면(null이면 비우면) 어떻게 되는지 */
  preview(slot: number, id: RelicId | null): LoadoutState
  wield(id: RelicId, slot: number): void
  stow(slot: number): void
  drop(slot: number): void
  /** 일반 장비를 분해해 재료로 (E13-07-3) */
  salvage(id: string): void
  readonly progress: ClassProgress
  /** 신화 탭 (E12-06): 고르기와 상시 효과 단계 */
  readonly myths: {
    /** 지금 고른 신화를 바꿀 수 있는 곳인가 (마을·성소) */
    canChoose(): boolean
    choose(god: God): boolean
    /** 그 신화의 상시 효과 단계 (개방 단계, 그 신 유물을 끼면 +1) */
    stage(god: God): number
  }
  readonly wardrobe: WardrobeHost
  /** 설명 카드에 넣을 지금 상태 */
  cardContext(id: RelicId, preview?: { before: LoadoutState; after: LoadoutState }): RelicCardContext
  stats(): HeroStats
  readonly sources: SourcesHost
  /** 저장하고 처음 화면(슬롯 고르기)으로 */
  toTitle(): void
  /** 설정을 연다 (일시 정지 메뉴) */
  openSettings(): void
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
 * - 클래스: 지금 클래스와 다음 승급, 원천 넷, 발견한 만큼만 드러나는 신들의 지도
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
  /** 신화 탭에서 눌러 본 신화 (없으면 고른 신화) */
  private selectedMyth: God | null = null
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
    this.button.addEventListener('click', () => (this.pendingTab && !this.open ? this.show(this.pendingTab) : this.toggle()))

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
      b.append(img(glyph(icon)), el('span', '', label))
      b.addEventListener('click', () => this.show(id))
      this.hintOn(b, TAB_HINTS[id])
      this.tabButtons.set(id, b)
      tabs.append(b)
    }
    // 처음 화면으로: 저장하고 슬롯 고르기로 돌아간다. 잘못 누르지 않게 한 번 더 눌러야 한다.
    const home = el('button', 'menu__home')
    home.type = 'button'
    home.append(img(glyph('drop', '#b9c3cf', '#5d6876')), el('span', '', '처음 화면'))
    home.addEventListener('click', () => {
      if (home.classList.contains('is-confirm')) {
        host.toTitle()
        return
      }
      home.classList.add('is-confirm')
      home.lastElementChild!.textContent = '한 번 더 누르면 이동'
      setTimeout(() => {
        home.classList.remove('is-confirm')
        home.lastElementChild!.textContent = '처음 화면'
      }, 2500)
    })
    this.hintOn(home, '처음 화면\n지금까지를 저장하고 슬롯 고르기 화면으로 돌아간다')
    const gear = el('button', 'menu__gear')
    gear.type = 'button'
    gear.setAttribute('aria-label', '설정')
    gear.append(img(glyph('gear', '#b9c3cf', '#5d6876')))
    gear.addEventListener('click', () => host.openSettings())
    this.hintOn(gear, '설정\n음량, 화면 흔들림·번쩍임, 해상도')
    const close = el('button', 'menu__close', '×')
    close.type = 'button'
    close.setAttribute('aria-label', '닫기')
    close.addEventListener('click', () => this.toggle(false))
    head.append(tabs, home, gear, close)
    this.body = el('div', 'menu__body')
    frame.append(head, this.body, this.hint)
    this.window.append(frame)
    // 바깥 어두운 곳을 누르면 닫는다.
    this.window.addEventListener('pointerdown', (e) => {
      if (e.target === this.window) this.toggle(false)
    })
    this.window.addEventListener('wheel', (e) => e.stopPropagation())
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
    if (tab === 'looks' || tab === this.pendingTab) this.button.classList.remove('has-new')
    if (tab === this.pendingTab) this.pendingTab = null
    if (slot !== undefined) this.selectedSlot = slot
    if (!this.open) this.toggle(true)
    else this.render()
  }

  /** 단추를 누르면 바로 열 탭 (발현할 수 있는 조합이 가방에 있을 때 유물 탭) */
  private pendingTab: MenuTab | null = null

  /** 볼 것이 생긴 탭: 단추에 표시하고, 단추를 누르면 그 탭부터 연다 */
  markTab(tab: MenuTab): void {
    if (this.open && this.tab === tab) return
    this.pendingTab = tab
    this.button.classList.add('has-new')
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
      const words = typeof text === 'function' ? text() : text
      const [first, ...rest] = words.split('\n')
      this.hint.replaceChildren()
      if (rest.length > 0) this.hint.append(el('b', '', first!), rest.join('\n'))
      else this.hint.textContent = words
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
    else if (this.tab === 'sources') this.renderSources()
    else if (this.tab === 'relics') this.renderRelics()
    else if (this.tab === 'classes') this.renderClasses()
    else this.wardrobe.render(this.body)
  }

  // ───────────────────────────── 원천 ─────────────────────────────

  /**
   * 원천 탭 (E14): 원천 넷의 각성, 세계 위협 단계와 원천 갈래, 공명, 편의 자동화.
   */
  private renderSources(): void {
    const { sources } = this.host
    const wrap = el('div', 'menu-src')
    const sourceName = (id: SourceId) => DATA.classes.sources.find((x) => x.id === id)!.name
    /** 제목 옆의 ?: 올리거나 누르면 설명 */
    const titled = (text: string, help: string): HTMLElement => {
      const t = el('div', 'menu-src__title', text)
      const q = el('span', 'menu-src__help', '?')
      this.hintOn(q, help)
      t.append(q)
      return t
    }

    // 원천 각성: 넷의 카드
    const awaken = el('section', 'menu-src__panel')
    awaken.append(titled('원천 각성', SOURCE_HELP.awaken))
    const grid = el('div', 'menu-src__sources')
    for (const row of sources.rows()) {
      const card = el('section', `menu-src__source${row.level > 0 ? ' is-awake' : ''}`)
      card.style.setProperty('--god', SOURCE_COLORS[row.id]![0])
      const head = el('div', 'menu-src__head')
      head.append(img(sourceSigil(row.id)), el('b', '', sourceName(row.id)))
      const gems = el('div', 'ui-gems ui-gems--small')
      for (let i = 0; i < 3; i++) gems.append(el('i', i < row.level ? 'is-on' : ''))
      head.append(gems)
      card.append(head)
      const amount = el('div', 'menu-src__amount')
      amount.append(el('b', '', String(row.total)), el('span', '', row.mastery > 0 ? `장비 ${row.gear} + 숙련 ${row.mastery}` : '장비'))
      card.append(amount)
      AWAKENING_TEXT[row.id].forEach((text, i) => card.append(el('div', `menu-src__line${i < row.level ? ' is-on' : ''}`, `${i + 1} · ${text}`)))
      const next = AWAKEN_AT.find((at) => row.total < at)
      card.append(el('div', 'menu-src__next', next === undefined ? '모두 깨어났다' : `다음 각성까지 ${next - row.total}`))
      grid.append(card)
    }
    awaken.append(grid)
    wrap.append(awaken)

    // 위협 단계와 원천 갈래
    const t = sources.threat
    const here = sources.here()
    const threat = el('section', 'menu-src__panel')
    threat.append(titled(`위협 단계 · ${t.level}단계`, SOURCE_HELP.threat))
    const levels = el('div', 'menu-src__levels')
    for (let n = 1; n <= THREAT_MAX; n++) {
      const b = el('button', `menu-src__level${n === t.level ? ' is-on' : ''}`, String(n))
      b.type = 'button'
      b.disabled = !here || n > t.reached
      if (n > t.unlocked) b.classList.add('is-locked')
      else if (n > t.reached) b.classList.add('is-next')
      b.addEventListener('click', () => sources.choose(n) && this.render())
      levels.append(b)
    }
    threat.append(levels)
    threat.append(el('div', 'menu-src__text', here ? '마을 촌장: 올라가 본 단계 안에서 고를 수 있다' : '마을 촌장에게 가면 단계를 고를 수 있다'))
    if (t.unlocked > t.reached) {
      const branch = el('div', 'menu-src__branch')
      branch.append(titled(`${t.reached + 1}단계로 오르기 · 원천 갈래`, SOURCE_HELP.branch))
      branch.append(el('div', 'menu-src__text', `그동안 싸운 경험 ${t.battle} → 고른 원천 숙련 +${t.pour}`))
      const cards = el('div', 'menu-src__cards')
      for (const row of sources.rows()) {
        const b = el('button', 'menu-src__card')
        b.type = 'button'
        b.disabled = !here
        b.style.setProperty('--god', SOURCE_COLORS[row.id]![0])
        b.append(img(sourceSigil(row.id)), el('b', '', sourceName(row.id)), el('small', '', `${row.total} → ${row.total + t.pour}`))
        b.addEventListener('click', () => sources.advance(row.id) && this.render())
        cards.append(b)
      }
      branch.append(cards)
      threat.append(branch)
    } else {
      threat.append(el('div', 'menu-src__text', t.unlocked >= THREAT_MAX ? '가장 높은 단계까지 열었다' : `${t.unlocked}단계에서 지역 보스를 이기면 ${t.unlocked + 1}단계가 열린다`))
    }
    wrap.append(threat)

    // 공명과 편의
    const lower = el('div', 'menu-src__lower')
    const resonance = el('section', 'menu-src__panel')
    resonance.append(titled(`공명 · ${t.resonance}`, SOURCE_HELP.resonance))
    resonance.append(el('div', 'menu-src__text', t.resonance > 0 ? `모든 각성 효과 +${t.resonance * 5}%` : '네 원천 숙련이 모두 1 이상이면 공명이 시작된다'))
    lower.append(resonance)
    const conv = el('section', 'menu-src__panel')
    conv.append(titled('편의', SOURCE_HELP.convenience))
    for (const c of sources.conveniences()) {
      const line = el('div', `menu-src__conv${c.open ? ' is-on' : ''}`)
      line.append(el('b', '', c.name), el('small', '', c.open ? c.text : `${Math.min(c.have, c.need)} / ${c.need}`))
      if (c.id === 'autoSalvage' && c.open) {
        const toggle = el('button', 'ui-pill', sources.autoSalvage ? '켬' : '끔')
        toggle.type = 'button'
        toggle.addEventListener('click', () => {
          sources.autoSalvage = !sources.autoSalvage
          this.render()
        })
        line.append(toggle)
      }
      conv.append(line)
    }
    const warps = sources.warps()
    if (warps.length > 0) {
      const row = el('div', 'menu-src__warps')
      for (const w of warps) {
        const b = el('button', 'ui-pill', w.name)
        b.type = 'button'
        b.addEventListener('click', () => sources.warp(w.id) && this.toggle(false))
        row.append(b)
      }
      conv.append(row)
    }
    lower.append(conv)
    wrap.append(lower)
    this.body.append(wrap)
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
        this.hintOn(bar, `다음 단계까지 ${Math.round(host.progress.xpRatio(current) * 100)}%`)
        who.append(bar)
      }
    } else {
      portrait.classList.add('is-empty')
      portrait.append(img(unknownSigil()))
      who.append(portrait, el('div', 'menu-status__title', '이름 없는 모험가'))
      this.hintOn(portrait, '한 신의 유물이 모이면 그 신의 힘이 깨어난다.')
    }
    const tags = el('div', 'menu-status__tags')
    if (current) tags.append(el('span', 'ui-tag ui-tag--solid', '신화 개방'))
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
      this.hintOn(r, hint.includes('\n') ? hint : `${name}\n${hint}`)
      grid.append(r)
    }
    const changed = (v: number, higherIsGood: boolean) => (Math.abs(v - 1) < 0.005 ? undefined : { text: pct(v), good: v > 1 === higherIsGood })
    row('heart', '생명', `${Math.round(stats.hp)} / ${stats.maxHp}`, '생명\n개방 단계가 오를 때마다 최대 생명 +15. 오르면 가득 찬다.')
    row('sword', '주는 피해', `×${stats.damage.toFixed(2)}`, '주는 피해\n개방 단계가 오를 때마다 +5%, 지금 신화의 힘이 곱해진다.', changed(stats.damage, true))
    row('shield', '받는 피해', `×${stats.damageTaken.toFixed(2)}`, '낀 유물의 지속 효과', changed(stats.damageTaken, false))
    row('boot', '이동 속도', `${Math.round(stats.moveSpeed * 100)}%`, '낀 유물의 지속 효과', changed(stats.moveSpeed, true))
    row('push', '밀쳐 내기', `×${stats.knockbackDealt.toFixed(2)}`, '내 공격이 적을 미는 힘', changed(stats.knockbackDealt, true))
    row('stand', '버티기', `×${stats.knockbackTaken.toFixed(2)}`, '내가 밀려나는 정도. 낮을수록 잘 버틴다.', changed(stats.knockbackTaken, false))
    row('divine', '궁극기 충전', `${Math.round(stats.divine * 100)}%`, '궁극기 충전\n스킬로 맞히고 적을 쓰러뜨릴수록 차오른다. 가득 차면 지금 신화의 궁극기가 저절로 나간다.')
    row('promote', '올린 단계', `${stats.promotions}`, '올린 단계\n어느 신화든 개방 단계를 하나 올릴 때마다 생명 +15, 모든 피해 +5%. 모든 신화에 함께 적용된다.')
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
      this.hintOn(badge, `${god.name}의 신화 개방`)
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

    // 가방: 누르면 그 부위 칸에 낀다 (고른 칸이 맞는 부위면 그 칸, 아니면 비어 있는 칸부터)
    const bag = el('div', 'menu-relics__bag')
    bag.style.backgroundImage = `url(${glyph('bag', '#222a36', '#141a24')})`
    for (const id of host.bag) {
      const b = el('button', 'menu-relics__item')
      b.type = 'button'
      this.paintItem(b, id)
      b.setAttribute('aria-label', this.itemName(id))
      b.addEventListener('pointerenter', () => {
        this.hovered = id
        this.renderDetail(detail)
      })
      b.addEventListener('click', () => {
        this.hovered = null
        const fits = host.slotsFor(id)
        const slot = fits.includes(this.selectedSlot) ? this.selectedSlot : (fits.find((i) => host.slots[i] === null) ?? fits[0])
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
    const gear = host.gearOf(id)
    if (gear) {
      // 같은 부위에 지금 낀 일반 장비와 비교한다
      const wornId = host.slotsFor(id).map((i) => host.slots[i]).find((x) => x && x !== id && host.gearOf(x))
      detail.append(gearCard(gear, wornId ? host.gearOf(wornId) : null))
      const b = el('button', 'menu-relics__salvage')
      b.type = 'button'
      b.append(img(glyph('salvage')), '분해')
      this.hintOn(b, '분해하면 그 땅의 공통 재료가 나온다 (보통 1 · 좋음 2 · 희귀 4 · 영웅 8)')
      b.addEventListener('click', () => {
        this.hovered = null
        host.salvage(id)
      })
      detail.append(b)
      return
    }
    const preview = this.hovered ? { before: host.loadout, after: host.preview(this.selectedSlot, this.hovered) } : undefined
    detail.append(relicCard(relicDef(id), host.cardContext(id, preview)))
  }

  /** 대장간 칸: 신화마다 다음 제작과 모자란 재료, 「벼리기」 단추 (마을에서만 켜짐) */
  private forgePanel(): HTMLElement {
    const { forge } = this.host
    const box = el('section', 'menu-forge')
    const here = forge.here()
    box.append(el('b', '', '대장간'), el('small', '', here ? '같은 부위 장비와 재료로 신화의 유물을 벼린다' : '마을 대장장이에게 가면 벼릴 수 있다'))
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
      const ready = next.materials.every((m) => m.have >= m.need) && (next.base?.ok ?? true)
      row.append(el('span', 'menu-forge__name', next.stage === 1 ? `${next.name} 만들기` : `${josa(next.name, '으로')} 올리기`))
      const needs = el('span', 'menu-forge__needs')
      for (const m of next.materials) needs.append(el('span', m.have >= m.need ? 'is-ok' : 'is-short', `${m.name} ${Math.min(m.have, m.need)}/${m.need}`))
      if (next.base) needs.append(el('span', next.base.ok ? 'is-ok' : 'is-short', `바탕: ${next.base.part} 장비`))
      row.append(needs)
      const b = el('button', 'menu-forge__make', '벼리기')
      b.type = 'button'
      b.disabled = !here || !ready
      if (here && ready) b.addEventListener('click', () => forge.make(god) && this.render())
      row.append(b)
      box.append(row)
    }
    return box
  }

  /** 칸·가방 단추에 그림: 유물은 유물 그림과 신의 색, 일반 장비는 등급 색 */
  private paintItem(b: HTMLElement, id: string | null): void {
    if (!id) return
    const gear = this.host.gearOf(id)
    if (gear) {
      b.classList.add('is-gear')
      b.style.setProperty('--god', GRADE_COLORS[gear.grade])
      b.dataset.grade = gear.grade
      return
    }
    b.style.backgroundImage = `url(${relicIcon(relicDef(id))})`
    b.style.setProperty('--god', godDef(relicDef(id).god).color)
  }

  private itemName(id: string): string {
    const gear = this.host.gearOf(id)
    return gear ? gearName(gear) : relicDef(id).name
  }

  // ───────────────────────────── 클래스 ─────────────────────────────

  /**
   * 신들의 지도. 처음부터 모든 체계를 늘어놓지 않고, 발견한 만큼만 드러난다.
   * - 아는 땅(유물이 이 세계에 있는 신화권)은 신 넷이 자리로 보이고, 깨운 신은 칭호가, 나머지는 ?가 된다.
   * - 모르는 땅은 문장 하나(?)로만 보인다.
   * - 높은 자리(원천·신화권의 상위)는 그 길에 처음 발을 디딘 뒤에야 ?로 나타난다.
   * - 숨겨진 별은 이름 없이 흐리게 떠 있다.
   * 모든 ?는 올리거나 누르면 그 신화의 이야기로 된 힌트를 보여 준다.
   */
  /**
   * 다음 단계까지의 두 걸음(숙련 채우기 → 전설)과, Lv1~4 단계마다 얻는 것.
   * 지난 단계는 밝게, 다음 단계는 금빛 테로 강조한다.
   */
  private promotionGuide(god: God): HTMLElement {
    const { progress } = this.host
    const def = godDef(god)
    const level = progress.level(god)
    const box = el('section', 'menu-promo')
    box.style.setProperty('--god', def.color)

    if (level < MAX_LEVEL) {
      const steps = el('div', 'menu-promo__steps')
      const ratio = progress.xpRatio(god)
      const ready = progress.readyToPromote(god)
      const step1 = el('div', `menu-promo__step${ready ? ' is-done' : ' is-now'}`)
      step1.append(el('span', 'menu-promo__no', '1'), el('span', '', def.hidden ? `${def.name}의 신화를 고른 채 싸워 숙련을 채운다` : `${REALM_NAME[def.realm] ?? '그'} 몬스터를 잡아 숙련을 채운다 (고르면 더 빨리)`))
      const bar = el('div', 'ui-bar ui-bar--thin')
      bar.style.setProperty('--fill', def.color)
      bar.style.setProperty('--pct', ratio.toFixed(3))
      step1.append(bar, el('b', '', `${Math.round(ratio * 100)}%`))
      const step2 = el('div', `menu-promo__step${ready ? ' is-now' : ''}`)
      step2.append(
        el('span', 'menu-promo__no', '2'),
        el('span', '', def.legend ? `성소의 결계에 들어가 전설 「${def.legend.name}」에서 이긴다` : '이 신의 전설은 아직 이 세계에 없다'),
      )
      steps.append(el('div', 'menu-promo__head', `다음 단계: ${level + 1}단계 ${def.titles[level]}`), step1, step2)
      box.append(steps)
    }

    const ladder = el('div', 'menu-promo__ladder')
    allLevelGains(god).forEach((gains, i) => {
      const lv = i + 1
      const row = el('div', `menu-promo__level${lv <= level ? ' is-have' : ''}${lv === level + 1 ? ' is-next' : ''}`)
      const head = el('div', 'menu-promo__lv')
      head.append(el('span', 'ui-tag' + (lv <= level ? ' ui-tag--solid' : ' ui-tag--plain'), `${lv}단계`), el('span', '', def.titles[i]!))
      const list = el('ul', '')
      for (const g of gains) list.append(el('li', `is-${g.kind}`, g.text))
      if (gains.length === 0) list.append(el('li', '', '신화 개방'))
      row.append(head, list)
      ladder.append(row)
    })
    box.append(ladder)
    return box
  }

  /**
   * 한 신화 카드 (E12-06): 단계·칭호, 상시 효과(열려 있으면 늘), 추가 효과(고르면), 다음 단계 조건, 고르기 단추.
   */
  private mythCard(god: God): HTMLElement {
    const { progress, myths, loadout } = this.host
    const def = godDef(god)
    const level = progress.level(god)
    const stage = myths.stage(god)
    const chosen = loadout.manifested === god
    const card = el('section', `menu-myth${level === 0 ? ' is-closed' : ''}`)
    card.style.setProperty('--god', def.color)

    const head = el('div', 'menu-myth__head')
    head.append(img(level > 0 ? classIcon(def.name) : unknownSigil(), 'menu-myth__emblem'))
    const name = el('div', 'menu-myth__name')
    const title = el('div', 'menu-classes__title', level > 0 ? progress.title(god) : def.name)
    if (level > 0) title.append(pips(level))
    name.append(title, el('small', '', level > 0 ? def.name : '아직 열리지 않은 신화'))
    head.append(name)
    if (chosen) head.append(el('span', 'ui-tag ui-tag--solid menu-myth__chosen', '고른 신화'))
    card.append(head)

    // 상시 효과: 열린 신화면 고르지 않아도 늘 붙는다
    const always = el('div', 'menu-myth__part')
    always.append(el('b', '', '상시 효과'), el('small', '', stage > level ? '열려 있으면 늘 · 유물로 한 단계 위' : '열려 있으면 늘'))
    const alwaysList = el('ul', '')
    for (const line of alwaysLines(god, stage)) {
      alwaysList.append(el('li', line.active ? 'is-on' : '', line.active ? line.text : `${line.text} (${line.from}단계부터)`))
    }
    always.append(alwaysList)
    card.append(always)

    // 추가 효과: 고른 신화만
    const extra = el('div', `menu-myth__part${chosen ? '' : ' is-dim'}`)
    extra.append(el('b', '', '추가 효과'), el('small', '', '고른 신화만'))
    const extraList = el('ul', '')
    for (const g of levelGains(god, 1)) if (g.kind === 'power' || g.kind === 'damage') extraList.append(el('li', chosen ? 'is-on' : '', g.text))
    extraList.append(el('li', chosen ? 'is-on' : '', `궁극기 「${def.ultimate.name}」`))
    extra.append(extraList)
    card.append(extra)

    // 고르기: 열린 신화만, 마을·성소에서만
    if (level > 0 && !chosen) {
      const can = myths.canChoose()
      const button = el('button', 'menu-myth__choose', '이 신화 고르기')
      button.type = 'button'
      button.disabled = !can
      if (can) button.addEventListener('click', () => myths.choose(god) && this.render())
      else this.hintOn(button, '고른 신화는 마을이나 성소 곁에서만 바꿀 수 있다.')
      card.append(button)
    }

    // 다음 단계: 못 연 신화는 여는 법, 연 신화는 숙련과 전설
    if (level === 0) {
      const open = el('div', 'menu-myth__part')
      open.append(el('b', '', '여는 법'))
      const how = def.hidden ? '숨겨진 신화. 이 신의 유물을 모두 모으면 열린다.' : `${def.name}의 유물을 손에 넣거나, 그 신화권 몬스터를 잡아 숙련을 채운다.`
      open.append(el('p', '', how))
      if (!def.hidden) {
        const bar = el('div', 'ui-bar ui-bar--thin')
        bar.style.setProperty('--fill', def.color)
        bar.style.setProperty('--pct', progress.xpRatio(god).toFixed(3))
        open.append(bar)
      }
      card.append(open)
    } else card.append(this.promotionGuide(god))
    return card
  }

  private renderClasses(): void {
    const { progress, loadout } = this.host
    const tree = DATA.classes
    const wrap = el('div', 'menu-classes')
    const levelOf = (god: God | undefined): number => (god ? progress.level(god) : 0)

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
              ? `「${god.legend.name}」\n성소의 결계 안에서 증명하면 ${next}`
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
      this.hintOn(now, '한 신의 유물을 손에 넣으면 그 신의 힘이 깨어난다.')
    }
    wrap.append(now)

    // 눌러 본 신화(없으면 고른 신화)의 카드: 상시·추가 효과, 다음 단계, 고르기 (E12-06)
    const focus = this.selectedMyth ?? current
    if (focus) wrap.append(this.mythCard(focus))

    // 원천 넷: 이름, 차오르는 때, 숙련은 보석 점으로
    const sigils = el('div', 'menu-classes__sources')
    for (const x of tree.sources) {
      const value = progress.mastery(x.id)
      const known = tree.mythologies.some((m) => m.classes.some((c) => c.source === x.id && levelOf(c.god) > 0))
      const cell = el('span', `menu-classes__source${known ? ' is-known' : ''}`)
      cell.style.setProperty('--god', SOURCE_COLORS[x.id]![0])
      cell.append(img(sourceSigil(x.id, known)))
      const words = el('span', 'menu-classes__source-words')
      words.append(el('b', '', x.name), el('small', '', x.gain))
      cell.append(words)
      if (value > 0) cell.append(pips(Math.min(value, 4), 4))
      this.hintOn(cell, `${x.name}\n${x.gain} 차오르는 힘. 같은 원천의 신화가 단계를 올릴 때마다 숙련이 오르고, 지금 신화가 그 원천이면 피해가 늘어난다.${value > 0 ? `\n숙련 ${value}` : ''}`)
      sigils.append(cell)
    }
    wrap.append(sigils)

    // 신들의 지도
    const node = (open: boolean, label: string, hint: string, extra = '', color?: string, icon?: string, god?: God): HTMLElement => {
      const chip = el('button', `menu-tree__node${open ? ' is-open' : ''}${extra}${god && god === focus ? ' is-selected' : ''}`)
      chip.type = 'button'
      // 게임에 들어 있는 신화는 누르면 위 카드로 본다
      if (god)
        chip.addEventListener('click', () => {
          this.selectedMyth = god
          this.render()
        })
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
            ? node(true, title, `${c.name}\n${c.hint}`, '', color, classIcon(c.name), c.god)
            : node(false, c.name, c.hint, c.god ? ' is-near' : '', undefined, undefined, c.god),
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

    // 원천의 높은 자리: 그 원천의 신이 한 번이라도 승급한 뒤에 나타난다. 짝은 두 원천 모두 승급한 뒤에.
    const heights = el('div', 'menu-tree__heights')
    const count = (source: string, minLevel: number) =>
      [...tree.mythologies.flatMap((m) => m.classes), ...tree.hidden].filter((c) => c.source === source && levelOf(c.god) >= minLevel).length
    for (const x of tree.sources) {
      if (count(x.id, 2) === 0) continue
      const pair = el('span', 'menu-tree__height')
      pair.append(img(sourceSigil(x.id)))
      pair.append(node(count(x.id, 3) >= 2, x.upper.name, x.upper.hint))
      heights.append(pair)
    }
    for (const p of tree.pairs) {
      if (p.sources.some((s) => count(s, 2) === 0)) continue
      const pair = el('span', 'menu-tree__height')
      pair.append(img(sourceSigil(p.sources[0])), img(sourceSigil(p.sources[1])))
      pair.append(node(p.sources.every((s) => count(s, 3) >= 1), p.name, p.hint))
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

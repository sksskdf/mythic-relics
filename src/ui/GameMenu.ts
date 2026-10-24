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
import { type Cycle, LAWS, type LawId, REBIRTH_NEED, RING_NEXT, RING_PREV, STARS, type StarId, TRAINING_TEXT, UNLOCKS } from '../progress/Cycle'
import { allLevelGains, levelGains } from '../myth/levelGains'
import type { SourceId } from '../data/schema'
import { shortNumber } from './format'
import { type God, godDef, relicDef, type RelicId } from '../relics/data'
import type { LoadoutState } from '../myth/manifest'
import { relicCard, type RelicCardContext, relicIcon } from './relicCard'
import { classIcon } from './classIcons'
import { smallSigilRing } from './emblem'
import { glyph, SOURCE_COLORS, sourceSigil, unknownSigil } from './sigils'
import { type WardrobeHost, WardrobePane } from './WardrobePane'
import './menu.css'

export type MenuTab = 'status' | 'cycle' | 'relics' | 'classes' | 'looks'

/** 탭은 그림으로만 보여 주고, 이름은 올렸을 때 힌트로 띄운다. */
const TABS: readonly [MenuTab, MenuTab, string][] = [
  ['status', 'status', '상태'],
  ['cycle', 'cycle', '순환'],
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
  cycle: '순환\n원천 결정으로 단련하고, 윤회해 더 빨리 강해진다',
  relics: '유물\n낀 유물과 가방. 눌러서 바꿔 끼고, 바꾸면 어떻게 되는지 미리 본다',
  classes: '신화\n지금 신화의 개방 단계와 다음 단계로 가는 법, 만난 신들',
  looks: '외형\n부위마다 보이는 모습을 고른다',
}

/** 순환 탭의 ? 설명 */
const CYCLE_HELP = {
  cycle: '순환\n싸울수록 원천 결정이 모이고, 결정으로 단련하고, 신화 개방 단계와 윤회를 거칠수록 같은 길을 더 빨리 강해지며 지나간다. 단계마다 새 장치가 열린다.',
  train: '단련 (2고리)\n원천 결정을 써서 그 원천의 능력치를 올린다. 오를수록 비싸지고, 개방 단계가 오를 때마다 싸진다. 한 원천을 단련하면 고리의 다음 원천(바람→불꽃→사냥→바위→바람) 결정이 4%씩 더 들어온다.',
  rebirth: '윤회 (4고리)\n세계를 처음으로 되돌린다. 단련과 결정은 사라지고 유물·개방 단계는 남는다. 재와 영구 배율 +10%를 얻고, 윤회할수록 새 장치가 열린다.',
  stars: '별자리\n윤회의 재로 별을 밝혀 영구히 강해진다. 윤회해도 사라지지 않는다.',
  auto: '자동 단련\n살 수 있는 단련 중 가장 싼 것을 1.2초마다 저절로 올린다.',
  resonance: '원천 공명\n두 원천의 단련이 모두 Lv5 이상이면 그 원천들의 결정이 10% 더 들어온다.',
  doom: '종말 (5고리)\n종말 보스를 불러 쓰러뜨리면 윤회의 규칙을 바꾸는 태초의 법을 하나 고른다.',
  challenge: '도전\n다음 윤회에 원천 하나를 끊고 한 판을 끝내면, 그 원천 결정이 영구히 25% 더 들어온다.',
}

/** 순환 탭이 게임에서 읽고 부르는 것 */
export interface CycleHost {
  readonly state: Cycle
  train(source: SourceId, count: number): number
  rebirth(challenge: SourceId | null): boolean
  lightStar(id: StarId): boolean
  chooseLaw(id: LawId): boolean
  summonDoom(): boolean
  readonly doomActive: boolean
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
  readonly cycle: CycleHost
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
  /** 다음 윤회에 걸 도전 */
  private nextChallenge: SourceId | null = null
  /** 단련 단위 */
  private trainUnit: 1 | 10 | 100 | 'max' = 1
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
    else if (this.tab === 'cycle') this.renderCycle()
    else if (this.tab === 'relics') this.renderRelics()
    else if (this.tab === 'classes') this.renderClasses()
    else this.wardrobe.render(this.body)
  }

  // ───────────────────────────── 순환 ─────────────────────────────

  /**
   * 순환 탭 (E4.5 회색 박스): 원천 넷의 단련, 윤회, 그리고 윤회할수록 하나씩 열리는 장치.
   * 아직 열리지 않은 장치는 자물쇠와 "윤회 n회"만 보여 준다.
   */
  private renderCycle(): void {
    const { cycle } = this.host
    const c = cycle.state
    const wrap = el('div', 'menu-cycle')
    const sourceName = (id: SourceId) => DATA.classes.sources.find((x) => x.id === id)!.name
    /** 제목 옆의 ?: 올리거나 누르면 그 단계의 설명 */
    const titled = (text: string, help: string): HTMLElement => {
      const t = el('div', 'menu-cycle__title', text)
      const q = el('span', 'menu-cycle__help', '?')
      this.hintOn(q, help)
      t.append(q)
      return t
    }

    // 순환 전체: 첫 발현 전에는 잠겨 있다. 결정은 그 전에도 모인다.
    if (!c.opened.has('train')) {
      const locked = el('section', 'menu-cycle__panel is-locked')
      locked.append(titled('순환', CYCLE_HELP.cycle))
      const lock = el('div', 'menu-cycle__lock')
      lock.append(img(glyph('lock', '#5d6876', '#2a3240')), el('span', '', '한 신의 유물을 모두 끼워 그 힘을 깨우면 열린다'))
      locked.append(lock, el('div', 'menu-cycle__text', `모아 둔 결정: ${DATA.classes.sources.map((x) => `${x.name} ${shortNumber(c.essence[x.id])}`).join(' · ')}`))
      wrap.append(locked)
      this.body.append(wrap)
      return
    }

    // 단련 단위
    const units = el('div', 'menu-cycle__units')
    units.append(titled('단련', CYCLE_HELP.train))
    const unitBox = el('div', 'menu-cycle__unit-box')
    for (const u of [1, 10, 100, 'max'] as const) {
      const b = el('button', `ui-pill${this.trainUnit === u ? ' is-on' : ''}`, u === 'max' ? '최대' : `×${u}`)
      b.type = 'button'
      b.addEventListener('click', () => {
        this.trainUnit = u
        this.render()
      })
      unitBox.append(b)
    }
    units.append(unitBox)
    wrap.append(units)

    // 원천 넷
    const grid = el('div', 'menu-cycle__sources')
    for (const x of DATA.classes.sources) {
      const card = el('section', 'menu-cycle__source')
      card.style.setProperty('--god', SOURCE_COLORS[x.id]![0])
      const head = el('div', 'menu-cycle__head')
      head.append(img(sourceSigil(x.id)), el('b', '', x.name), el('small', '', `${x.gain} 모인다`))
      card.append(head)
      const amount = el('div', 'menu-cycle__amount')
      amount.append(el('b', '', shortNumber(c.essence[x.id])), el('span', 'ui-tag ui-tag--plain', `×${c.gainScale(x.id).toFixed(2)}`))
      this.hintOn(amount, `${x.name} 결정\n들어오는 배율 ×${c.gainScale(x.id).toFixed(2)}: 숙련, 고리의 앞 원천(${sourceName(RING_PREV[x.id])}) 단련, 윤회, 별자리${c.resonating(x.id) ? ', 공명' : ''}${c.challenge === x.id ? '\n도전 중이라 들어오지 않는다' : ''}`)
      card.append(amount)
      const level = c.training[x.id]
      card.append(el('div', 'menu-cycle__now', level > 0 ? TRAINING_TEXT[x.id](level) : '아직 단련하지 않았다'))
      card.append(el('div', 'menu-cycle__next', `다음: ${TRAINING_TEXT[x.id](level + 1)} · ${sourceName(RING_NEXT[x.id])} 결정 +${(level + 1) * 4}%`))
      const want = this.trainUnit === 'max' ? Infinity : this.trainUnit
      const q = c.quote(x.id, want)
      const btn = el('button', 'menu-cycle__train')
      btn.type = 'button'
      btn.disabled = q.levels === 0
      const gainLv = q.levels > 0 ? q.levels : 1
      btn.append(el('span', '', `Lv${level} → ${level + gainLv}`), el('b', '', shortNumber(q.cost)))
      btn.addEventListener('click', () => {
        if (cycle.train(x.id, want) > 0) this.render()
      })
      card.append(btn)
      grid.append(card)
    }
    wrap.append(grid)

    // 윤회
    const rebirth = el('section', 'menu-cycle__panel')
    rebirth.append(titled(`윤회${c.rebirths > 0 ? ` · ${c.rebirths}회` : ''}`, CYCLE_HELP.rebirth))
    if (!c.opened.has('rebirth')) {
      rebirth.classList.add('is-locked')
      const lock = el('div', 'menu-cycle__lock')
      lock.append(img(glyph('lock', '#5d6876', '#2a3240')), el('span', '', '신화가 처음으로 2단계가 되면 열린다'))
      rebirth.append(lock)
      wrap.append(rebirth)
      this.body.append(wrap)
      return
    }
    const bar = el('div', 'ui-bar ui-bar--thin')
    bar.style.setProperty('--fill', 'var(--c-moon)')
    bar.style.setProperty('--pct', Math.min(1, c.runTotal / REBIRTH_NEED).toFixed(3))
    const ash = c.ashForRebirth()
    const row = el('div', 'menu-cycle__row')
    row.append(
      el('span', '', ash > 0 ? `지금 윤회하면 재 +${ash}, 모든 결정 ×${(1 + (c.rebirths + 1) * 0.1).toFixed(1)}` : `이번 판에 결정 ${shortNumber(c.runTotal)} / ${REBIRTH_NEED}`),
    )
    const go = el('button', 'menu-cycle__go')
    go.type = 'button'
    go.disabled = ash <= 0
    go.textContent = '윤회'
    go.addEventListener('click', () => {
      if (!go.classList.contains('is-confirm')) {
        go.classList.add('is-confirm')
        go.textContent = '한 번 더: 단련·결정이 사라진다'
        return
      }
      if (cycle.rebirth(this.nextChallenge)) {
        this.nextChallenge = null
        this.render()
      }
    })
    row.append(go)
    rebirth.append(bar, row)
    wrap.append(rebirth)

    // 차례로 열리는 장치
    const devices = el('div', 'menu-cycle__devices')
    const device = (at: number, name: string, help: string, body: () => HTMLElement | null) => {
      const box = el('section', `menu-cycle__panel${c.rebirths >= at ? '' : ' is-locked'}`)
      box.append(titled(c.rebirths >= at ? name : '?', c.rebirths >= at ? help : `윤회 ${at}회에 열리는 장치`))
      if (c.rebirths < at) {
        const lock = el('div', 'menu-cycle__lock')
        lock.append(img(glyph('lock', '#5d6876', '#2a3240')), el('span', '', `윤회 ${at}회에 열린다`))
        box.append(lock)
      } else {
        const content = body()
        if (content) box.append(content)
      }
      devices.append(box)
    }
    device(UNLOCKS.rebirthToStars, `별자리 · 재 ${c.ash}`, CYCLE_HELP.stars, () => {
      const list = el('div', 'menu-cycle__stars')
      for (const id of Object.keys(STARS) as StarId[]) {
        const def = STARS[id]
        const level = c.star(id)
        const b = el('button', 'menu-cycle__star')
        b.type = 'button'
        b.disabled = level >= def.max || c.ash < def.cost(level)
        b.append(img(glyph('star', level > 0 ? '#ffd27a' : '#8d98a6', level > 0 ? '#a8862e' : '#3a4558')), el('b', '', def.name), el('small', '', level > 0 ? def.text(level) : def.text(1)))
        const gems = el('span', 'ui-gems ui-gems--small')
        gems.style.setProperty('--gem', '#ffd27a')
        for (let i = 0; i < def.max; i++) gems.append(el('i', i < level ? 'is-on' : ''))
        b.append(gems, el('span', 'menu-cycle__cost', level >= def.max ? '다 밝힘' : `재 ${def.cost(level)}`))
        b.addEventListener('click', () => {
          if (cycle.lightStar(id)) this.render()
        })
        list.append(b)
      }
      return list
    })
    device(UNLOCKS.autoTrain, '자동 단련', CYCLE_HELP.auto, () => el('div', 'menu-cycle__text', '살 수 있는 단련 중 가장 싼 것을 저절로 올린다.'))
    device(UNLOCKS.resonance, '원천 공명', CYCLE_HELP.resonance, () => {
      const on = DATA.classes.sources.filter((x) => c.resonating(x.id)).map((x) => x.name)
      return el('div', 'menu-cycle__text', on.length > 0 ? `공명 중: ${on.join(', ')} 결정 +10%` : '두 원천의 단련이 모두 Lv5가 되면 서로 결정 +10%.')
    })
    device(UNLOCKS.doom, `종말${c.dooms > 0 ? ` · ${c.dooms}회` : ''}`, CYCLE_HELP.doom, () => {
      const box = el('div', 'menu-cycle__doom')
      if (c.lawPending) {
        box.append(el('div', 'menu-cycle__text', '태초의 법을 하나 고른다. 윤회의 규칙이 바뀐다.'))
        for (const id of Object.keys(LAWS) as LawId[]) {
          if (c.laws.includes(id)) continue
          const b = el('button', 'menu-cycle__law')
          b.type = 'button'
          b.append(el('b', '', LAWS[id].name), el('small', '', LAWS[id].text))
          b.addEventListener('click', () => {
            if (cycle.chooseLaw(id)) this.render()
          })
          box.append(b)
        }
      } else {
        const b = el('button', 'menu-cycle__go')
        b.type = 'button'
        b.disabled = cycle.doomActive
        b.textContent = cycle.doomActive ? '종말 보스가 와 있다' : '종말 보스 부르기'
        b.addEventListener('click', () => {
          if (cycle.summonDoom()) this.toggle(false)
        })
        box.append(b)
      }
      if (c.laws.length > 0) box.append(el('div', 'menu-cycle__text', `태초의 법: ${c.laws.map((l) => LAWS[l].name).join(', ')}`))
      return box
    })
    device(UNLOCKS.challenge, '도전', CYCLE_HELP.challenge, () => {
      const box = el('div', 'menu-cycle__challenges')
      box.append(el('div', 'menu-cycle__text', c.challenge ? `지금 도전: ${sourceName(c.challenge)} 없이. 다음 윤회 때 끝난다.` : '다음 윤회에 걸 도전을 고른다. 그 원천 결정 없이 한 판을 끝내면 그 원천이 영구히 +25%.'))
      for (const x of DATA.classes.sources) {
        const b = el('button', `ui-pill${this.nextChallenge === x.id ? ' is-on' : ''}${c.cleared.has(x.id) ? ' is-done' : ''}`)
        b.type = 'button'
        b.append(img(sourceSigil(x.id)), `${x.name} 없이${c.cleared.has(x.id) ? ' ✓' : ''}`)
        b.addEventListener('click', () => {
          this.nextChallenge = this.nextChallenge === x.id ? null : x.id
          this.render()
        })
        box.append(b)
      }
      return box
    })
    wrap.append(devices)
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

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

export type MenuTab = 'status' | 'sources' | 'relics' | 'classes' | 'trials' | 'rift' | 'map' | 'looks'

/** 탭은 그림으로만 보여 주고, 이름은 올렸을 때 힌트로 띄운다. */
const TABS: readonly [MenuTab, Parameters<typeof glyph>[0], string][] = [
  ['status', 'status', '상태'],
  ['sources', 'cycle', '원천'],
  ['relics', 'relics', '장비'],
  ['classes', 'classes', '신화'],
  ['trials', 'scroll', '시련'],
  ['rift', 'star', '균열'],
  ['map', 'map', '지도'],
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
  trials: '시련\n제약을 건 전설. 깨면 그 제약과 이어진 힘이 영구히 붙는다',
  rift: '균열\n한계를 깨면 열리는 끝없는 층과, 별을 밝히는 성좌판',
  map: '지도\n마을에서 신화권마다 뻗은 땅 열다섯. 찾은 성소는 빛나고, 워프가 열리면 눌러서 간다',
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

/** 시련 탭이 게임에서 읽고 부르는 것 (E16-04) */
export interface TrialsHost {
  /** 위협 3단계에 열린다 */
  open(): boolean
  /** 지금 시련을 열 수 없는 까닭 (열 수 있으면 null) */
  blocked(): string | null
  /** 시련마다: 이름, 제약, 보상(한 단계마다), 깬 난이도, 난이도마다 가장 빠른 기록(초) */
  list(): { id: string; name: string; rule: string; reward: string; per: string; cleared: number; best: (number | null)[] }[]
  /** 깬 난이도의 합과 마일스톤 */
  total(): number
  milestones(): { at: number; name: string; text: string }[]
  /** 균열 보상 배율 (E17) */
  riftScale(): number
  start(id: string, level: number): boolean
}

/** 균열 탭이 게임에서 읽고 부르는 것 (E17) */
export interface RiftMenuHost {
  /** 한계를 깼나 (균열이 열렸다) */
  open(): boolean
  /** 한계를 깨는 길: 신화권마다 이긴 가장 높은 위협 단계 */
  progress(): { name: string; cleared: number }[]
  canEnter(): boolean
  enter(): boolean
  /** 진행 중인 균열: 층과 고른 축복 이름 */
  run(): { depth: number; blessings: string[] } | null
  best(): number
  stars(): number
  /** 균열 보상 배율 (시련 기록) */
  scale(): number
  /** 성좌판: 별마다 신화 이름·색·자리·이웃, 밝혔나, 지금 밝힐 수 있나 */
  chart(): { god: string; name: string; color: string; x: number; y: number; neighbors: string[]; lit: boolean; can: boolean }[]
  light(god: string): boolean
}

/** 지도 탭이 게임에서 읽고 부르는 것 (E15-04) */
export interface WorldMapHost {
  /** 지역마다: 이름, 신화권 색, 자리(입구·깊은 땅·보스), 지도 위 자리, 이웃, 지금 여기인가, 성소를 찾았나, 그 신화권 보스를 이긴 가장 높은 위협 단계 */
  nodes(): { id: string; name: string; color: string; zone: string | null; x: number; y: number; links: string[]; here: boolean; found: boolean; cleared: number }[]
  /** 성소 워프가 열렸나 */
  canWarp(): boolean
  warp(id: string): boolean
}

/** 원천 탭이 게임에서 읽고 부르는 것 */
export interface SourcesHost {
  /** 원천마다: 장비 합, 숙련, 합계, 각성 단계 */
  rows(): { id: SourceId; gear: number; mastery: number; total: number; level: number }[]
  readonly threat: { level: number; unlocked: number; reached: number; battle: number; pour: number; resonance: number; max: number }
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
    next(god: God): { name: string; stage: number; materials: { name: string; have: number; need: number }[]; base?: { part: string; ok: boolean; item?: string } } | null
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
  readonly world: WorldMapHost
  readonly trials: TrialsHost
  readonly rift: RiftMenuHost
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
    else if (this.tab === 'map') this.renderMap()
    else if (this.tab === 'trials') this.renderTrials()
    else if (this.tab === 'rift') this.renderRift()
    else this.wardrobe.render(this.body)
  }

  // ───────────────────────────── 시련 ─────────────────────────────

  /**
   * 시련 탭 (E16-04): 제약 여덟과 난이도 다섯, 내 기록과 영구 보상, 깬 수의 합 마일스톤.
   * 필드 성소 결계 안에서 난이도를 누르면 그 자리에서 시작한다. 다음 난이도는 앞 난이도를 깨야 열린다.
   */
  private renderTrials(): void {
    const { trials } = this.host
    const wrap = el('div', 'menu-src')
    const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
    const head = el('section', 'menu-src__panel')
    const title = el('div', 'menu-src__title', `시련 · 깬 난이도 ${trials.total()}`)
    head.append(title)
    const blocked = trials.blocked()
    head.append(el('div', 'menu-src__text', !trials.open() ? (blocked ?? '') : blocked ? `${blocked} · 고르면 바로 시작한다` : '성소 결계 안이다. 난이도를 누르면 바로 시작한다'))
    wrap.append(head)
    if (!trials.open()) {
      this.body.append(wrap)
      return
    }
    const grid = el('div', 'menu-trials')
    for (const t of trials.list()) {
      const card = el('section', `menu-src__source${t.cleared > 0 ? ' is-awake' : ''}`)
      card.style.setProperty('--god', 'var(--c-gold-soft)')
      const top = el('div', 'menu-src__head')
      top.append(el('b', '', t.name))
      const gems = el('div', 'ui-gems ui-gems--small')
      for (let i = 0; i < 5; i++) gems.append(el('i', i < t.cleared ? 'is-on' : ''))
      top.append(gems)
      card.append(top, el('div', 'menu-src__line is-on', t.rule), el('div', 'menu-src__line', `깬 단계마다 ${t.reward} ${t.per}`))
      const levels = el('div', 'menu-src__levels')
      for (let n = 1; n <= 5; n++) {
        const best = t.best[n - 1]
        const b = el('button', `menu-src__level${n <= t.cleared ? ' is-on' : n === t.cleared + 1 ? ' is-next' : ' is-locked'}`, String(n))
        b.type = 'button'
        b.disabled = blocked !== null || n > t.cleared + 1
        this.hintOn(b, `${t.name} ${n}단계\n${best ? `가장 빠른 기록 ${fmt(best)}` : n > t.cleared + 1 ? '앞 단계를 깨야 열린다' : '아직 기록 없음'}`)
        b.addEventListener('click', () => trials.start(t.id, n) && this.toggle(false))
        levels.append(b)
      }
      card.append(levels)
      grid.append(card)
    }
    wrap.append(grid)
    const ms = el('section', 'menu-src__panel')
    ms.append(el('div', 'menu-src__title', '깬 난이도의 합'))
    for (const m of trials.milestones()) {
      const line = el('div', `menu-src__conv${trials.total() >= m.at ? ' is-on' : ''}`)
      line.append(el('b', '', `${m.at} · ${m.name}`), el('small', '', m.text))
      ms.append(line)
    }
    ms.append(el('div', 'menu-src__text', `기록이 빠를수록 균열 보상이 커진다 (지금 ×${trials.riftScale().toFixed(2)})`))
    wrap.append(ms)
    this.body.append(wrap)
  }

  // ───────────────────────────── 균열 ─────────────────────────────

  /**
   * 균열 탭 (E17): 한계를 깨는 길, 균열 들어가기와 지금 층·축복, 깊이 기록, 성좌판.
   * 성좌판의 별은 이웃한 별이 밝혀졌을 때만(첫 별은 열린 신화 아무것이나) 눌러 밝힌다.
   */
  private renderRift(): void {
    const { rift } = this.host
    const wrap = el('div', 'menu-src')
    const head = el('section', 'menu-src__panel')
    if (!rift.open()) {
      head.append(el('div', 'menu-src__title', '균열 · 닫힘'))
      head.append(el('div', 'menu-src__text', '다섯 신화권의 보스를 모두 위협 10단계에서 이기면 한계를 깨고 균열이 열린다'))
      const row = el('div', 'menu-src__levels')
      for (const p of rift.progress()) row.append(el('span', `ui-pill${p.cleared >= 10 ? ' is-done' : ''}`, `${p.name} ${p.cleared}/10`))
      head.append(row)
    } else {
      const run = rift.run()
      head.append(el('div', 'menu-src__title', run ? `균열 ${run.depth}층` : `균열 · 가장 깊이 ${rift.best()}층`))
      if (run) head.append(el('div', 'menu-src__text', run.blessings.length ? `축복: ${run.blessings.join(', ')}` : '층의 적을 모두 쓰러뜨리면 축복을 고르고 다음 층 문이 열린다'))
      else {
        const go = el('button', 'menu-src__level is-next', '균열에 들어가기')
        go.type = 'button'
        go.disabled = !rift.canEnter()
        go.addEventListener('click', () => rift.enter() && this.toggle(false))
        head.append(go, el('div', 'menu-src__text', rift.canEnter() ? '들어갈 때마다 1층부터. 나오거나 쓰러지면 축복은 사라지고 기록·재료·별만 남는다' : '마을에서 들어갈 수 있다'))
      }
      head.append(el('div', 'menu-src__text', `보상 배율 ×${rift.scale().toFixed(2)} (시련 기록) · 처음 닿은 5층마다 별 하나, 종말 보스는 별 둘`))
    }
    wrap.append(head)

    // 성좌판
    const chart = rift.chart()
    const board = el('section', 'menu-src__panel')
    board.append(el('div', 'menu-src__title', `성좌판 · 별 ${rift.stars()}`))
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('class', 'menu-stars')
    svg.setAttribute('viewBox', '-1.25 -1.25 2.5 2.5')
    const at = new Map(chart.map((c) => [c.god, c]))
    for (const c of chart) {
      for (const n of c.neighbors) {
        const m = at.get(n)
        if (!m || m.god < c.god) continue
        const line = document.createElementNS(NS, 'line')
        line.setAttribute('x1', String(c.x))
        line.setAttribute('y1', String(c.y))
        line.setAttribute('x2', String(m.x))
        line.setAttribute('y2', String(m.y))
        line.setAttribute('class', `menu-stars__link${c.lit && m.lit ? ' is-lit' : ''}`)
        svg.append(line)
      }
    }
    for (const c of chart) {
      const dot = document.createElementNS(NS, 'circle')
      dot.setAttribute('cx', String(c.x))
      dot.setAttribute('cy', String(c.y))
      dot.setAttribute('r', '0.08')
      dot.setAttribute('class', `menu-stars__star${c.lit ? ' is-lit' : ''}${c.can ? ' can-light' : ''}`)
      dot.style.setProperty('--realm', c.color)
      dot.addEventListener('click', () => c.can && rift.light(c.god) && this.render())
      const tip = document.createElementNS(NS, 'title')
      tip.textContent = `${c.name} · ${c.lit ? '밝혔다: 상시 효과 한 단계 위' : c.can ? '눌러서 밝힌다 (별 하나)' : '이웃한 별을 먼저 밝혀야 한다'}`
      dot.append(tip)
      svg.append(dot)
    }
    board.append(svg, el('div', 'menu-src__text', '밝힌 별: 그 신화의 상시 효과가 한 단계 위로 돈다 (5단계까지). 이웃한 별만 밝힐 수 있다'))
    wrap.append(board)
    this.body.append(wrap)
  }

  // ───────────────────────────── 지도 ─────────────────────────────

  /**
   * 지도 탭 (E15-04): 마을이 가운데, 신화권마다 입구 들판 → 깊은 땅 → 보스의 땅이 한 줄로 뻗는다.
   * 지금 있는 곳은 테두리, 찾은 성소는 채운 점. 워프가 열렸으면 찾은 성소를 눌러 바로 간다.
   */
  private renderMap(): void {
    const { world } = this.host
    const nodes = world.nodes()
    const warp = world.canWarp()
    const wrap = el('div', 'menu-map')
    const NS = 'http://www.w3.org/2000/svg'
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('class', 'menu-map__svg')
    svg.setAttribute('viewBox', '-3.7 -3.7 7.4 7.4')
    const byId = new Map(nodes.map((n) => [n.id, n]))
    for (const n of nodes) {
      for (const to of n.links) {
        const m = byId.get(to)
        if (!m || m.id < n.id) continue
        const line = document.createElementNS(NS, 'line')
        line.setAttribute('x1', String(n.x))
        line.setAttribute('y1', String(n.y))
        line.setAttribute('x2', String(m.x))
        line.setAttribute('y2', String(m.y))
        line.setAttribute('class', 'menu-map__road')
        svg.append(line)
      }
    }
    const labels = el('div', 'menu-map__labels')
    for (const n of nodes) {
      const g = document.createElementNS(NS, 'g')
      g.setAttribute('class', `menu-map__node${n.here ? ' is-here' : ''}${n.found ? ' is-found' : ''}${warp && n.found && !n.here ? ' can-warp' : ''}`)
      g.style.setProperty('--realm', n.color)
      const shape = document.createElementNS(NS, n.zone === 'boss' ? 'rect' : 'circle')
      if (n.zone === 'boss') {
        shape.setAttribute('x', String(n.x - 0.2))
        shape.setAttribute('y', String(n.y - 0.2))
        shape.setAttribute('width', '0.4')
        shape.setAttribute('height', '0.4')
        shape.setAttribute('transform', `rotate(45 ${n.x} ${n.y})`)
      } else {
        shape.setAttribute('cx', String(n.x))
        shape.setAttribute('cy', String(n.y))
        shape.setAttribute('r', n.zone === null ? '0.32' : '0.22')
      }
      g.append(shape)
      svg.append(g)
      // 이름은 HTML로 얹는다 (갈무리 글꼴, 정해진 크기)
      const label = el('button', `menu-map__label${n.here ? ' is-here' : ''}`)
      label.type = 'button'
      label.style.left = `${((n.x + 3.7) / 7.4) * 100}%`
      label.style.top = `${((n.y + 3.7) / 7.4) * 100}%`
      label.append(el('span', '', n.name))
      if (n.zone === 'boss' && n.cleared > 0) label.append(el('small', '', `${n.cleared}단계 이김`))
      label.disabled = !(warp && n.found && !n.here)
      label.addEventListener('click', () => world.warp(n.id) && this.toggle(false))
      this.hintOn(label, () => {
        const zone = n.zone === 'entrance' ? '입구 들판' : n.zone === 'deep' ? '깊은 땅 (정예가 많다)' : n.zone === 'boss' ? '보스의 땅' : '마을'
        const how = n.here ? '지금 여기' : warp ? (n.found ? '누르면 워프' : '성소를 찾으면 워프할 수 있다') : n.found ? '성소를 찾았다' : '아직 성소를 찾지 못했다'
        return `${n.name}\n${zone} · ${how}`
      })
      labels.append(label)
    }
    const board = el('div', 'menu-map__board')
    board.append(svg, labels)
    wrap.append(board)
    wrap.append(el('div', 'menu-src__text', warp ? '찾은 성소를 누르면 워프한다' : '성소 워프는 위협 2단계에 열린다 (정보 화면 › 원천 › 편의)'))
    this.body.append(wrap)
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
    for (let n = 1; n <= Math.max(THREAT_MAX, t.unlocked); n++) {
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
      threat.append(el('div', 'menu-src__text', t.unlocked >= t.max ? '가장 높은 단계까지 열었다' : `${t.unlocked}단계에서 지역 보스를 이기면 ${t.unlocked + 1}단계가 열린다`))
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
    // 미리보기는 누르면 실제로 낄 칸으로 본다
    const target = this.hovered ? this.wieldSlot(this.hovered) : undefined
    const preview = this.hovered && target !== undefined ? { before: host.loadout, after: host.preview(target, this.hovered) } : undefined
    detail.append(relicCard(relicDef(id), host.cardContext(id, preview)))
  }

  /** 가방의 것을 누르면 낄 칸: 고른 칸이 맞는 부위면 그 칸, 아니면 비어 있는 맞는 칸부터 */
  private wieldSlot(id: string): number | undefined {
    const fits = this.host.slotsFor(id)
    return fits.includes(this.selectedSlot) ? this.selectedSlot : (fits.find((i) => this.host.slots[i] === null) ?? fits[0])
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
      // 바탕은 사라지므로 어느 장비가 쓰이는지 이름으로 보인다 (가방 것부터)
      if (next.base) needs.append(el('span', next.base.ok ? 'is-ok' : 'is-short', `바탕: ${next.base.item ?? `${next.base.part} 장비`}`))
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

    // 원천 넷: 이름, 차오르는 때, 원천 숙련(위협 단계를 올릴 때 부은 것)은 보석 점으로
    const sigils = el('div', 'menu-classes__sources')
    const rows = this.host.sources.rows()
    for (const x of tree.sources) {
      const value = rows.find((r) => r.id === x.id)?.mastery ?? 0
      const known = tree.mythologies.some((m) => m.classes.some((c) => c.source === x.id && levelOf(c.god) > 0))
      const cell = el('span', `menu-classes__source${known ? ' is-known' : ''}`)
      cell.style.setProperty('--god', SOURCE_COLORS[x.id]![0])
      cell.append(img(sourceSigil(x.id, known)))
      const words = el('span', 'menu-classes__source-words')
      words.append(el('b', '', x.name), el('small', '', x.gain))
      cell.append(words)
      if (value > 0) cell.append(pips(Math.min(value, 4), 4))
      this.hintOn(cell, `${x.name}\n${x.gain} 차오르는 힘. 위협 단계를 올릴 때 전투 경험을 부어 숙련을 쌓으면 각성에 닿기 쉬워진다.${value > 0 ? `\n원천 숙련 ${value}` : ''}`)
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

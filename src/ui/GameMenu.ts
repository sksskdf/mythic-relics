import { smallSigilRing } from './emblem'
import { renderMap } from './menu/mapTab'
import { MythTab } from './menu/mythTab'
import { RelicsTab } from './menu/relicsTab'
import { renderRift } from './menu/riftTab'
import { renderSources } from './menu/sourcesTab'
import { renderStatus } from './menu/statusTab'
import { renderTrials } from './menu/trialsTab'
import { TrainingTab } from './menu/trainingTab'
import { el, img, type TabContext } from './menu/dom'
import type { MenuHost } from './menu/host'
import { glyph } from './sigils'
import { WardrobePane } from './WardrobePane'
import './menu.css'

export type MenuTab = 'status' | 'sources' | 'relics' | 'classes' | 'training' | 'trials' | 'rift' | 'map' | 'looks'

/** 탭: 그림과 이름 (좁은 화면에서는 고른 탭만 이름), 올리면 힌트 */
const TABS: readonly [MenuTab, Parameters<typeof glyph>[0], string][] = [
  ['status', 'status', '상태'],
  ['sources', 'cycle', '원천'],
  ['relics', 'relics', '장비'],
  ['classes', 'classes', '신화'],
  ['training', 'tree', '수련'],
  ['trials', 'scroll', '시련'],
  ['rift', 'star', '균열'],
  ['map', 'map', '지도'],
  ['looks', 'looks', '외형'],
]

/** 엔딩 뒤에만 보이는 탭 (E21-06) */
const ENDING_TABS: readonly MenuTab[] = ['trials', 'rift']

/** 탭에 올리면 나오는 설명 */
const TAB_HINTS: Record<MenuTab, string> = {
  status: '상태\n지금 내 능력치와 걸려 있는 힘',
  sources: '원천\n장비의 원천이 쌓여 각성한 힘 (엔딩 뒤에는 세계의 위협 단계와 손이 덜 가는 편의도)',
  relics: '유물\n낀 유물과 가방. 눌러서 바꿔 끼고, 바꾸면 어떻게 되는지 미리 본다',
  trials: '시련\n제약을 건 전설. 깨면 그 제약과 이어진 힘이 영구히 붙는다',
  rift: '균열\n한계를 깨면 열리는 끝없는 층과, 별을 밝히는 성좌판',
  map: '지도\n마을에서 북쪽으로 한 줄로 이어진 땅. 켠 성소와 마을은 눌러서 바로 간다',
  classes: '신화\n지금 신화의 개방 단계와 다음 단계로 가는 법, 만난 신들',
  training: '수련\n적을 잡아 얻은 깨달음으로 힘·몸·손 갈래의 마디를 익힌다. 언제든 무료로 되돌린다',
  looks: '외형\n부위마다 보이는 모습을 고른다',
}

/**
 * 정보 화면. (E4) HUD 오른쪽 위 책 단추로 연다. 열려 있는 동안 게임은 멈춘다.
 * 글을 최소로 쓰고 그림·점·막대로 보여 준다. 자세한 말은 올리거나 누를 때 힌트로만 띄운다. (DESIGN.md 2.1, 10.5)
 * 틀(탭 줄·힌트·여닫기)만 여기 있고, 탭마다 그리는 것은 `menu/` 아래 파일에 있다.
 */
export class GameMenu {
  readonly button: HTMLButtonElement
  private readonly window: HTMLElement
  private readonly body: HTMLElement
  private readonly tabButtons = new Map<MenuTab, HTMLButtonElement>()
  private readonly wardrobe: WardrobePane
  private tab: MenuTab = 'status'
  /** 탭이 쓰는 것 (게임, 힌트, 다시 그리기, 닫기) */
  private readonly ctx: TabContext
  /** 장비 탭 (고른 칸·커서를 올린 것을 기억한다) */
  private readonly relics: RelicsTab
  /** 신화 탭 (눌러 본 신화를 기억한다) */
  private readonly myths: MythTab
  /** 수련 탭 (손가락으로 한 번 누른 마디를 기억한다) */
  private readonly training: TrainingTab
  /** 힌트 말풍선 */
  private readonly hint: HTMLElement
  /** 열고 닫을 때 (게임 멈춤) */
  onToggle: (open: boolean) => void = () => {}

  constructor(parent: HTMLElement, host: MenuHost) {
    this.ctx = { host, hintOn: (target, text) => this.hintOn(target, text), render: () => this.render(), close: () => this.toggle(false) }
    this.relics = new RelicsTab(this.ctx)
    this.myths = new MythTab(this.ctx)
    this.training = new TrainingTab(this.ctx)
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
    // 손가락으로 띄운 힌트는 다음에 누를 때 거둔다 (힌트 칸이면 뗄 때 다시 뜬다)
    frame.addEventListener('pointerdown', (e) => e.pointerType !== 'mouse' && (this.hint.hidden = true))
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
    if (open) this.button.classList.remove('is-calling')
    if (open) this.render()
    this.onToggle(open)
  }

  /** 탭을 골라 연다. 유물 탭이면 칸을 함께 고를 수 있다. */
  show(tab: MenuTab, slot?: number): void {
    this.tab = tab
    this.fresh.delete(tab)
    if (tab === 'looks' || tab === this.pendingTab) this.button.classList.remove('has-new')
    if (tab === this.pendingTab) this.pendingTab = null
    if (slot !== undefined) this.relics.selectedSlot = slot
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

  /** 새로 열린 탭 (E236-05): 정보 화면을 열 때까지 단추가 빛나며 부르고, 열면 그 탭이 처음 볼 때까지 빛난다 */
  private readonly fresh = new Set<MenuTab>()

  callTab(tab: MenuTab): void {
    this.markTab(tab)
    this.fresh.add(tab)
    if (!this.open) this.button.classList.add('is-calling')
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
    target.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && show())
    target.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && (this.hint.hidden = true))
    // 손가락: 눌 수 없는(disabled) 단추에는 click이 오지 않는다. 떼는 순간 띄우고 다음에 누를 때까지 둔다
    target.addEventListener('pointerup', (e) => e.pointerType !== 'mouse' && show())
    target.addEventListener('click', show)
  }

  /** 탭 줄에 보이는 탭인가 */
  private tabShown(tab: MenuTab): boolean {
    const { host } = this.ctx
    if (tab === 'status') return true
    if (ENDING_TABS.includes(tab)) return host.afterEnding()
    return host.tabOpen(tab)
  }

  private render(): void {
    this.hint.hidden = true
    // 아직 열리지 않은 탭은 숨긴다: 시련·균열은 엔딩 뒤(E21-06), 나머지는 쓸 일이 생길 때 하나씩(E236-05)
    if (!this.tabShown(this.tab)) this.tab = 'status'
    for (const [id, b] of this.tabButtons) {
      b.classList.toggle('is-on', id === this.tab)
      b.classList.toggle('is-fresh', this.fresh.has(id) && id !== this.tab)
      b.hidden = !this.tabShown(id)
    }
    this.body.replaceChildren()
    const { ctx, body } = this
    if (this.tab === 'status') renderStatus(ctx, body)
    else if (this.tab === 'sources') renderSources(ctx, body)
    else if (this.tab === 'relics') this.relics.render(body)
    else if (this.tab === 'classes') this.myths.render(body)
    else if (this.tab === 'training') this.training.render(body)
    else if (this.tab === 'map') renderMap(ctx, body)
    else if (this.tab === 'trials') renderTrials(ctx, body)
    else if (this.tab === 'rift') renderRift(ctx, body)
    else this.wardrobe.render(body)
  }
}

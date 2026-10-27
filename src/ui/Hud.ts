import { classIcon } from './classIcons'
import './hud.css'
import { BOLT_ICON, pixelIcon } from './pixelIcon'
import { smallSigilRing } from './emblem'
import { shortNumber } from './format'
import { glyph, sourceSigil, unknownSigil } from './sigils'

export interface HudSlot {
  /** 유물 그림 주소. 빈 칸이면 null */
  icon: string | null
  /** 행동 연동 효과의 충전 정도 0~1 (1이면 다 참) */
  charge: number
  /** 이 유물이 있는 장비 칸 번호 (빈 칸이면 null) */
  slot: number | null
  /** 그 신화를 고르지 않아 유물의 힘이 잠들어 있다 (E21-04) */
  asleep?: boolean
}

export interface HudState {
  /** 생명력 비율 0~1 */
  life: number
  /** 신위 게이지 비율 0~1 */
  divine: number
  /** 보스 생명력 비율 0~1. 보스와 싸우지 않을 때는 null */
  boss: number | null
  /** 보스 막대 위에 보이는 이름 (E12-09). 이름 없는 막대(내기 전설의 처치 수)는 null */
  bossName?: string | null
  slots: readonly HudSlot[]
  /** 클래스가 발현되어 궁극기를 쓸 수 있는가 */
  ultimate: boolean
  /** 발현한 클래스의 경험치 바 0~1. 발현하지 않았으면 null */
  xp: number | null
  /** 경험치 바 색 (발현한 신의 대표 색) */
  xpColor: string
  /** 왼쪽 위 초상: 발현한 클래스. 발현하지 않았으면 null */
  portrait: { name: string; title: string; color: string; level: number } | null
  /** 원천 수치 (장비의 합 + 원천 숙련)와 각성 단계 0~3 (E14-02). 모두 0이면 감춘다 */
  sources: Readonly<Record<string, { value: number; level: number }>>
  /** 잠든 유물의 신들 (가호, E21-04에서 유물의 힘은 잠든다) */
  blessings: readonly { name: string; color: string }[]
  /** 경험치가 가득 차 승급 전설에 들어갈 수 있다 */
  promote: boolean
}

/** 유물 스킬 칸 수 */
export const SKILL_SLOTS = 4
/** 얻은 것 카드 하나가 다음 카드에 자리를 내주기 전에 보이는 시간 (ms). 카드 자체는 5초 뒤 사라진다 */
const GAINS_MIN_MS = 3000

/**
 * HUD: 왼쪽 위에 지금의 나, 아래 가운데에 떠 있는 묶음 하나. (DESIGN.md 10.5)
 * - 지금의 나: 발현한 클래스 초상, 레벨 보석, 걸린 힘 칩(가호, 승급 대기). 누르면 정보 화면의 상태 탭.
 * - 생명: 금속 테 안의 막대(parts.css). 깎인 만큼 밝은 잔상이 잠깐 남았다가 따라 줄어든다.
 * - 유물 칸 4개: 충전은 칸 위를 시계 방향으로 걷어 내는 그늘로, 다 차면 칸이 빛난다.
 * - 궁극기: 마름모 칸. 신위가 차는 만큼 둘레의 금빛 고리가 채워지고, 다 차면 숨 쉬듯 빛난다.
 * - 경험치: 화면 맨 아래 끝에서 끝까지 이어진 가는 줄 (발현했을 때만).
 * 스킬과 궁극기는 자동으로 나가므로 키 표시가 없고, 글 대신 막대와 그림으로 보여 준다. (텍스트 최소화)
 * 유물 칸에 커서를 올리면 설명 카드가 뜨고, 누르면 유물 화면이 열린다. (E4)
 */
export class Hud {
  readonly root: HTMLElement
  /** 유물 칸을 눌렀을 때 */
  onSlotClick: (slot: number) => void = () => {}
  /** 유물 칸에 커서를 올렸을 때 (벗어나면 slot이 null) */
  onSlotHover: (slot: number | null, anchor: DOMRect | null) => void = () => {}
  /** 왼쪽 위 초상을 눌렀을 때 */
  onPortraitClick: () => void = () => {}

  private readonly life: HTMLElement
  private readonly portrait: HTMLElement
  private readonly portraitIcon: HTMLImageElement
  private readonly gems: HTMLElement[] = []
  private readonly chips: HTMLElement
  private statusKey = ''
  private essenceBox!: HTMLElement
  private readonly essenceEls = new Map<string, { cell: HTMLElement; count: HTMLElement; shown: string; level: number }>()
  private statusTip = ''
  private readonly tip: HTMLElement
  private readonly ultimate: HTMLElement
  private readonly ultimateIcon: HTMLElement
  private readonly slotEls: { root: HTMLElement; icon: HTMLElement; src: string | null }[] = []
  private readonly bossBar: HTMLElement
  private readonly bossTrack: HTMLElement
  private readonly bossName: HTMLElement
  private readonly banner: HTMLElement
  /** 지역·전설 제목 띠 (E9-05): 문장과 양옆 띠, 이름 */
  private readonly card: HTMLElement
  private readonly toast: HTMLElement
  private readonly gains: HTMLElement
  /** 카드를 띄운 때(ms)와 기다리는 카드: 같은 때 열린 것(위협 단계 + 편의 등)이 서로 덮지 않게 차례로 보인다 */
  private gainsShownAt = -Infinity
  private readonly gainsQueue: (() => void)[] = []
  private gainsTimer: ReturnType<typeof setTimeout> | null = null
  private readonly flashEl: HTMLElement
  /** 화면 번쩍임: 설정에서 끌 수 있다 */
  flashEnabled = true
  private readonly xpBar: HTMLElement
  private readonly xpFill: HTMLElement
  private bossTrailRatio = 1
  private lifeTrailRatio = 1

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'hud'

    this.bossBar = this.el('div', 'hud__boss', this.root)
    this.bossTrack = this.bar('ui-bar ui-bar--capped hud__boss-track', this.bossBar)
    // 막대 아래에 등급과 이름 (E12-09)
    const bossHead = this.el('div', 'hud__boss-head', this.bossBar)
    this.el('span', 'hud__boss-grade', bossHead).textContent = '보스'
    this.bossName = this.el('span', 'hud__boss-name', bossHead)

    // 지금의 나
    const status = this.el('div', 'hud__status', this.root)
    this.portrait = this.el('button', 'ui-portrait is-empty hud__portrait', status)
    this.portrait.setAttribute('aria-label', '상태')
    this.portrait.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      this.onPortraitClick()
    })
    this.tipOn(this.portrait, () => (this.statusTip || '이름 없는 모험가\n한 신의 유물을 모두 끼면 그 신의 힘이 깨어난다.') + '\n누르면 자세한 상태')
    this.portraitIcon = document.createElement('img')
    this.portraitIcon.alt = ''
    this.portraitIcon.src = unknownSigil()
    this.portrait.append(this.portraitIcon)
    const side = this.el('div', 'hud__status-side', status)
    const gems = this.el('div', 'ui-gems ui-gems--small', side)
    for (let i = 0; i < 4; i++) this.gems.push(this.el('i', '', gems))
    this.chips = this.el('div', 'hud__chips', side)
    // 원천: 문장과 수 넷, 각성 단계만큼 문장이 밝아진다
    const essence = this.el('div', 'hud__essence', this.root)
    this.essenceBox = essence
    for (const id of ['flame', 'hunt', 'wind', 'stone']) {
      const cell = this.el('span', 'hud__essence-cell', essence)
      cell.append(this.img(sourceSigil(id)))
      const count = this.el('span', '', cell)
      count.textContent = '0'
      this.essenceEls.set(id, { cell, count, shown: '0', level: 0 })
    }
    this.tipOn(essence, '원천\n장비에 붙은 원천 수치의 합. 5·10·20을 넘을 때마다 그 원천이 한 단계씩 각성한다. 자세한 것은 정보 화면 › 원천.')

    this.banner = this.el('div', 'hud__banner', this.root)
    this.card = this.el('div', 'hud__card', this.root)
    this.toast = this.el('div', 'hud__toast', this.root)
    this.flashEl = this.el('div', 'hud__flash', this.root)
    this.gains = this.el('div', 'hud__gains', this.root)

    this.xpBar = this.el('div', 'hud__xp', this.root)
    this.xpFill = this.el('div', 'hud__xp-fill', this.xpBar)

    const dock = this.el('div', 'hud__dock', this.root)
    this.life = this.bar('ui-bar ui-bar--capped hud__life', dock)
    this.tipOn(this.life, '생명\n다 떨어지면 쓰러졌다가 잠시 뒤 일어난다.')

    const slots = this.el('div', 'hud__slots', dock)
    for (let i = 0; i < SKILL_SLOTS; i++) {
      const root = this.el('button', 'hud__slot hud__slot--empty', slots)
      root.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        this.onSlotHover(null, null)
        this.onSlotClick(i)
      })
      root.addEventListener('pointerenter', () => this.onSlotHover(i, root.getBoundingClientRect()))
      root.addEventListener('pointerleave', () => this.onSlotHover(null, null))
      const icon = this.el('div', 'hud__icon', root)
      this.el('div', 'hud__sweep', root)
      this.slotEls.push({ root, icon, src: null })
    }
    this.ultimate = this.el('div', 'hud__ult', slots)
    this.tipOn(this.ultimate, '궁극기\n싸울수록 둘레의 금빛 고리가 차오르고, 가득 차면 지금 신화의 궁극기가 저절로 나간다.')
    this.el('div', 'hud__ult-ring', this.ultimate)
    this.ultimateIcon = this.el('div', 'hud__icon', this.el('div', 'hud__ult-core', this.ultimate))
    this.ultimateIcon.style.backgroundImage = `url(${pixelIcon(BOLT_ICON.rows, BOLT_ICON.colors)})`

    this.tip = this.el('div', 'hud__tip', this.root)
    this.tip.hidden = true
    parent.appendChild(this.root)
  }

  /** 올리면 위쪽에 짧은 설명. 첫 줄은 굵게 */
  private tipOn(target: HTMLElement, text: string | (() => string)): void {
    target.classList.add('hud__tippable')
    target.addEventListener('pointerenter', () => {
      const [first, ...rest] = (typeof text === 'function' ? text() : text).split('\n')
      const b = document.createElement('b')
      b.textContent = first!
      this.tip.replaceChildren(b, rest.join('\n'))
      this.tip.hidden = false
      const r = target.getBoundingClientRect()
      const w = this.tip.offsetWidth
      const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), innerWidth - w - 8)
      const below = r.top < innerHeight / 2
      const top = below ? r.bottom + 8 : r.top - this.tip.offsetHeight - 8
      this.tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
    })
    target.addEventListener('pointerleave', () => (this.tip.hidden = true))
  }

  update(state: HudState, dt: number): void {
    // 깎인 생명은 잔상으로 잠깐 남았다가 따라 줄어든다. 차오를 때는 바로 따라간다.
    this.lifeTrailRatio = Math.max(state.life, this.lifeTrailRatio - dt * 0.6)
    this.life.style.setProperty('--pct', state.life.toFixed(3))
    this.life.style.setProperty('--trail', this.lifeTrailRatio.toFixed(3))
    this.life.classList.toggle('is-low', state.life <= 0.3)
    this.updateStatus(state)
    this.essenceBox.hidden = Object.values(state.sources).every((s) => s.value <= 0)
    for (const [id, el] of this.essenceEls) {
      const source = state.sources[id] ?? { value: 0, level: 0 }
      if (source.level !== el.level) {
        el.cell.classList.remove(`is-awake-${el.level}`)
        el.level = source.level
        if (source.level > 0) el.cell.classList.add(`is-awake-${source.level}`)
      }
      const text = shortNumber(source.value)
      if (text === el.shown) continue
      el.shown = text
      el.count.textContent = text
      el.cell.classList.remove('is-bump')
      void el.cell.offsetWidth
      el.cell.classList.add('is-bump')
    }

    state.slots.forEach((slot, i) => {
      const el = this.slotEls[i]
      if (!el) return
      if (el.src !== slot.icon) {
        el.src = slot.icon
        el.icon.style.backgroundImage = slot.icon ? `url(${slot.icon})` : ''
        el.root.classList.toggle('hud__slot--empty', !slot.icon)
      }
      // 찬 만큼 그늘을 시계 방향으로 걷어 낸다.
      el.root.style.setProperty('--charge', slot.charge.toFixed(3))
      el.root.classList.toggle('is-charged', slot.charge >= 1 && !slot.asleep)
      el.root.classList.toggle('is-asleep', !!slot.asleep)
    })

    this.xpBar.classList.toggle('is-visible', state.xp !== null)
    if (state.xp !== null) {
      this.xpFill.style.width = `${(state.xp * 100).toFixed(1)}%`
      this.xpFill.style.background = state.xpColor
      this.xpFill.style.color = state.xpColor
      // 가득 차면 깜빡여서 승급 전설에 들어갈 수 있음을 알린다.
      this.xpBar.classList.toggle('is-full', state.xp >= 1)
    }

    this.ultimate.style.setProperty('--charge', state.ultimate ? state.divine.toFixed(3) : '0')
    this.ultimate.classList.toggle('is-locked', !state.ultimate)
    this.ultimate.classList.toggle('is-ready', state.ultimate && state.divine >= 1)

    this.bossBar.classList.toggle('is-visible', state.boss !== null)
    if (state.boss !== null) {
      // 깎인 부분이 잠깐 남았다가 따라 줄어들어, 얼마나 깎였는지 보이게 한다.
      this.bossTrailRatio = Math.max(state.boss, this.bossTrailRatio - dt * 0.5)
      this.bossTrack.style.setProperty('--pct', state.boss.toFixed(3))
      const name = state.bossName ?? ''
      if (this.bossName.textContent !== name) this.bossName.textContent = name
      this.bossBar.classList.toggle('has-name', name !== '')
      this.bossTrack.style.setProperty('--trail', this.bossTrailRatio.toFixed(3))
    } else {
      this.bossTrailRatio = 1
    }
  }

  /** 왼쪽 위 지금의 나: 바뀌었을 때만 다시 그린다. */
  private updateStatus(state: HudState): void {
    const { portrait, blessings, promote } = state
    this.statusTip = portrait ? `${portrait.title}\n${portrait.name} ${portrait.level}단계${promote ? ' · 다음 단계 준비됨' : ''}` : ''
    const key = `${portrait?.name}|${portrait?.level}|${blessings.map((b) => b.name).join()}|${promote}`
    if (key === this.statusKey) return
    this.statusKey = key
    this.portrait.classList.toggle('is-empty', !portrait)
    this.portrait.style.setProperty('--glow', portrait?.color ?? '')
    this.portraitIcon.src = portrait ? classIcon(portrait.name) : unknownSigil()
    this.gems.forEach((gem, i) => gem.classList.toggle('is-on', !!portrait && i < portrait.level))
    ;(this.gems[0]!.parentElement as HTMLElement).style.setProperty('--gem', portrait?.color ?? '')
    this.chips.replaceChildren()
    for (const b of blessings) {
      const chip = this.el('span', 'ui-chip', this.chips)
      chip.style.setProperty('--glow', b.color)
      chip.append(this.img(classIcon(b.name)))
    }
    if (promote) {
      const chip = this.el('span', 'ui-chip is-glowing hud__chip--glyph', this.chips)
      chip.style.setProperty('--glow', 'var(--c-gilt)')
      chip.append(this.img(glyph('promote', '#ffd27a', '#a8862e')))
    }
  }

  /** 화면 가운데 위쪽에 큰 글씨로 잠깐 띄운다. (클래스 발현처럼 중요한 순간에만 쓴다) */
  showBanner(text: string, color: string): void {
    this.banner.textContent = text
    this.banner.style.color = color
    this.restartAnimation(this.banner)
  }

  /**
   * 무엇이 얼마나 강해졌는지 보여 주는 카드 (발현·승급). 가운데 위에 몇 초 떠 있다가 사라진다.
   * lines의 각 줄은 얻은 것 하나. "→"가 있으면 앞은 흐리게, 뒤는 밝게 보인다.
   */
  showGains(kind: string, title: string, color: string, icon: string, lines: readonly string[]): void {
    this.gainsQueue.push(() => this.renderGains(kind, title, color, icon, lines))
    this.nextGains()
  }

  /** 앞 카드가 GAINS_MIN_MS 넘게 보였으면 다음 카드를 띄운다 */
  private nextGains(): void {
    if (this.gainsTimer !== null || this.gainsQueue.length === 0) return
    const wait = this.gainsShownAt + GAINS_MIN_MS - performance.now()
    if (wait > 0) {
      this.gainsTimer = setTimeout(() => {
        this.gainsTimer = null
        this.nextGains()
      }, wait)
      return
    }
    this.gainsShownAt = performance.now()
    this.gainsQueue.shift()!()
    this.nextGains()
  }

  private renderGains(kind: string, title: string, color: string, icon: string, lines: readonly string[]): void {
    const card = this.gains
    card.replaceChildren()
    card.style.setProperty('--glow', color)
    const head = document.createElement('div')
    head.className = 'hud__gains-head'
    const portrait = this.el('div', 'ui-portrait', head)
    portrait.style.setProperty('--glow', color)
    portrait.append(this.img(icon || smallSigilRing()))
    const words = this.el('div', '', head)
    this.el('div', 'hud__gains-kind', words).textContent = kind
    this.el('div', 'hud__gains-title', words).textContent = title
    card.append(head)
    const list = this.el('ul', '', card)
    lines.forEach((line, i) => {
      const li = this.el('li', '', list)
      li.style.animationDelay = `${0.35 + i * 0.12}s`
      const [from, to] = line.split(' → ')
      if (to !== undefined) {
        this.el('span', 'hud__gains-from', li).textContent = from!
        this.el('span', 'hud__gains-arrow', li).textContent = '→'
        this.el('span', 'hud__gains-to', li).textContent = to
      } else li.textContent = line
    })
    this.restartAnimation(card)
  }

  /** 화면 전체가 신의 색으로 한 번 번쩍인다. (발현) */
  flash(color: string): void {
    if (!this.flashEnabled) return
    this.flashEl.style.setProperty('--flash', color)
    this.restartAnimation(this.flashEl)
  }

  /**
   * 지역에 들어설 때·승급 전설을 열 때: 신화권 문장을 가운데 두고 양옆으로 그 색 띠가 뻗고, 아래에 이름.
   * color는 CSS 색 (토큰이면 var(--c-realm-…))
   */
  showTitleCard(name: string, color: string, emblem: string, sub = ''): void {
    const card = this.card
    card.replaceChildren()
    card.style.setProperty('--glow', color)
    const row = this.el('div', 'hud__card-row', card)
    this.el('span', 'hud__card-band', row)
    row.append(this.img(emblem))
    this.el('span', 'hud__card-band is-right', row)
    this.el('div', 'hud__card-name', card).textContent = name
    if (sub) this.el('div', 'hud__card-sub', card).textContent = sub
    this.restartAnimation(card)
  }

  /** 유물을 주웠을 때처럼 가벼운 알림을 작게 띄운다. */
  showToast(text: string): void {
    this.toast.textContent = text
    this.restartAnimation(this.toast)
  }

  private restartAnimation(el: HTMLElement): void {
    el.classList.remove('is-showing')
    void el.offsetWidth
    el.classList.add('is-showing')
  }

  private img(src: string): HTMLImageElement {
    const img = document.createElement('img')
    img.src = src
    img.alt = ''
    return img
  }

  /** 막대 (parts.css의 .ui-bar): 왼쪽 마름모 장식과 25% 눈금 */
  private bar(className: string, parent: HTMLElement): HTMLElement {
    const bar = this.el('div', className, parent)
    this.el('span', 'ui-bar__cap', bar)
    this.el('span', 'ui-bar__ticks', bar)
    return bar
  }

  private el(tag: string, className: string, parent: HTMLElement): HTMLElement {
    const el = document.createElement(tag)
    el.className = className
    parent.appendChild(el)
    return el
  }
}

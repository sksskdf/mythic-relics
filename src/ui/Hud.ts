import { touchUi } from '../input/device'
import type { RelicId } from '../relics/data'
import { classIcon } from './classIcons'
import './hud.css'
import { BOLT_ICON, pixelIcon } from './pixelIcon'
import { smallSigilRing } from './emblem'
import { shortNumber } from './format'
import { type GainsCard, GAINS_LIFE, GainsLine, type GainsSize, gainsView } from './gainsLine'
import { heroIcon } from './heroIcon'
import { glyph, sourceSigil } from './sigils'
import { TOAST_LIFE, type ToastBundle, ToastLine } from './toastLine'

export interface HudSlot {
  /** 유물 그림 주소. 빈 칸이면 null */
  icon: string | null
  /** 행동 연동 효과의 충전 정도 0~1 (1이면 다 참) */
  charge: number
  /** 이 칸의 유물 (빈 칸이면 null) */
  relic: RelicId | null
  /** 그 신화를 고르지 않아 유물의 힘이 잠들어 있다 (E21-04) */
  asleep?: boolean
}

export interface HudState {
  /** 생명력 비율 0~1 */
  life: number
  /** 심장 게이지 비율 0~1 (궁극기 충전) */
  heartGauge: number
  /** 보스 생명력 비율 0~1. 보스와 싸우지 않을 때는 null */
  boss: number | null
  /** 보스 막대 위에 보이는 이름 (E12-09). 이름 없는 막대(내기 전설의 처치 수)는 null */
  bossName?: string | null
  slots: readonly HudSlot[]
  /** 클래스가 발현되어 궁극기를 쓸 수 있는가 */
  ultimate: boolean
  /** 기세 막대 0~1 (다음 깨달음까지, E305-03에서 신화 경험치 대신). 손에 신이 없으면 null */
  xp: number | null
  /** 막대 색 (손의 신의 대표 색) */
  xpColor: string
  /** 왼쪽 위 초상의 그림: 주인공의 얼굴 (E307: 신을 깨워도 초상은 그 신의 문장·칭호로 바뀌지 않는다) */
  face: string
  /** 손에 쥔 신: 초상 테의 빛, 단계 보석, 첫 칩. 손이 비었으면 null */
  hand: { name: string; color: string; level: number } | null
  /** 원천 수치 (장비의 합 + 원천 숙련)와 각성 단계 0~3 (E14-02). 모두 0이면 감춘다 */
  sources: Readonly<Record<string, { value: number; level: number }>>
  /** 손 말고 자리(심장·숨)에 든 신들 (E237 → E302): 초상 옆 칩으로, 손의 신 다음에 */
  lent: readonly { name: string; color: string }[]
  /** 원정이 무르익어 성소 화로에서 귀환(승천)할 수 있다 (E305-03: 성소 전설 대신) */
  promote: boolean
}

/** 유물 스킬 칸 수 */
export const SKILL_SLOTS = 4
export type { GainsSize } from './gainsLine'
/** 장면이 HUD를 숨기기 이만큼(ms) 안에 띄운 제목 카드는 장면 뒤에 다시 띄운다 */
const TITLE_REPLAY_MS = 3000
/** 고르는 카드가 떠 있는 동안 다음 얻은 것 카드를 이만큼(ms)마다 다시 본다 */
const CHOOSING_POLL_MS = 250
/** 작은 알림을 땅의 카드 위로 올릴 때 그 카드와의 틈 (px) */
const TOAST_GAP = 6
/** 알림이 사라진 뒤에도 이만큼(ms)은 자리를 더 잰다 (사라지는 움직임이 한두 프레임 늦게 끝나도 카드 뒤로 내려앉지 않게) */
const TOAST_TAIL_MS = 300

/**
 * HUD: 왼쪽 위에 지금의 나, 아래 가운데에 떠 있는 묶음 하나. (DESIGN.md 10.5)
 * - 지금의 나: 주인공의 초상(신을 깨워도 그대로, E307), 손에 쥔 신의 단계 보석, 자리에 든 신 칩과 귀환 대기. 누르면 정보 화면의 상태 탭.
 * - 생명: 금속 테 안의 막대(parts.css). 깎인 만큼 밝은 잔상이 잠깐 남았다가 따라 줄어든다.
 * - 유물 칸 4개: 충전은 칸 위를 시계 방향으로 걷어 내는 그늘로, 다 차면 칸이 빛난다.
 * - 궁극기: 마름모 칸. 심장 게이지가 차는 만큼 둘레의 금빛 고리가 채워지고, 다 차면 숨 쉬듯 빛난다.
 * - 경험치: 화면 맨 아래 끝에서 끝까지 이어진 가는 줄 (발현했을 때만).
 * 스킬과 궁극기는 자동으로 나가므로 키 표시가 없고, 글 대신 막대와 그림으로 보여 준다. (텍스트 최소화)
 * 유물 칸에 커서를 올리면 설명 카드가 뜨고, 누르면 정보 화면의 신 탭이 열린다. (E4)
 * 휴대폰(E307)에서는 엄지가 놓이는 아래 묶음과 원천 칩이 누름을 받지 않는다: 그 위에서 끌어도 걷고, 정보 화면은 초상이나 메뉴 단추로 연다.
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
  /** 지금 보이는 초상 그림 (기본 모습을 바꾸면 다시 그린다) */
  private faceShown = ''
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
  /** 작은 알림의 줄: 같은 때 온 알림이 서로 덮지 않게 차례로, 같은 장비의 일은 한 줄로 묶어 보인다 (규칙은 `toastLine.ts`, E307) */
  private readonly toasts = new ToastLine()
  private toastTimer: ReturnType<typeof setTimeout> | null = null
  /** 지금 알림의 자리를 재는 것을 그만둘 때 (ms, 재지 않으면 0)와 땅의 카드를 피해 올린 높이 (px) */
  private toastUntil = 0
  private toastLift = 0
  /** 조작 안내 한 줄: 해 볼 때까지 남는다 (시작 장면 뒤) */
  private readonly coach: HTMLElement
  private readonly gains: HTMLElement
  /**
   * 얻은 것 카드의 줄: 같은 때 열린 것(귀환 + 자동화 등)이 서로 덮지 않게 차례로 보인다.
   * 같은 종류의 장비 카드는 묶고 밀리면 빨리 넘기며, 화면이 덮인 동안은 멈춘다 (규칙은 `gainsLine.ts`, E307)
   */
  private readonly line = new GainsLine()
  /** 이번 프레임의 일이 끝나면 카드와 알림의 줄을 본다고 걸어 두었나 */
  private kicked = false
  /** 정보 화면·일시 정지가 화면을 덮었다: 그동안 카드를 감추고 줄을 넘기지 않는다 */
  private covered = false
  /** 마지막 제목 카드와 띄운 때, HUD를 숨긴 때 (장면 뒤 다시 띄우기) */
  private lastTitle: { args: [string, string, string, string]; at: number } | null = null
  private hiddenAt = 0
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
    this.portrait = this.el('button', 'ui-portrait hud__portrait', status)
    this.portrait.setAttribute('aria-label', '상태')
    // 누르는 순간이 아니라 click으로 연다 (E307): 손가락을 뗄 때의 click이 새로 열린 창에 떨어지지 않고, 끌면 열리지 않는다
    this.portrait.addEventListener('click', () => {
      this.tip.hidden = true
      this.onPortraitClick()
    })
    this.tipOn(this.portrait, () => (this.statusTip || '이름 없는 모험가\n신의 흔적·사냥·수호자, 조각 셋을 모으면 그 신이 깨어난다.') + '\n누르면 자세한 상태')
    this.portraitIcon = document.createElement('img')
    this.portraitIcon.alt = ''
    this.portraitIcon.src = heroIcon()
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
    this.tipOn(essence, '원천\n장비에 붙은 원천 수치의 합. 5·10·20을 넘을 때마다 그 원천이 한 단계씩 각성한다. 정보 화면의 원천 탭은 첫 귀환에 열린다.')

    this.banner = this.el('div', 'hud__banner', this.root)
    this.card = this.el('div', 'hud__card', this.root)
    this.toast = this.el('div', 'hud__toast', this.root)
    this.coach = this.el('div', 'hud__coach', this.root)
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
      // click으로 연다 (E307, 끌면 열리지 않는다). 터치 화면에서는 칸이 누름을 받지 않고 게임 화면으로 흘려보낸다 (hud.css)
      root.addEventListener('click', () => {
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

  /**
   * 위쪽 HUD 묶음(초상·원천·목표 한 줄·작은 지도·보스 막대)과 아래 묶음 사이의 빈 띠 (화면 px).
   * 휴대폰에서 다가가면 뜨는 땅의 카드가 이 안에 머문다 (E307). 레이아웃을 읽으니 프레임마다 부르지 않는다
   */
  clearBand(): { top: number; bottom: number } {
    let top = 0
    // 감춘 것(hidden·보이지 않는 보스 막대)은 높이가 0이라 빠진다
    for (const el of this.root.querySelectorAll('.hud__status, .hud__essence, .chapter-goal, .minimap, .hud__boss.is-visible')) {
      const r = el.getBoundingClientRect()
      if (r.height > 0) top = Math.max(top, r.bottom)
    }
    const dock = this.root.querySelector('.hud__dock')!.getBoundingClientRect()
    return { top: top + 8, bottom: dock.top - 8 }
  }

  /** 커서를 올리면 위쪽에 짧은 설명. 첫 줄은 굵게. 손가락으로는 띄우지 않는다 (설명은 정보 화면에서 본다, E307) */
  private tipOn(target: HTMLElement, text: string | (() => string)): void {
    target.classList.add('hud__tippable')
    target.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch') return
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
      // 다음 단계를 올릴 수 있을 때만 깜빡여서 승급 전설에 들어갈 수 있음을 알린다 (단계 끝이면 가득 찬 채 멈춘다)
      this.xpBar.classList.toggle('is-full', state.promote)
    }

    this.ultimate.style.setProperty('--charge', state.ultimate ? state.heartGauge.toFixed(3) : '0')
    this.ultimate.classList.toggle('is-locked', !state.ultimate)
    this.ultimate.classList.toggle('is-ready', state.ultimate && state.heartGauge >= 1)

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
    if (this.toastUntil > 0) this.liftToast()
  }

  /** 왼쪽 위 지금의 나: 바뀌었을 때만 다시 그린다. 초상은 늘 주인공의 얼굴이고, 손에 쥔 신은 테의 빛·보석·첫 칩으로만 보인다 (E307) */
  private updateStatus(state: HudState): void {
    const { face, hand, lent, promote } = state
    const borrowed = lent.length ? `\n빌린 힘: ${lent.map((b) => b.name).join('·')}` : ''
    // 조각 2에 무기만 쥔 신은 아직 깨어나지 않았다 (0단계)
    const stage = hand ? (hand.level > 0 ? `${hand.level}단계` : '깨우는 중') : ''
    this.statusTip = hand ? `이름 없는 모험가\n손에 쥔 신: ${hand.name} ${stage}${borrowed}${promote ? ' · 성소 화로에서 귀환할 수 있다' : ''}` : ''
    const key = `${hand?.name}|${hand?.level}|${lent.map((b) => b.name).join()}|${promote}`
    if (key === this.statusKey && face === this.faceShown) return
    this.statusKey = key
    this.faceShown = face
    // 손이 비었으면 빛 없는 테, 신을 쥐면 그 신의 색으로 빛난다
    this.portrait.style.setProperty('--glow', hand?.color ?? 'var(--c-line-2)')
    this.portraitIcon.src = face
    this.gems.forEach((gem, i) => gem.classList.toggle('is-on', !!hand && i < hand.level))
    ;(this.gems[0]!.parentElement as HTMLElement).style.setProperty('--gem', hand?.color ?? '')
    this.chips.replaceChildren()
    for (const b of hand ? [hand, ...lent] : lent) {
      const chip = this.el('span', 'ui-chip is-lent', this.chips)
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
   * 무엇이 얼마나 강해졌는지 보여 주는 카드. 몇 초 떠 있다가 사라진다 (순간의 크기 E23-01).
   * - card: 오른쪽 위 작은 지도 아래에 작게 (싸움을 가리지 않게)
   * - big: 가운데 위에 크게 (신화 단계·유물 벼리기·장면 뒤)
   * lines의 각 줄은 얻은 것 하나. "→"가 있으면 앞은 흐리게, 뒤는 밝게 보인다.
   * bundles면 줄에 선 같은 종류와 한 장으로 묶인다 (장비 카드). 같은 때 온 것도 묶이도록, 이번 프레임의 일이 끝난 뒤에 띄운다
   */
  showGains(kind: string, title: string, color: string, icon: string, lines: readonly string[], size: GainsSize = 'big', bundles = false): void {
    this.line.push({ kind, title, color, icon, lines, size, bundles })
    this.kick()
  }

  /** 이번 프레임의 일이 끝난 뒤에 카드와 알림의 줄을 본다 (같은 때 온 것끼리 묶이도록) */
  private kick(): void {
    if (this.kicked) return
    this.kicked = true
    queueMicrotask(() => {
      this.kicked = false
      this.nextGains()
      this.nextToast()
    })
  }

  /** 줄에 선 카드가 있거나, 지금 카드가 아직 자리를 지키는 중인가 (그동안 장면이 HUD를 숨기면 카드가 가려진다) */
  get gainsBusy(): boolean {
    return this.line.busy(performance.now())
  }

  /** 줄에 선 카드와 지금 카드를 띄운 때 (점검용: `scripts/power-curve.mjs`가 카드를 하나씩 찍을 때) */
  get gainsQueue(): readonly GainsCard[] {
    return this.line.waiting
  }

  get gainsShownAt(): number {
    return this.line.shownAt
  }

  /**
   * 정보 화면·일시 정지가 화면을 덮었다·걷혔다 (E307): 덮인 동안 얻은 것 카드는 감추고 줄을 넘기지 않는다
   * (창 뒤로 비치거나 못 본 채 지나가지 않게). 걷히면 줄을 다시 본다: 밀린 같은 종류는 한 장으로 묶여 있다
   */
  setCovered(covered: boolean): void {
    if (covered === this.covered) return
    this.covered = covered
    if (!covered) return this.nextGains()
    if (this.gainsTimer !== null) clearTimeout(this.gainsTimer)
    this.gainsTimer = null
    this.line.cover(performance.now())
    this.gains.classList.remove('is-showing')
  }

  /**
   * 대화 장면 동안 HUD를 숨긴다 (투명하게만: 움직임은 그대로 흐른다).
   * 숨기기 직전 3초 안에 띄운 지역·전설 제목 카드는 장면 뒤에 다시 띄운다 (장면 밑에서 지나가 버리지 않게)
   */
  setHidden(hidden: boolean): void {
    if (this.root.classList.contains('is-hidden') === hidden) return
    this.root.classList.toggle('is-hidden', hidden)
    if (hidden) this.hiddenAt = performance.now()
    else if (this.lastTitle && this.hiddenAt - this.lastTitle.at < TITLE_REPLAY_MS) {
      const { args } = this.lastTitle
      this.lastTitle = null
      this.showTitleCard(...args)
    }
  }

  /** 지금 떠 있는 카드의 크기 (점검용). 없으면 null */
  get gainsShowing(): GainsSize | null {
    return this.gains.classList.contains('is-showing') ? this.line.showing(performance.now()) : null
  }

  /**
   * 고르는 카드(귀환·맹세 출발)가 떠 있나. 그동안 얻은 것 카드는 줄에서 기다리고, 떠 있던 카드는 숨는다(hud.css):
   * 귀환하는 순간의 「원정 N 출발」 큰 카드가 맹세 출발 카드에 반쯤 가려지지 않게 (E306 90분 QA).
   * 두 갈래 카드는 막지 않는다: 위에 뜬 「신이 깨어남」 큰 카드가 무엇을 고르는지 알려 준다
   */
  private get choosing(): boolean {
    return this.root.querySelector('.pick-card:not([hidden])') !== null
  }

  /** 앞 카드가 제 시간(장비 카드는 줄이 밀렸으면 짧게)을 채웠고 고르는 카드·화면을 덮은 창이 없으면 다음 카드를 띄운다 */
  private nextGains(): void {
    if (this.gainsTimer !== null || this.covered) return
    const left = this.line.wait(performance.now())
    if (left === null) return
    const wait = this.choosing ? CHOOSING_POLL_MS : left
    if (wait > 0) {
      this.gainsTimer = setTimeout(() => {
        this.gainsTimer = null
        this.nextGains()
      }, wait)
      return
    }
    this.renderGains(this.line.take(performance.now()))
    this.nextGains()
  }

  private renderGains(gains: GainsCard): void {
    const { color, icon, size } = gains
    // 묶인 카드는 「장비 셋」과 이름들
    const { kind, title, lines } = gainsView(gains)
    const card = this.gains
    card.replaceChildren()
    card.classList.toggle('is-side', size === 'card')
    card.classList.toggle('is-fly', size === 'tab')
    // 떠 있는 시간 (hud.css의 움직임 길이)
    card.style.setProperty('--life', `${GAINS_LIFE[size]}ms`)
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
      // 작은 카드는 금방 넘어가니 줄도 바로 보인다
      li.style.animationDelay = size === 'card' ? `${0.12 + i * 0.06}s` : `${0.35 + i * 0.12}s`
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
    this.lastTitle = { args: [name, color, emblem, sub], at: performance.now() }
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

  /** 조작 안내 한 줄 (null이면 감춘다) */
  setCoach(text: string | null): void {
    if (text !== null && this.coach.textContent !== text) this.coach.textContent = text
    this.coach.classList.toggle('is-on', text !== null)
  }

  /**
   * 유물을 주웠을 때처럼 가벼운 알림을 화면 아래 한 줄로 작게 띄운다 (순간의 크기 1).
   * 같은 때 온 알림은 차례로 뜨고, 기다리는 동안 같은 종류(kind)가 또 오면 bundle의 글 한 줄로 묶인다 (「장비 셋 · 낌」).
   * 같은 때 온 것도 묶이도록, 이번 프레임의 일이 끝난 뒤에 띄운다
   */
  showToast(text: string, kind = '', bundle?: ToastBundle): void {
    this.toasts.push(kind, text, bundle)
    this.kick()
  }

  /** 앞 알림이 자리를 지킬 만큼 떠 있었으면 다음 알림을 띄운다 */
  private nextToast(): void {
    if (this.toastTimer !== null) return
    const now = performance.now()
    const wait = this.toasts.wait(now)
    if (wait === null) return
    if (wait > 0) {
      this.toastTimer = setTimeout(() => {
        this.toastTimer = null
        this.nextToast()
      }, wait)
      return
    }
    this.toast.textContent = this.toasts.take(now)
    this.toastUntil = now + TOAST_LIFE + TOAST_TAIL_MS
    this.liftToast()
    this.restartAnimation(this.toast)
    this.nextToast()
  }

  /**
   * 휴대폰: 알림이 땅의 카드에 가리면 그 카드 위 끝 바로 위로 올린다 (E307). 다가가면 뜨는 땅의 카드는 아래 묶음 바로 위,
   * 곧 알림 자리에 뜨고 알림보다 위에 그려진다: 흩어진 장비를 걸어가며 주우면 「낌」 알림이 다음 장비의 카드 뒤에 통째로 가렸다.
   * 알림이 떠 있는 동안만 프레임마다 잰다 (카드가 알림보다 늦게 뜨기도 한다). 올릴 자리가 화면 밖이면 그대로 둔다.
   * 컴퓨터의 커서 카드는 올려 본 동안만 뜨니 그대로 둔다
   */
  private liftToast(): void {
    if (performance.now() >= this.toastUntil) {
      // 다 사라졌다: 올린 높이는 다음 알림이 뜰 때 다시 잰다
      this.toastUntil = 0
      return
    }
    let lift = 0
    const card = touchUi() ? this.root.parentElement?.querySelector<HTMLElement>(':scope > .relic-tooltip:not([hidden])') : null
    if (card) {
      const { toast } = this
      const c = card.getBoundingClientRect()
      // 올리지 않았을 때 알림의 상자 (움직임의 transform은 빼고 잰다. 가로는 가운데 맞춤)
      const top = toast.offsetTop + this.toastLift
      const bottom = top + toast.offsetHeight
      const center = toast.offsetLeft
      const half = toast.offsetWidth / 2
      const hidden = c.top < bottom && c.bottom > top && c.left < center + half && c.right > center - half
      if (hidden && c.top - TOAST_GAP - toast.offsetHeight >= 0) lift = Math.round(bottom - (c.top - TOAST_GAP))
    }
    if (lift === this.toastLift) return
    this.toastLift = lift
    this.toast.style.setProperty('--lift', `${lift}px`)
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

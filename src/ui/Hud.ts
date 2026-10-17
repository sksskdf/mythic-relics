import { classIcon } from './classIcons'
import './hud.css'
import { BOLT_ICON, pixelIcon } from './pixelIcon'
import { glyph, unknownSigil } from './sigils'

export interface HudSlot {
  /** 유물 그림 주소. 빈 칸이면 null */
  icon: string | null
  /** 행동 연동 효과의 충전 정도 0~1 (1이면 다 참) */
  charge: number
}

export interface HudState {
  /** 생명력 비율 0~1 */
  life: number
  /** 신위 게이지 비율 0~1 */
  divine: number
  /** 보스 생명력 비율 0~1. 보스와 싸우지 않을 때는 null */
  boss: number | null
  slots: readonly HudSlot[]
  /** 클래스가 발현되어 궁극기를 쓸 수 있는가 */
  ultimate: boolean
  /** 발현한 클래스의 경험치 바 0~1. 발현하지 않았으면 null */
  xp: number | null
  /** 경험치 바 색 (발현한 신의 대표 색) */
  xpColor: string
  /** 왼쪽 위 초상: 발현한 클래스. 발현하지 않았으면 null */
  portrait: { name: string; color: string; level: number } | null
  /** 가호로 붙은 신들 */
  blessings: readonly { name: string; color: string }[]
  /** 경험치가 가득 차 승급 전설에 들어갈 수 있다 */
  promote: boolean
}

/** 유물 스킬 칸 수 */
export const SKILL_SLOTS = 4

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
  private readonly ultimate: HTMLElement
  private readonly ultimateIcon: HTMLElement
  private readonly slotEls: { root: HTMLElement; icon: HTMLElement; src: string | null }[] = []
  private readonly bossBar: HTMLElement
  private readonly bossTrack: HTMLElement
  private readonly banner: HTMLElement
  private readonly toast: HTMLElement
  private readonly xpBar: HTMLElement
  private readonly xpFill: HTMLElement
  private bossTrailRatio = 1
  private lifeTrailRatio = 1

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'hud'

    this.bossBar = this.el('div', 'hud__boss', this.root)
    this.bossTrack = this.bar('ui-bar ui-bar--capped hud__boss-track', this.bossBar)

    // 지금의 나
    const status = this.el('div', 'hud__status', this.root)
    this.portrait = this.el('button', 'ui-portrait is-empty hud__portrait', status)
    this.portrait.setAttribute('aria-label', '상태')
    this.portrait.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      this.onPortraitClick()
    })
    this.portraitIcon = document.createElement('img')
    this.portraitIcon.alt = ''
    this.portraitIcon.src = unknownSigil()
    this.portrait.append(this.portraitIcon)
    const side = this.el('div', 'hud__status-side', status)
    const gems = this.el('div', 'ui-gems ui-gems--small', side)
    for (let i = 0; i < 4; i++) this.gems.push(this.el('i', '', gems))
    this.chips = this.el('div', 'hud__chips', side)

    this.banner = this.el('div', 'hud__banner', this.root)
    this.toast = this.el('div', 'hud__toast', this.root)

    this.xpBar = this.el('div', 'hud__xp', this.root)
    this.xpFill = this.el('div', 'hud__xp-fill', this.xpBar)

    const dock = this.el('div', 'hud__dock', this.root)
    this.life = this.bar('ui-bar ui-bar--capped hud__life', dock)

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
    this.el('div', 'hud__ult-ring', this.ultimate)
    this.ultimateIcon = this.el('div', 'hud__icon', this.el('div', 'hud__ult-core', this.ultimate))
    this.ultimateIcon.style.backgroundImage = `url(${pixelIcon(BOLT_ICON.rows, BOLT_ICON.colors)})`

    parent.appendChild(this.root)
  }

  update(state: HudState, dt: number): void {
    // 깎인 생명은 잔상으로 잠깐 남았다가 따라 줄어든다. 차오를 때는 바로 따라간다.
    this.lifeTrailRatio = Math.max(state.life, this.lifeTrailRatio - dt * 0.6)
    this.life.style.setProperty('--pct', state.life.toFixed(3))
    this.life.style.setProperty('--trail', this.lifeTrailRatio.toFixed(3))
    this.life.classList.toggle('is-low', state.life <= 0.3)
    this.updateStatus(state)

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
      el.root.classList.toggle('is-charged', slot.charge >= 1)
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
      this.bossTrack.style.setProperty('--trail', this.bossTrailRatio.toFixed(3))
    } else {
      this.bossTrailRatio = 1
    }
  }

  /** 왼쪽 위 지금의 나: 바뀌었을 때만 다시 그린다. */
  private updateStatus(state: HudState): void {
    const { portrait, blessings, promote } = state
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

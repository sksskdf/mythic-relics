import { BOLT_ICON, pixelIcon } from './pixelIcon'
import './hud.css'

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
}

/** 유물 스킬 칸 수 */
export const SKILL_SLOTS = 4

/**
 * HUD: 큰 판 없이 아래 가운데에 떠 있는 묶음 하나. (DESIGN.md 10.5)
 * - 생명: 양 끝을 비스듬히 자른 얇은 막대. 깎인 만큼 밝은 잔상이 잠깐 남았다가 따라 줄어든다.
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

  private readonly lifeFill: HTMLElement
  private readonly lifeTrail: HTMLElement
  private readonly ultimate: HTMLElement
  private readonly ultimateIcon: HTMLElement
  private readonly slotEls: { root: HTMLElement; icon: HTMLElement; src: string | null }[] = []
  private readonly bossBar: HTMLElement
  private readonly bossFill: HTMLElement
  private readonly bossTrail: HTMLElement
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
    const bossTrack = this.el('div', 'hud__boss-track', this.bossBar)
    this.bossTrail = this.el('div', 'hud__boss-trail', bossTrack)
    this.bossFill = this.el('div', 'hud__boss-fill', bossTrack)

    this.banner = this.el('div', 'hud__banner', this.root)
    this.toast = this.el('div', 'hud__toast', this.root)

    this.xpBar = this.el('div', 'hud__xp', this.root)
    this.xpFill = this.el('div', 'hud__xp-fill', this.xpBar)

    const dock = this.el('div', 'hud__dock', this.root)
    const life = this.el('div', 'hud__life', dock)
    this.lifeTrail = this.el('div', 'hud__life-trail', life)
    this.lifeFill = this.el('div', 'hud__life-fill', life)

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
    this.lifeFill.style.width = `${(state.life * 100).toFixed(1)}%`
    this.lifeTrail.style.width = `${(this.lifeTrailRatio * 100).toFixed(1)}%`
    this.root.classList.toggle('is-low', state.life <= 0.3)

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
      this.bossFill.style.width = `${(state.boss * 100).toFixed(1)}%`
      this.bossTrail.style.width = `${(this.bossTrailRatio * 100).toFixed(1)}%`
    } else {
      this.bossTrailRatio = 1
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

  private el(tag: string, className: string, parent: HTMLElement): HTMLElement {
    const el = document.createElement(tag)
    el.className = className
    parent.appendChild(el)
    return el
  }
}

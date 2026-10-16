import { BOLT_ICON, pixelIcon } from './pixelIcon'
import './hud.css'

export interface HudSlot {
  /** 유물 그림 주소. 빈 칸이면 null */
  icon: string | null
  /** 재사용 대기 비율 0~1 (1이면 막 사용함) */
  cooldown: number
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
}

/** 유물 스킬 칸 수 */
export const SKILL_SLOTS = 4

/**
 * HUD: 아래쪽에 생명력, 유물 스킬 칸 4개, 궁극기 칸, 신위 게이지, 위쪽에 보스 생명력.
 * 스킬과 궁극기는 자동으로 나가므로 키 표시가 없고, 글 대신 막대와 그림으로 보여 준다. (텍스트 최소화)
 * 유물 칸을 누르면 그 유물을 빼서 발밑에 내려놓는다.
 */
export class Hud {
  readonly root: HTMLElement
  /** 유물 칸을 눌렀을 때 */
  onSlotClick: (slot: number) => void = () => {}

  private readonly lifeFill: HTMLElement
  private readonly divineFill: HTMLElement
  private readonly ultimate: HTMLElement
  private readonly ultimateIcon: HTMLElement
  private readonly slotEls: { root: HTMLElement; icon: HTMLElement; shade: HTMLElement; src: string | null }[] = []
  private readonly bossBar: HTMLElement
  private readonly bossFill: HTMLElement
  private readonly bossTrail: HTMLElement
  private readonly banner: HTMLElement
  private readonly toast: HTMLElement
  private bossTrailRatio = 1

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'hud'

    this.bossBar = this.el('div', 'hud__boss', this.root)
    const bossTrack = this.el('div', 'hud__boss-track', this.bossBar)
    this.bossTrail = this.el('div', 'hud__boss-trail', bossTrack)
    this.bossFill = this.el('div', 'hud__boss-fill', bossTrack)

    this.banner = this.el('div', 'hud__banner', this.root)
    this.toast = this.el('div', 'hud__toast', this.root)

    const bar = this.el('div', 'hud__bar', this.root)
    const life = this.meter('hud__meter hud__meter--life', bar)
    this.lifeFill = life

    const slots = this.el('div', 'hud__slots', bar)
    for (let i = 0; i < SKILL_SLOTS; i++) {
      const root = this.el('button', 'hud__slot hud__slot--empty', slots)
      root.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        this.onSlotClick(i)
      })
      const icon = this.el('div', 'hud__icon', root)
      const shade = this.el('div', 'hud__shade', root)
      this.slotEls.push({ root, icon, shade, src: null })
    }
    this.ultimate = this.el('div', 'hud__slot hud__slot--ultimate', slots)
    this.ultimateIcon = this.el('div', 'hud__icon', this.ultimate)
    this.ultimateIcon.style.backgroundImage = `url(${pixelIcon(BOLT_ICON.rows, BOLT_ICON.colors)})`

    this.divineFill = this.meter('hud__meter hud__meter--divine', bar)

    parent.appendChild(this.root)
  }

  update(state: HudState, dt: number): void {
    this.lifeFill.style.width = `${Math.round(state.life * 100)}%`
    this.divineFill.style.width = `${Math.round(state.divine * 100)}%`

    state.slots.forEach((slot, i) => {
      const el = this.slotEls[i]
      if (!el) return
      if (el.src !== slot.icon) {
        el.src = slot.icon
        el.icon.style.backgroundImage = slot.icon ? `url(${slot.icon})` : ''
        el.root.classList.toggle('hud__slot--empty', !slot.icon)
      }
      el.shade.style.height = `${Math.round(slot.cooldown * 100)}%`
    })

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

  private meter(className: string, parent: HTMLElement): HTMLElement {
    const root = this.el('div', className, parent)
    const track = this.el('div', 'hud__meter-track', root)
    return this.el('div', 'hud__meter-fill', track)
  }
}

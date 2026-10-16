import { type Action, type Bindings, DEFAULT_BINDINGS, keyLabel, SKILL_ACTIONS } from '../input/bindings'
import type { Input } from '../input/Input'
import './hud.css'

export interface HudState {
  /** 생명력 비율 0~1 */
  life: number
  /** 신위 게이지 비율 0~1 */
  divine: number
  /** 회피 재사용 대기 비율 0~1 (1이면 막 사용함) */
  dodgeCooldown: number
}

/**
 * 화면 아래쪽 HUD: 생명력, 스킬 칸 4개(Q/W/E/R), 궁극기 칸(F), 신위 게이지.
 * 글 대신 막대와 칸으로만 보여 준다. (텍스트 최소화)
 */
export class Hud {
  readonly root: HTMLElement
  private readonly lifeFill: HTMLElement
  private readonly divineFill: HTMLElement
  private readonly slots = new Map<Action, HTMLElement>()
  private readonly dodgeShade: HTMLElement

  constructor(parent: HTMLElement, bindings: Bindings = DEFAULT_BINDINGS) {
    this.root = document.createElement('div')
    this.root.className = 'hud'
    const bar = document.createElement('div')
    bar.className = 'hud__bar'
    this.root.appendChild(bar)

    const life = this.meter('hud__meter hud__meter--life')
    this.lifeFill = life.fill
    bar.appendChild(life.root)

    const slots = document.createElement('div')
    slots.className = 'hud__slots'
    for (const action of ['dodge', ...SKILL_ACTIONS, 'ultimate'] as const) {
      const slot = document.createElement('div')
      slot.className = `hud__slot hud__slot--${action}`
      slot.dataset.action = action
      const key = document.createElement('span')
      key.className = 'hud__key'
      key.textContent = keyLabel(bindings, action)
      slot.appendChild(key)
      slots.appendChild(slot)
      this.slots.set(action, slot)
    }
    bar.appendChild(slots)

    this.dodgeShade = document.createElement('div')
    this.dodgeShade.className = 'hud__dodge'
    this.slots.get('dodge')!.appendChild(this.dodgeShade)

    const divine = this.meter('hud__meter hud__meter--divine')
    this.divineFill = divine.fill
    bar.appendChild(divine.root)

    parent.appendChild(this.root)
  }

  update(state: HudState, input: Input): void {
    this.lifeFill.style.width = `${Math.round(state.life * 100)}%`
    this.divineFill.style.width = `${Math.round(state.divine * 100)}%`
    this.dodgeShade.style.height = `${Math.round(state.dodgeCooldown * 100)}%`
    for (const [action, slot] of this.slots) {
      slot.classList.toggle('is-pressed', input.isDown(action))
    }
  }

  private meter(className: string) {
    const root = document.createElement('div')
    root.className = className
    const track = document.createElement('div')
    track.className = 'hud__meter-track'
    const fill = document.createElement('div')
    fill.className = 'hud__meter-fill'
    track.appendChild(fill)
    root.appendChild(track)
    return { root, fill }
  }
}

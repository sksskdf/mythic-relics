import type * as THREE from 'three'

import { type Subpixel, worldToScreen } from '../render/picking'
import type { RenderSize } from '../render/resolution'

export type DamageStyle = 'normal' | 'strong' | 'hurt' | 'thunder'

interface Popup {
  el: HTMLElement
  world: THREE.Vector3
  life: number
  /** 처음 수명 (초) */
  span: number
  drift: number
  /** 떠오르는 높이 (px) */
  rise: number
}

const LIFE = 0.7
/** 주운 것 이름은 더 오래, 더 높이 떠오른다 */
const LABEL_LIFE = 1.6

/** 맞은 자리 위로 떠오르는 피해 숫자. 글 대신 숫자만 보여 준다. */
export class DamageNumbers {
  private readonly root: HTMLElement
  private readonly pool: Popup[] = []
  private next = 0

  constructor(parent: HTMLElement, size = 32) {
    this.root = document.createElement('div')
    this.root.className = 'damage-numbers'
    for (let i = 0; i < size; i++) {
      const el = document.createElement('div')
      el.className = 'damage-number'
      el.style.display = 'none'
      this.root.appendChild(el)
      this.pool.push({ el, world: null as unknown as THREE.Vector3, life: 0, span: LIFE, drift: 0, rise: 40 })
    }
    parent.appendChild(this.root)
  }

  show(world: THREE.Vector3, amount: number, style: DamageStyle): void {
    const popup = this.take(world, LIFE, (Math.random() - 0.5) * 24, 40)
    popup.el.textContent = String(Math.round(amount))
    popup.el.className = `damage-number damage-number--${style}`
    popup.el.style.color = ''
  }

  /** 주운 것의 이름이 주인공 머리 위로 떠오른다 (사용자 의견 2026-10-28: 얻는 표현이 모자라다). color는 등급·신의 색 */
  label(world: THREE.Vector3, text: string, color: string): void {
    const popup = this.take(world, LABEL_LIFE, 0, 56)
    popup.el.textContent = `+ ${text}`
    popup.el.className = 'damage-number damage-number--label'
    popup.el.style.color = color
  }

  private take(world: THREE.Vector3, life: number, drift: number, rise: number): Popup {
    const popup = this.pool[this.next]!
    this.next = (this.next + 1) % this.pool.length
    popup.world = world.clone()
    popup.life = life
    popup.span = life
    popup.drift = drift
    popup.rise = rise
    popup.el.style.display = ''
    return popup
  }

  update(dt: number, screenHeight: number, size: RenderSize, camera: THREE.Camera, subpixel?: Subpixel): void {
    for (const popup of this.pool) {
      if (popup.life <= 0) continue
      popup.life -= dt
      if (popup.life <= 0) {
        popup.el.style.display = 'none'
        continue
      }
      const t = 1 - popup.life / popup.span
      const screen = worldToScreen(popup.world, screenHeight, size, camera, subpixel)
      const rise = 18 + t * popup.rise
      const pop = t < 0.15 ? 1.5 - t * 3.3 : 1
      popup.el.style.transform = `translate(${Math.round(screen.x + popup.drift * t)}px, ${Math.round(screen.y - rise)}px) translate(-50%, -50%) scale(${pop})`
      popup.el.style.opacity = String(Math.min(1, (popup.life / popup.span) * 2.5))
    }
  }
}

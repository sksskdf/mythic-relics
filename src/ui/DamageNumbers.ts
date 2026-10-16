import type * as THREE from 'three'

import { worldToScreen } from '../render/picking'
import type { RenderSize } from '../render/resolution'

export type DamageStyle = 'normal' | 'strong' | 'hurt' | 'thunder'

interface Popup {
  el: HTMLElement
  world: THREE.Vector3
  life: number
  drift: number
}

const LIFE = 0.7

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
      this.pool.push({ el, world: null as unknown as THREE.Vector3, life: 0, drift: 0 })
    }
    parent.appendChild(this.root)
  }

  show(world: THREE.Vector3, amount: number, style: DamageStyle): void {
    const popup = this.pool[this.next]!
    this.next = (this.next + 1) % this.pool.length
    popup.world = world.clone()
    popup.life = LIFE
    popup.drift = (Math.random() - 0.5) * 24
    popup.el.textContent = String(Math.round(amount))
    popup.el.className = `damage-number damage-number--${style}`
    popup.el.style.display = ''
  }

  update(dt: number, screenHeight: number, size: RenderSize, camera: THREE.Camera): void {
    for (const popup of this.pool) {
      if (popup.life <= 0) continue
      popup.life -= dt
      if (popup.life <= 0) {
        popup.el.style.display = 'none'
        continue
      }
      const t = 1 - popup.life / LIFE
      const screen = worldToScreen(popup.world, screenHeight, size, camera)
      const rise = 18 + t * 40
      const pop = t < 0.15 ? 1.5 - t * 3.3 : 1
      popup.el.style.transform = `translate(${Math.round(screen.x + popup.drift * t)}px, ${Math.round(screen.y - rise)}px) translate(-50%, -50%) scale(${pop})`
      popup.el.style.opacity = String(Math.min(1, (popup.life / LIFE) * 2.5))
    }
  }
}

import type * as THREE from 'three'

import { type Subpixel, worldToScreen } from '../render/picking'
import type { RenderSize } from '../render/resolution'
import { countWord } from './gainsLine'

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
  /** 처음부터 올려 띄우는 높이 (px): 이어 주운 이름이 떠 있는 앞 이름을 피해 그 위 줄에 뜬다 */
  lift: number
  /** 주운 것 이름인가, 아직 줄을 잡지 못했나 (처음 그릴 때 잡는다) */
  label: boolean
  fresh: boolean
  /** 마지막으로 그린 자리 (화면 px, 글의 한가운데)와 글의 폭: 뒤에 온 이름이 이 자리를 피한다 */
  x: number
  y: number
  width: number
  /** 줄이 다 차서 이 이름에 접힌 이름 수 (0이 아니면 글이 「+ 외 N」) */
  more: number
}

const LIFE = 0.7
/** 주운 것 이름은 더 오래, 더 높이 떠오른다 */
const LABEL_LIFE = 1.6
/**
 * 이어 주운 이름 (E307): 떠 있는 앞 이름과 겹치면 그 위 줄에 쌓는다 (한자리의 장비 넷을 주우면 이름 넷이 겹쳐 읽을 수 없었다).
 * 줄 높이는 글자 크기의 배수. 다섯 줄이 다 차면 맨 윗줄을 「+ 외 N」으로 바꿔 접는다 (보스가 쏟은 더미·자동 줍기)
 */
const LABEL_ROWS = 5
const LABEL_ROW_EM = 1.5
/** 이름이 처음 뜨는 높이 (px, 띄운 자리 위로) */
const POPUP_BASE = 18

/**
 * 새 이름을 얼마나 올려 띄울까 (px). above는 가로로 겹치는 떠 있는 이름들이 새 이름의 바닥 자리에서 얼마나 위에 있나 (px, 아래면 음수),
 * row는 줄 높이. 어느 이름과도 한 줄 넘게 떨어지는 가장 낮은 자리를 돌려준다.
 * 이름들은 같은 빠르기로 떠오르니 처음에 겹치지 않으면 끝까지 겹치지 않는다
 */
export function stackLift(above: readonly number[], row: number): number {
  let lift = 0
  for (const at of [...above].sort((a, b) => a - b)) {
    if (at <= lift - row) continue
    if (at >= lift + row) break
    lift = at + row
  }
  return lift
}

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
      this.pool.push({ el, world: null as unknown as THREE.Vector3, life: 0, span: LIFE, drift: 0, rise: 40, lift: 0, label: false, fresh: false, x: 0, y: 0, width: 0, more: 0 })
    }
    parent.appendChild(this.root)
  }

  show(world: THREE.Vector3, amount: number, style: DamageStyle): void {
    const popup = this.take(world, LIFE, (Math.random() - 0.5) * 24, 40)
    popup.el.textContent = String(Math.round(amount))
    popup.el.className = `damage-number damage-number--${style}`
    popup.el.style.color = ''
  }

  /**
   * 주운 것의 이름이 주인공 머리 위로 떠오른다 (사용자 의견 2026-10-28: 얻는 표현이 모자라다). color는 등급·신의 색.
   * 줍기를 알리는 것은 이 이름 하나뿐이라(E307) 이어 주운 이름끼리 겹치지 않게 한 줄씩 위로 쌓는다 (줄은 처음 그릴 때 잡는다, `settle`)
   */
  label(world: THREE.Vector3, text: string, color: string): void {
    const popup = this.take(world, LABEL_LIFE, 0, 56)
    popup.el.textContent = `+ ${text}`
    popup.el.className = 'damage-number damage-number--label'
    popup.el.style.color = color
    popup.label = true
    popup.fresh = true
  }

  /**
   * 새 이름의 줄을 잡는다: 화면에서 가로로 겹치는 떠 있는 이름들을 피해 가장 낮은 줄에 (x, y는 올리지 않았을 때 그릴 자리).
   * 주운 자리가 달라도(걸으며 주움) 화면 자리로 견주니 겹치지 않는다. 줄이 다 찼으면 맨 윗줄 이름에 접고 false (새 이름은 띄우지 않는다)
   */
  private settle(popup: Popup, x: number, y: number): boolean {
    popup.fresh = false
    const row = LABEL_ROW_EM * (parseFloat(getComputedStyle(popup.el).fontSize) || 12)
    popup.width = popup.el.offsetWidth
    const others = this.pool.filter((other) => other !== popup && other.label && !other.fresh && other.life > 0 && Math.abs(other.x - x) < (other.width + popup.width) / 2)
    const lift = stackLift(
      others.map((other) => y - other.y),
      row,
    )
    // 앞 이름이 그새 조금 떠올라 줄이 딱 맞지 않으니 반 줄은 봐준다
    if (lift <= row * (LABEL_ROWS - 0.5)) {
      popup.lift = lift
      return true
    }
    // 새 이름이 섰을 자리 바로 아래의 이름(쌓인 줄의 맨 위)을 「+ 외 N」으로: 그 이름과 새 이름, 앞서 접힌 이름들
    const top = others.filter((other) => y - other.y < lift).reduce((best, other) => (other.y < best.y ? other : best))
    top.more += 1
    top.el.textContent = `+ 외 ${countWord(top.more + 1)}`
    top.el.style.color = ''
    top.width = top.el.offsetWidth
    popup.life = 0
    popup.label = false
    popup.el.style.display = 'none'
    return false
  }

  private take(world: THREE.Vector3, life: number, drift: number, rise: number): Popup {
    const popup = this.pool[this.next]!
    this.next = (this.next + 1) % this.pool.length
    popup.world = world.clone()
    popup.life = life
    popup.span = life
    popup.drift = drift
    popup.rise = rise
    popup.lift = 0
    popup.label = false
    popup.fresh = false
    popup.more = 0
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
      if (popup.fresh && !this.settle(popup, screen.x, screen.y - POPUP_BASE - t * popup.rise)) continue
      const rise = POPUP_BASE + popup.lift + t * popup.rise
      const pop = t < 0.15 ? 1.5 - t * 3.3 : 1
      popup.x = screen.x + popup.drift * t
      popup.y = screen.y - rise
      popup.el.style.transform = `translate(${Math.round(popup.x)}px, ${Math.round(popup.y)}px) translate(-50%, -50%) scale(${pop})`
      popup.el.style.opacity = String(Math.min(1, (popup.life / popup.span) * 2.5))
    }
  }
}

import type { RelicDef } from '../data/schema'
import { relicCard } from './relicCard'
import './menu.css'

/**
 * 커서를 올린 유물의 설명 카드. HUD 유물 칸 위나 땅에 떨어진 유물 옆에 뜬다. (E4-03)
 */
export class RelicTooltip {
  private readonly root: HTMLElement
  private shown: string | null = null

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'relic-tooltip'
    this.root.hidden = true
    parent.append(this.root)
  }

  /** 화면 좌표 (x, y) 근처에 띄운다. above면 그 점 위로 띄운다. */
  show(def: RelicDef, x: number, y: number, above = false): void {
    if (this.shown !== def.id) {
      this.root.replaceChildren(relicCard(def))
      this.shown = def.id
    }
    this.root.hidden = false
    const { width, height } = this.root.getBoundingClientRect()
    const left = Math.min(Math.max(8, x - width / 2), innerWidth - width - 8)
    const top = above ? y - height - 10 : Math.min(y + 18, innerHeight - height - 8)
    this.root.style.transform = `translate(${Math.round(left)}px, ${Math.round(Math.max(8, top))}px)`
  }

  hide(): void {
    this.root.hidden = true
    this.shown = null
  }
}

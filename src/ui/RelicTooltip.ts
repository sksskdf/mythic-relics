import type { RelicDef } from '../data/schema'
import { relicCard, type RelicCardContext } from './relicCard'
import './menu.css'

/** 커서를 올리고 이만큼 머물러야 뜬다. 지나가며 스친 칸마다 카드가 번쩍이지 않게 한다. */
const HOVER_DELAY = 0.12

/**
 * 커서를 올린 유물의 설명 카드. HUD 유물 칸 위나 땅에 떨어진 유물 옆에 뜬다. (E4-03)
 * 끼고 있는 유물은 충전 정도가 살아 움직이므로, 보여 줄 내용이 바뀌면 다시 그린다.
 */
export class RelicTooltip {
  private readonly root: HTMLElement
  private key: string | null = null
  private target: string | null = null
  private since = 0

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'relic-tooltip'
    this.root.hidden = true
    parent.append(this.root)
  }

  /**
   * 화면 좌표 (x, y) 근처에 띄운다. above면 그 점 위로, 아니면 커서 오른쪽 아래로 띄우고 화면 밖으로 나가면 뒤집는다.
   * 매 프레임 불러도 된다.
   */
  show(def: RelicDef, ctx: RelicCardContext | undefined, x: number, y: number, above = false): void {
    const key = `${def.id}|${ctx?.place?.kind ?? ''}|${ctx?.charge === undefined ? '' : Math.round(ctx.charge * 20)}|${ctx?.manifested ?? ''}${ctx?.level ?? ''}|${ctx?.awake ? 1 : 0}`
    this.showCard(def.id, key, () => relicCard(def, ctx), x, y, above)
  }

  /** 아무 카드나 띄운다 (일반 장비 카드 등). target이 바뀌면 처음부터 잠깐 기다렸다 뜬다, key가 바뀌면 다시 그린다 */
  showCard(target: string, key: string, make: () => HTMLElement, x: number, y: number, above = false): void {
    if (this.target !== target) {
      this.target = target
      this.since = performance.now()
      this.root.classList.remove('is-shown')
    }
    if (this.key !== key) {
      this.root.replaceChildren(make())
      this.key = key
    }
    this.root.hidden = false
    if ((performance.now() - this.since) / 1000 >= HOVER_DELAY) this.root.classList.add('is-shown')
    const { width, height } = this.root.getBoundingClientRect()
    let left: number
    let top: number
    if (above) {
      left = x - width / 2
      top = y - height - 12
    } else {
      left = x + 18
      top = y + 18
      if (left + width > innerWidth - 8) left = x - width - 18
      if (top + height > innerHeight - 8) top = y - height - 18
    }
    left = Math.min(Math.max(8, left), innerWidth - width - 8)
    top = Math.min(Math.max(8, top), innerHeight - height - 8)
    this.root.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
  }

  hide(): void {
    this.root.hidden = true
    // 숨긴 카드에 지난 유물의 내용이 남지 않게 비운다
    this.root.replaceChildren()
    this.root.classList.remove('is-shown')
    this.key = null
    this.target = null
  }
}

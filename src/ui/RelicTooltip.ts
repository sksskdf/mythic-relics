import type { RelicDef } from '../data/schema'
import { foldCount } from '../relics/hover'
import { relicCard, type RelicCardContext } from './relicCard'
import './menu.css'

/** 커서를 올리고 이만큼 머물러야 뜬다. 지나가며 스친 칸마다 카드가 번쩍이지 않게 한다. */
const HOVER_DELAY = 0.12

/**
 * 카드가 머물 세로 띠 (화면 px): 위 끝과 아래 끝. 휴대폰에서 위쪽 HUD와 아래 엄지 자리를 가리지 않게 (E307).
 * keep을 주면 카드는 될 수 있으면 그 아래에 머문다 (주인공의 발): keep ~ bottom에 다 들어가지 않으면 아래쪽 단락부터 접는다
 */
export interface CardBand {
  top: number
  bottom: number
  keep?: number
}

/**
 * 커서를 올린 유물의 설명 카드. HUD 유물 칸 위나 땅에 떨어진 유물 옆에 뜬다. (E4-03)
 * 휴대폰에서는 주인공이 다가간 땅의 장비·유물·흔적의 카드를 정해진 띠 안에 띄운다 (E307).
 * 끼고 있는 유물은 충전 정도가 살아 움직이므로, 보여 줄 내용이 바뀌면 다시 그린다.
 */
export class RelicTooltip {
  private readonly root: HTMLElement
  private key: string | null = null
  private target: string | null = null
  private since = 0
  /** 지금 카드를 맞춰 접어 둔 띠 (카드를 다시 그리거나 띠가 바뀌면 다시 맞춘다) */
  private fitted: CardBand | null = null

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
  show(def: RelicDef, ctx: RelicCardContext | undefined, x: number, y: number, above = false, band?: CardBand): void {
    const key = `${def.id}|${ctx?.place?.kind ?? ''}|${ctx?.charge === undefined ? '' : Math.round(ctx.charge * 20)}|${ctx?.manifested ?? ''}${ctx?.level ?? ''}|${ctx?.awake ? 1 : 0}`
    this.showCard(def.id, key, () => relicCard(def, ctx), x, y, above, band)
  }

  /**
   * 아무 카드나 띄운다 (일반 장비 카드 등). target이 바뀌면 처음부터 잠깐 기다렸다 뜬다, key가 바뀌면 다시 그린다.
   * band를 주면 카드는 그 띠 안에 머문다 (띠가 카드보다 낮으면 위 끝에 맞춘다)
   */
  showCard(target: string, key: string, make: () => HTMLElement, x: number, y: number, above = false, band?: CardBand): void {
    if (this.target !== target) {
      this.target = target
      this.since = performance.now()
      this.root.classList.remove('is-shown')
    }
    if (this.key !== key) {
      this.root.replaceChildren(make())
      this.key = key
      this.fitted = null
    }
    this.root.hidden = false
    if ((performance.now() - this.since) / 1000 >= HOVER_DELAY) this.root.classList.add('is-shown')
    if (this.fitted !== (band ?? null)) {
      this.fitted = band ?? null
      this.fold(band)
    }
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
    top = band ? Math.max(band.top, Math.min(top, band.bottom - height)) : Math.min(Math.max(8, top), innerHeight - height - 8)
    this.root.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`
  }

  /**
   * 띠의 keep 아래에 다 들어가지 않는 카드를 간추린다: 아래쪽 단락(전해지는 이야기 → 고유 효과·덧붙는 설명)부터 접고,
   * 머리와 첫 단락(수치·지속 효과·깨우면 얻는 것)까지는 남긴다. 접은 것은 정보 화면에서 본다.
   * 카드를 그리거나 띠가 바뀔 때 한 번만 잰다 (띠 없이 띄우면 접은 것을 편다)
   */
  private fold(band?: CardBand): void {
    const card = this.root.firstElementChild
    if (!card) return
    const parts = [...card.children] as HTMLElement[]
    for (const part of parts) part.style.display = ''
    if (band?.keep === undefined) return
    const room = band.bottom - Math.max(band.top, band.keep)
    const first = parts.findIndex((part) => part.classList.contains('rc__section'))
    if (first < 0) return
    // 아래쪽 n개를 접는다 (접어 보고 높이를 재야 하니 세는 동안에도 접는다)
    const hide = (n: number): void => {
      for (let i = parts.length - n; i < parts.length; i++) parts[i]!.style.display = 'none'
    }
    hide(
      foldCount(parts.length, first, room, (folded) => {
        hide(folded)
        return this.root.getBoundingClientRect().height
      }),
    )
  }

  hide(): void {
    // 이미 숨겨져 있으면 손대지 않는다 (창이 열린 동안 프레임마다 불려도 되게)
    if (this.root.hidden) return
    this.root.hidden = true
    // 숨긴 카드에 지난 유물의 내용이 남지 않게 비운다
    this.root.replaceChildren()
    this.root.classList.remove('is-shown')
    this.key = null
    this.target = null
    this.fitted = null
  }
}

import './title.css'

import { BODY_OPTIONS, BODY_PART_NAMES, BODY_PARTS, type BodyLook, DEFAULT_BODY } from '../looks/body'
import { sigilRing } from './emblem'
import { heroIcon } from './heroIcon'
import { HeroPreview } from './HeroPreview'
import { glyph } from './sigils'
import type { SlotSummary } from './slotSummary'

/**
 * 읽지 못한 저장이 든 슬롯 (E307 0B): 더 새 버전이 쓴 저장(newer)이거나 깨진 글(broken).
 * 빈 슬롯처럼 새 모험을 시작할 수 있고, 원본은 옆 키에 남는다 (kept, `saveStorage.unread`).
 * 저장소가 차서 원본을 남기지 못한 칸(kept가 false)은 덮지 않으므로 거기서 시작한 새 판은 저장되지 않는다 (`saveStorage.save`)
 */
export interface UnreadSlot {
  unread: 'newer' | 'broken'
  kept: boolean
}

/** 슬롯 카드 하나: 저장 요약, 읽지 못한 저장, 빈 슬롯(null) */
export type SlotCard = SlotSummary | UnreadSlot | null

/** 읽지 못한 저장의 한 줄: 무엇이 들어 있는지와, 원본을 남겼는지 (남기지 못한 칸은 원본을 지키려고 새 판을 저장하지 않는다: `saveStorage.save`) */
export function unreadLine(slot: UnreadSlot): string {
  const what = slot.unread === 'newer' ? '더 새 버전의 저장' : '깨진 저장'
  return `${what} · ${slot.kept ? '원본은 남겨 둠' : '공간이 모자라 이 칸은 저장되지 않음'}`
}

/**
 * 슬롯의 「×」를 켠 뒤 이만큼(ms) 안에 다시 누른 것은 급히 두 번 누른 것으로 보고 지우지 않는다 (E307).
 * 휴대폰에서는 「×」가 카드 모서리 44px을 받아(`portrait.css`) 이어 가려던 누름이 닿을 수 있다: 「한 번 더 누르면 지움」을 볼 틈을 둔다
 */
export const DELETE_GUARD_MS = 500

/** 켠 「×」를 다시 눌렀다: 지우나 (켠 때와 지금, ms) */
export function confirmsDelete(armedAt: number, now: number): boolean {
  return now - armedAt >= DELETE_GUARD_MS
}

export interface TitleHandlers {
  /** 빈 슬롯을 골라 캐릭터를 만들었다 */
  onCreate(slot: number, body: BodyLook): void
  /** 저장이 있는 슬롯을 골랐다 */
  onContinue(slot: number): void
  /** 슬롯을 지웠다 */
  onDelete(slot: number): void
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`

/**
 * 시작·로딩 화면. 실행하자마자 글 없이 문장 고리 하나가 가운데에서 숨 쉬듯 흐려졌다 진해지며 로딩을 알린다.
 * 실행 후 게임까지 가장 빨리 닿는 것이 목표다.
 * - 마지막으로 플레이한 슬롯이 있으면: 준비되는 대로 바로 사라지고 그 슬롯을 이어서 플레이한다.
 * - 처음 실행이거나 게임에서 처음 화면으로 돌아왔으면: 제목과 저장 슬롯 3개. 빈 슬롯은 캐릭터 만들기로.
 *   읽지 못한 저장이 든 슬롯은 빈 슬롯처럼 누르되 「읽지 못한 저장」이라고 알린다 (단추는 늘리지 않는다, E307 0B).
 */
export class TitleScreen {
  readonly root: HTMLElement
  private readonly menu: HTMLElement

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div')
    this.root.className = 'title is-loading'
    this.root.innerHTML = `
      <div class="title__logo">
        <img class="title__ring" src="${sigilRing()}" alt="" />
        <h1 class="title__name">MYTHIC <span>RELICS</span></h1>
        <p class="title__tag">신들이 사라진 세계</p>
      </div>
      <div class="title__menu"></div>
      <p class="title__build">PROTOTYPE</p>
    `
    this.menu = this.root.querySelector('.title__menu')!
    parent.appendChild(this.root)
  }

  /** 게임이 준비되었고 이어 갈 슬롯이 있다: 곧바로 닫는다. */
  continueNow(onStart: () => void): void {
    this.root.classList.remove('is-loading')
    this.close(onStart)
  }

  /** 슬롯 고르기 */
  showSlots(slots: readonly SlotCard[], handlers: TitleHandlers): void {
    this.root.classList.remove('is-loading', 'is-creating')
    this.menu.replaceChildren()
    const list = this.el('div', 'title-slots', this.menu)
    slots.forEach((slot, i) => {
      const unread = slot !== null && 'unread' in slot ? slot : null
      const info = slot !== null && !('unread' in slot) ? slot : null
      const card = this.el('button', `title-slot${info ? '' : unread ? ' is-empty is-unread' : ' is-empty'}`, list) as HTMLButtonElement
      card.type = 'button'
      card.style.animationDelay = `${i * 0.06}s`
      if (info) {
        // 초상은 그 슬롯 주인공의 얼굴 (E307: 신의 문장·칭호 대신). 손에 쥔 신이 있으면 그 색으로 빛난다
        if (info.color) card.style.setProperty('--glow', info.color)
        const portrait = this.el('span', 'ui-portrait', card)
        portrait.style.setProperty('--glow', info.color || 'var(--c-line-2)')
        const img = document.createElement('img')
        img.src = heroIcon(info.body)
        img.alt = ''
        portrait.append(img)
        const words = this.el('span', 'title-slot__words', card)
        this.el('span', 'title-slot__title', words).textContent = info.title
        this.el('span', 'title-slot__meta', words).textContent = info.meta
        card.addEventListener('click', () => handlers.onContinue(i))
        // 지우기: 한 번 더 눌러야 지워진다
        const del = this.el('span', 'title-slot__delete', card)
        del.setAttribute('role', 'button')
        del.setAttribute('aria-label', '슬롯 지우기')
        del.textContent = '×'
        let armedAt = 0
        del.addEventListener('click', (e) => {
          e.stopPropagation()
          if (del.classList.contains('is-confirm')) {
            if (confirmsDelete(armedAt, performance.now())) handlers.onDelete(i)
            return
          }
          armedAt = performance.now()
          del.classList.add('is-confirm')
          del.textContent = '한 번 더 누르면 지움'
          setTimeout(() => {
            del.classList.remove('is-confirm')
            del.textContent = '×'
          }, 2500)
        })
      } else {
        this.el('span', 'title-slot__plus', card).textContent = '+'
        const words = this.el('span', 'title-slot__words', card)
        if (unread) {
          // 읽지 못한 저장: 빈 칸처럼 새 모험을 시작할 수 있지만, 무엇이 들어 있는지 한 줄로 알린다
          this.el('span', 'title-slot__title', words).textContent = '읽지 못한 저장'
          this.el('span', 'title-slot__meta', words).textContent = unreadLine(unread)
        } else words.textContent = '새 모험'
        card.addEventListener('click', () => this.showCreator(i, slots, handlers))
      }
    })
  }

  /** 캐릭터 만들기: 가운데에 돌아가는 미리 보기, 피부·머리카락·옷 색 고르기, [시작] */
  private showCreator(slot: number, slots: readonly SlotCard[], handlers: TitleHandlers): void {
    this.root.classList.add('is-creating')
    this.menu.replaceChildren()
    const body: BodyLook = { ...DEFAULT_BODY }
    const preview = new HeroPreview()
    const box = this.el('div', 'title-creator', this.menu)
    const stage = this.el('div', 'title-creator__stage', box)
    stage.append(preview.canvas)
    const pickers = this.el('div', 'title-creator__pickers', box)
    for (const part of BODY_PARTS) {
      const row = this.el('div', 'title-creator__row', pickers)
      this.el('span', 'title-creator__label', row).textContent = BODY_PART_NAMES[part]
      const swatches = this.el('div', 'title-creator__swatches', row)
      BODY_OPTIONS[part].forEach((colors, i) => {
        const b = this.el('button', `title-swatch${i === body[part] ? ' is-on' : ''}`, swatches) as HTMLButtonElement
        b.type = 'button'
        b.setAttribute('aria-label', `${BODY_PART_NAMES[part]} ${i + 1}`)
        b.style.background = colors.length > 1 ? `linear-gradient(135deg, ${hex(colors[0]!)} 55%, ${hex(colors[1]!)} 55%)` : hex(colors[0]!)
        b.addEventListener('click', () => {
          body[part] = i
          for (const other of swatches.children) other.classList.toggle('is-on', other === b)
          preview.setBody(body)
        })
      })
    }
    const actions = this.el('div', 'title-creator__actions', box)
    const back = this.el('button', 'title__button title__button--ghost', actions) as HTMLButtonElement
    back.type = 'button'
    back.append(this.icon('none'), '뒤로')
    back.addEventListener('click', () => this.showSlots(slots, handlers))
    const start = this.el('button', 'title__button title__button--primary', actions) as HTMLButtonElement
    start.type = 'button'
    start.textContent = '시작'
    start.addEventListener('click', () => this.close(() => handlers.onCreate(slot, body)), { once: true })
    preview.start()
  }

  private icon(name: Parameters<typeof glyph>[0]): HTMLImageElement {
    const img = document.createElement('img')
    img.src = glyph(name, '#b9c3cf', '#5d6876')
    img.alt = ''
    return img
  }

  private el(tag: string, className: string, parent: HTMLElement): HTMLElement {
    const e = document.createElement(tag)
    e.className = className
    parent.append(e)
    return e
  }

  private close(then: () => void): void {
    this.root.classList.add('is-leaving')
    then()
    window.setTimeout(() => this.root.remove(), 500)
  }
}

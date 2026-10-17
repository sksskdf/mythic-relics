import './title.css'

import { BODY_OPTIONS, BODY_PART_NAMES, BODY_PARTS, type BodyLook, DEFAULT_BODY } from '../looks/body'
import { classIcon } from './classIcons'
import { sigilRing } from './emblem'
import { HeroPreview } from './HeroPreview'
import { glyph } from './sigils'

/** 슬롯 카드에 보일 것. 빈 슬롯이면 null */
export interface SlotSummary {
  /** 가장 높은 클래스 */
  className: string
  title: string
  level: number
  color: string
  /** 가진 유물 수 */
  relics: number
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
  showSlots(slots: readonly (SlotSummary | null)[], handlers: TitleHandlers): void {
    this.root.classList.remove('is-loading', 'is-creating')
    this.menu.replaceChildren()
    const list = this.el('div', 'title-slots', this.menu)
    slots.forEach((info, i) => {
      const card = this.el('button', `title-slot${info ? '' : ' is-empty'}`, list) as HTMLButtonElement
      card.type = 'button'
      card.style.animationDelay = `${i * 0.06}s`
      if (info) {
        card.style.setProperty('--glow', info.color)
        const portrait = this.el('span', 'ui-portrait', card)
        portrait.style.setProperty('--glow', info.color)
        const img = document.createElement('img')
        img.src = classIcon(info.className)
        img.alt = ''
        portrait.append(img)
        const words = this.el('span', 'title-slot__words', card)
        this.el('span', 'title-slot__title', words).textContent = info.title
        this.el('span', 'title-slot__meta', words).textContent = `${info.className} Lv${info.level} · 유물 ${info.relics}개`
        card.addEventListener('click', () => handlers.onContinue(i))
        // 지우기: 한 번 더 눌러야 지워진다
        const del = this.el('span', 'title-slot__delete', card)
        del.setAttribute('role', 'button')
        del.setAttribute('aria-label', '슬롯 지우기')
        del.textContent = '×'
        del.addEventListener('click', (e) => {
          e.stopPropagation()
          if (del.classList.contains('is-confirm')) {
            handlers.onDelete(i)
            return
          }
          del.classList.add('is-confirm')
          del.textContent = '한 번 더 누르면 지움'
          setTimeout(() => {
            del.classList.remove('is-confirm')
            del.textContent = '×'
          }, 2500)
        })
      } else {
        this.el('span', 'title-slot__plus', card).textContent = '+'
        this.el('span', 'title-slot__words', card).textContent = '새 모험'
        card.addEventListener('click', () => this.showCreator(i, slots, handlers))
      }
    })
  }

  /** 캐릭터 만들기: 가운데에 돌아가는 미리 보기, 피부·머리카락·옷 색 고르기, [시작] */
  private showCreator(slot: number, slots: readonly (SlotSummary | null)[], handlers: TitleHandlers): void {
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

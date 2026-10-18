import { RENDER_QUALITIES, type RenderQuality, type Settings } from '../save/settings'
import './pause.css'

/** 일시 정지 메뉴가 게임에서 읽고 부르는 것 */
export interface PauseHost {
  settings(): Settings
  /** 설정 일부를 바꾼다: 바로 적용하고 저장한다 */
  change(patch: Partial<Settings>): void
  /** 저장하고 처음 화면(슬롯 고르기)으로 */
  toTitle(): void
}

const QUALITY_NAMES: Record<RenderQuality, string> = { low: '낮음', normal: '보통', high: '높음' }
const VOLUME_NAMES: [keyof Settings['volume'], string][] = [
  ['master', '전체'],
  ['music', '음악'],
  ['sfx', '효과음'],
]

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

function button(className: string, text: string, run: () => void): HTMLButtonElement {
  const b = el('button', className, text)
  b.type = 'button'
  b.addEventListener('click', run)
  return b
}

/**
 * 일시 정지 메뉴 (E5-04·05). Esc를 누르거나 창 밖으로 나가면 뜬다. 떠 있는 동안 게임은 멈춘다.
 * 계속하기, 설정(음량·화면 흔들림·번쩍임·렌더 해상도), 처음 화면으로.
 */
export class PauseMenu {
  private readonly root: HTMLElement
  private readonly settingsBox: HTMLElement
  private readonly settingsButton: HTMLButtonElement
  /** 열고 닫을 때 (게임 멈춤) */
  onToggle: (open: boolean) => void = () => {}

  constructor(
    parent: HTMLElement,
    private readonly host: PauseHost,
  ) {
    this.root = el('div', 'pause')
    this.root.hidden = true
    const frame = el('section', 'pause__frame ui-panel')
    frame.append(el('h2', 'pause__title', '멈춤'))
    const resume = button('pause__button ui-btn is-on', '계속하기', () => this.hide())
    this.settingsButton = button('pause__button ui-btn', '설정', () => this.toggleSettings())
    const home = button('pause__button ui-btn', '처음 화면', () => {
      if (home.classList.contains('is-confirm')) return host.toTitle()
      home.classList.add('is-confirm')
      home.textContent = '한 번 더 누르면 저장하고 이동'
      setTimeout(() => {
        home.classList.remove('is-confirm')
        home.textContent = '처음 화면'
      }, 2500)
    })
    this.settingsBox = el('div', 'pause__settings')
    this.settingsBox.hidden = true
    frame.append(resume, this.settingsButton, this.settingsBox, home)
    this.root.append(frame)
    // 바깥 어두운 곳을 누르면 계속한다.
    this.root.addEventListener('pointerdown', (e) => {
      if (e.target === this.root) this.hide()
    })
    this.root.addEventListener('wheel', (e) => e.stopPropagation())
    parent.append(this.root)
  }

  get open(): boolean {
    return !this.root.hidden
  }

  /** 연다. settings면 설정을 펼친 채로 */
  show(settings = false): void {
    this.settingsBox.hidden = !settings
    this.settingsButton.classList.toggle('is-open', settings)
    if (settings) this.renderSettings()
    if (this.open) return
    this.root.hidden = false
    this.onToggle(true)
  }

  hide(): void {
    if (!this.open) return
    this.root.hidden = true
    this.onToggle(false)
  }

  private toggleSettings(): void {
    const open = this.settingsBox.hidden !== false
    this.settingsBox.hidden = !open
    this.settingsButton.classList.toggle('is-open', open)
    if (open) this.renderSettings()
  }

  private renderSettings(): void {
    const s = this.host.settings()
    const box = this.settingsBox
    box.replaceChildren()
    box.append(el('div', 'ui-label', '소리'))
    for (const [key, name] of VOLUME_NAMES) {
      const row = el('label', 'pause__row')
      const value = el('span', 'pause__value', `${Math.round(s.volume[key] * 100)}`)
      const range = el('input', 'pause__range')
      range.type = 'range'
      range.min = '0'
      range.max = '100'
      range.step = '5'
      range.value = String(Math.round(s.volume[key] * 100))
      range.setAttribute('aria-label', `${name} 음량`)
      range.addEventListener('input', () => {
        value.textContent = range.value
        this.host.change({ volume: { ...this.host.settings().volume, [key]: Number(range.value) / 100 } })
      })
      row.append(el('span', 'pause__name', name), range, value)
      box.append(row)
    }
    box.append(el('div', 'ui-label', '화면'))
    const choice = <T>(name: string, options: readonly [T, string][], current: T, pick: (v: T) => void) => {
      const row = el('div', 'pause__row')
      const pills = el('div', 'pause__pills')
      for (const [v, label] of options) {
        const b = button(`ui-pill${v === current ? ' is-on' : ''}`, label, () => {
          pick(v)
          this.renderSettings()
        })
        b.setAttribute('aria-pressed', String(v === current))
        b.dataset.setting = name
        pills.append(b)
      }
      row.append(el('span', 'pause__name', name), pills)
      box.append(row)
    }
    const onOff: [boolean, string][] = [
      [true, '켬'],
      [false, '끔'],
    ]
    choice('화면 흔들림', onOff, s.shake, (shake) => this.host.change({ shake }))
    choice('번쩍임', onOff, s.flash, (flash) => this.host.change({ flash }))
    choice(
      '해상도',
      RENDER_QUALITIES.map((q) => [q, QUALITY_NAMES[q]] as [RenderQuality, string]),
      s.quality,
      (quality) => this.host.change({ quality }),
    )
  }
}

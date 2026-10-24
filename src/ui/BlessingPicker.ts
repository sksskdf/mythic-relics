import type { Blessing } from '../data/rift'
import './blessing.css'

/**
 * 균열의 축복 고르기 (E17-03): 층을 깨면 화면 가운데에 카드 셋. 하나를 누르면 닫히고 다음 층 문이 열린다.
 * 글은 이름과 한 줄 설명만 (텍스트 최소화의 예외: 고르는 화면).
 */
export class BlessingPicker {
  private readonly root = document.createElement('div')

  constructor(parent: HTMLElement) {
    this.root.className = 'blessing'
    this.root.hidden = true
    parent.append(this.root)
  }

  get open(): boolean {
    return !this.root.hidden
  }

  show(choices: readonly Blessing[], pick: (id: string) => void): void {
    this.root.replaceChildren()
    const title = document.createElement('div')
    title.className = 'blessing__title'
    title.textContent = '축복 하나를 고른다'
    const row = document.createElement('div')
    row.className = 'blessing__row'
    for (const b of choices) {
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'blessing__card'
      const name = document.createElement('b')
      name.textContent = b.name
      const text = document.createElement('small')
      text.textContent = b.text
      card.append(name, text)
      card.addEventListener('click', (e) => {
        e.stopPropagation()
        this.root.hidden = true
        pick(b.id)
      })
      row.append(card)
    }
    this.root.append(title, row)
    this.root.hidden = false
  }

  hide(): void {
    this.root.hidden = true
  }
}

import { levelGains } from '../myth/levelGains'
import { type God, godDef } from '../relics/data'
import { classIcon } from './classIcons'
import './mythPicker.css'

/**
 * 신화 고르기 (E22-03): 그 신화권 성소 가운데에 서면 신화 넷이 카드로 나란히 선다. 하나를 누르면 닫힌다.
 * first면 처음 고르는 신화라 그 신화로 싸우고, 아니면 연 신화를 마을·성소에서 바꿔 쓸 수 있다. 나머지가 언제 열리는지 한 줄 덧붙인다.
 * 글은 이름·칭호와 공격·힘 두 줄만 (텍스트 최소화의 예외: 고르는 화면).
 */
export class MythPicker {
  private readonly root = document.createElement('div')

  constructor(parent: HTMLElement) {
    this.root.className = 'myth-pick'
    this.root.hidden = true
    parent.append(this.root)
  }

  get open(): boolean {
    return !this.root.hidden
  }

  /** rest: 나머지 신화가 열리는 때 (「거인 왕을 쓰러뜨리면」) */
  show(gods: readonly God[], first: boolean, rest: string | null, pick: (god: God) => void): void {
    this.root.replaceChildren()
    const title = document.createElement('div')
    title.className = 'myth-pick__title'
    title.textContent = first ? '신화 하나를 고른다' : '신화 하나를 연다'
    const note = document.createElement('div')
    note.className = 'myth-pick__note'
    const after = rest ? ` 나머지는 ${rest} 열린다` : ''
    note.textContent = (first ? '고른 신의 힘으로 싸운다.' : '연 신화는 마을이나 성소에서 바꿔 쓸 수 있다.') + after
    const row = document.createElement('div')
    row.className = 'myth-pick__row'
    for (const god of gods) {
      const def = godDef(god)
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'myth-pick__card'
      card.dataset.god = god
      card.style.setProperty('--glow', def.color)
      const icon = document.createElement('img')
      icon.src = classIcon(def.name)
      icon.alt = ''
      const name = document.createElement('b')
      name.textContent = def.name
      const epithet = document.createElement('span')
      epithet.textContent = def.titles[0]!
      const lines = document.createElement('ul')
      for (const g of levelGains(god, 1).filter((x) => x.kind === 'power').slice(0, 2)) {
        const li = document.createElement('li')
        li.textContent = g.text
        lines.append(li)
      }
      card.append(icon, name, epithet, lines)
      card.addEventListener('click', (e) => {
        e.stopPropagation()
        this.root.hidden = true
        pick(god)
      })
      row.append(card)
    }
    this.root.append(title, note, row)
    this.root.hidden = false
  }

  hide(): void {
    this.root.hidden = true
  }
}

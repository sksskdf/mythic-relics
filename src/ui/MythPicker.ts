import { ATTACK_NAMES } from '../combat/styles'
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

  /**
   * 두 갈래 (E302-03): 새 신의 부품이 왔는데 그 자리가 차 있을 때. 「새 신의 것으로 / 지금 그대로」 카드 둘.
   * 고르는 화면이라 게임은 멈춘다 (정보 화면의 카드이지 전투 버튼이 아니다)
   */
  swap(part: 'hand' | 'heart', incoming: God, current: God, choose: (take: boolean) => void): void {
    this.root.replaceChildren()
    const title = document.createElement('div')
    title.className = 'myth-pick__title'
    title.textContent = part === 'hand' ? '손에 무엇을 쥘까' : '심장에 무엇을 둘까'
    const note = document.createElement('div')
    note.className = 'myth-pick__note'
    note.textContent = '고르지 않은 쪽은 신 탭에서 언제든 다시 낀다.'
    const row = document.createElement('div')
    row.className = 'myth-pick__row'
    const what = (god: God) => (part === 'hand' ? `공격: ${ATTACK_NAMES[godDef(god).attack]}` : `궁극기 「${godDef(god).ultimate.name}」`)
    for (const [god, take, label] of [
      [incoming, true, part === 'hand' ? '새 무기를 쥔다' : '새 궁극기를 둔다'],
      [current, false, '지금 그대로'],
    ] as const) {
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
      name.textContent = label
      const epithet = document.createElement('span')
      epithet.textContent = def.name
      const lines = document.createElement('ul')
      const li = document.createElement('li')
      li.textContent = what(god)
      lines.append(li)
      card.append(icon, name, epithet, lines)
      card.addEventListener('click', (e) => {
        e.stopPropagation()
        this.root.hidden = true
        choose(take)
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

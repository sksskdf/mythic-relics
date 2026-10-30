import { ATTACK_NAMES } from '../combat/styles'
import { type God, godDef } from '../relics/data'
import { classIcon } from './classIcons'
import './swapCard.css'

/**
 * 두 갈래 카드 (E302-03): 새 신의 부품이 왔는데 그 자리가 차 있을 때. 「새 신의 것으로 / 지금 그대로」 카드 둘.
 * 고르는 화면이라 게임은 멈춘다 (정보 화면의 카드이지 전투 버튼이 아니다). 글은 이름과 한 줄만 (텍스트 최소화의 예외: 고르는 화면).
 * 옛 성소의 신화 고르기 카드(E22-03)는 E305-03에서 걷고 이 카드만 남겼다
 */
export class SwapCard {
  private readonly root = document.createElement('div')

  constructor(parent: HTMLElement) {
    this.root.className = 'swap-card'
    this.root.hidden = true
    parent.append(this.root)
  }

  get open(): boolean {
    return !this.root.hidden
  }

  show(part: 'hand' | 'heart', incoming: God, current: God, choose: (take: boolean) => void): void {
    this.root.replaceChildren()
    const title = document.createElement('div')
    title.className = 'swap-card__title'
    title.textContent = part === 'hand' ? '손에 무엇을 쥘까' : '심장에 무엇을 둘까'
    const note = document.createElement('div')
    note.className = 'swap-card__note'
    note.textContent = '고르지 않은 쪽은 신 탭에서 언제든 다시 낀다.'
    const row = document.createElement('div')
    row.className = 'swap-card__row'
    const what = (god: God) => (part === 'hand' ? `공격: ${ATTACK_NAMES[godDef(god).attack]}` : `궁극기 「${godDef(god).ultimate.name}」`)
    for (const [god, take, label] of [
      [incoming, true, part === 'hand' ? '새 무기를 쥔다' : '새 궁극기를 둔다'],
      [current, false, '지금 그대로'],
    ] as const) {
      const def = godDef(god)
      const card = document.createElement('button')
      card.type = 'button'
      card.className = 'swap-card__card'
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

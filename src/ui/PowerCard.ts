import { PickCardGuard } from './pickGate'
import { powerCardMarkup, type PowerCardView } from './powerCardView'
import './pickCard.css'
import './powerCard.css'

/**
 * 힘 카드 (재미 재설계 P5): 신이 내미는 힘 셋 가운데 하나를 고른다. 세 줄이 곧 누를 것이고 닫기 단추는 없다 (골라야 닫힌다).
 * 뜬 동안 게임은 멈춘다 (`Game.paused`). 싸움 끝에 뜰 수 있는 카드라 뜬 직후의 누름은 받지 않는다 (`pickGate.ts`)
 */
export class PowerCard {
  private readonly root = document.createElement('div')
  private readonly guard = new PickCardGuard(this.root)

  constructor(parent: HTMLElement) {
    this.root.className = 'pick-card power-card'
    this.root.hidden = true
    parent.append(this.root)
  }

  get open(): boolean {
    return !this.root.hidden
  }

  show(view: PowerCardView, pick: (id: string) => void): void {
    this.root.innerHTML = powerCardMarkup(view)
    for (const row of this.root.querySelectorAll<HTMLButtonElement>('.power-card__row')) {
      this.guard.on(row, () => {
        this.guard.close()
        pick(row.dataset.power!)
      })
    }
    this.guard.open()
  }

  hide(): void {
    this.guard.close()
  }
}

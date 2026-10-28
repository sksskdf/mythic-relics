import './rotate.css'

import { wantsPortrait } from '../input/device'

/**
 * 휴대폰을 가로로 들면 세로로 돌려 달라고 안내한다 (E235: 휴대폰은 세로 화면만).
 * 시작 화면부터 덮고, 떠 있는 동안 게임은 멈춘다.
 */
export class RotateHint {
  readonly root = document.createElement('div')

  constructor(
    parent: HTMLElement,
    private readonly touch: boolean,
  ) {
    this.root.className = 'rotate-hint'
    this.root.innerHTML = '<div class="rotate-hint__phone"></div><p class="rotate-hint__text">휴대폰을 세로로 들어 주세요</p>'
    parent.appendChild(this.root)
    addEventListener('resize', () => this.check())
    this.check()
  }

  /** 안내가 떠 있나 */
  get shown(): boolean {
    return !this.root.hidden
  }

  private check(): void {
    this.root.hidden = !wantsPortrait(this.touch, innerWidth, innerHeight)
  }
}

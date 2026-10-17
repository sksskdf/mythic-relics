import './title.css'

import { sigilRing } from './emblem'

/**
 * 시작·로딩 화면. 실행하자마자 문장 고리와 제목이 숨 쉬듯 흐려졌다 진해지며 로딩을 알린다.
 * 실행 후 게임까지 가장 빨리 닿는 것이 목표라, 단추는 처음 실행할 때의 [시작] 하나뿐이다.
 * - 처음 실행(저장 없음): 준비되면 숨쉬기를 멈추고 [시작]을 띄운다.
 * - 그 뒤 실행: 준비되는 대로 바로 사라지고 이어서 플레이한다.
 */
export class TitleScreen {
  readonly root: HTMLElement

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
    parent.appendChild(this.root)
  }

  /** 게임이 준비되면 부른다. 처음 실행이면 [시작]을 기다리고, 아니면 곧바로 닫는다. */
  ready(firstRun: boolean, onStart: () => void): void {
    this.root.classList.remove('is-loading')
    if (!firstRun) {
      this.close(onStart)
      return
    }
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'title__button title__button--primary'
    button.textContent = '시작'
    button.addEventListener('click', () => this.close(onStart), { once: true })
    this.root.querySelector('.title__menu')!.append(button)
  }

  private close(then: () => void): void {
    this.root.classList.add('is-leaving')
    then()
    window.setTimeout(() => this.root.remove(), 500)
  }
}

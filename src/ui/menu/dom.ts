import { MAX_LEVEL } from '../../myth/ClassProgress'
import type { MenuHost } from './host'

/** 클래스 이름(과 글)을 붙인 요소를 만든다 */
export function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/** 그림 요소 (꾸밈 그림이라 alt는 비운다) */
export function img(src: string, className = ''): HTMLImageElement {
  const i = el('img', className)
  i.src = src
  i.alt = ''
  return i
}

/** 레벨을 보석 점으로 (parts.css의 .ui-gems) */
export function pips(level: number, max = MAX_LEVEL): HTMLElement {
  const box = el('span', 'ui-gems ui-gems--small menu-gems')
  for (let i = 1; i <= max; i++) box.append(el('i', i <= level ? 'is-on' : ''))
  return box
}

/** 탭이 정보 화면에서 쓰는 것 */
export interface TabContext {
  readonly host: MenuHost
  /** 커서를 올리거나(데스크톱) 누르면(터치) 그 칸 근처에 힌트를 띄운다 */
  hintOn(target: HTMLElement, text: string | (() => string)): void
  /** 지금 탭을 다시 그린다 */
  render(): void
  /** 정보 화면을 닫는다 */
  close(): void
}

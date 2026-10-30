import { el, type TabContext } from './dom'

/**
 * 맹세 탭 (E305-01): 지금 건 맹세와 맹세마다 제약·지키면 얻는 것·가장 빠른 기록.
 * 맹세는 귀환하고 다시 떠날 때 출발 카드에서 고른다 (여기서는 보기만)
 */
export function renderOaths(ctx: TabContext, body: HTMLElement): void {
  const { oaths } = ctx.host
  const wrap = el('div', 'menu-src')
  const head = el('section', 'menu-src__panel')
  const now = oaths.current()
  head.append(el('div', 'menu-src__title', now ? `지금 건 맹세 · ${now}` : '지금 건 맹세 없음'))
  head.append(el('div', 'menu-src__text', '귀환하고 다시 떠날 때 하나를 건다. 그 원정에서 장 보스나 수호자를 이기면 지킨 것이다'))
  head.append(el('div', 'menu-src__text', `빨리 지킬수록 명성이 더 붙는다 (지금 ×${oaths.renownScale().toFixed(2)})`))
  wrap.append(head)
  const grid = el('div', 'menu-oaths')
  for (const o of oaths.list()) {
    const card = el('section', `menu-src__source${o.kept ? ' is-awake' : ''}`)
    card.style.setProperty('--god', 'var(--c-gilt)')
    const top = el('div', 'menu-src__head')
    top.append(el('b', '', o.name))
    if (o.kept) top.append(el('span', 'ui-tag ui-tag--solid', o.best ? `지킴 · ${o.best}` : '지킴'))
    card.append(top, el('div', 'menu-src__line is-on', o.rule), el('div', 'menu-src__line', `지키면 ${o.reward}`))
    grid.append(card)
  }
  wrap.append(grid)
  body.append(wrap)
}

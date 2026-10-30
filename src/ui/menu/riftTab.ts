import { el, type TabContext } from './dom'

/**
 * 균열 탭 (E17): 한계를 깨는 길, 균열 들어가기와 지금 층, 깊이 기록 (축복·성좌판은 E305-03에서 걷었다)
 */
export function renderRift(ctx: TabContext, body: HTMLElement): void {
  const { rift } = ctx.host
  const wrap = el('div', 'menu-src')
  const head = el('section', 'menu-src__panel')
  if (!rift.open()) {
    head.append(el('div', 'menu-src__title', '균열 · 닫힘'))
    const { reached, limit } = rift.depth()
    head.append(el('div', 'menu-src__text', `깊이 ${limit} 원정에서 장 보스나 수호자를 이기고 귀환하면 한계를 깨고 균열이 열린다`))
    const row = el('div', 'menu-src__levels')
    row.append(el('span', `ui-pill${reached >= limit ? ' is-done' : ''}`, `깊이 ${reached}/${limit}`))
    head.append(row)
  } else {
    const run = rift.run()
    head.append(el('div', 'menu-src__title', run ? `균열 ${run.depth}층` : `균열 · 가장 깊이 ${rift.best()}층`))
    if (run) head.append(el('div', 'menu-src__text', '층의 적을 모두 쓰러뜨리면 다음 층 문이 열린다'))
    else {
      const go = el('button', 'menu-src__level is-next', '균열에 들어가기')
      go.type = 'button'
      go.disabled = !rift.canEnter()
      go.addEventListener('click', () => rift.enter() && ctx.close())
      head.append(go, el('div', 'menu-src__text', rift.canEnter() ? '들어갈 때마다 1층부터. 나오거나 쓰러지면 끝나고 깊이 기록·재료만 남는다' : '마을에서 들어갈 수 있다'))
    }
    head.append(el('div', 'menu-src__text', '층마다 원형, 5층마다 보스의 재료'))
  }
  wrap.append(head)
  body.append(wrap)
}

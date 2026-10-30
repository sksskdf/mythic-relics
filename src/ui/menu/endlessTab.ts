import { el, type TabContext } from './dom'

/**
 * 끝없는 원정 탭 (E17 균열 → E305-03): 한계를 깨는 길, 나서기와 지금 층, 깊이 기록 (축복·성좌판은 E305-03에서 걷었다)
 */
export function renderEndless(ctx: TabContext, body: HTMLElement): void {
  const { endless } = ctx.host
  const wrap = el('div', 'menu-src')
  const head = el('section', 'menu-src__panel')
  if (!endless.open()) {
    head.append(el('div', 'menu-src__title', '끝없는 원정 · 닫힘'))
    const { reached, limit } = endless.depth()
    head.append(el('div', 'menu-src__text', `깊이 ${limit} 원정에서 장 보스나 수호자를 이기고 귀환하면 한계를 깨고 끝없는 원정이 열린다`))
    const row = el('div', 'menu-src__levels')
    row.append(el('span', `ui-pill${reached >= limit ? ' is-done' : ''}`, `깊이 ${reached}/${limit}`))
    head.append(row)
  } else {
    const run = endless.run()
    head.append(el('div', 'menu-src__title', run ? `끝없는 원정 ${run.depth}층` : `끝없는 원정 · 가장 깊이 ${endless.best()}층`))
    if (run) head.append(el('div', 'menu-src__text', '층의 적을 모두 쓰러뜨리면 다음 층 문이 열린다'))
    else {
      const go = el('button', 'menu-src__level is-next', '끝없는 원정에 나서기')
      go.type = 'button'
      go.disabled = !endless.canEnter()
      go.addEventListener('click', () => endless.enter() && ctx.close())
      head.append(go, el('div', 'menu-src__text', endless.canEnter() ? '나설 때마다 1층부터. 나오거나 쓰러지면 끝나고 깊이 기록·재료만 남는다' : '마을에서 나설 수 있다'))
    }
    head.append(el('div', 'menu-src__text', '층마다 원형, 5층마다 보스의 재료'))
  }
  wrap.append(head)
  body.append(wrap)
}

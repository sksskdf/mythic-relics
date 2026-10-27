import { el, type TabContext } from './dom'

/**
 * 균열 탭 (E17): 한계를 깨는 길, 균열 들어가기와 지금 층·축복, 깊이 기록, 성좌판.
 * 성좌판의 별은 이웃한 별이 밝혀졌을 때만(첫 별은 열린 신화 아무것이나) 눌러 밝힌다.
 */
export function renderRift(ctx: TabContext, body: HTMLElement): void {
  const { rift } = ctx.host
  const wrap = el('div', 'menu-src')
  const head = el('section', 'menu-src__panel')
  if (!rift.open()) {
    head.append(el('div', 'menu-src__title', '균열 · 닫힘'))
    head.append(el('div', 'menu-src__text', '다섯 신화권의 보스를 모두 위협 10단계에서 이기면 한계를 깨고 균열이 열린다'))
    const row = el('div', 'menu-src__levels')
    for (const p of rift.progress()) row.append(el('span', `ui-pill${p.cleared >= 10 ? ' is-done' : ''}`, `${p.name} ${p.cleared}/10`))
    head.append(row)
  } else {
    const run = rift.run()
    head.append(el('div', 'menu-src__title', run ? `균열 ${run.depth}층` : `균열 · 가장 깊이 ${rift.best()}층`))
    if (run) head.append(el('div', 'menu-src__text', run.blessings.length ? `축복: ${run.blessings.join(', ')}` : '층의 적을 모두 쓰러뜨리면 축복을 고르고 다음 층 문이 열린다'))
    else {
      const go = el('button', 'menu-src__level is-next', '균열에 들어가기')
      go.type = 'button'
      go.disabled = !rift.canEnter()
      go.addEventListener('click', () => rift.enter() && ctx.close())
      head.append(go, el('div', 'menu-src__text', rift.canEnter() ? '들어갈 때마다 1층부터. 나오거나 쓰러지면 축복은 사라지고 기록·재료·별만 남는다' : '마을에서 들어갈 수 있다'))
    }
    head.append(el('div', 'menu-src__text', `보상 배율 ×${rift.scale().toFixed(2)} (시련 기록) · 처음 닿은 5층마다 별 하나, 종말 보스는 별 둘`))
  }
  wrap.append(head)

  // 성좌판
  const chart = rift.chart()
  const board = el('section', 'menu-src__panel')
  board.append(el('div', 'menu-src__title', `성좌판 · 별 ${rift.stars()}`))
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'menu-stars')
  svg.setAttribute('viewBox', '-1.25 -1.25 2.5 2.5')
  const at = new Map(chart.map((c) => [c.god, c]))
  for (const c of chart) {
    for (const n of c.neighbors) {
      const m = at.get(n)
      if (!m || m.god < c.god) continue
      const line = document.createElementNS(NS, 'line')
      line.setAttribute('x1', String(c.x))
      line.setAttribute('y1', String(c.y))
      line.setAttribute('x2', String(m.x))
      line.setAttribute('y2', String(m.y))
      line.setAttribute('class', `menu-stars__link${c.lit && m.lit ? ' is-lit' : ''}`)
      svg.append(line)
    }
  }
  for (const c of chart) {
    const dot = document.createElementNS(NS, 'circle')
    dot.setAttribute('cx', String(c.x))
    dot.setAttribute('cy', String(c.y))
    dot.setAttribute('r', '0.08')
    dot.setAttribute('class', `menu-stars__star${c.lit ? ' is-lit' : ''}${c.can ? ' can-light' : ''}`)
    dot.style.setProperty('--realm', c.color)
    dot.addEventListener('click', () => c.can && rift.light(c.god) && ctx.render())
    const tip = document.createElementNS(NS, 'title')
    tip.textContent = `${c.name} · ${c.lit ? '밝혔다: 상시 효과 한 단계 위' : c.can ? '눌러서 밝힌다 (별 하나)' : '이웃한 별을 먼저 밝혀야 한다'}`
    dot.append(tip)
    svg.append(dot)
  }
  board.append(svg, el('div', 'menu-src__text', '밝힌 별: 그 신화의 상시 효과가 한 단계 위로 돈다 (5단계까지). 이웃한 별만 밝힐 수 있다'))
  wrap.append(board)
  body.append(wrap)
}

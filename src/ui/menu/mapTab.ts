import { el, type TabContext } from './dom'

/**
 * 지도 탭 (E15-04): 마을이 가운데, 신화권마다 입구 들판 → 깊은 땅 → 보스의 땅이 한 줄로 뻗는다.
 * 지금 있는 곳은 테두리, 찾은 성소는 채운 점. 워프가 열렸으면 찾은 성소를 눌러 바로 간다.
 */
export function renderMap(ctx: TabContext, body: HTMLElement): void {
  const { world } = ctx.host
  const nodes = world.nodes()
  const warp = world.canWarp()
  const wrap = el('div', 'menu-map')
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'menu-map__svg')
  svg.setAttribute('viewBox', '-3.7 -3.7 7.4 7.4')
  const byId = new Map(nodes.map((n) => [n.id, n]))
  for (const n of nodes) {
    for (const to of n.links) {
      const m = byId.get(to)
      if (!m || m.id < n.id) continue
      const line = document.createElementNS(NS, 'line')
      line.setAttribute('x1', String(n.x))
      line.setAttribute('y1', String(n.y))
      line.setAttribute('x2', String(m.x))
      line.setAttribute('y2', String(m.y))
      line.setAttribute('class', 'menu-map__road')
      svg.append(line)
    }
  }
  const labels = el('div', 'menu-map__labels')
  for (const n of nodes) {
    const g = document.createElementNS(NS, 'g')
    g.setAttribute('class', `menu-map__node${n.here ? ' is-here' : ''}${n.found ? ' is-found' : ''}${warp && n.found && !n.here ? ' can-warp' : ''}`)
    g.style.setProperty('--realm', n.color)
    const shape = document.createElementNS(NS, n.zone === 'boss' ? 'rect' : 'circle')
    if (n.zone === 'boss') {
      shape.setAttribute('x', String(n.x - 0.2))
      shape.setAttribute('y', String(n.y - 0.2))
      shape.setAttribute('width', '0.4')
      shape.setAttribute('height', '0.4')
      shape.setAttribute('transform', `rotate(45 ${n.x} ${n.y})`)
    } else {
      shape.setAttribute('cx', String(n.x))
      shape.setAttribute('cy', String(n.y))
      shape.setAttribute('r', n.zone === null ? '0.32' : '0.22')
    }
    g.append(shape)
    svg.append(g)
    // 이름은 HTML로 얹는다 (갈무리 글꼴, 정해진 크기)
    const label = el('button', `menu-map__label${n.here ? ' is-here' : ''}`)
    label.type = 'button'
    label.style.left = `${((n.x + 3.7) / 7.4) * 100}%`
    label.style.top = `${((n.y + 3.7) / 7.4) * 100}%`
    label.append(el('span', '', n.name))
    if (n.zone === 'boss' && n.cleared > 0) label.append(el('small', '', `${n.cleared}단계 이김`))
    label.disabled = !(warp && n.found && !n.here)
    label.addEventListener('click', () => world.warp(n.id) && ctx.close())
    ctx.hintOn(label, () => {
      const zone = n.zone === 'entrance' ? '입구 들판' : n.zone === 'deep' ? '깊은 땅 (정예가 많다)' : n.zone === 'boss' ? '보스의 땅' : '마을'
      const how = n.here ? '지금 여기' : warp ? (n.found ? '누르면 워프' : '성소를 찾으면 워프할 수 있다') : n.found ? '성소를 찾았다' : '아직 성소를 찾지 못했다'
      return `${n.name}\n${zone} · ${how}`
    })
    labels.append(label)
  }
  const board = el('div', 'menu-map__board')
  board.append(svg, labels)
  wrap.append(board)
  wrap.append(el('div', 'menu-src__text', warp ? '찾은 성소를 누르면 워프한다' : '성소 워프는 위협 2단계에 열린다 (정보 화면 › 원천 › 편의)'))
  body.append(wrap)
}

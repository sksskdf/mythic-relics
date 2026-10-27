import { el, type TabContext } from './dom'

/** 지도가 보여 주는 반 폭 (세계 칸 단위) */
const HALF = 4
/** 지도 판의 가장 큰 폭 (px, menu.css의 .menu-map__board) */
const BOARD_PX = 460

type Box = { x0: number; x1: number; y0: number; y1: number }

/**
 * 세계 칸 자리 → 지도 자리. 작은 지도·화면과 같은 방향으로 45° 돌린다 (쿼터뷰라 화면 위가 북서쪽).
 * 그래서 지도에서 위로 가면 화면에서도 위로 걷는다.
 */
function view(p: { x: number; y: number }): { x: number; y: number } {
  return { x: (p.x - p.y) * Math.SQRT1_2, y: (p.x + p.y) * Math.SQRT1_2 }
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/**
 * 지도 탭 (E15-04): 마을이 가운데, 신화권마다 입구 들판 → 깊은 땅 → 보스의 땅이 한 줄로 뻗는다.
 * 하나로 이어진 세계(E19-05)라 땅은 세계 칸 자리 그대로(화면 방향으로 돌려) 그리고, 내 자리를 점으로 찍는다.
 * 지금 있는 곳은 테두리, 찾은 성소는 채운 점. 워프가 열렸으면 찾은 성소를 눌러 바로 간다.
 */
export function renderMap(ctx: TabContext, body: HTMLElement): void {
  const { world } = ctx.host
  const nodes = world.nodes().map((n) => ({ ...n, ...view(n) }))
  const warp = world.canWarp()
  const wrap = el('div', 'menu-map')
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('class', 'menu-map__svg')
  svg.setAttribute('viewBox', `${-HALF} ${-HALF} ${HALF * 2} ${HALF * 2}`)
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // 땅의 넓이 (세계 칸 자리 그대로라 돌리면 마름모, E19-05)
  for (const n of nodes) {
    const land = document.createElementNS(NS, 'rect')
    land.setAttribute('x', String(n.x - n.size / 2))
    land.setAttribute('y', String(n.y - n.size / 2))
    land.setAttribute('width', String(n.size))
    land.setAttribute('height', String(n.size))
    land.setAttribute('transform', `rotate(45 ${n.x} ${n.y})`)
    land.setAttribute('class', 'menu-map__land')
    land.style.setProperty('--realm', n.color)
    svg.append(land)
  }
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
  // 이름 자리: 아래 → 위 → 왼쪽 → 오른쪽 가운데 다른 이름·땅 표시와 겹치지 않는 첫 자리 (모두 겹치면 아래)
  // 글자 크기는 px로 정해져 있으니, 지도 판이 좁으면(휴대폰) 지도 단위로는 이름이 더 넓다
  const boardPx = Math.min(BOARD_PX, (document.documentElement.clientWidth || BOARD_PX) - 60)
  const unit = (px: number) => px / (boardPx / (HALF * 2))
  const CHAR = unit(11)
  const LINE = unit(16)
  const MARK = unit(17)
  const taken: Box[] = nodes.map((n) => ({ x0: n.x - MARK, x1: n.x + MARK, y0: n.y - MARK, y1: n.y + MARK }))
  const place = (n: (typeof nodes)[number]): string => {
    const w = n.name.length * CHAR + 0.1
    const options: [string, Box][] = [
      ['', { x0: n.x - w / 2, x1: n.x + w / 2, y0: n.y + MARK, y1: n.y + MARK + LINE }],
      [' is-above', { x0: n.x - w / 2, x1: n.x + w / 2, y0: n.y - MARK - LINE, y1: n.y - MARK }],
      [' is-left', { x0: n.x - MARK - w, x1: n.x - MARK, y0: n.y - LINE / 2, y1: n.y + LINE / 2 }],
      [' is-right', { x0: n.x + MARK, x1: n.x + MARK + w, y0: n.y - LINE / 2, y1: n.y + LINE / 2 }],
    ]
    const inside = (b: Box) => b.x0 > -HALF && b.x1 < HALF && b.y0 > -HALF && b.y1 < HALF
    const [side, box] = options.find(([, b]) => inside(b) && !taken.some((t) => overlaps(t, b))) ?? options[0]!
    taken.push(box)
    return side
  }
  // 좁은 판(휴대폰)에는 열여섯 이름이 다 들어가지 않는다: 지금 있는 곳·마을·보스의 땅·찾은 성소만 이름을 보이고 나머지는 눌러서 힌트로
  const narrow = boardPx < 400
  const named = (n: (typeof nodes)[number]) => !narrow || n.here || n.zone === null || n.zone === 'boss' || n.found
  const labels = el('div', 'menu-map__labels')
  // 이름을 보일 땅부터 자리를 잡는다
  const sides = new Map([...nodes].sort((a, b) => Number(named(b)) - Number(named(a))).map((n) => [n.id, named(n) ? place(n) : '']))
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
    const label = el('button', `menu-map__label${sides.get(n.id)}${n.here ? ' is-here' : ''}${named(n) ? '' : ' is-quiet'}`)
    label.type = 'button'
    label.style.left = `${((n.x + HALF) / (HALF * 2)) * 100}%`
    label.style.top = `${((n.y + HALF) / (HALF * 2)) * 100}%`
    label.append(el('span', '', n.name))
    if (n.zone === 'boss' && n.cleared > 0) label.append(el('small', '', `${n.cleared}단계 이김`))
    label.disabled = !(warp && n.found && !n.here)
    label.addEventListener('click', () => world.warp(n.id) && ctx.close())
    ctx.hintOn(label, () => {
      const zone = n.zone === 'entrance' ? '입구 들판' : n.zone === 'deep' ? '깊은 땅 (정예가 많다)' : n.zone === 'boss' ? '보스의 땅' : '마을'
      const how = n.here ? '지금 여기' : warp ? (n.found ? '누르면 워프' : '성소를 찾으면 워프할 수 있다') : n.found ? '성소를 찾았다' : '아직 성소를 찾지 못했다'
      const won = n.zone === 'boss' && n.cleared > 0 ? ` · ${n.cleared}단계 이김` : ''
      return `${n.name}\n${zone}${won} · ${how}`
    })
    labels.append(label)
  }
  // 나
  const me = world.me()
  if (me) {
    const at = view(me)
    const dot = document.createElementNS(NS, 'circle')
    dot.setAttribute('cx', String(at.x))
    dot.setAttribute('cy', String(at.y))
    dot.setAttribute('r', '0.09')
    dot.setAttribute('class', 'menu-map__me')
    svg.append(dot)
  }
  const board = el('div', 'menu-map__board')
  board.append(svg, labels)
  wrap.append(board)
  wrap.append(el('div', 'menu-src__text', warp ? '찾은 성소를 누르면 워프한다' : '성소 워프는 위협 2단계에 열린다 (정보 화면 › 원천 › 편의)'))
  body.append(wrap)
}

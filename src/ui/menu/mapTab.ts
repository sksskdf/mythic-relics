import { el, type TabContext } from './dom'
import { labelRank, layoutMap, leaveBox, markRim, placeLabels, spotSize, type Box, type LabelAsk, type LabelBlock, type Point } from './mapLayout'

const NS = 'http://www.w3.org/2000/svg'

/** SVG 요소 하나 (자리는 소수 한 자리로 다듬는다) */
function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, className: string, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag)
  e.setAttribute('class', className)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, typeof v === 'number' ? String(Math.round(v * 10) / 10) : v)
  return e
}

/** 지도 판이 쓸 수 있는 넓이 (px): 탭 몸에서 여백과 판 말고 다른 줄(목표 한 줄·안내 한 줄)을 뺀 것 */
function room(body: HTMLElement, wrap: HTMLElement, board: HTMLElement): { w: number; h: number } {
  const cs = getComputedStyle(body)
  const px = (v: string) => parseFloat(v) || 0
  const w = Math.floor(body.clientWidth - px(cs.paddingLeft) - px(cs.paddingRight))
  const h = Math.floor(body.clientHeight - px(cs.paddingTop) - px(cs.paddingBottom) - (wrap.offsetHeight - board.offsetHeight))
  // 아직 화면에 붙지 않았으면(잴 수 없으면) 옛 크기로, 아주 낮은 창은 판을 밀어 본다
  return w > 120 ? { w, h: Math.max(240, h) } : { w: 460, h: 460 }
}

/** 창 크기가 바뀌어(사파리 도구 막대, 창 끌기) 판이 쓸 넓이가 달라지면 다시 그린다. 잇달아 되풀이되면 그만둔다 */
let redraws: number[] = []
function watch(ctx: TabContext, body: HTMLElement, wrap: HTMLElement, board: HTMLElement, was: { w: number; h: number }): void {
  if (typeof ResizeObserver !== 'function') return
  const observer = new ResizeObserver(() => {
    if (!wrap.isConnected) return observer.disconnect()
    if (body.clientWidth === 0) return
    const now = room(body, wrap, board)
    if (Math.abs(now.w - was.w) <= 2 && Math.abs(now.h - was.h) <= 2) return
    observer.disconnect()
    const t = performance.now()
    redraws = [...redraws.filter((at) => t - at < 1000), t]
    if (redraws.length <= 4) ctx.render()
  })
  observer.observe(body)
}

/** 신의 흔적 표시: 십자 (작은 지도의 흔적 표시와 같은 모양) */
const CROSS = 'M-5,-1.5h3.5v-3.5h3v3.5h3.5v3h-3.5v3.5h-3v-3.5h-3.5z'
/**
 * 판을 그린 지 이만큼(ms) 안의 누름은 워프하지 않고 설명만 띄운다: 작은 지도를 두 번 누르면 둘째 누름이
 * 방금 그 자리에 뜬 땅 표시에 떨어진다 (세로 판에서 리키아 화산의 누르는 자리가 작은 지도 자리와 겹친다).
 * 두 번 누르기로 치는 사이(0.5초)만큼 막는다. 새로 뜬 판을 보고 갈 곳을 고르는 데는 이보다 오래 걸린다
 */
const SETTLE_MS = 500

/**
 * 지도 탭 (E15-04): 마을에서 북쪽으로 땅이 한 줄로 뻗는다 (E239부터 마을은 남쪽 끝).
 * 하나로 이어진 세계(E19-05)라 땅은 세계 칸 자리 그대로 그리고, 내 자리를 흰 점으로 찍는다.
 * 세로 화면은 북쪽을 위로 놓아 판을 다 쓰고, 가로 화면은 작은 지도·화면과 같은 방향으로 돌린다 (자리 셈은 `mapLayout.ts`, E307).
 * 속이 찬 표시는 마을과 켠 성소: 표시(둘레 44px)나 이름을 누르면 바로 간다 (웨이포인트, E239-05. 판이 뜬 직후의 누름은 설명만, `SETTLE_MS`).
 * 지금 있는 곳은 흰 고리.
 * 다음 목표의 땅은 금빛 마름모가 뛰고, 결계로 막힌 땅은 회색 점선 (E22-04). 표시의 모양은 작은 지도와 같다.
 */
export function renderMap(ctx: TabContext, body: HTMLElement): void {
  const { world } = ctx.host
  const nodes = world.nodes()
  const goal = world.goal()
  const traces = world.traces()
  const wrap = el('div', 'menu-map')
  if (goal) {
    const line = el('div', 'menu-map__goal-line')
    line.append(el('i', ''), el('span', '', goal.text))
    wrap.append(line)
  }
  const board = el('div', 'menu-map__board')
  // 웨이포인트 (E239-05): 처음부터 켠 성소와 마을로 바로 간다
  wrap.append(board, el('div', 'menu-map__help', '속이 찬 땅(마을·켠 성소)을 누르면 바로 간다'))
  body.append(wrap)

  const avail = room(body, wrap, board)
  const map = layoutMap(nodes, avail)
  board.style.width = `${map.w}px`
  board.style.height = `${map.h}px`
  const svg = svgEl('svg', 'menu-map__svg', { viewBox: `0 0 ${map.w} ${map.h}`, width: map.w, height: map.h })
  const drawn = performance.now()
  const byId = new Map(nodes.map((n) => [n.id, n]))
  // 땅의 자리는 온 픽셀에 맞춘다: 표시·누르는 자리·이름이 같은 눈금에 놓여, 반 픽셀 걸친 것 때문에 이름 자리가 막히지 않는다
  const at = new Map(nodes.map((n) => [n.id, { x: Math.round(map.place(n).x), y: Math.round(map.place(n).y) }]))
  const shown = nodes.filter((n) => map.shown.has(n.id))

  // 땅의 넓이 (세계 칸 자리 그대로: 북쪽이 위면 네모, 돌리면 마름모, E19-05)
  for (const n of shown) {
    const p = at.get(n.id)!
    const side = n.size * map.land
    const land = svgEl('rect', `menu-map__land${n.locked ? ' is-locked' : ''}${n.here ? ' is-here' : ''}`, { x: p.x - side / 2, y: p.y - side / 2, width: side, height: side })
    if (map.mode === 'screen') land.setAttribute('transform', `rotate(45 ${p.x.toFixed(1)} ${p.y.toFixed(1)})`)
    land.style.setProperty('--realm', n.color)
    svg.append(land)
  }
  // 길. 판 밖의 땅(세로 화면의 엔딩 뒤 신화권)으로 가는 길은 판 가장자리에서 끊는다
  const roads: [Point, Point][] = []
  const edge: Box = { x0: 3, y0: 3, x1: map.w - 3, y1: map.h - 3 }
  for (const n of shown) {
    for (const to of n.links) {
      const m = byId.get(to)
      if (!m) continue
      const far = !map.shown.has(m.id)
      if (!far && m.id < n.id) continue
      const a = at.get(n.id)!
      const b = far ? leaveBox(a, at.get(m.id)!, edge) : at.get(m.id)!
      roads.push([a, b])
      svg.append(svgEl('line', `menu-map__road${n.locked || m.locked ? ' is-locked' : ''}${far ? ' is-beyond' : ''}`, { x1: a.x, y1: a.y, x2: b.x, y2: b.y }))
    }
  }

  const labels = el('div', 'menu-map__labels')
  const spot = spotSize(shown.map((n) => at.get(n.id)!))
  const blocks: LabelBlock[] = []
  const asks: (LabelAsk & { rank: number })[] = []
  const names = new Map<string, HTMLElement>()
  const here = nodes.find((n) => n.here)
  for (const n of nodes) {
    const isGoal = goal?.region === n.id
    const canWarp = n.found && !n.here
    const flags = `${n.here ? ' is-here' : ''}${n.locked ? ' is-locked' : ''}${isGoal ? ' is-goal' : ''}${canWarp ? ' can-warp' : ''}`
    const marks = traces.filter((t) => t.region === n.id)
    const hint = () => {
      const zone = n.zone === 'entrance' ? '입구 들판' : n.zone === 'deep' ? '깊은 땅 (정예가 많다)' : n.zone === 'boss' ? '보스의 땅' : '마을'
      const how = n.here ? '지금 여기' : n.found ? '누르면 바로 간다' : '성소를 밟으면 켜진다'
      const won = n.zone === 'boss' && n.beaten ? ' · 이김' : ''
      const seal = n.locked ? '\n결계로 막혀 있다' : ''
      const next = isGoal ? `\n다음 목표: ${goal?.text}` : ''
      const found = marks.length ? `\n신의 흔적: ${marks.map((t) => t.name).join('·')}` : ''
      return `${n.name}\n${zone}${won} · ${how}${seal}${next}${found}`
    }
    const go = () => performance.now() - drawn >= SETTLE_MS && world.warp(n.id) && ctx.close()
    // 이름은 HTML로 얹는다 (갈무리 글꼴, 정해진 크기). 판에 그리지 않는 땅의 이름은 숨긴 채 둔다
    const label = el('button', `menu-map__label${flags}`)
    label.type = 'button'
    label.hidden = true
    label.append(el('span', '', n.name))
    if (n.zone === 'boss' && n.beaten) label.append(el('small', '', '이김'))
    label.addEventListener('click', go)
    ctx.hintOn(label, hint)
    names.set(n.id, label)
    if (!map.shown.has(n.id)) {
      labels.append(label)
      continue
    }

    const p = at.get(n.id)!
    const rim = markRim(n.zone, Math.min(map.sx, map.sy), n.here, isGoal)
    const r = rim.r
    const g = svgEl('g', `menu-map__node${n.found ? ' is-found' : ''}${flags}`)
    g.style.setProperty('--realm', n.color)
    // 다음 목표의 땅: 금빛 마름모 테 (작은 지도의 목표 표시와 같은 모양), 어두운 테를 깔아 땅 색 위에서도 선다.
    // 어두운 테가 고리와 표시를 가리지 않게 맨 먼저 그린다
    if (isGoal) {
      const d = rim.tip
      const points = `${p.x.toFixed(1)},${(p.y - d).toFixed(1)} ${(p.x + d).toFixed(1)},${p.y.toFixed(1)} ${p.x.toFixed(1)},${(p.y + d).toFixed(1)} ${(p.x - d).toFixed(1)},${p.y.toFixed(1)}`
      g.append(svgEl('polygon', 'menu-map__goal-rim', { points }), svgEl('polygon', 'menu-map__goal', { points }))
    }
    // 지금 있는 땅: 흰 고리 (목표의 땅이면 마름모 안쪽에, `markRim`)
    if (n.here) g.append(svgEl('circle', 'menu-map__here', { cx: p.x, cy: p.y, r: rim.ring }))
    // 땅 표시: 마을은 큰 원, 보스의 땅은 마름모, 나머지는 원. 켠 성소와 마을은 속을 채운다
    if (n.zone === 'boss') {
      const mark = svgEl('rect', 'menu-map__mark', { x: p.x - r * 0.75, y: p.y - r * 0.75, width: r * 1.5, height: r * 1.5 })
      mark.setAttribute('transform', `rotate(45 ${p.x.toFixed(1)} ${p.y.toFixed(1)})`)
      g.append(mark)
    } else g.append(svgEl('circle', 'menu-map__mark', { cx: p.x, cy: p.y, r }))
    // 신의 흔적 (E238): 그 땅 표시 오른쪽 위에 그 신의 색 십자 (깨우는 중·잠잠한 흔적은 테만)
    marks.forEach((t, i) => {
      const x = p.x + r + 8 + i * 13
      const y = p.y - r - 3
      const mark = svgEl('path', `menu-map__trace${t.waking ? ' is-waking' : ''}`, { d: CROSS, transform: `translate(${x.toFixed(1)} ${y.toFixed(1)})` })
      mark.style.setProperty('--god', t.color)
      g.append(mark)
      blocks.push({ x0: x - 7, y0: y - 7, x1: x + 7, y1: y + 7 })
    })
    svg.append(g)

    // 누르는 자리: 표시 둘레 44px (이름과 따로, E307). 갈 수 없는 땅도 누르면 설명이 뜬다
    const hit = el('button', `menu-map__spot${flags}`)
    hit.type = 'button'
    hit.setAttribute('aria-label', n.name)
    hit.style.left = `${Math.round(p.x)}px`
    hit.style.top = `${Math.round(p.y)}px`
    hit.style.width = hit.style.height = `${spot}px`
    hit.addEventListener('click', go)
    ctx.hintOn(hit, hint)
    labels.append(hit, label)
    // 제 이름은 표시 바깥(목표의 마름모·지금 땅의 고리까지)에 놓고, 남의 이름은 이 표시(solid)를 덮지 못하며 누르는 자리는 되도록 덮지 않는다
    blocks.push({ of: n.id, x0: p.x - rim.solid, y0: p.y - rim.solid, x1: p.x + rim.solid, y1: p.y + rim.solid }, { of: n.id, soft: true, x0: p.x - spot / 2, y0: p.y - spot / 2, x1: p.x + spot / 2, y1: p.y + spot / 2 })
    const rank = labelRank({ here: n.here, goal: isGoal, village: n.zone === null, found: n.found, near: here !== undefined && (here.links.includes(n.id) || n.links.includes(here.id)), locked: n.locked, later: n.later })
    asks.push({ id: n.id, x: p.x, y: p.y, r: rim.out, diamond: isGoal, w: 0, h: 0, must: rank <= 2, rank })
  }

  // 나: 흰 점과 퍼지는 고리 (판 밖으로 나가지 않게 당긴다)
  const me = world.me()
  if (me) {
    const p = map.place(me)
    const x = Math.min(map.w - 18, Math.max(18, p.x))
    const y = Math.min(map.h - 18, Math.max(18, p.y))
    const ping = svgEl('circle', 'menu-map__ping', { cx: x, cy: y, r: 8 })
    for (const [name, values] of [['r', '8;17'], ['stroke-opacity', '0.9;0']] as const) ping.append(svgEl('animate', '', { attributeName: name, values, dur: '1.6s', repeatCount: 'indefinite' }))
    svg.append(ping, svgEl('circle', 'menu-map__me', { cx: x, cy: y, r: 7 }))
    // 이름이 내 자리를 덮지 않게 비워 둔다
    blocks.push({ x0: x - 12, y0: y - 12, x1: x + 12, y1: y + 12 })
  }
  board.append(svg, labels)

  // 이름 자리: 화면에 붙인 뒤 글자 폭을 재어, 중요한 차례대로 겹치지 않는 자리에 놓는다 (자리가 없는 이름은 눌렀을 때 설명으로)
  asks.sort((a, b) => a.rank - b.rank)
  for (const ask of asks) names.get(ask.id)!.hidden = false
  for (const ask of asks) {
    const label = names.get(ask.id)!
    ask.w = label.offsetWidth || label.textContent!.length * 12 + 8
    ask.h = label.offsetHeight || 17
  }
  const placed = placeLabels(asks, map, blocks, roads)
  for (const ask of asks) {
    const label = names.get(ask.id)!
    const p = placed.get(ask.id)
    label.hidden = !p
    if (p) label.style.transform = `translate(${p.x}px, ${p.y}px)`
  }
  watch(ctx, body, wrap, board, avail)
}

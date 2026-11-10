import { describe, expect, it } from 'vitest'

import { chapterOf } from '../src/data/chapters'
import { REGIONS } from '../src/data/regions'
import { CELL, cellOrigin } from '../src/data/world'
import { away, crosses, labelRank, layoutMap, leaveBox, markRadius, markRim, placeLabels, reads, spotSize, type Box, type LabelAsk, type LabelBlock, type MapLand, type MapLayout, type Point } from '../src/ui/menu/mapLayout'

type Land = MapLand & { name: string; zone: string | null; links: string[] }

/**
 * 세계의 땅 (게임이 지도 탭에 넘기는 것과 같은 모양, `MenuData`의 world.nodes):
 * here = 지금 있는 땅, found = 켠 성소, open = 열린 땅, ending = 엔딩을 봤나
 */
function lands(here = 'village', found: readonly string[] = [], open: readonly string[] = ['midgard'], ending = false): Land[] {
  return Object.values(REGIONS).map((r) => {
    const locked = !ending && r.kind !== 'hub' && r.id !== here && !found.includes(r.id) && !open.includes(r.id)
    return {
      id: r.id,
      name: r.name,
      zone: r.zone,
      x: r.cell ? cellOrigin(r.cell).x / CELL : 0,
      y: r.cell ? cellOrigin(r.cell).z / CELL : 0,
      size: (r.halfExtent * 2) / CELL,
      links: r.exits.map((e) => e.to),
      here: r.id === here,
      found: r.kind === 'hub' || found.includes(r.id),
      locked,
      later: r.kind === 'field' && chapterOf(r.id) === null && locked,
    }
  })
}

/** 아이폰 15 Pro의 지도 판이 쓸 넓이: 393×852(도구 막대 없음)와 393×659(사파리 도구 막대가 보일 때) */
const PHONE = { w: 349, h: 670 }
const PHONE_SHORT = { w: 349, h: 477 }
/** 1280×720 창의 지도 판 */
const DESKTOP = { w: 868, h: 440 }

/** 그 땅의 넓이가 판에서 차지하는 상자 (돌린 판은 마름모의 바깥 상자) */
function extent(map: MapLayout, n: MapLand): Box {
  const p = map.place(n)
  const half = (n.size * map.land * (map.mode === 'screen' ? Math.SQRT2 : 1)) / 2
  return { x0: p.x - half, y0: p.y - half, x1: p.x + half, y1: p.y + half }
}

describe('지도 탭의 판 (E307): 세로 화면을 다 쓴다', () => {
  it('세로로 긴 판은 북쪽이 위다: 마을이 맨 아래, 리키아 화산이 맨 위에 오고 줄기가 세로로 선다', () => {
    const all = lands()
    const map = layoutMap(all, PHONE)
    expect(map.mode).toBe('north')
    const at = (id: string) => map.place(all.find((n) => n.id === id)!)
    expect(at('village').y).toBeGreaterThan(at('midgard').y)
    expect(at('midgard').y).toBeGreaterThan(at('utgard').y)
    expect(at('utgard').y).toBeGreaterThan(at('olympus').y)
    expect(at('olympus').y).toBeGreaterThan(at('lycia').y)
    // 같은 줄의 땅은 같은 높이, 동쪽이 오른쪽
    expect(at('ironwood').y).toBeCloseTo(at('serpentshore').y, 5)
    expect(at('ironwood').x).toBeLessThan(at('serpentshore').x)
  })

  it('세로 판은 쓸 수 있는 높이를 거의 다 쓰고, 칸 하나가 옛 판(46px)의 두 배쯤이다', () => {
    const map = layoutMap(lands(), PHONE)
    expect(map.w).toBe(PHONE.w)
    expect(map.h).toBeLessThanOrEqual(PHONE.h)
    expect(map.h).toBeGreaterThan(PHONE.h * 0.95)
    expect(map.sx).toBeGreaterThan(90)
    // 줄기만 담을 때는 가로세로가 같은 크기 (실제 자리 그대로)
    expect(map.sy).toBe(map.sx)
    // 사파리 도구 막대가 보여 낮아진 화면에서도 옛 판보다 크다
    const short = layoutMap(lands(), PHONE_SHORT)
    expect(short.mode).toBe('north')
    expect(short.h).toBeLessThanOrEqual(PHONE_SHORT.h)
    expect(short.sx).toBeGreaterThan(60)
  })

  it('엔딩 전의 세로 판은 줄기에 맞춘다: 엔딩 뒤 신화권의 먼 땅은 그리지 않고, 판 안에 드는 땅은 그린다', () => {
    const map = layoutMap(lands(), PHONE)
    for (const id of ['izumo', 'hiikawa', 'kunlun', 'huoyanshan', 'songdo']) expect(map.shown.has(id), id).toBe(false)
    for (const id of ['takamagahara', 'hwagwasan', 'sinsi', 'taebaek']) expect(map.shown.has(id), id).toBe(true)
    for (const n of lands()) if (!n.later) expect(map.shown.has(n.id), n.id).toBe(true)
  })

  it('엔딩 뒤 땅이어도 지금 있거나 켠 땅은 판에 담는다', () => {
    const all = lands('kunlun', ['hwagwasan'])
    const map = layoutMap(all, PHONE)
    expect(map.shown.has('kunlun')).toBe(true)
    expect(map.shown.has('hwagwasan')).toBe(true)
  })

  it('엔딩 뒤에는 세로 판도 스물한 곳을 다 담고, 줄 사이를 두 배까지 벌려 판 아래를 비우지 않는다 (땅은 네모 그대로)', () => {
    const all = lands('village', [], [], true)
    const map = layoutMap(all, PHONE)
    expect(map.mode).toBe('north')
    expect(map.shown.size).toBe(all.length)
    expect(map.sy / map.sx).toBeGreaterThan(1.5)
    expect(map.sy / map.sx).toBeLessThanOrEqual(2)
    expect(map.land).toBe(map.sx)
    expect(map.h).toBeLessThanOrEqual(PHONE.h)
    expect(map.h).toBeGreaterThan(PHONE.h * 0.85)
    // 낮은 화면에서는 남는 만큼만 벌린다
    const short = layoutMap(all, PHONE_SHORT)
    expect(short.h).toBeLessThanOrEqual(PHONE_SHORT.h)
    expect(short.h).toBeGreaterThan(PHONE_SHORT.h * 0.95)
  })

  it('가로로 넓은 판은 화면과 같은 방향(45°)이다: 북쪽으로 가면 오른쪽 위, 모든 땅을 담고 가로세로가 같은 크기', () => {
    const all = lands()
    const map = layoutMap(all, DESKTOP)
    expect(map.mode).toBe('screen')
    expect(map.shown.size).toBe(all.length)
    expect(map.sy).toBe(map.sx)
    expect(map.w).toBeLessThanOrEqual(DESKTOP.w)
    expect(map.h).toBeLessThanOrEqual(DESKTOP.h)
    const village = map.place(all.find((n) => n.id === 'village')!)
    const north = map.place({ x: 0, y: -1 })
    expect(north.x).toBeGreaterThan(village.x)
    expect(north.y).toBeLessThan(village.y)
  })

  it.each([
    ['세로 852', PHONE, false],
    ['세로 659', PHONE_SHORT, false],
    ['세로 엔딩 뒤', PHONE, true],
    ['세로 659 엔딩 뒤', PHONE_SHORT, true],
    ['가로', DESKTOP, false],
    ['가로 엔딩 뒤', DESKTOP, true],
    ['작은 가로 창 (960×540)', { w: 928, h: 300 }, false],
  ] as const)('%s: 그리는 땅의 넓이와 누르는 자리가 모두 판 안에 든다 (잘린 요소 0)', (_name, avail, ending) => {
    const all = lands('village', [], ['midgard'], ending)
    const map = layoutMap(all, avail)
    const shown = all.filter((n) => map.shown.has(n.id))
    const spot = spotSize(shown.map((n) => map.place(n)))
    for (const n of shown) {
      const box = extent(map, n)
      expect(box.x0, n.id).toBeGreaterThanOrEqual(0)
      expect(box.y0, n.id).toBeGreaterThanOrEqual(0)
      expect(box.x1, n.id).toBeLessThanOrEqual(map.w)
      expect(box.y1, n.id).toBeLessThanOrEqual(map.h)
      const p = map.place(n)
      expect(p.x - spot / 2, n.id).toBeGreaterThanOrEqual(0)
      expect(p.x + spot / 2, n.id).toBeLessThanOrEqual(map.w)
      expect(p.y - spot / 2, n.id).toBeGreaterThanOrEqual(0)
      expect(p.y + spot / 2, n.id).toBeLessThanOrEqual(map.h)
    }
  })

  it('땅이 하나뿐이거나 없어도 판이 선다', () => {
    const one = layoutMap(lands().slice(0, 1), PHONE)
    expect(Number.isFinite(one.sx) && one.sx > 0).toBe(true)
    expect(one.shown.size).toBe(1)
    const none = layoutMap([], DESKTOP)
    expect(Number.isFinite(none.w) && Number.isFinite(none.h)).toBe(true)
  })
})

describe('지도 탭의 땅 표시 둘레 (E307): 지금 땅의 흰 고리와 목표의 금빛 마름모', () => {
  /** 선 굵기 (`menu.css`): 고리 2px, 금빛 마름모 3px, 마름모에 깐 어두운 테 7px */
  const RING = 2
  const GOLD = 3
  const DARK = 7

  it('지금 땅은 표시 밖 6px에 고리, 목표는 표시 밖 11px까지 마름모를 두른다', () => {
    expect(markRim('entrance', 68, true, false)).toMatchObject({ r: 11, ring: 17, tip: 0 })
    expect(markRim('entrance', 68, false, true)).toMatchObject({ r: 11, ring: 0, tip: 22 })
    expect(markRim('entrance', 68, false, false)).toMatchObject({ r: 11, ring: 0, tip: 0 })
  })

  it('같은 크기로 겹쳐 두면 고리가 마름모의 어두운 테에 통째로 가린다 (고치기 전)', () => {
    const here = markRim('entrance', 68, true, false)
    const goal = markRim('entrance', 68, false, true)
    // 마름모의 변은 가운데에서 끝 / √2, 어두운 테는 그 안팎으로 반 굵기씩
    const side = goal.tip * Math.SQRT1_2
    expect(here.ring - RING / 2).toBeGreaterThan(side - DARK / 2)
    expect(here.ring + RING / 2).toBeLessThan(side + DARK / 2)
  })

  it.each([
    ['입구·깊은 땅', 'entrance'],
    ['보스의 땅', 'boss'],
    ['마을', null],
  ] as const)('%s: 지금 땅이 목표여도 고리가 표시와 금빛 마름모 사이에 온전히 보인다 (칸이 넓든 좁든)', (_name, zone) => {
    for (const scale of [40, 68, 98]) {
      const rim = markRim(zone, scale, true, true)
      // 고리 안쪽은 표시 밖에, 고리 바깥쪽은 금빛 선 안쪽보다 가운데에 가깝다
      expect(rim.ring - RING / 2, `${scale}`).toBeGreaterThan(rim.r + 1.5)
      expect(rim.ring + RING / 2, `${scale}`).toBeLessThan(rim.tip * Math.SQRT1_2 - GOLD / 2)
      // 제 이름이 비키는 바깥은 마름모의 끝보다 밖
      expect(rim.out).toBeGreaterThan(rim.tip)
    }
  })
})

describe('지도 탭의 누르는 자리 (E307): 땅 표시를 눌러 바로 간다', () => {
  it('땅 표시 둘레 44px, 땅끼리 가까우면 이웃과 겹치지 않게 줄이되 28px 아래로는 줄이지 않는다', () => {
    expect(spotSize([{ x: 0, y: 0 }, { x: 98, y: 0 }, { x: 49, y: 98 }])).toBe(44)
    expect(spotSize([{ x: 0, y: 0 }, { x: 43, y: 0 }])).toBe(41)
    expect(spotSize([{ x: 0, y: 0 }, { x: 12, y: 0 }])).toBe(28)
    expect(spotSize([{ x: 0, y: 0 }])).toBe(44)
  })

  it.each([
    ['세로 852', PHONE, false],
    ['세로 659', PHONE_SHORT, false],
    ['세로 659 엔딩 뒤', PHONE_SHORT, true],
    ['가로', DESKTOP, true],
  ] as const)('%s: 누르는 자리끼리 겹치지 않는다', (_name, avail, ending) => {
    const all = lands('village', [], ['midgard'], ending)
    const map = layoutMap(all, avail)
    const points = all.filter((n) => map.shown.has(n.id)).map((n) => map.place(n))
    const spot = spotSize(points)
    expect(spot).toBeGreaterThanOrEqual(40)
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) expect(Math.max(Math.abs(points[i]!.x - points[j]!.x), Math.abs(points[i]!.y - points[j]!.y))).toBeGreaterThanOrEqual(spot)
    }
  })
})

describe('지도 탭의 이름 (E307): 지금 땅·목표·마을·켠 성소·이웃은 보이고 서로 겹치지 않는다', () => {
  const overlap = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

  /** 지도 탭이 이름을 놓는 것과 같은 셈 (글자 폭은 12px 글꼴로 어림: 한 글자 12px, 빈칸 6px, 양옆 4px) */
  function names(all: Land[], avail: { w: number; h: number }, goal: string) {
    const map = layoutMap(all, avail)
    const shown = all.filter((n) => map.shown.has(n.id))
    const here = all.find((n) => n.here)!
    const spot = spotSize(shown.map((n) => map.place(n)))
    const blocks: LabelBlock[] = []
    const asks: (LabelAsk & { rank: number })[] = []
    const marks = new Map<string, Box>()
    const roads: [Point, Point][] = []
    for (const n of shown) {
      const p = map.place(n)
      const rim = markRim(n.zone, Math.min(map.sx, map.sy), n.here, n.id === goal)
      const mark = { x0: p.x - rim.solid, y0: p.y - rim.solid, x1: p.x + rim.solid, y1: p.y + rim.solid }
      marks.set(n.id, mark)
      blocks.push({ of: n.id, ...mark }, { of: n.id, soft: true, x0: p.x - spot / 2, y0: p.y - spot / 2, x1: p.x + spot / 2, y1: p.y + spot / 2 })
      const rank = labelRank({ here: n.here, goal: n.id === goal, village: n.zone === null, found: n.found, near: here.links.includes(n.id) || n.links.includes(here.id), locked: n.locked, later: n.later })
      const w = [...n.name].reduce((sum, c) => sum + (c === ' ' ? 6 : 12), 8)
      asks.push({ id: n.id, x: p.x, y: p.y, r: rim.out, diamond: n.id === goal, w, h: 17, must: rank <= 2, rank })
      for (const to of n.links) {
        const m = all.find((o) => o.id === to)
        if (m && map.shown.has(m.id) && m.id > n.id) roads.push([p, map.place(m)])
      }
    }
    asks.sort((a, b) => a.rank - b.rank)
    const placed = placeLabels(asks, map, blocks, roads)
    const boxes = new Map([...placed].map(([id, p]) => [id, { x0: p.x, y0: p.y, x1: p.x + asks.find((a) => a.id === id)!.w, y1: p.y + 17 }]))
    return { map, asks, placed, boxes, marks }
  }

  /** 켠 성소를 따라 북쪽으로 올라가는 차례 (장 흐름) */
  const TRAIL = ['midgard', 'serpentshore', 'ironwood', 'jotunheim', 'muspel', 'utgard', 'pass', 'olympus', 'delphi', 'lycia', 'sky']
  /** 장 흐름의 진행 상태: 목표 땅마다 앞 땅에서·그 땅 안에서·마을에서·미드가르드에서 볼 때 */
  const journey = TRAIL.flatMap((goal, i) => {
    const found = TRAIL.slice(0, i)
    return [i > 0 ? TRAIL[i - 1]! : 'village', goal, 'village', 'midgard'].map((here) => [`${here}에서 목표 ${goal}`, here, found, goal] as const)
  })

  it.each([
    ['처음 (마을만 앎)', lands(), 'midgard'],
    ['중반 (성소 넷을 켬, 목표는 이웃 땅)', lands('jotunheim', ['midgard', 'serpentshore', 'ironwood', 'jotunheim'], ['muspel', 'utgard']), 'utgard'],
    ['목표가 먼 땅', lands('village', ['midgard', 'serpentshore', 'ironwood', 'jotunheim'], ['muspel', 'utgard']), 'utgard'],
    ['그리스 (성소 여덟)', lands('olympus', ['midgard', 'serpentshore', 'ironwood', 'jotunheim', 'muspel', 'utgard', 'pass', 'olympus'], ['delphi']), 'delphi'],
  ] as const)('%s: 세로 852·659와 가로 판에서 꼭 보일 이름이 다 보이고, 이름끼리도 땅 표시와도 겹치지 않는다', (_name, all, goal) => {
    for (const avail of [PHONE, PHONE_SHORT, DESKTOP]) {
      const { map, asks, placed, boxes, marks } = names([...all], avail, goal)
      const where = `${avail.w}×${avail.h}`
      for (const a of asks) if (a.rank <= 5) expect(placed.has(a.id), `${where} ${a.id}`).toBe(true)
      const list = [...boxes]
      for (let i = 0; i < list.length; i++) {
        const [id, box] = list[i]!
        // 판 안에
        expect(box.x0 >= 0 && box.y0 >= 0 && box.x1 <= map.w && box.y1 <= map.h, `${where} ${id}`).toBe(true)
        for (let j = i + 1; j < list.length; j++) expect(overlap(box, list[j]![1]), `${where} ${id} × ${list[j]![0]}`).toBe(false)
        for (const [of, mark] of marks) {
          if (of !== id) expect(overlap(box, mark), `${where} ${id} × ${of} 표시`).toBe(false)
          else {
            // 제 땅의 표시(원)는 대각선 자리에서 모서리가 스칠 만큼 가깝다: 원 밖이면 된다
            const cx = (mark.x0 + mark.x1) / 2
            const cy = (mark.y0 + mark.y1) / 2
            const gap = Math.hypot(Math.max(box.x0 - cx, 0, cx - box.x1), Math.max(box.y0 - cy, 0, cy - box.y1))
            expect(gap, `${where} ${id} × 제 표시`).toBeGreaterThanOrEqual(markRadius(all.find((n) => n.id === id)!.zone, Math.min(map.sx, map.sy)) + 2)
          }
        }
      }
    }
  })

  it.each([
    ['세로 852', PHONE],
    ['세로 659', PHONE_SHORT],
    ['가로', DESKTOP],
  ] as const)('%s: 어느 진행 상태에서든 지금 땅·목표의 이름은 제 표시에 붙어 있고, 남의 표시보다 제 표시의 이름으로 읽힌다', (_name, avail) => {
    for (const [state, here, found, goal] of journey) {
      const { asks, boxes } = names(lands(here, found, [goal]), avail, goal)
      for (const a of asks.filter((x) => x.must)) {
        const box = boxes.get(a.id)
        expect(box, `${state}: ${a.id}`).toBeDefined()
        // 한 줄 더 떨어진 자리(표시에서 20px 남짓)로 밀려나지 않는다
        expect(away(a, box!), `${state}: ${a.id} 제 표시까지`).toBeLessThanOrEqual(6)
        for (const o of asks) if (o.id !== a.id) expect(away(o, box!), `${state}: ${a.id} × ${o.id}`).toBeGreaterThanOrEqual(reads(a, box!) - 1)
      }
    }
  })

  it('세로 판의 처음 화면에서 옛 판(이름 일곱)보다 많은 이름이 보인다: 다음에 갈 땅의 이름을 눌러 보지 않아도 안다', () => {
    const { placed } = names(lands(), PHONE, 'midgard')
    expect(placed.size).toBeGreaterThanOrEqual(12)
    expect(placed.has('midgard')).toBe(true)
  })

  it('이름을 놓는 차례: 지금 땅 → 목표 → 마을 → 켠 성소 → 이웃 → 열린 땅 → 막힌 땅 → 엔딩 뒤 땅', () => {
    const base = { here: false, goal: false, village: false, found: false, near: false, locked: false, later: false }
    const order = [{ ...base, here: true, found: true }, { ...base, goal: true, locked: true }, { ...base, village: true, found: true }, { ...base, found: true }, { ...base, near: true, locked: true }, base, { ...base, locked: true }, { ...base, locked: true, later: true }]
    expect(order.map(labelRank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('자리가 없는 이름은 놓지 않고(눌러서 설명으로 본다), 지금 땅·목표의 이름은 가장 덜 겹치는 자리에라도 놓는다', () => {
    const ask = (id: string, must: boolean): LabelAsk => ({ id, x: 50, y: 50, r: 12, w: 80, h: 17, must })
    // 판이 이름 하나 겨우 들어갈 크기: 먼저 놓은 이름이 자리를 다 차지한다
    const board = { w: 100, h: 100 }
    const wall: LabelBlock[] = [{ x0: 0, y0: 0, x1: 100, y1: 30 }, { x0: 0, y0: 84, x1: 100, y1: 100 }]
    expect(placeLabels([ask('a', false), ask('b', false)], board, wall, []).size).toBe(1)
    const forced = placeLabels([ask('a', false), ask('b', true)], board, wall, [])
    expect(forced.has('b')).toBe(true)
  })

  it('길을 가로지르지 않는 자리를 먼저 고르고, 남의 누르는 자리는 덮어도 되지만 되도록 비킨다', () => {
    const ask: LabelAsk = { id: 'a', x: 100, y: 100, r: 12, w: 60, h: 17, must: false }
    const board = { w: 200, h: 200 }
    // 아래로 곧게 내려가는 길: 아래 자리는 길 위라 위에 놓는다
    const down: [Point, Point][] = [[{ x: 100, y: 100 }, { x: 100, y: 200 }]]
    expect(placeLabels([ask], board, [], down).get('a')!.y).toBeLessThan(100)
    // 길이 없으면 아래
    expect(placeLabels([ask], board, [], []).get('a')!.y).toBeGreaterThan(100)
    // 아래에 남의 누르는 자리가 있으면 위로 비키고, 사방이 누르는 자리면 그래도 놓는다
    const below: LabelBlock = { of: 'b', soft: true, x0: 78, y0: 110, x1: 122, y1: 154 }
    expect(placeLabels([ask], board, [below], []).get('a')!.y).toBeLessThan(100)
    expect(placeLabels([ask], board, [{ of: 'b', soft: true, x0: 0, y0: 0, x1: 200, y1: 200 }], []).has('a')).toBe(true)
    // 제 땅의 누르는 자리는 비키지 않는다
    expect(placeLabels([ask], board, [{ ...below, of: 'a' }], []).get('a')!.y).toBeGreaterThan(100)
  })

  it('제 땅보다 다른 땅의 표시에 더 가까운 자리에는 놓지 않는다 (그 땅의 이름처럼 읽힌다)', () => {
    // 땅 셋이 43px 사이로 한 줄: 가운데 땅의 이름은 옆 땅 밑으로 밀려나지 않고 제 땅 위나 아래에만 온다
    const row = [0, 43, 86].map((x, i): LabelAsk => ({ id: `n${i}`, x: 60 + x, y: 60, r: 12, w: 70, h: 17, must: false }))
    const blocks: LabelBlock[] = row.map((a) => ({ of: a.id, x0: a.x - 10, y0: a.y - 10, x1: a.x + 10, y1: a.y + 10 }))
    const placed = placeLabels(row, { w: 220, h: 160 }, blocks, [])
    for (const a of row) {
      const p = placed.get(a.id)
      if (!p) continue
      const box = { x0: p.x, y0: p.y, x1: p.x + a.w, y1: p.y + a.h }
      const near = (o: LabelAsk) => Math.hypot(Math.max(box.x0 - o.x, 0, o.x - box.x1), Math.max(box.y0 - o.y, 0, o.y - box.y1))
      for (const o of row) if (o !== a) expect(near(o), `${a.id} × ${o.id}`).toBeGreaterThanOrEqual(near(a) - 1)
    }
    expect(placed.size).toBeGreaterThanOrEqual(2)
  })

  it('표시까지의 거리는 가운데가 아니라 바깥에서 잰다: 목표의 마름모는 끝까지 뻗고 대각선 쪽은 덜 찬다', () => {
    const box = (x0: number, y0: number, w = 60, h = 17): Box => ({ x0, y0, x1: x0 + w, y1: y0 + h })
    // 둥근 표시: 가운데까지의 거리에서 반지름을 뺀다. 닿거나 덮으면 0
    expect(away({ x: 0, y: 0, r: 10 }, box(20, -8))).toBe(10)
    expect(away({ x: 0, y: 0, r: 10 }, box(-30, 13))).toBe(3)
    expect(away({ x: 0, y: 0, r: 10 }, box(-30, -8))).toBe(0)
    // 마름모: 끝 쪽(옆·위아래)은 끝에서, 대각선 쪽은 변에서
    const goal = { x: 0, y: 0, r: 20, diamond: true }
    expect(away(goal, box(25, -8))).toBe(5)
    expect(away(goal, box(-30, 23))).toBe(3)
    expect(away(goal, box(10, 10))).toBe(0)
    expect(away(goal, box(15, 15))).toBeCloseTo(10 * Math.SQRT1_2, 5)
    // 같은 자리의 둥근 표시(반지름 20)라면 닿아 있다: 마름모는 대각선 쪽이 비어 이름이 더 다가갈 수 있다
    expect(away({ x: 0, y: 0, r: 20 }, box(13, 13))).toBe(0)
    expect(away(goal, box(13, 13))).toBeGreaterThan(4)
  })

  it('모서리로만 닿은 이름표는 6px 더 먼 것으로 친다: 바로 위·아래·옆의 이름이 먼저 그 표시의 것으로 읽힌다', () => {
    const mark = { x: 0, y: 0, r: 10 }
    // 바로 아래 (표시가 이름표의 가로 범위 안): 그대로
    const below: Box = { x0: -30, y0: 13, x1: 30, y1: 30 }
    expect(reads(mark, below)).toBe(away(mark, below))
    // 오른쪽 아래 모서리
    const corner: Box = { x0: 10, y0: 10, x1: 70, y1: 27 }
    expect(reads(mark, corner)).toBeCloseTo(away(mark, corner) + 6, 5)
    // 가로 범위를 2px 벗어난 표시는 2px만 더한다 (갑자기 뛰지 않는다)
    const nearly: Box = { x0: 2, y0: 13, x1: 62, y1: 30 }
    expect(reads(mark, nearly)).toBeCloseTo(away(mark, nearly) + 2, 5)
  })

  it('한 줄 더 떨어진 자리보다 표시에 붙은 자리가 먼저다: 길 둘을 가로질러도 붙여 놓는다', () => {
    const ask: LabelAsk = { id: 'a', x: 100, y: 100, r: 12, w: 60, h: 17, must: false }
    // 붙은 자리는 위만 비었고 길 둘이 지난다. 한 줄 더 떨어진 위는 길도 없이 비었다
    const walls: LabelBlock[] = [{ x0: 0, y0: 108, x1: 200, y1: 200 }, { x0: 0, y0: 86, x1: 68, y1: 108 }, { x0: 132, y0: 86, x1: 200, y1: 108 }]
    const roads: [Point, Point][] = [[{ x: 100, y: 100 }, { x: 80, y: 40 }], [{ x: 100, y: 100 }, { x: 120, y: 40 }]]
    const at = placeLabels([ask], { w: 200, h: 200 }, walls, roads).get('a')!
    expect(at.y).toBe(100 - 12 - 3 - 17)
  })

  it('옆 자리가 표시 오른쪽 위의 신의 흔적에 걸리면 옆에 붙인 채 반 줄 내린다', () => {
    const ask: LabelAsk = { id: 'a', x: 100, y: 100, r: 13, w: 60, h: 17, must: false }
    // 오른쪽만 비었다: 위·아래·왼쪽은 막혔고, 오른쪽 위에 흔적 표시가 있다
    const walls: LabelBlock[] = [{ x0: 0, y0: 0, x1: 200, y1: 78 }, { x0: 0, y0: 118, x1: 200, y1: 200 }, { x0: 0, y0: 0, x1: 95, y1: 200 }]
    const trace: LabelBlock = { x0: 112, y0: 79, x1: 126, y1: 93 }
    expect(placeLabels([ask], { w: 200, h: 200 }, [...walls, trace], []).get('a')).toEqual({ x: 118, y: 100 })
    // 흔적이 없으면 옆 한가운데
    expect(placeLabels([ask], { w: 200, h: 200 }, walls, []).get('a')).toEqual({ x: 118, y: 92 })
  })

  it('지금 땅·목표의 이름이 놓일 자리가 모두 남의 표시 쪽으로 기울면 가장 덜 기운 자리에 놓는다 (다른 이름은 놓지 않는다)', () => {
    const own = (must: boolean): LabelAsk => ({ id: 'a', x: 100, y: 60, r: 12, w: 60, h: 17, must })
    // 양옆이 막혀 위·아래만 남았다. 아래 자리는 아랫마을 표시에 닿고(2px 기욺), 위 자리는 윗마을 표시에서 1px 떨어진다(1px 기욺)
    const walls: LabelBlock[] = [{ x0: 0, y0: 0, x1: 68, y1: 120 }, { x0: 132, y0: 0, x1: 200, y1: 120 }]
    const lower: LabelAsk = { id: 'lower', x: 100, y: 97, r: 6, w: 0, h: 0, must: false }
    const upper: LabelAsk = { id: 'upper', x: 100, y: 21, r: 6, w: 0, h: 0, must: false }
    const board = { w: 200, h: 120 }
    // 남의 표시는 이름 없이 자리만 견준다 (크기 0인 이름표는 판 가장자리 밖이라 놓이지 않는다)
    expect(placeLabels([own(true), lower, upper], board, walls, []).get('a')).toEqual({ x: 70, y: 28 })
    expect(placeLabels([own(false), lower, upper], board, walls, []).has('a')).toBe(false)
  })

  it('선이 상자를 지나가는지: 닿기만 한 것은 아니다', () => {
    const box = { x0: 10, y0: 10, x1: 20, y1: 20 }
    expect(crosses({ x: 0, y: 15 }, { x: 30, y: 15 }, box)).toBe(true)
    expect(crosses({ x: 0, y: 0 }, { x: 30, y: 30 }, box)).toBe(true)
    expect(crosses({ x: 0, y: 5 }, { x: 30, y: 5 }, box)).toBe(false)
    expect(crosses({ x: 0, y: 10 }, { x: 30, y: 10 }, box)).toBe(false)
    expect(crosses({ x: 0, y: 15 }, { x: 5, y: 15 }, box)).toBe(false)
  })

  it('판 밖 땅으로 가는 길은 판 가장자리에서 끊는다', () => {
    const box = { x0: 0, y0: 0, x1: 100, y1: 100 }
    expect(leaveBox({ x: 50, y: 50 }, { x: 150, y: 50 }, box)).toEqual({ x: 100, y: 50 })
    expect(leaveBox({ x: 50, y: 50 }, { x: 50, y: -150 }, box)).toEqual({ x: 50, y: 0 })
    const corner = leaveBox({ x: 50, y: 50 }, { x: 250, y: 150 }, box)
    expect(corner.x).toBeCloseTo(100, 5)
    expect(corner.y).toBeCloseTo(75, 5)
    // 안에 있는 끝이면 그대로
    expect(leaveBox({ x: 50, y: 50 }, { x: 60, y: 60 }, box)).toEqual({ x: 60, y: 60 })
  })
})

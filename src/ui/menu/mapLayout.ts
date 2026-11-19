/**
 * 지도 탭의 자리 셈 (E307): 화면(DOM) 없이 계산만 한다. 그리기는 `mapTab.ts`.
 *
 * - **판의 방향:** 세로로 긴 판(휴대폰)은 북쪽을 위로 놓는다. 세계는 마을에서 북쪽으로 한 줄로 뻗어 있어
 *   (`src/data/world.ts`의 칸: 줄 0~6, 데모의 땅은 가로 2.5칸 안) 줄기가 세로로 서고 판을 다 쓴다.
 *   가로로 넓은 판은 작은 지도·화면과 같은 방향(45° 돌림)이라, 지도에서 위로 가면 화면에서도 위로 걷는다.
 * - **판에 담는 땅:** 세로 판은 엔딩 뒤에야 풀리는 신화권(장 흐름 밖의 땅)을 빼고 줄기에 맞춘다. 그 가운데
 *   판 안에 드는 땅은 그리고, 판 밖 땅으로 가는 길은 가장자리에서 끊는다. 엔딩 뒤에는 모두 담는다.
 * - **크기:** 땅 표시·이름·누르는 자리는 px로 정해져 있으니 자리도 px로 센다 (칸 하나의 크기 = sx·sy).
 * - **이름:** 제 표시에 붙은 자리에, 남의 표시보다 제 표시의 이름으로 읽히게 놓는다 (`placeLabels`).
 *   남의 이름 바로 위·아래에 붙이지 않고, 판에 그린 땅의 이름은 되도록 빠뜨리지 않는다.
 *   표시의 크기(지금 땅의 고리·목표의 마름모)는 `markRim` 한 곳에서 정한다.
 */

export interface Point {
  x: number
  y: number
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** 지도 위의 땅 하나 (`WorldMapHost.nodes()`의 일부) */
export interface MapLand extends Point {
  id: string
  /** 땅의 너비 (칸 한 변 = 1) */
  size: number
  here: boolean
  found: boolean
  locked: boolean
  /** 장 흐름 밖의 땅: 엔딩 뒤에야 결계가 풀린다 */
  later: boolean
}

/** 북쪽이 위(세로 판) / 화면과 같은 방향(45° 돌림) */
export type MapMode = 'north' | 'screen'

export interface MapLayout {
  mode: MapMode
  /** 판의 크기 (px) */
  w: number
  h: number
  /** 칸 하나의 크기 (px): 가로, 세로(줄 사이) */
  sx: number
  sy: number
  /** 땅의 넓이를 그리는 크기 (px, 칸 한 변): 줄 사이를 벌려도 땅은 네모다 */
  land: number
  /** 세계 칸 자리 → 판 위 자리 (px) */
  place(p: Point): Point
  /** 판에 그리는 땅 */
  shown: ReadonlySet<string>
}

/** 판의 세로가 가로의 이만큼 이상이면 북쪽을 위로 (정사각형이면 두 방향의 크기가 같아지고, 그보다 길면 북쪽이 위인 쪽이 크다) */
const TALL = 1
/**
 * 판 가장자리에서 가장 바깥 땅 표시까지 (px): 옆은 누르는 자리 44px의 절반과 조금, 위아래는 이름 한 줄.
 * 옆을 44px로 두던 때는 엔딩 뒤 세로 판(가로 일곱 칸)의 칸이 43px로 줄어 누르는 자리도 41px이었다 (E307 손 QA):
 * 가장자리 땅의 이름은 판 안으로 당겨 놓으니(`placeLabels`) 옆 여백을 줄여 칸을 49px로 넓힌다
 */
const PAD = { x: 28, y: 36 }
/** 땅의 넓이(네모)와 판 가장자리 사이 (px) */
const EDGE = 4
/** 가로 판에서 지도 양옆에 이름이 놓일 자리 (px) */
const SIDE_ROOM = 110
/** 칸 하나의 크기 (px): 아무리 좁아도·넓어도 */
const MIN_SCALE = 24
const MAX_SCALE = 132
/**
 * 세로 판에서 줄 사이를 칸 사이보다 이만큼까지 벌린다: 엔딩 뒤 세계는 가로세로가 같아(7칸 × 7줄), 그대로면 판 아래 절반이 빈다.
 * 두 배까지만 벌리던 때는 393×852에서 판 아래가 한 줄 넘게 남았고(칸 43px × 2 = 87px, 줄 사이로 쓸 수 있는 것은 99px),
 * 촘촘한 가운데 줄(땅 일곱)의 이름 하나가 놓일 자리가 없었다 (E307 손 QA): 남는 높이를 다 쓴다.
 * 땅의 넓이는 벌리지 않고 제 모양(네모)대로 그린다 (`land`)
 */
const STRETCH = 2.5

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** 쓸 수 있는 넓이(px)에 지도를 놓는다 */
export function layoutMap(lands: readonly MapLand[], avail: { w: number; h: number }): MapLayout {
  const mode: MapMode = avail.h >= avail.w * TALL ? 'north' : 'screen'
  const turn = (p: Point): Point => (mode === 'north' ? { x: p.x, y: p.y } : { x: (p.x - p.y) * Math.SQRT1_2, y: (p.x + p.y) * Math.SQRT1_2 })
  // 판을 맞출 땅: 세로 판은 줄기(엔딩 뒤 신화권이 아닌 땅)와, 엔딩 뒤 땅이어도 지금 있거나 켰거나 열린 땅
  const core = mode === 'north' ? lands.filter((n) => !n.later || n.here || n.found || !n.locked) : lands
  const framed = (core.length > 0 ? core : lands).map(turn)
  const xs = framed.map((p) => p.x)
  const ys = framed.map((p) => p.y)
  const [x0, x1, y0, y1] = framed.length > 0 ? [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)] : [0, 0, 0, 0]
  const spanX = x1 - x0
  const spanY = y1 - y0
  // 땅의 넓이가 표시 가운데에서 뻗는 만큼 (칸): 돌리면 마름모라 √2배
  const reach = (Math.max(0, ...lands.map((n) => n.size)) / 2) * (mode === 'screen' ? Math.SQRT2 : 1)
  const limit = (len: number, span: number, pad: number) => Math.min(span > 0 ? (len - 2 * pad) / span : Infinity, span + reach > 0 ? (len - 2 * EDGE) / (span + 2 * reach) : Infinity)
  const sx = clamp(Math.min(limit(avail.w, spanX, PAD.x), limit(avail.h, spanY, PAD.y)), MIN_SCALE, MAX_SCALE)
  // 줄 사이: 남는 높이만큼 벌린다 (땅의 넓이는 sx 그대로라 위아래 여백도 sx로 센다)
  const roomY = spanY > 0 ? (avail.h - 2 * Math.max(PAD.y, reach * sx + EDGE)) / spanY : sx
  const sy = mode === 'north' ? clamp(Math.min(roomY, sx * STRETCH), sx, MAX_SCALE) : sx
  const padX = Math.max(PAD.x, reach * sx + EDGE)
  const padY = Math.max(PAD.y, reach * sx + EDGE)
  const needW = Math.ceil(spanX * sx + 2 * padX)
  const w = mode === 'north' ? Math.max(avail.w, needW) : Math.max(needW, Math.min(avail.w, Math.ceil(spanX * sx + 2 * Math.max(padX, SIDE_ROOM))))
  const h = Math.ceil(spanY * sy + 2 * padY)
  const ox = (w - spanX * sx) / 2 - x0 * sx
  const oy = padY - y0 * sy
  const place = (p: Point): Point => {
    const t = turn(p)
    return { x: ox + t.x * sx, y: oy + t.y * sy }
  }
  const near = 0.01
  const shown = new Set(
    lands
      .filter((n) => {
        const t = turn(n)
        return t.x >= x0 - near && t.x <= x1 + near && t.y >= y0 - near && t.y <= y1 + near
      })
      .map((n) => n.id),
  )
  return { mode, w, h, sx, sy, land: sx, place, shown }
}

/** 상자 안의 a에서 상자 밖의 b로 가는 선이 상자를 벗어나는 자리 (판 밖 땅으로 가는 길을 가장자리에서 끊는다) */
export function leaveBox(a: Point, b: Point, box: Box): Point {
  let t = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx > 0) t = Math.min(t, (box.x1 - a.x) / dx)
  if (dx < 0) t = Math.min(t, (box.x0 - a.x) / dx)
  if (dy > 0) t = Math.min(t, (box.y1 - a.y) / dy)
  if (dy < 0) t = Math.min(t, (box.y0 - a.y) / dy)
  t = Math.max(0, t)
  return { x: a.x + dx * t, y: a.y + dy * t }
}

/** 땅 표시의 반지름 (px): 마을은 크게, 보스의 땅(마름모)은 조금 크게. 칸이 좁게 놓인 판은 조금 줄인다 */
export function markRadius(zone: string | null, scale: number): number {
  return (zone === null ? 14 : zone === 'boss' ? 13 : 11) * (scale < 56 ? 0.85 : 1)
}

/** 땅 표시와 그 둘레에 두르는 것 (px, 표시 가운데에서) */
export interface MarkRim {
  /** 표시의 반지름 */
  r: number
  /** 지금 땅의 흰 고리 (없으면 0) */
  ring: number
  /** 목표의 금빛 마름모가 뻗는 끝 (없으면 0) */
  tip: number
  /** 표시가 차지하는 바깥 (선 굵기까지): 제 이름은 이 밖에 놓는다. 마름모면 끝까지의 거리 */
  out: number
  /** 남의 이름이 덮지 못하는 네모의 반 변 */
  solid: number
}

/**
 * 땅 표시의 둘레: 지금 땅은 흰 고리(굵기 2), 목표는 금빛 마름모(굵기 3)를 두른다.
 * 지금 땅이 목표면 고리를 표시에 붙이고 마름모를 그 밖으로 키운다: 같은 크기로 두면 고리(r + 6)가 마름모의 변(r + 11의 1/√2)과 겹쳐
 * 마름모에 깐 어두운 테에 통째로 가린다. 마름모의 변 안쪽(끝 / √2 − 1.5)이 고리 바깥(고리 + 1)보다 멀어야 둘 다 보인다
 */
export function markRim(zone: string | null, scale: number, here: boolean, goal: boolean): MarkRim {
  const r = markRadius(zone, scale)
  const ring = here ? r + (goal ? 4 : 6) : 0
  const tip = goal ? r + (here ? 16 : 11) : 0
  return { r, ring, tip, out: goal ? tip + 2 : here ? ring + 1 : r + 2, solid: goal ? tip - 3 : here ? ring + 1 : r + 1 }
}

/** 손가락이 누르는 자리의 한 변 (px): 44px, 땅끼리 가까우면 이웃과 겹치지 않을 만큼 줄인다 */
export function spotSize(points: readonly Point[]): number {
  let nearest = Infinity
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) nearest = Math.min(nearest, Math.max(Math.abs(points[i]!.x - points[j]!.x), Math.abs(points[i]!.y - points[j]!.y)))
  }
  return clamp(Math.floor(nearest) - 2, 28, 44)
}

/**
 * 이름을 놓는 차례 (작을수록 먼저): 지금 땅 → 목표 → 마을 → 켠 성소 → 지금 땅의 이웃 → 열린 땅 → 막힌 땅 → 엔딩 뒤 땅.
 * 앞의 넷은 어떤 크기에서도 보이고(`LabelAsk.must`·`keepsName`), 뒤는 다른 이름·표시와 겹치지 않는 자리가 남았을 때만 보인다
 */
export function labelRank(n: { here: boolean; goal: boolean; village: boolean; found: boolean; near: boolean; locked: boolean; later: boolean }): number {
  if (n.here) return 1
  if (n.goal) return 2
  if (n.village) return 3
  if (n.found) return 4
  if (n.near) return 5
  if (!n.locked) return 6
  return n.later ? 8 : 7
}

/**
 * 이름이 빠지면 안 되는 땅인가 (E307 손 QA): 워프할 수 있는 곳, 곧 마을과 켠 성소 (`labelRank`의 넷째까지).
 * 이름 없는 속이 찬 원만 보고는 어디로 가는지 모른다. 지금 땅·목표는 `LabelAsk.must`가, 이 땅들은 `LabelAsk.keep`이 지킨다
 */
export const keepsName = (rank: number): boolean => rank <= 4

/** 이름표 하나를 놓아 달라는 것 */
export interface LabelAsk {
  id: string
  /** 그 땅 표시의 가운데와, 표시가 차지하는 바깥까지 (px, `MarkRim.out`) */
  x: number
  y: number
  r: number
  /** 표시의 바깥이 마름모다 (목표의 금빛 마름모): 끝은 r까지 뻗지만 대각선 쪽은 r / √2까지만 찬다 */
  diamond?: boolean
  /** 이름표의 크기 (px) */
  w: number
  h: number
  /** 놓을 자리가 마땅치 않아도 보인다 (지금 땅·목표): 남의 표시 쪽으로 가장 덜 기운 자리, 없으면 가장 덜 겹치는 자리에 */
  must: boolean
  /**
   * 빠지면 안 되는 이름 (워프할 수 있는 곳: 마을과 켠 성소, `keepsName`). 자리가 모자라면 뒤 차례의 이름(가 보지 않은 땅)을 치우고 놓고,
   * 그래도 없으면 must처럼 가장 덜 기운·가장 덜 겹치는 자리에 놓는다 (E307 손 QA: 393×659에서 켠 성소의 이름이 빠졌다)
   */
  keep?: boolean
}

/** 표시와 이름표 사이 (px) */
const GAP = 3

/** 이름표를 놓아 볼 자리 하나 (왼쪽 위 모서리). far = 한 줄 더 떨어진 자리, over = 표시의 바로 위·아래 (옆으로 밀어도 그 표시의 것으로 읽힌다) */
type Candidate = Point & { far: boolean; over: boolean }

/** 바로 위·아래의 이름표를 옆으로 밀 때 표시의 가운데 양옆에 남기는 폭 (px): 이름표가 표시 위에 걸쳐 있어야 제 이름으로 읽힌다 */
const OVER_KEEP = 6

/**
 * 이름표를 놓아 볼 자리: 아래 → 위 → 오른쪽 → 왼쪽 → 옆에서 반 줄 내리거나 올린 넷 → 대각선 넷 →
 * 아래·위에서 한쪽으로 민 넷(이름표의 끝이 표시에 걸친다: 가운데 자리가 옆 땅의 이름·흔적에 걸릴 때),
 * 땅이 촘촘하면 한 줄 더 떨어진(far) 아래·위·대각선과 그 줄에서 한쪽으로 민 넷
 */
function candidates(a: LabelAsk): Candidate[] {
  // 대각선 자리: 이름표의 모서리가 표시의 바깥에서 GAP만큼 (마름모는 변이 가운데에 더 가깝다)
  const d = a.diamond ? a.r / 2 + GAP * Math.SQRT1_2 : a.r * Math.SQRT1_2 + GAP
  const right = a.x + a.r + GAP + 2
  const left = a.x - a.r - GAP - 2 - a.w
  const below = a.y + a.r + GAP
  const above = a.y - a.r - GAP - a.h
  // 한쪽으로 민 자리: 이름표의 왼쪽 끝이나 오른쪽 끝이 표시 가운데에서 OVER_KEEP만큼 걸친다 (이름표가 좁으면 가운데 자리와 같다)
  const keep = Math.min(OVER_KEEP, a.w / 2)
  const toRight = a.x - keep
  const toLeft = a.x + keep - a.w
  const beside: (Point & { over?: boolean })[] = [
    { x: a.x - a.w / 2, y: below, over: true },
    { x: a.x - a.w / 2, y: above, over: true },
    { x: right, y: a.y - a.h / 2 },
    { x: left, y: a.y - a.h / 2 },
    // 옆에 붙인 채 반 줄 내리거나 올린다: 표시 오른쪽 위의 신의 흔적이나 비스듬히 놓인 이웃 표시를 비킨다
    { x: right, y: a.y },
    { x: right, y: a.y - a.h },
    { x: left, y: a.y },
    { x: left, y: a.y - a.h },
    { x: a.x + d, y: a.y + d },
    { x: a.x - d - a.w, y: a.y + d },
    { x: a.x + d, y: a.y - d - a.h },
    { x: a.x - d - a.w, y: a.y - d - a.h },
    { x: toRight, y: below, over: true },
    { x: toLeft, y: below, over: true },
    { x: toRight, y: above, over: true },
    { x: toLeft, y: above, over: true },
  ]
  const apart: (Point & { over?: boolean })[] = [
    { x: a.x - a.w / 2, y: below + a.h + 1, over: true },
    { x: a.x - a.w / 2, y: above - a.h - 1, over: true },
    { x: a.x + d, y: a.y + d + a.h + 1 },
    { x: a.x - d - a.w, y: a.y + d + a.h + 1 },
    { x: a.x + d, y: a.y - d - a.h * 2 - 1 },
    { x: a.x - d - a.w, y: a.y - d - a.h * 2 - 1 },
    { x: toRight, y: below + a.h + 1, over: true },
    { x: toLeft, y: below + a.h + 1, over: true },
    { x: toRight, y: above - a.h - 1, over: true },
    { x: toLeft, y: above - a.h - 1, over: true },
  ]
  return [...beside.map((p) => ({ ...p, far: false })), ...apart.map((p) => ({ ...p, far: true }))].map((p) => ({ x: Math.round(p.x), y: Math.round(p.y), far: p.far, over: p.over === true }))
}

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0))

/** 선이 상자를 지나가나 (끝이 닿기만 한 것은 아니다) */
export function crosses(a: Point, b: Point, box: Box): boolean {
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dy = b.y - a.y
  const edges: [number, number][] = [
    [-dx, a.x - box.x0],
    [dx, box.x1 - a.x],
    [-dy, a.y - box.y0],
    [dy, box.y1 - a.y],
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q <= 0) return false
      continue
    }
    const t = q / p
    if (p < 0) t0 = Math.max(t0, t)
    else t1 = Math.min(t1, t)
    if (t0 >= t1) return false
  }
  return true
}

/** 이름표가 비켜야 하는 자리. of는 그 자리의 땅(제 땅의 것은 비키지 않는다), soft는 덮어도 되지만 되도록 비키는 자리 */
export type LabelBlock = Box & { of?: string; soft?: boolean }

/** 길 하나를 가로지르는 것을 겹친 넓이로 치면 (px²): 누르는 자리를 조금 덮는 쪽이 길을 가로지르는 쪽보다 낫다 */
const ROAD_COST = 240
/** 한 줄 더 떨어진 자리의 값: 표시에 붙은 자리가 길 둘을 가로질러도 그쪽이 낫다 (떨어진 이름은 어느 땅의 것인지 흐려진다) */
const FAR_COST = 600
/** 제 표시보다 남의 표시에 더 가까운 자리의 값: 지금 땅·목표의 이름도 다른 자리가 있으면 그리로 간다 */
const ASTRAY_COST = 4000
/** 그런 자리밖에 없을 때는 덜 기운 자리부터: 남의 표시 쪽으로 1px 더 기울 때마다 (길 하나를 가로지르는 것 = 2px) */
const LEAN_COST = 120
/** 이만큼(px)까지는 남의 표시에 더 가까워도 제 이름으로 읽힌다 */
const LEAN_OK = 1
/** 자리가 없어 마지막에 놓는 이름은 이만큼(px)까지만 기울어도 된다: 그보다 기울면 남의 이름으로 읽히니 놓지 않는다 (눌러서 설명으로 본다) */
const LEAN_LAST = 8
/**
 * 빠지면 안 되는 이름(keep)을 어디에든 놓을 때, 남의 표시 쪽으로 1px 기운 것을 덮은 넓이로 치면 (px²).
 * 8px 기운 자리(`LEAN_LAST`)가 글자 하나(12×17px)를 덮는 자리와 비슷하게 나쁘다: 조금 기운 자리는 글자를 덮는 자리보다 낫고,
 * 한 줄 넘게 기운 자리(남의 표시 바로 밑: 그 땅의 이름으로 읽힌다)보다는 흔적 십자를 조금 덮더라도 제 표시에 붙은 자리가 낫다
 */
const LEAN_FORCED = 25
/** 표시와 나란하지 않고 모서리로만 닿는 이름표는 이만큼(px) 더 먼 것으로 친다: 바로 위·아래·옆에 놓인 이름이 먼저 그 표시의 것으로 읽힌다 */
const CORNER = 6
/**
 * 남의 이름 바로 위·아래에 붙은 자리의 값 (E307 손 QA): 두 이름이 두 줄짜리 이름 하나처럼 읽힌다
 * (1280×720 판에서 「요툰헤임 빙하」가 「철의 숲」 바로 위에 놓여 둘 다 철의 숲 표시의 이름처럼 보였다).
 * 길 둘을 가로지르는 자리(480)보다는 비싸고 한 줄 더 떨어진 자리(600)보다는 싸다
 */
const STACK_COST = 500
/** 위아래로 이만큼(px) 안에 붙고 가로로 STACK_SPAN(글자 하나) 넘게 겹치면 붙은 것으로 친다 */
const STACK_GAP = 8
const STACK_SPAN = 12
/** 다 놓은 뒤 서로를 보고 다시 고르는 횟수: 먼저 놓은 이름이 뒤에 놓인 이름을 비켜 줄 수 있다 */
const SWEEPS = 2

/** 두 이름표가 위아래로 붙어 있나 (겹치지는 않는다) */
export function stacked(a: Box, b: Box): boolean {
  const span = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)
  const gap = Math.max(a.y0 - b.y1, b.y0 - a.y1)
  return span >= STACK_SPAN && gap >= 0 && gap < STACK_GAP
}

/** 상자에서 점에 가장 가까운 곳까지 (가로·세로 따로, 점이 상자의 그 범위 안이면 0) */
const offset = (p: Point, box: Box) => ({ dx: Math.max(box.x0 - p.x, 0, p.x - box.x1), dy: Math.max(box.y0 - p.y, 0, p.y - box.y1) })

/**
 * 이름표(상자)에서 땅 표시의 바깥까지 (px, 닿거나 겹치면 0). 가운데가 아니라 바깥에서 잰다:
 * 목표의 마름모·지금 땅의 고리는 표시보다 커서, 가운데에서 재면 제 이름이 늘 남의 표시에 더 가깝게 나온다
 */
export function away(mark: Point & { r: number; diamond?: boolean }, box: Box): number {
  const { dx, dy } = offset(mark, box)
  if (!mark.diamond) return Math.max(0, Math.hypot(dx, dy) - mark.r)
  if (dx + dy <= mark.r) return 0
  // 마름모의 변 (r, 0)–(0, r) 위에서 가장 가까운 점
  const t = clamp((mark.r - dx + dy) / (2 * mark.r), 0, 1)
  return Math.hypot(dx - mark.r * (1 - t), dy - mark.r * t)
}

/**
 * 이름표가 제 표시의 이름으로 읽히는 정도 (px, 작을수록 또렷하다): 표시의 바깥까지의 거리에,
 * 표시가 이름표의 위·아래·옆에 나란히 있지 않으면(모서리로만 닿으면) CORNER까지 더한다
 */
export function reads(mark: Point & { r: number; diamond?: boolean }, box: Box): number {
  const { dx, dy } = offset(mark, box)
  return away(mark, box) + Math.min(CORNER, dx, dy)
}

/**
 * 이름표가 남의 표시 쪽으로 기운 만큼 (px): 0보다 크면 제 표시(`reads`)보다 남의 표시(`away`)가 가까워 그 땅의 이름처럼 읽힌다.
 * LEAN_OK까지는 봐준다
 */
export function leaning(a: LabelAsk, box: Box, asks: readonly LabelAsk[]): number {
  return reads(a, box) - asks.reduce((near, o) => (o.id === a.id ? near : Math.min(near, away(o, box))), Infinity) - LEAN_OK
}

/**
 * 이름표의 자리를 얼마나 가려 고르나: 깔끔한 자리만 / 조금 기운 자리까지(`LEAN_LAST`) / 어디에든.
 * 어디에든(forced)은 덮는 자리와 기운 자리를 한 값으로 견준다: 덮은 넓이(px²) + 기운 만큼(`LEAN_FORCED`) + 길·떨어진 줄의 값
 */
type Care = 'tidy' | 'loose' | 'forced'

/**
 * 이름표를 차례대로 놓는다: 판 안에서, 땅 표시·내 자리(blocks)와 이미 놓은 이름을 덮지 않는 자리 가운데
 * 다른 땅의 누르는 자리(soft)를 가장 덜 덮고 길을 가장 덜 가로지르는 자리. 표시에 붙은 자리가 먼저다.
 * 표시의 바로 위·아래 자리가 판 밖으로 나가면 판 안으로 당긴다 (이름표가 표시 위에 걸쳐 있는 한).
 * 제 표시의 이름으로 읽히는 것(`reads`)보다 남의 표시까지(`away`: 어느 쪽에 있든)가 가까운 자리는 그 땅의 이름처럼
 * 읽히니 고르지 않고, 남의 이름 바로 위·아래에 붙는 자리(`stacked`)는 되도록 피한다.
 * must(지금 땅·목표)는 어디에든 놓는다: 남의 표시 쪽으로 가장 덜 기운 자리, 덮지 않는 자리가 아예 없으면 가장 덜 덮는 자리.
 * 다 놓은 뒤에는 서로를 보고 다시 고른다 (`SWEEPS`): 뒤에 놓인 이름과 붙은 이름이 빈 옆자리로 비키고, 자리가 없던 이름이 그 틈에 놓인다.
 * keep(워프할 수 있는 곳: 마을·켠 성소)은 빠지지 않는다 (E307 손 QA: 393×659에서 켠 성소가 이름 없는 원으로만 보였다).
 * 자리가 없으면 먼저 놓인 이름 하나가 다른 깔끔한 자리로 비켜 주고(`giveWay`), 그것도 안 되면 뒤 차례의 이름(가 보지 않은 땅)을
 * 치우고 놓으며, 그래도 없으면 가장 덜 나쁜 자리에 놓는다 (조금 기운 자리나 조금 덮는 자리. 남의 표시 밑으로 멀리 밀려나지는 않는다).
 * 그 밖에 자리가 없는 이름은 마지막에, 아무것도 덮지 않는 자리 가운데 남의 표시 쪽으로 가장 덜 기운 자리에 놓는다 (E307 손 QA:
 * 엔딩 뒤 세로 판의 촘촘한 줄에서 이름 하나가 빠졌다. 조금 기운 이름이 없는 이름보다 낫다). 그런 자리도 없거나 너무 기울면(`LEAN_LAST`) 빠진다.
 * 돌려주는 것은 놓은 이름표마다 왼쪽 위 모서리 (px)
 */
export function placeLabels(asks: readonly LabelAsk[], board: { w: number; h: number }, blocks: readonly LabelBlock[], roads: readonly (readonly [Point, Point])[]): Map<string, Point> {
  /** 놓은 자리: over = 덮은 넓이 (0이면 아무것도 덮지 않는다), cost = 덮지 않는 자리끼리 견주는 값 */
  type Spot = { at: Point; box: Box; far: boolean; over: number; cost: number }
  const spots = new Map<string, Spot>()
  const inset = 2
  /** 그 자리의 값. 판 밖이거나 남의 표시 쪽으로 기울어 고르지 않는 자리면 null */
  const rate = (a: LabelAsk, at: Point, far: boolean, taken: readonly Box[], care: Care = 'tidy'): Spot | null => {
    const box = { x0: at.x, y0: at.y, x1: at.x + a.w, y1: at.y + a.h }
    if (box.x0 < inset || box.y0 < inset || box.x1 > board.w - inset || box.y1 > board.h - inset) return null
    const others = blocks.filter((b) => b.of !== a.id)
    const over = others.reduce((sum, b) => sum + (b.soft ? 0 : overlap(b, box)), 0) + taken.reduce((sum, b) => sum + overlap(b, box), 0)
    if (over > 0 && care !== 'forced') return { at, box, far, over, cost: Infinity }
    const lean = leaning(a, box, asks)
    if (lean > (care === 'loose' ? LEAN_LAST : 0) && !a.must && care !== 'forced') return null
    const tidiness =
      others.reduce((sum, b) => sum + (b.soft ? overlap(b, box) : 0), 0) +
      roads.filter(([p, q]) => crosses(p, q, box)).length * ROAD_COST +
      (far ? FAR_COST : 0) +
      (taken.some((t) => stacked(t, box)) ? STACK_COST : 0)
    // 어디에든: 덮은 넓이와 기운 만큼을 한 값으로 (덮지 않는 자리가 늘 이기지는 않는다)
    if (care === 'forced') return { at, box, far, over, cost: tidiness + over + Math.max(0, lean) * LEAN_FORCED }
    return { at, box, far, over: 0, cost: tidiness + (lean > 0 ? ASTRAY_COST + lean * LEAN_COST : 0) }
  }
  /** a가 b보다 나은 자리인가: 덮지 않는 자리가 먼저, 그다음 값이 싼 자리 */
  const better = (a: Spot, b: Spot) => (a.over === 0 && b.over === 0 ? a.cost < b.cost : a.over < b.over)
  /** 그 이름의 가장 나은 자리: 다른 이름들(taken)이 놓인 채로. 덮는 자리는 must와 「어디에든」(forced)만 */
  const best = (a: LabelAsk, taken: readonly Box[], care: Care = 'tidy'): Spot | null => {
    let pick: Spot | null = null
    const keep = Math.min(OVER_KEEP, a.w / 2)
    for (const c of candidates(a)) {
      // 바로 위·아래 자리가 판 밖으로 나가면 판 안으로 당긴다: 이름표가 표시 가운데 양옆에 걸쳐 있을 때까지만
      const slid = c.over ? clamp(c.x, inset, board.w - inset - a.w) : c.x
      const x = slid >= a.x - a.w + keep - 1 && slid <= a.x - keep + 1 ? slid : c.x
      const spot = rate(a, { x, y: c.y }, c.far, taken, care)
      if (!spot || (spot.over > 0 && !a.must && care !== 'forced')) continue
      if (!pick || (care === 'forced' ? spot.cost < pick.cost : better(spot, pick))) pick = spot
      if (spot.over === 0 && spot.cost === 0) break
    }
    return pick
  }
  const boxes = (...but: string[]) => [...spots].filter(([id]) => !but.includes(id)).map(([, spot]) => spot.box)
  /** 깔끔하게 놓였나: 아무것도 덮지 않고 남의 표시 쪽으로 기울지 않았다 */
  const tidy = (spot: Spot | null): spot is Spot => spot !== null && spot.over === 0 && spot.cost < ASTRAY_COST

  for (const a of asks) {
    const spot = best(a, boxes(a.id))
    if (spot) spots.set(a.id, spot)
  }
  // 다시 고르기: 다른 이름이 다 놓인 지금의 값으로 견줘, 더 나은 자리가 있을 때만 옮긴다 (놓이지 못한 이름은 자리가 났으면 놓는다)
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    let moved = false
    for (const a of asks) {
      const taken = boxes(a.id)
      const was = spots.get(a.id)
      const now = was ? rate(a, was.at, was.far, taken) : null
      const spot = best(a, taken)
      if (!spot || (now && !better(spot, now))) continue
      spots.set(a.id, spot)
      moved = true
    }
    if (!moved) break
  }

  // 워프할 수 있는 곳의 이름(keep)이 아직 놓이지 못했다 (E307 손 QA)
  const firm = new Set(asks.filter((a) => a.must || a.keep).map((a) => a.id))
  /**
   * 먼저 놓인 이름 하나가 비켜 준다: 그 이름을 들어내면 keep 이름이 깔끔하게 놓이고, 들어낸 이름도 다른 깔끔한 자리에 다시 놓일 때만.
   * 뒤 차례의 이름부터 비켜 본다 (목표의 이름이 켠 성소의 하나뿐인 자리를 먼저 차지했을 때는 목표의 이름이 제 표시의 다른 쪽으로 간다)
   */
  const giveWay = (a: LabelAsk): boolean => {
    for (const other of [...asks].reverse()) {
      if (other.id === a.id || !spots.has(other.id)) continue
      const rest = boxes(a.id, other.id)
      const spot = best(a, rest)
      if (!tidy(spot)) continue
      const again = best(other, [...rest, spot.box])
      if (!tidy(again)) continue
      spots.set(a.id, spot)
      spots.set(other.id, again)
      return true
    }
    return false
  }
  for (const a of asks) {
    if (!a.keep || spots.has(a.id) || giveWay(a)) continue
    // 뒤 차례의 이름(must도 keep도 아닌 것)은 없는 셈 치고 고른다: 덮지 않는 자리(깔끔하거나 조금 기운), 없으면 덮은 넓이와 기운 만큼이 가장 작은 자리
    const held = [...spots].filter(([id]) => firm.has(id)).map(([, spot]) => spot.box)
    const spot = best(a, held, 'loose') ?? best(a, held, 'forced')
    if (!spot) continue
    // 그 자리를 덮는 뒤 차례의 이름은 치운다 (아래에서 남은 자리에 다시 놓아 본다)
    for (const [id, other] of [...spots]) if (!firm.has(id) && overlap(other.box, spot.box) > 0) spots.delete(id)
    spots.set(a.id, spot)
  }
  // 그래도 자리가 없는 이름: 아무것도 덮지 않는 자리 가운데 남의 표시 쪽으로 가장 덜 기운 자리에 놓는다 (조금 기운 이름이 없는 이름보다 낫다)
  for (const a of asks) {
    if (spots.has(a.id)) continue
    const spot = best(a, boxes(a.id), 'loose')
    if (spot && spot.over === 0) spots.set(a.id, spot)
  }
  return new Map([...spots].map(([id, spot]) => [id, { x: spot.at.x, y: spot.at.y }]))
}

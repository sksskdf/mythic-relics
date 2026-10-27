/**
 * 하나로 이어진 세계 (E19): 지역마다 세계 칸 하나를 차지한다. 칸은 벽돌처럼 줄마다 반 칸씩 엇갈려,
 * 한 칸에 이웃이 여섯(같은 줄 둘, 위 줄 둘, 아래 줄 둘) 생긴다. 마을이 가운데이고 신화권 다섯이 서로 다른 쪽으로 뻗는다.
 *
 * - 칸 한 변은 CELL(m). 그 가운데에 지역의 움직일 수 있는 네모(한 변 halfExtent × 2)가 있고, 나머지는 숲 띠다.
 * - 출구로 이어진 이웃끼리는 숲 띠를 지르는 통로(폭 PASSAGE_WIDTH)로 걸어서 넘어간다.
 * - 지역 데이터(regions.json)의 좌표는 칸 가운데를 (0, 0)으로 한 지역 안 좌표이고, 세계 좌표는 칸 자리를 더한 것이다.
 *   화면 오른쪽이 +x, 북쪽(화면 위)이 −z이므로 위 줄(row +1)은 z가 CELL만큼 작다.
 */
import type { Spot } from './regions'

/** 세계 칸 한 변 (m) */
export const CELL = 100
/** 이웃 사이 통로의 폭 (m) */
export const PASSAGE_WIDTH = 6
/** 출구(문)는 움직일 수 있는 네모 가장자리에서 이만큼 안쪽에 선다 */
export const EXIT_INSET = 3

/** 세계 칸: row는 북쪽이 +, col은 같은 줄 이웃이 1씩. 홀수 줄은 0.5만큼 엇갈린다 (벽돌) */
export interface Cell {
  col: number
  row: number
}

/** 축에 나란한 네모 (세계 좌표) */
export interface Rect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** 칸 가운데의 세계 좌표 */
export function cellOrigin(cell: Cell): Spot {
  return { x: cell.col * CELL, z: -cell.row * CELL }
}

/** 칸 전체 (숲 띠까지) */
export function cellRect(cell: Cell): Rect {
  const o = cellOrigin(cell)
  return { minX: o.x - CELL / 2, maxX: o.x + CELL / 2, minZ: o.z - CELL / 2, maxZ: o.z + CELL / 2 }
}

/** 칸 안의 움직일 수 있는 네모 */
export function walkRect(cell: Cell, halfExtent: number): Rect {
  const o = cellOrigin(cell)
  return { minX: o.x - halfExtent, maxX: o.x + halfExtent, minZ: o.z - halfExtent, maxZ: o.z + halfExtent }
}

/** 벽돌 자리인가: 짝수 줄은 정수 칸, 홀수 줄은 반 칸 */
export function validCell(cell: Cell): boolean {
  const odd = Math.abs(cell.row) % 2 === 1
  return Number.isInteger(cell.row) && Number.isInteger(odd ? cell.col - 0.5 : cell.col)
}

/** 두 칸이 이웃인가: 같은 줄 옆(side), 위·아래 줄(vertical), 아니면 null */
export function adjacency(a: Cell, b: Cell): 'side' | 'vertical' | null {
  if (a.row === b.row && Math.abs(a.col - b.col) === 1) return 'side'
  if (Math.abs(a.row - b.row) === 1 && Math.abs(a.col - b.col) === 0.5) return 'vertical'
  return null
}

/** 한 칸의 이웃 자리 여섯 */
export function neighborCells(cell: Cell): Cell[] {
  return [
    { col: cell.col - 1, row: cell.row },
    { col: cell.col + 1, row: cell.row },
    { col: cell.col - 0.5, row: cell.row + 1 },
    { col: cell.col + 0.5, row: cell.row + 1 },
    { col: cell.col - 0.5, row: cell.row - 1 },
    { col: cell.col + 0.5, row: cell.row - 1 },
  ]
}

export const cellKey = (cell: Cell): string => `${cell.col},${cell.row}`

/** 통로가 계산에 쓰는 지역 모양 (RegionDef의 일부) */
export interface PlacedRegion {
  id: string
  cell: Cell
  halfExtent: number
  exits: readonly (Spot & { to: string })[]
}

/** 이웃 사이 통로: from의 출구(세계 좌표)와 to의 출구, 두 네모 사이를 잇는 길 네모 */
export interface Passage {
  from: string
  to: string
  /** from 쪽 문 자리 (세계 좌표) */
  fromExit: Spot
  /** to 쪽 문 자리 (세계 좌표) */
  toExit: Spot
  /** 숲 띠를 지르는 길 (두 네모의 가장자리 사이, 세계 좌표) */
  rect: Rect
}

/**
 * 출구로 이어진 이웃마다 통로를 정한다. 통로 가로 자리는 지금 두 출구 자리의 가운데에서,
 * 두 네모가 함께 닿는 폭 안으로 당긴다 (문이 네모 모서리에 붙지 않게 여유를 둔다).
 * 출구를 옮기는 스크립트(scripts/place-world.mjs)와 데이터 검사가 같은 계산을 쓴다.
 */
export function passages(regions: Readonly<Record<string, PlacedRegion>>): Passage[] {
  const out: Passage[] = []
  for (const a of Object.values(regions)) {
    for (const exit of a.exits) {
      const b = regions[exit.to]
      if (!b || a.id > b.id) continue
      const kind = adjacency(a.cell, b.cell)
      if (!kind) continue
      const back = b.exits.find((e) => e.to === a.id)
      const oa = cellOrigin(a.cell)
      const ob = cellOrigin(b.cell)
      const half = PASSAGE_WIDTH / 2 + 2
      if (kind === 'side') {
        // 같은 줄: 세로 가장자리를 지르는 가로 통로. z는 두 네모가 함께 닿는 폭 안
        const lo = Math.max(oa.z - a.halfExtent, ob.z - b.halfExtent) + half
        const hi = Math.min(oa.z + a.halfExtent, ob.z + b.halfExtent) - half
        const want = ((exit.z + oa.z) + (back ? back.z + ob.z : exit.z + oa.z)) / 2
        const z = clamp(want, lo, hi)
        const dir = Math.sign(ob.x - oa.x)
        const ea = oa.x + dir * a.halfExtent
        const eb = ob.x - dir * b.halfExtent
        out.push({
          from: a.id,
          to: b.id,
          fromExit: { x: ea - dir * EXIT_INSET, z },
          toExit: { x: eb + dir * EXIT_INSET, z },
          rect: { minX: Math.min(ea, eb), maxX: Math.max(ea, eb), minZ: z - PASSAGE_WIDTH / 2, maxZ: z + PASSAGE_WIDTH / 2 },
        })
      } else {
        // 위·아래 줄: 가로 가장자리를 지르는 세로 통로. x는 두 네모가 함께 닿는 폭 안
        const lo = Math.max(oa.x - a.halfExtent, ob.x - b.halfExtent) + half
        const hi = Math.min(oa.x + a.halfExtent, ob.x + b.halfExtent) - half
        const want = ((exit.x + oa.x) + (back ? back.x + ob.x : exit.x + oa.x)) / 2
        const x = clamp(want, lo, hi)
        const dir = Math.sign(ob.z - oa.z)
        const ea = oa.z + dir * a.halfExtent
        const eb = ob.z - dir * b.halfExtent
        out.push({
          from: a.id,
          to: b.id,
          fromExit: { x, z: ea - dir * EXIT_INSET },
          toExit: { x, z: eb + dir * EXIT_INSET },
          rect: { minX: x - PASSAGE_WIDTH / 2, maxX: x + PASSAGE_WIDTH / 2, minZ: Math.min(ea, eb), maxZ: Math.max(ea, eb) },
        })
      }
    }
  }
  return out
}

/** 그 지역에서 to로 가는 문 자리 (세계 좌표). 통로가 없으면 null */
export function exitTo(regions: Readonly<Record<string, PlacedRegion>>, from: string, to: string, list = passages(regions)): Spot | null {
  const p = list.find((q) => (q.from === from && q.to === to) || (q.from === to && q.to === from))
  if (!p) return null
  return p.from === from ? p.fromExit : p.toExit
}

/** 점이 네모 안인가 */
export function inRect(r: Rect, x: number, z: number, margin = 0): boolean {
  return x >= r.minX - margin && x <= r.maxX + margin && z >= r.minZ - margin && z <= r.maxZ + margin
}

/** 점에서 네모까지 거리 (안이면 0) */
export function rectDistance(r: Rect, x: number, z: number): number {
  const dx = Math.max(r.minX - x, 0, x - r.maxX)
  const dz = Math.max(r.minZ - z, 0, z - r.maxZ)
  return Math.hypot(dx, dz)
}

/** 네모들 가운데 가장 가까운 곳으로 점을 당긴다 (이미 안이면 그대로) */
export function clampToRects(rects: readonly Rect[], x: number, z: number, inset = 0): Spot {
  let best: Spot = { x, z }
  let bestD = Infinity
  for (const r of rects) {
    const cx = clamp(x, r.minX + inset, r.maxX - inset)
    const cz = clamp(z, r.minZ + inset, r.maxZ - inset)
    const d = Math.hypot(cx - x, cz - z)
    if (d === 0) return { x, z }
    if (d < bestD) {
      bestD = d
      best = { x: cx, z: cz }
    }
  }
  return best
}

function clamp(v: number, lo: number, hi: number): number {
  return lo > hi ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v))
}

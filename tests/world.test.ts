import { describe, expect, it } from 'vitest'

import { REGIONS } from '../src/data/regions'
import {
  adjacency,
  CELL,
  cellOrigin,
  cellRect,
  clampToRects,
  EXIT_INSET,
  exitTo,
  inRect,
  neighborCells,
  PASSAGE_WIDTH,
  type PlacedRegion,
  passages,
  type Rect,
  rectDistance,
  validCell,
  walkRect,
} from '../src/data/world'

/**
 * 하나로 이어진 세계 (E19-01). 지역 데이터 전부를 돈다: 지역을 더하면 같은 검사가 저절로 붙는다.
 */

const placed: Record<string, PlacedRegion> = Object.fromEntries(Object.values(REGIONS).map((r) => [r.id, { ...r, cell: r.cell! }]))
const list = passages(placed)
const overlaps = (a: Rect, b: Rect) => a.minX < b.maxX && b.minX < a.maxX && a.minZ < b.maxZ && b.minZ < a.maxZ

describe('벽돌 칸', () => {
  it('짝수 줄은 정수 칸, 홀수 줄은 반 칸만 자리다', () => {
    expect(validCell({ col: 2, row: 0 })).toBe(true)
    expect(validCell({ col: -1.5, row: 3 })).toBe(true)
    expect(validCell({ col: 0.5, row: 0 })).toBe(false)
    expect(validCell({ col: 1, row: -1 })).toBe(false)
  })

  it('한 칸의 이웃은 여섯이고 모두 벽돌 자리·이웃이다', () => {
    for (const cell of [{ col: 0, row: 0 }, { col: -0.5, row: 1 }]) {
      const near = neighborCells(cell)
      expect(near).toHaveLength(6)
      for (const n of near) {
        expect(validCell(n)).toBe(true)
        expect(adjacency(cell, n)).not.toBeNull()
      }
    }
    expect(adjacency({ col: 0, row: 0 }, { col: 1, row: 1 })).toBeNull()
    expect(adjacency({ col: 0, row: 0 }, { col: 2, row: 0 })).toBeNull()
  })

  it('북쪽(위 줄)은 −z, 동쪽은 +x', () => {
    expect(cellOrigin({ col: 0.5, row: 1 })).toEqual({ x: CELL / 2, z: -CELL })
    expect(cellOrigin({ col: -3, row: 0 })).toEqual({ x: -3 * CELL, z: -0 })
  })
})

describe('세계 배치 (E19-01)', () => {
  it('지역마다 칸이 있고, 움직일 수 있는 네모는 제 칸 안에서 숲 띠를 남긴다', () => {
    for (const r of Object.values(placed)) {
      const cell = cellRect(r.cell)
      const walk = walkRect(r.cell, r.halfExtent)
      expect(walk.minX - cell.minX).toBeGreaterThanOrEqual(4)
      expect(cell.maxZ - walk.maxZ).toBeGreaterThanOrEqual(4)
    }
  })

  it('출구로 이어진 이웃마다 통로가 하나씩 있다', () => {
    const pairs = new Set<string>()
    for (const r of Object.values(placed)) for (const e of r.exits) pairs.add([r.id, e.to].sort().join('|'))
    expect(list).toHaveLength(pairs.size)
    for (const p of list) expect(pairs.has([p.from, p.to].sort().join('|'))).toBe(true)
  })

  describe.each(list.map((p) => [`${p.from} ↔ ${p.to}`, p] as const))('통로 %s', (_name, p) => {
    const a = placed[p.from]!
    const b = placed[p.to]!
    const wa = walkRect(a.cell, a.halfExtent)
    const wb = walkRect(b.cell, b.halfExtent)

    it('두 땅의 네모 가장자리에 닿고, 폭이 정해진 만큼이다', () => {
      const side = adjacency(a.cell, b.cell) === 'side'
      const width = side ? p.rect.maxZ - p.rect.minZ : p.rect.maxX - p.rect.minX
      expect(width).toBeCloseTo(PASSAGE_WIDTH)
      expect(rectDistance(wa, (p.rect.minX + p.rect.maxX) / 2, (p.rect.minZ + p.rect.maxZ) / 2)).toBeLessThanOrEqual(CELL)
      // 통로의 두 끝이 두 네모의 가장자리에 붙는다 (틈도 겹침도 없음)
      const ends = side ? [p.rect.minX, p.rect.maxX] : [p.rect.minZ, p.rect.maxZ]
      const edges = side ? [wa.minX, wa.maxX, wb.minX, wb.maxX] : [wa.minZ, wa.maxZ, wb.minZ, wb.maxZ]
      for (const end of ends) expect(edges.some((e) => Math.abs(e - end) < 1e-6)).toBe(true)
    })

    it('통로 폭 전체가 두 네모와 맞닿는다 (모서리에 걸쳐 숲으로 새지 않는다)', () => {
      const side = adjacency(a.cell, b.cell) === 'side'
      for (const w of [wa, wb]) {
        if (side) {
          expect(p.rect.minZ).toBeGreaterThanOrEqual(w.minZ)
          expect(p.rect.maxZ).toBeLessThanOrEqual(w.maxZ)
        } else {
          expect(p.rect.minX).toBeGreaterThanOrEqual(w.minX)
          expect(p.rect.maxX).toBeLessThanOrEqual(w.maxX)
        }
      }
    })

    it('두 문은 통로를 사이에 두고 마주 보며, 각자 제 네모 안 가장자리에 선다', () => {
      expect(inRect(wa, p.fromExit.x, p.fromExit.z)).toBe(true)
      expect(inRect(wb, p.toExit.x, p.toExit.z)).toBe(true)
      const side = adjacency(a.cell, b.cell) === 'side'
      if (side) expect(p.fromExit.z).toBeCloseTo(p.toExit.z)
      else expect(p.fromExit.x).toBeCloseTo(p.toExit.x)
      expect(rectDistance(p.rect, p.fromExit.x, p.fromExit.z)).toBeCloseTo(EXIT_INSET)
      expect(rectDistance(p.rect, p.toExit.x, p.toExit.z)).toBeCloseTo(EXIT_INSET)
    })

    it('지역 데이터의 출구가 통로 입구에 있다', () => {
      for (const [self, other] of [[a, b], [b, a]] as const) {
        const exit = self.exits.find((e) => e.to === other.id)!
        const o = cellOrigin(self.cell)
        const at = exitTo(placed, self.id, other.id, list)!
        expect(exit.x + o.x).toBeCloseTo(at.x, 1)
        expect(exit.z + o.z).toBeCloseTo(at.z, 1)
      }
    })

    it('다른 땅의 네모나 다른 통로를 지나가지 않는다', () => {
      for (const r of Object.values(placed)) {
        if (r.id === a.id || r.id === b.id) continue
        expect(overlaps(p.rect, walkRect(r.cell, r.halfExtent))).toBe(false)
      }
      for (const q of list) if (q !== p) expect(overlaps(p.rect, q.rect)).toBe(false)
    })
  })

  it('땅의 네모끼리 겹치지 않는다', () => {
    const rects = Object.values(placed).map((r) => walkRect(r.cell, r.halfExtent))
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) expect(overlaps(rects[i]!, rects[j]!)).toBe(false)
  })
})

describe('갈 수 있는 곳으로 당기기', () => {
  const village = placed.village!
  const midgard = placed.midgard!
  const rects = [walkRect(village.cell, village.halfExtent), walkRect(midgard.cell, midgard.halfExtent), ...list.map((p) => p.rect)]

  it('땅과 통로 안의 점은 그대로 둔다', () => {
    const p = list.find((q) => q.from === 'midgard' && q.to === 'village')!
    const mid = { x: (p.rect.minX + p.rect.maxX) / 2, z: (p.rect.minZ + p.rect.maxZ) / 2 }
    expect(clampToRects(rects, mid.x, mid.z)).toEqual(mid)
    expect(clampToRects(rects, 3, -4)).toEqual({ x: 3, z: -4 })
  })

  it('숲 띠의 점은 가장 가까운 땅이나 통로 가장자리로 당긴다', () => {
    const at = clampToRects(rects, 0, -40)
    expect(at.z).toBeGreaterThan(-40)
    expect(rects.some((r) => inRect(r, at.x, at.z, 1e-6))).toBe(true)
  })
})

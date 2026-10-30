import { describe, expect, it } from 'vitest'

import { REGIONS } from '../src/data/regions'
import {
  adjacency,
  CELL,
  cellKey,
  CROSS_MARGIN,
  crossingAt,
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
  regionLinks,
  validCell,
  walkRect,
  walkRects,
} from '../src/data/world'
import { clampToArea, inArea, walkArea } from '../src/world/colliders'
import { NavGrid } from '../src/world/navGrid'
import * as THREE from 'three'

import { EFFECT_LAYER } from '../src/render/PixelRenderer'
import { PathLine } from '../src/world/moveMarker'
import { buildChunk, cellTheme, chunkSteps, RegionMap } from '../src/world/regionMap'
import { EDGE_BLEND, edgeWave, FLAT_LAND, heightAt, withTerrainFrame } from '../src/world/terrain'

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

describe('걸어서 넘어가기 (E19-02)', () => {
  const regions = Object.fromEntries(Object.values(REGIONS).map((r) => [r.id, r]))

  it('통로마다 양쪽에서 서로를 가리키고, 옮김은 반대다', () => {
    for (const r of Object.values(placed)) {
      for (const link of regionLinks(regions, r.id)) {
        const back = regionLinks(regions, link.to).find((l) => l.to === r.id)
        expect(back, `${r.id} → ${link.to}`).toBeDefined()
        expect(back!.shift.x).toBeCloseTo(-link.shift.x)
        expect(back!.shift.z).toBeCloseTo(-link.shift.z)
        expect(back!.dir).toBe(-link.dir)
      }
    }
  })

  it('통로는 제 땅의 네모와 이웃 땅의 네모에 겹쳐 끊김 없이 걸을 수 있다', () => {
    for (const r of Object.values(placed)) {
      const own = walkRects(r.halfExtent, [])[0]!
      for (const link of regionLinks(regions, r.id)) {
        const other = placed[link.to]!
        const there = { minX: -other.halfExtent - link.shift.x, maxX: other.halfExtent - link.shift.x, minZ: -other.halfExtent - link.shift.z, maxZ: other.halfExtent - link.shift.z }
        expect(overlaps(link.rect, own), `${r.id} → ${link.to}`).toBe(true)
        expect(overlaps(link.rect, there), `${r.id} → ${link.to}`).toBe(true)
      }
    }
  })

  it('통로 가운데를 조금 넘어야 이웃 땅이 되고, 넘어간 자리는 이웃 쪽에서 되돌아오는 자리가 아니다', () => {
    const link = regionLinks(regions, 'village').find((l) => l.to === 'midgard')!
    const across = link.axis === 'x' ? (a: number) => ({ x: a, z: (link.rect.minZ + link.rect.maxZ) / 2 }) : (a: number) => ({ x: (link.rect.minX + link.rect.maxX) / 2, z: a })
    const before = across(link.mid + link.dir * (CROSS_MARGIN - 0.2))
    const after = across(link.mid + link.dir * (CROSS_MARGIN + 0.2))
    expect(crossingAt(regionLinks(regions, 'village'), before.x, before.z)).toBeNull()
    expect(crossingAt(regionLinks(regions, 'village'), after.x, after.z)?.to).toBe('midgard')
    // 미드가르드 좌표로 옮기면 그 통로의 반대쪽에 있어 곧바로 되돌아가지 않는다
    const there = { x: after.x + link.shift.x, z: after.z + link.shift.z }
    expect(crossingAt(regionLinks(regions, 'midgard'), there.x, there.z)).toBeNull()
  })

  it('세계 칸이 없는 땅(끝없는 원정 층)은 통로가 없다', () => {
    expect(regionLinks({ ...regions, endless: { ...regions.village!, id: 'endless', cell: null } }, 'endless')).toEqual([])
  })
})

describe('땅 높이는 세계 좌표를 따른다 (E19-02)', () => {
  it('두 땅의 경계에서 어느 쪽 원점으로 재도 높이가 같다', () => {
    const village = placed.village!
    const midgard = placed.midgard!
    const ov = cellOrigin(village.cell)
    const om = cellOrigin(midgard.cell)
    const keep = heightAt(0, 0)
    for (const [wx, wz] of [[ov.x + 3, ov.z - 49], [om.x - 2, om.z + 50], [ov.x, ov.z - 50]] as const) {
      const fromVillage = withTerrainFrame(ov, REGIONS.village!, () => heightAt(wx - ov.x, wz - ov.z))
      const fromMidgard = withTerrainFrame(om, REGIONS.midgard!, () => heightAt(wx - om.x, wz - om.z))
      expect(fromVillage).toBeCloseTo(fromMidgard, 5)
    }
    // 잠깐 바꾼 틀은 끝나면 되돌아온다
    expect(heightAt(0, 0)).toBe(keep)
  })

  it('경계를 흔드는 물결도 어느 쪽 원점으로 재든 같다 (양쪽 칸이 같은 선을 경계로 삼는다)', () => {
    const ov = cellOrigin(placed.village!.cell)
    const om = cellOrigin(placed.midgard!.cell)
    for (const [wx, wz] of [[ov.x - 20, ov.z - 50], [ov.x + 7, ov.z - 47]] as const) {
      const a = withTerrainFrame(ov, FLAT_LAND, () => edgeWave(wx - ov.x, wz - ov.z))
      const b = withTerrainFrame(om, FLAT_LAND, () => edgeWave(wx - om.x, wz - om.z))
      expect(a).toBeCloseTo(b, 6)
      expect(Math.abs(a)).toBeLessThanOrEqual(EDGE_BLEND)
    }
  })
})

describe('칸의 땅 얼굴 (E19-03)', () => {
  it('지역이 있는 칸은 그 지역, 빈 칸은 가장 가까운 지역의 얼굴이다', () => {
    expect(cellTheme(REGIONS, placed.midgard!.cell)).toBe(REGIONS.midgard!.theme)
    const used = new Set(Object.values(placed).map((r) => cellKey(r.cell)))
    const empty = neighborCells(placed.village!.cell).concat(neighborCells(placed.midgard!.cell)).find((c) => !used.has(cellKey(c)))!
    expect(empty).toBeDefined()
    const o = cellOrigin(empty)
    const nearest = Math.min(...Object.values(placed).map((r) => Math.hypot(cellOrigin(r.cell).x - o.x, cellOrigin(r.cell).z - o.z)))
    const owners = Object.values(placed).filter((r) => Math.abs(Math.hypot(cellOrigin(r.cell).x - o.x, cellOrigin(r.cell).z - o.z) - nearest) < 1e-6)
    expect(owners.map((r) => REGIONS[r.id]!.theme)).toContain(cellTheme(REGIONS, empty))
  })
})

describe('통로가 있는 땅의 길찾기 (E19-02)', () => {
  const area = walkArea([
    { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
    { minX: -1.5, maxX: 1.5, minZ: -16, maxZ: -8 },
  ])

  it('땅과 통로 밖의 칸은 막히고, 통로 끝까지는 길이 있다', () => {
    const nav = new NavGrid(area, 0.5, [], 0.4)
    expect(nav.halfExtent).toBe(16)
    expect(nav.isBlocked({ x: 6, z: -14 })).toBe(true)
    expect(nav.isBlocked({ x: 0, z: -14 })).toBe(false)
    const path = nav.findPath({ x: 6, z: 6 }, { x: 0, z: -15 })
    expect(path.at(-1)).toEqual({ x: 0, z: -15 })
    for (const p of path) expect(inArea(area, p.x, p.z)).toBe(true)
  })

  it('격자에서 막힌 칸은 가운데가 땅·통로 밖인 칸과 같다', () => {
    const nav = new NavGrid(area, 0.5, [], 0.4)
    for (let cz = 0; cz < nav.size; cz++) {
      for (let cx = 0; cx < nav.size; cx++) {
        const c = nav.toWorld(cx, cz)
        expect(nav.isBlockedCell(cx, cz)).toBe(!inArea(area, c.x, c.z))
      }
    }
  })

  it('숲 띠의 점은 땅이나 통로 가장자리로 당긴다', () => {
    const at = clampToArea({ x: 6, z: -14 }, area)
    expect(inArea(area, at.x, at.z, -1e-6)).toBe(true)
  })
})

describe('이웃 땅의 성소 (E19-04)', () => {
  it('이웃 조각에는 성소 자리가 보이고, 지금 땅이 되면 숨는다 (전설이 그 자리에 그린다)', () => {
    const map = new RegionMap(REGIONS.midgard!, regionLinks(REGIONS, 'midgard'))
    expect(map.chunk.sanctuary?.visible).toBe(false)
    const next = buildChunk(REGIONS.jotunheim!, regionLinks(REGIONS, 'jotunheim'))
    expect(next.sanctuary?.visible).toBe(true)
    const previous = map.adopt(next)
    expect(next.sanctuary!.visible).toBe(false)
    expect(previous.sanctuary!.visible).toBe(true)
    // 마을처럼 성소가 없는 땅은 표시도 없다
    expect(buildChunk(REGIONS.village!, regionLinks(REGIONS, 'village')).sanctuary).toBeNull()
  })
})

describe('조각 짓기의 무게 (검수 고침)', () => {
  const instanced = (group: THREE.Object3D) => {
    const out: THREE.InstancedMesh[] = []
    group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) out.push(o)
    })
    return out
  }

  it('숲은 땅 네모만 한 묶음으로 그려, 묶음 하나에 여러 그루가 든다', () => {
    const chunk = buildChunk(REGIONS.midgard!, regionLinks(REGIONS, 'midgard'))
    const trees = instanced(chunk.group)
    const count = trees.reduce((sum, t) => sum + t.count, 0)
    expect(count).toBeGreaterThan(500)
    expect(trees.length).toBeLessThan(count / 3)
  })

  it('단계로 나눠 지어도 한 번에 지은 것과 같고, 땅·숲을 여러 단계로 쉰다', () => {
    const links = regionLinks(REGIONS, 'midgard')
    const whole = buildChunk(REGIONS.midgard!, links)
    const steps = chunkSteps(REGIONS.midgard!, links)
    let n = 0
    let step = steps.next()
    while (!step.done) {
      n++
      step = steps.next()
    }
    expect(n).toBeGreaterThan(15)
    const a = instanced(whole.group)
    const b = instanced(step.value.group)
    expect(b.map((t) => t.count)).toEqual(a.map((t) => t.count))
    expect(Array.from(b[0]!.instanceMatrix.array)).toEqual(Array.from(a[0]!.instanceMatrix.array))
    expect(step.value.colliders).toEqual(whole.colliders)
  })

  it('대장간 연기는 효과 층에 있어 법선 패스에 그려지지 않는다', () => {
    const chunk = buildChunk(REGIONS.village!, regionLinks(REGIONS, 'village'))
    const puffs: THREE.Mesh[] = []
    chunk.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.material instanceof THREE.MeshBasicMaterial && o.material.transparent && o.material.color.getHex() === 0xb8b4ac) puffs.push(o)
    })
    expect(puffs.length).toBeGreaterThan(0)
    for (const puff of puffs) expect(puff.layers.mask).toBe(1 << EFFECT_LAYER)
  })

  it('걷는 점선은 거리 버퍼를 새로 붙이지 않고 선 길이만 고쳐 쓴다', () => {
    const line = new PathLine()
    const distances = line.object.geometry.getAttribute('lineDistance')
    line.update(new THREE.Vector3(0, 0, 0), { x: 3, z: 4 })
    line.update(new THREE.Vector3(0, 0, 0), { x: 6, z: 8 })
    expect(line.object.geometry.getAttribute('lineDistance')).toBe(distances)
    const p = line.object.geometry.getAttribute('position')
    expect(distances.getX(1)).toBeCloseTo(Math.hypot(p.getX(1) - p.getX(0), p.getY(1) - p.getY(0), p.getZ(1) - p.getZ(0)), 5)
  })
})

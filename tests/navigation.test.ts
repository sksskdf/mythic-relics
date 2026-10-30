import { describe, expect, it } from 'vitest'

import { pushOut } from '../src/world/colliders'
import { NavGrid } from '../src/world/navGrid'

const wall = [-2, -1, 0, 1, 2].map((z) => ({ x: 0, z, radius: 0.6 }))

describe('pushOut', () => {
  it('충돌체에 겹친 점을 바깥으로 밀어낸다', () => {
    const p = pushOut({ x: 0.3, z: 0 }, 0.4, [{ x: 0, z: 0, radius: 1 }])
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(1.4)
  })

  it('겹치지 않으면 그대로 둔다', () => {
    expect(pushOut({ x: 5, z: 5 }, 0.4, [{ x: 0, z: 0, radius: 1 }])).toEqual({ x: 5, z: 5 })
  })
})

describe('NavGrid', () => {
  it('막힘이 없으면 목표로 바로 간다', () => {
    const nav = new NavGrid(10, 0.5, [], 0.4)
    expect(nav.findPath({ x: -5, z: 0 }, { x: 5, z: 0 })).toEqual([{ x: 5, z: 0 }])
  })

  it('벽을 돌아서 가는 경로를 찾는다', () => {
    const nav = new NavGrid(10, 0.5, wall, 0.4)
    const start = { x: -4, z: 0 }
    const path = nav.findPath(start, { x: 4, z: 0 })
    expect(path.length).toBeGreaterThan(1)
    expect(path.at(-1)).toEqual({ x: 4, z: 0 })
    // 경로의 모든 구간이 막힌 칸을 지나지 않는다.
    let prev = start
    for (const p of path) {
      expect(nav.hasLineOfSight(prev, p)).toBe(true)
      prev = p
    }
  })

  it('막힌 곳을 찍으면 가장 가까운 빈칸으로 간다', () => {
    const nav = new NavGrid(10, 0.5, wall, 0.4)
    const path = nav.findPath({ x: -4, z: 0 }, { x: 0, z: 0 })
    const end = path.at(-1)!
    expect(nav.isBlocked(end)).toBe(false)
    expect(Math.hypot(end.x, end.z)).toBeLessThan(2)
  })

  it('작업 배열을 되써도 길이 없던 찾기 뒤에 같은 길을 찾는다', () => {
    // 가운데를 가로막은 벽: 왼쪽 위 칸에서는 오른쪽으로 갈 수 없다
    const sealed = Array.from({ length: 41 }, (_, i) => ({ x: 0, z: -10 + i * 0.5, radius: 0.6 }))
    const nav = new NavGrid(10, 0.5, wall, 0.4)
    const first = nav.findPath({ x: -4, z: 0 }, { x: 4, z: 0 })
    const closed = new NavGrid(10, 0.5, sealed, 0.4)
    expect(closed.findPath({ x: -4, z: 0 }, { x: 4, z: 0 })).toEqual([])
    expect(closed.findPath({ x: -4, z: 0 }, { x: 4, z: 0 })).toEqual([])
    // 같은 격자로 거듭 찾아도, 다시 짜도 결과가 같다
    for (let i = 0; i < 3; i++) expect(nav.findPath({ x: -4, z: 0 }, { x: 4, z: 0 })).toEqual(first)
    nav.rebuild(10, wall)
    expect(nav.findPath({ x: -4, z: 0 }, { x: 4, z: 0 })).toEqual(first)
  })
})

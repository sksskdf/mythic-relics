import { describe, expect, it } from 'vitest'

import { KING } from '../src/enemies/Giant'
import { collidersFor } from '../src/world/regionMap'
import { NavGrid } from '../src/world/navGrid'
import { DOOM_BOSS, RIFT_HALF, riftFloor } from '../src/world/riftFloor'
import { RiftProgress } from '../src/progress/Rift'

describe('균열 층 생성 (E17-02)', () => {
  it('시드 100개 × 층: 시작점에서 무리·보스·다음 층 문·나가는 문까지 길이 막히지 않는다', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const depth = (seed % 12) + 1
      const { region, portal } = riftFloor(depth, seed)
      const nav = new NavGrid(RIFT_HALF, 0.5, region.props.flatMap(collidersFor), 0.4)
      expect(nav.isBlocked(region.spawn), `시드 ${seed} 시작점`).toBe(false)
      const goals = [portal, ...region.camps, ...region.exits, ...(region.boss ? [region.boss] : [])]
      for (const goal of goals) {
        const path = nav.findPath(region.spawn, goal)
        expect(path.length, `시드 ${seed} 층 ${depth}: (${goal.x}, ${goal.z})까지 길이 없다`).toBeGreaterThan(0)
        const end = path[path.length - 1]!
        expect(Math.hypot(end.x - goal.x, end.z - goal.z), `시드 ${seed}: 가까이 가지 못한다`).toBeLessThan(3)
      }
      if (region.boss) expect(new NavGrid(RIFT_HALF, 0.5, region.props.flatMap(collidersFor), KING.radius).nearestFree(region.boss), `시드 ${seed} 보스 자리`).not.toBeNull()
    }
  })

  it('같은 시드·층이면 같은 땅, 층이 다르면 다른 땅', () => {
    expect(riftFloor(3, 7)).toEqual(riftFloor(3, 7))
    expect(riftFloor(4, 7).region.props).not.toEqual(riftFloor(3, 7).region.props)
  })

  it('5층마다 보스, 10층마다 종말 보스가 문을 지키고, 깊을수록 무리가 크고 정예가 많다', () => {
    expect(riftFloor(4, 1).boss).toBe(false)
    expect(riftFloor(5, 1).boss).toBe(true)
    expect(riftFloor(5, 1).region.boss).not.toBeNull()
    expect(riftFloor(10, 1).doom).toBe(true)
    expect(riftFloor(10, 1).region.boss?.enemy).toBe(DOOM_BOSS)
    const shallow = riftFloor(1, 3).region
    const deep = riftFloor(12, 3).region
    expect(deep.camps.reduce((s, c) => s + c.count, 0)).toBeGreaterThan(shallow.camps.reduce((s, c) => s + c.count, 0))
    expect(deep.elite).toBeGreaterThan(shallow.elite)
    // 나가는 문은 마을로
    expect(shallow.exits.map((e) => e.to)).toEqual(['village'])
  })
})

describe('균열 기록 (E17-04, 성좌판은 E305-03에서 걷음)', () => {
  it('더 깊이 닿을 때만 기록을 올린다', () => {
    const r = new RiftProgress()
    expect(r.reach(4)).toBe(true)
    expect(r.reach(11)).toBe(true)
    expect(r.reach(9)).toBe(false)
    expect(r.best).toBe(11)
    expect(r.toData()).toEqual({ best: 11 })
  })
})

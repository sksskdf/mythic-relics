import { describe, expect, it } from 'vitest'

import { KING } from '../src/enemies/Giant'
import { collidersFor } from '../src/world/regionMap'
import { NavGrid } from '../src/world/navGrid'
import { DOOM_BOSS, RIFT_HALF, riftFloor } from '../src/world/riftFloor'
import { computeBuild } from '../src/build/BuildState'
import { BLESSINGS, rollBlessings, STAR_EVERY, STARS } from '../src/data/rift'
import { RiftProgress } from '../src/progress/Rift'
import { godDef, GODS } from '../src/relics/data'

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

describe('성좌판 (E17-05)', () => {
  it('신화마다 별 하나, 이웃은 서로 이웃이고 같은 신화권 별은 한 줄로 이어진다', () => {
    expect(Object.keys(STARS).sort()).toEqual(Object.keys(GODS).sort())
    for (const star of Object.values(STARS)) {
      expect(star.neighbors.length, star.god).toBeGreaterThanOrEqual(2)
      for (const n of star.neighbors) expect(STARS[n]!.neighbors, `${star.god} ↔ ${n}`).toContain(star.god)
    }
    // 같은 신화권 별끼리는 이웃을 따라 모두 닿는다
    for (const realm of ['norse', 'greek', 'china', 'japan', 'korea']) {
      const gods = Object.values(GODS).filter((g) => g.realm === realm).map((g) => g.id)
      const seen = new Set([gods[0]!])
      const queue = [gods[0]!]
      while (queue.length) for (const n of STARS[queue.shift()!]!.neighbors) if (gods.includes(n) && !seen.has(n)) seen.add(n) && queue.push(n)
      expect(seen.size, realm).toBe(gods.length)
    }
  })

  it('첫 별은 열린 신화만, 그 뒤로는 밝힌 별의 이웃만 밝힐 수 있다. 별이 없으면 못 밝힌다', () => {
    const r = new RiftProgress()
    const open = (g: string) => g === 'thor'
    expect(r.canLight('thor', open)).toBe(false)
    r.stars = 2
    expect(r.canLight('zeus', open)).toBe(false)
    expect(r.light('thor', open)).toBe(true)
    const far = Object.keys(STARS).find((g) => g !== 'thor' && !STARS.thor!.neighbors.includes(g))!
    expect(r.canLight(far, open)).toBe(false)
    expect(r.light(STARS.thor!.neighbors[0]!, open)).toBe(true)
    expect(r.stars).toBe(0)
    expect(r.canLight(STARS.thor!.neighbors[1]!, open)).toBe(false)
  })

  it('처음 닿은 5층마다 별 하나 (다시 닿아도 더 주지 않는다)', () => {
    const r = new RiftProgress()
    expect(r.reach(4, STAR_EVERY)).toBe(0)
    expect(r.reach(11, STAR_EVERY)).toBe(2)
    expect(r.reach(9, STAR_EVERY)).toBe(0)
    expect(r.reach(15, STAR_EVERY)).toBe(1)
    expect(r).toMatchObject({ best: 15, stars: 3 })
  })

  it('밝힌 별만 그 신화의 수치를 내고, 축복은 수치와 각성 단계를 더한다', () => {
    const base = { open: new Map([['thor', 2], ['odin', 4]]), chosen: [], gear: [], promotions: 0 }
    const plain = computeBuild(base)
    const starred = computeBuild({ ...base, starred: new Set(['thor', 'odin']) })
    const odin = godDef('odin').always.stat
    const thor = godDef('thor').always.stat
    // 별이 없으면 신화 수치는 0, 별을 밝히면 개방 단계 + 1 (오딘 4단계 → 5단계 ×1.5, 토르 2단계 → 3단계)
    expect(plain.stats[odin.kind]).toBe(0)
    expect(starred.stats[odin.kind] - (odin.kind === thor.kind ? thor.value[0] : 0)).toBeCloseTo(odin.value[1] * 1.5)
    expect(starred.stats[thor.kind] - (odin.kind === thor.kind ? odin.value[1] * 1.5 : 0)).toBeCloseTo(thor.value[0])
    const blessed = computeBuild({ ...base, bonus: { blessings: { damage: 0.12 } }, awakenBonus: { stone: 2 } })
    expect(blessed.stats.damage).toBeCloseTo(plain.stats.damage + 0.12)
    expect(blessed.awakening.stone).toBe(2)
    expect(BLESSINGS.length).toBe(20)
    expect(new Set(rollBlessings(() => 0.5).map((b) => b.id)).size).toBe(3)
  })
})

import { describe, expect, it } from 'vitest'

import { KING } from '../src/enemies/Giant'
import { collidersFor } from '../src/world/regionMap'
import { NavGrid } from '../src/world/navGrid'
import { DOOM_BOSS, ENDLESS_HALF, endlessFloor } from '../src/world/endlessFloor'
import { EndlessProgress } from '../src/progress/Endless'
import { AFTER_ENDING, Ending, endingLines } from '../src/progress/Ending'

describe('끝없는 원정의 층 생성 (E17-02 균열 → E305-03)', () => {
  it('시드 100개 × 층: 시작점에서 무리·보스·다음 층 문·나가는 문까지 길이 막히지 않는다', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const depth = (seed % 12) + 1
      const { region, portal } = endlessFloor(depth, seed)
      const nav = new NavGrid(ENDLESS_HALF, 0.5, region.props.flatMap(collidersFor), 0.4)
      expect(nav.isBlocked(region.spawn), `시드 ${seed} 시작점`).toBe(false)
      const goals = [portal, ...region.camps, ...region.exits, ...(region.boss ? [region.boss] : [])]
      for (const goal of goals) {
        const path = nav.findPath(region.spawn, goal)
        expect(path.length, `시드 ${seed} 층 ${depth}: (${goal.x}, ${goal.z})까지 길이 없다`).toBeGreaterThan(0)
        const end = path[path.length - 1]!
        expect(Math.hypot(end.x - goal.x, end.z - goal.z), `시드 ${seed}: 가까이 가지 못한다`).toBeLessThan(3)
      }
      if (region.boss) expect(new NavGrid(ENDLESS_HALF, 0.5, region.props.flatMap(collidersFor), KING.radius).nearestFree(region.boss), `시드 ${seed} 보스 자리`).not.toBeNull()
    }
  })

  it('같은 시드·층이면 같은 땅, 층이 다르면 다른 땅', () => {
    expect(endlessFloor(3, 7)).toEqual(endlessFloor(3, 7))
    expect(endlessFloor(4, 7).region.props).not.toEqual(endlessFloor(3, 7).region.props)
  })

  it('5층마다 보스, 10층마다 종말 보스가 문을 지키고, 깊을수록 무리가 크고 정예가 많다', () => {
    expect(endlessFloor(4, 1).boss).toBe(false)
    expect(endlessFloor(5, 1).boss).toBe(true)
    expect(endlessFloor(5, 1).region.boss).not.toBeNull()
    expect(endlessFloor(10, 1).doom).toBe(true)
    expect(endlessFloor(10, 1).region.boss?.enemy).toBe(DOOM_BOSS)
    const shallow = endlessFloor(1, 3).region
    const deep = endlessFloor(12, 3).region
    expect(deep.camps.reduce((s, c) => s + c.count, 0)).toBeGreaterThan(shallow.camps.reduce((s, c) => s + c.count, 0))
    expect(deep.elite).toBeGreaterThan(shallow.elite)
    // 나가는 문은 마을로
    expect(shallow.exits.map((e) => e.to)).toEqual(['village'])
  })
})

describe('끝없는 원정 기록 (E17-04, 성좌판은 E305-03에서 걷음)', () => {
  it('더 깊이 닿을 때만 기록을 올린다', () => {
    const r = new EndlessProgress()
    expect(r.reach(4)).toBe(true)
    expect(r.reach(11)).toBe(true)
    expect(r.reach(9)).toBe(false)
    expect(r.best).toBe(11)
    expect(r.toData()).toEqual({ best: 11 })
  })
})

describe('엔딩 문 (E305-03, CYCLE.md 7장)', () => {
  it('엔딩 뒤에 여는 것은 일곱이고, 첫 엔딩 큰 카드가 일곱을 모두 적는다', () => {
    expect(Object.keys(AFTER_ENDING).sort()).toEqual(['autoPickup', 'depth', 'endless', 'mythStage4', 'oaths', 'realms', 'relicStages'])
    const card = endingLines().join('\n')
    for (const text of Object.values(AFTER_ENDING)) expect(card).toContain(text)
  })

  it('엔딩을 보기 전에는 모두 닫혀 있고, 보면 모두 열린다', () => {
    const ending = new Ending()
    const keys = Object.keys(AFTER_ENDING) as (keyof typeof AFTER_ENDING)[]
    expect(keys.some((k) => ending.has(k))).toBe(false)
    ending.reached = true
    expect(keys.every((k) => ending.has(k))).toBe(true)
  })
})

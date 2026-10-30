import { describe, expect, it } from 'vitest'

import { DEPTH_LIMIT, DEPTH_LIMITLESS, depthElite, depthGrades, depthScale } from '../src/data/depth'
import { GRADES } from '../src/data/gearData'
import { GEAR } from '../src/gear/roll'
import { DepthProgress, parseDepth } from '../src/progress/Depth'
import { oldThreat } from '../src/save/migrate/legacy'

describe('깊이 (E305-03, 옛 위협 단계 E14-03)', () => {
  it('깊을수록 적이 세지고 정예가 늘며, 좋은 등급이 잘 나온다 (확률 합은 1)', () => {
    let last = depthScale(1)
    expect(last).toEqual({ hp: 1, damage: 1 })
    let rare = 0
    for (let n = 2; n <= DEPTH_LIMIT; n++) {
      const s = depthScale(n)
      expect(s.hp).toBeGreaterThan(last.hp)
      expect(s.damage).toBeGreaterThan(last.damage)
      last = s
      const chances = depthGrades(Object.fromEntries(GRADES.map((g) => [g, GEAR.grades[g].chance])) as never, n)
      expect(Object.values(chances).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
      expect(chances.rare).toBeGreaterThanOrEqual(rare)
      expect(chances.common).toBeGreaterThanOrEqual(0)
      rare = chances.rare
      expect(depthElite(0.2, n)).toBeGreaterThan(depthElite(0.2, n - 1))
    }
    // 깊이 10에서도 폭은 작게: 생명력 ×6 안, 피해 ×2.5 안
    expect(depthScale(DEPTH_LIMIT).hp).toBeLessThan(6)
    expect(depthScale(DEPTH_LIMIT).damage).toBeLessThan(2.5)
  })

  it('다음 원정은 가 본 곳보다 한 걸음까지만 깊이 고른다 (귀환 카드의 「그대로 / +1」)', () => {
    const d = new DepthProgress()
    expect(d.deepest).toBe(2)
    expect(d.choose(3)).toBe(false)
    expect(d.choose(2)).toBe(true)
    expect(d).toMatchObject({ level: 2, reached: 2 })
    expect(d.deepest).toBe(3)
    expect(d.choose(0)).toBe(false)
    expect(d.choose(2.5)).toBe(false)
  })

  it('한계를 깨기 전에는 깊이 10이 끝이고, 깨면 끝이 사라진다', () => {
    const d = new DepthProgress()
    for (let n = 2; n <= DEPTH_LIMIT; n++) expect(d.choose(n)).toBe(true)
    expect(d.choose(DEPTH_LIMIT + 1)).toBe(false)
    expect(d.deepest).toBe(DEPTH_LIMIT)
    d.limitBroken = true
    expect(d.max).toBe(DEPTH_LIMITLESS)
    expect(d.choose(DEPTH_LIMIT + 1)).toBe(true)
  })

  it('저장 왕복: 지금 깊이·가 본 곳·한계를 깸만 남는다', () => {
    const d = new DepthProgress()
    d.choose(2)
    d.choose(3)
    const back = new DepthProgress()
    back.load(parseDepth(JSON.parse(JSON.stringify(d.toData()))))
    expect(back.toData()).toEqual({ level: 3, reached: 3, limitBroken: false })
  })

  it('옛 위협 단계 모양을 읽으면 열린 단계·신화권마다 이긴 단계·원천 숙련은 버린다 (옛 사슬은 oldThreat가 읽는다)', () => {
    const raw = { level: 2, unlocked: 3, reached: 2, cleared: { norse: 3 }, mastery: { flame: 3 }, battle: 500 }
    expect(parseDepth(raw)).toEqual({ level: 2, reached: 2, limitBroken: false })
    expect(oldThreat(raw)).toEqual({ unlocked: 3, cleared: { norse: 3 } })
    // 내려가 있던 옛 단계도 그대로 (가 본 곳까지)
    expect(parseDepth({ level: 9, reached: 5 })).toEqual({ level: 5, reached: 5, limitBroken: false })
    expect(parseDepth({ level: 40, reached: 40, limitBroken: true })).toEqual({ level: 40, reached: 40, limitBroken: true })
    expect(parseDepth(undefined)).toEqual({ level: 1, reached: 1, limitBroken: false })
  })
})

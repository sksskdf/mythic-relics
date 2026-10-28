import { describe, expect, it } from 'vitest'

import { checkTraining, INSIGHT_COST, insightProgress, insightsAt, TRAINING_NODES } from '../src/data/training'
import { TrainingProgress } from '../src/progress/Training'

describe('수련 데이터 (E236-02)', () => {
  it('마디가 겹치지 않고, 앞 마디가 더 얕고, 큰 마디는 갈래 끝에만 있다', () => {
    expect(checkTraining()).toEqual([])
    expect(TRAINING_NODES.filter((n) => n.big).map((n) => n.branch).sort()).toEqual(['body', 'hand', 'might'])
  })

  it('틀린 데이터는 무엇이 틀렸는지 알린다', () => {
    const broken = [...TRAINING_NODES, { ...TRAINING_NODES[1]!, id: 'loose', row: 9, col: 9, after: ['nowhere'] }]
    expect(checkTraining(broken).join()).toMatch(/앞 마디 nowhere/)
    expect(checkTraining([...TRAINING_NODES, { ...TRAINING_NODES[1]! }]).join()).toMatch(/겹칩니다/)
  })
})

describe('깨달음 (E236-02)', () => {
  it('문턱은 점마다 조금씩 멀어진다: 60, 145, 255, 390, 550 …', () => {
    expect(insightsAt(0)).toBe(0)
    expect(insightsAt(59)).toBe(0)
    expect(insightsAt(60)).toBe(1)
    expect(insightsAt(144)).toBe(1)
    expect(insightsAt(145)).toBe(2)
    expect(insightsAt(550)).toBe(5)
    expect(insightProgress(100)).toEqual({ have: 40, need: INSIGHT_COST.first + INSIGHT_COST.step })
  })

  it('첫 신화를 여는 경험치(600)에 다섯, 엔딩 무렵(6000)에 스물쯤', () => {
    expect(insightsAt(600)).toBe(5)
    expect(insightsAt(6000)).toBeGreaterThanOrEqual(19)
    expect(insightsAt(6000)).toBeLessThan(TRAINING_NODES.length)
  })
})

describe('수련 진행 (E236-02)', () => {
  it('경험치를 모으면 깨달음이 생기고, 새로 얻은 수를 알린다', () => {
    const t = new TrainingProgress()
    expect(t.gain(50)).toBe(0)
    expect(t.gain(100)).toBe(2)
    expect(t.unspent).toBe(2)
    expect(t.gain(-5)).toBe(0)
  })

  it('뿌리부터, 앞 마디를 익혀야 익힌다. 가지는 둘 중 하나만 익혀도 다음으로 간다', () => {
    const t = new TrainingProgress()
    t.gain(10000)
    expect(t.take('edge')).toBe(false)
    expect(t.take('awaken')).toBe(true)
    expect(t.take('awaken')).toBe(false)
    for (const id of ['edge', 'fury', 'cleave']) expect(t.take(id)).toBe(true)
    expect(t.take('boil')).toBe(false)
    expect(t.take('pack')).toBe(true)
    expect(t.take('boil')).toBe(true)
  })

  it('깨달음이 모자라면 익히지 못하고, 되돌리면 모두 돌아온다 (무료)', () => {
    const t = new TrainingProgress()
    t.gain(145)
    expect(t.take('awaken')).toBe(true)
    expect(t.take('quick')).toBe(true)
    expect(t.take('stride')).toBe(false)
    expect(t.reset()).toBe(2)
    expect(t.unspent).toBe(2)
    expect(t.taken.size).toBe(0)
  })

  it('익힌 마디의 수치는 같은 종류끼리 더한다', () => {
    const t = new TrainingProgress()
    t.gain(10000)
    for (const id of ['awaken', 'edge', 'fury', 'quick']) t.take(id)
    const stats = t.stats()
    expect(stats.damage).toBeCloseTo(0.05 + 0.08)
    expect(stats.basicDamage).toBeCloseTo(0.12)
    expect(stats.maxHp).toBe(10)
    expect(stats.attackSpeed).toBeCloseTo(0.06)
  })

  it('불러올 때 익힐 수 없는 마디(앞 마디가 빠짐, 깨달음보다 많음)는 버린다', () => {
    const t = new TrainingProgress()
    t.load({ xp: 145, taken: ['awaken', 'fury', 'quick', 'stride'] })
    expect([...t.taken]).toEqual(['awaken', 'quick'])
    expect(t.toData()).toEqual({ xp: 145, taken: ['awaken', 'quick'] })
  })
})

import { describe, expect, it } from 'vitest'

import { Cycle, parseCycle, REBIRTH_NEED, UNLOCKS } from '../src/progress/Cycle'

const open = (c: Cycle): Cycle => {
  c.opened.add('train')
  c.opened.add('rebirth')
  return c
}

describe('순환 성장', () => {
  it('결정이 들어오고 단련하면 비용이 오르고 능력치가 붙는다', () => {
    const c = open(new Cycle())
    c.gain('flame', 100)
    expect(c.essence.flame).toBe(100)
    const first = c.cost('flame')
    expect(c.train('flame')).toBe(1)
    expect(c.cost('flame')).toBeGreaterThan(first)
    expect(c.damageScale).toBeCloseTo(1.05)
  })

  it('고리의 앞 원천 단련이 뒤 원천 결정을 늘린다 (바람 → 불꽃)', () => {
    const c = open(new Cycle())
    c.training.wind = 5
    expect(c.gainScale('flame')).toBeCloseTo(1.2)
    expect(c.gainScale('hunt')).toBe(1)
  })

  it('숙련과 승급이 결정 배율과 단련 할인이 된다', () => {
    const c = open(new Cycle())
    const before = c.cost('stone')
    c.mastery = (s) => (s === 'stone' ? 2 : 0)
    c.promotions = () => 3
    expect(c.gainScale('stone')).toBeCloseTo(1.5)
    expect(c.cost('stone')).toBeLessThan(before)
  })

  it('윤회하면 단련과 결정을 버리고 재를 얻으며, 다음 판은 더 빨리 모인다', () => {
    const c = open(new Cycle())
    expect(c.rebirth()).toBe(0)
    c.gain('hunt', REBIRTH_NEED * 4)
    c.train('hunt')
    const ash = c.rebirth()
    expect(ash).toBe(6)
    expect(c.training.hunt).toBe(0)
    expect(c.essence.hunt).toBe(0)
    expect(c.gainScale('hunt')).toBeCloseTo(1.1)
    expect(c.lightStar('gain')).toBe(true)
    expect(c.gainScale('hunt')).toBeCloseTo(1.1 * 1.2)
  })

  it('단련은 첫 발현, 윤회는 첫 승급 전에는 잠겨 있다', () => {
    const c = new Cycle()
    c.gain('flame', 10_000)
    expect(c.train('flame')).toBe(0)
    expect(c.ashForRebirth()).toBe(0)
    c.opened.add('train')
    expect(c.train('flame', 10)).toBe(10)
    expect(c.quote('flame', Infinity).levels).toBeGreaterThan(0)
  })

  it('장치는 윤회 횟수에 따라 차례로 열린다', () => {
    const c = open(new Cycle())
    c.essence.flame = 1000
    expect(c.autoTrain()).toBeNull()
    c.rebirths = UNLOCKS.autoTrain
    expect(c.autoTrain()).toBe('flame')
    expect(c.doomReady).toBe(c.rebirths >= UNLOCKS.doom)
  })

  it('도전을 건 원천은 결정이 들어오지 않고, 끝내면 영구 +25%', () => {
    const c = open(new Cycle())
    c.rebirths = UNLOCKS.challenge
    c.gain('wind', REBIRTH_NEED)
    c.rebirth('wind')
    expect(c.challenge).toBe('wind')
    expect(c.gainScale('wind')).toBe(0)
    c.gain('flame', REBIRTH_NEED)
    c.rebirth()
    expect(c.cleared.has('wind')).toBe(true)
    expect(c.gainScale('wind')).toBeGreaterThan(c.gainScale('stone'))
  })

  it('태초의 법: 흐르는 원천은 고리의 다음 원천으로 10%가 함께 들어온다', () => {
    const c = open(new Cycle())
    c.conquer()
    expect(c.chooseLaw('flow')).toBe(true)
    expect(c.lawPending).toBe(false)
    c.gain('wind', 100)
    expect(c.essence.flame).toBeCloseTo(10)
  })

  it('저장 형식을 검사하고, 틀린 값은 버린다', () => {
    const c = open(new Cycle())
    c.gain('stone', 50)
    c.conquer()
    c.chooseLaw('keep')
    const back = parseCycle(JSON.parse(JSON.stringify(c.toData())))
    expect(back).toEqual(c.toData())
    const odd = parseCycle({ training: { flame: -3, wind: 'x' }, laws: ['keep', 'nope'], challenge: 'sun' })
    expect(odd.training).toEqual({ flame: 0, hunt: 0, wind: 0, stone: 0 })
    expect(odd.laws).toEqual(['keep'])
    expect(odd.challenge).toBeNull()
  })
})

describe('큰 수 표기', async () => {
  const { shortNumber } = await import('../src/ui/format')
  it('만·억으로 줄인다', () => {
    expect(shortNumber(999.7)).toBe('999')
    expect(shortNumber(12_340)).toBe('1.2만')
    expect(shortNumber(30_000)).toBe('3만')
    expect(shortNumber(3_400_000)).toBe('340만')
    expect(shortNumber(120_000_000)).toBe('1.2억')
  })
})

describe('순환 성장 곡선 (간이 모의)', () => {
  /** 1초마다 때림 3·처치 0.5·걸음 2·맞음 1만큼 들어온다고 보고, 결정 500을 모을 때까지 걸리는 시간 */
  function timeToRebirth(c: Cycle): number {
    let t = 0
    while (c.runTotal < REBIRTH_NEED && t < 100_000) {
      const speed = c.damageScale * c.moveSpeedScale
      c.gain('flame', 3 * speed)
      c.gain('hunt', 2 * speed)
      c.gain('wind', 2 * c.moveSpeedScale)
      c.gain('stone', 1)
      for (const s of ['flame', 'hunt', 'wind', 'stone'] as const) c.train(s)
      t += 1
    }
    return t
  }

  it('윤회를 거듭할수록 같은 지점까지 더 빨리 닿는다', () => {
    const c = open(new Cycle())
    const times: number[] = []
    for (let i = 0; i < 4; i++) {
      times.push(timeToRebirth(c))
      c.rebirth()
      c.lightStar('gain')
    }
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeLessThan(times[i - 1]!)
  })
})

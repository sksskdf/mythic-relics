import { describe, expect, it } from 'vitest'

import { angleDiff, inArc, inRing } from '../src/combat/arc'
import { BASIC_COMBO, ComboState } from '../src/combat/combo'
import { Health } from '../src/combat/Health'

describe('inArc', () => {
  it('정면에 있으면 맞는다', () => {
    expect(inArc(0, 0, 0, 2, Math.PI / 4, 0, 1.5, 0.5)).toBe(true)
  })
  it('등 뒤에 있으면 맞지 않는다', () => {
    expect(inArc(0, 0, 0, 2, Math.PI / 4, 0, -1.5, 0.5)).toBe(false)
  })
  it('범위 밖이면 맞지 않는다', () => {
    expect(inArc(0, 0, 0, 2, Math.PI / 4, 0, 3, 0.5)).toBe(false)
  })
  it('몸통 일부만 걸쳐도 맞는다', () => {
    // 각도로는 범위 밖이지만 반지름 때문에 걸친다.
    expect(inArc(0, 0, 0, 2, Math.PI / 6, 1.0, 1.0, 0.6)).toBe(true)
  })
  it('각도 차이는 -π~π로 계산한다', () => {
    expect(angleDiff(Math.PI * 1.9, 0)).toBeCloseTo(-Math.PI * 0.1)
  })
})

describe('inRing', () => {
  it('충격파 고리의 띠 위에 있을 때만 맞는다', () => {
    expect(inRing(0, 0, 5, 1, 5, 0, 0.3)).toBe(true)
    expect(inRing(0, 0, 5, 1, 2, 0, 0.3)).toBe(false)
  })
})

describe('Health', () => {
  it('피해를 받으면 줄고 0에서 멈춘다', () => {
    const h = new Health(30)
    expect(h.damage(10)).toBe(10)
    expect(h.damage(50)).toBe(20)
    expect(h.dead).toBe(true)
    expect(h.damage(5)).toBe(0)
  })

  it('최대 생명이 바뀌면 비율을 지킨다: 장비를 뺐다 끼어도 차오르지 않고, 쓰러진 채면 그대로다', () => {
    const h = new Health(200)
    h.damage(50)
    h.setMax(184)
    h.setMax(200)
    expect(h.hp).toBeCloseTo(150)
    const dead = new Health(100)
    dead.damage(100)
    dead.setMax(200)
    expect(dead.dead).toBe(true)
  })
})

describe('ComboState', () => {
  const step = (combo: ComboState, seconds: number, wants: boolean) => {
    const events = []
    for (let t = 0; t < seconds; t += 0.01) events.push(...combo.update(0.01, wants))
    return events
  }

  it('계속 누르고 있으면 1→2→3타로 이어진다', () => {
    const combo = new ComboState()
    const events = step(combo, 1.5, true)
    const starts = events.filter((e) => e.type === 'start').map((e) => (e as { index: number }).index)
    expect(starts.slice(0, 4)).toEqual([0, 1, 2, 0])
    expect(events.filter((e) => e.type === 'hit').length).toBeGreaterThanOrEqual(3)
  })

  it('한 번만 누르면 한 번만 휘두르고 끝난다', () => {
    const combo = new ComboState()
    combo.update(0.01, true)
    const events = step(combo, 1, false)
    expect(events.filter((e) => e.type === 'start').length).toBe(0)
    expect(events.filter((e) => e.type === 'hit').length).toBe(1)
    expect(combo.swinging).toBe(false)
  })

  it('유예 시간 안에 다시 누르면 다음 타로 이어진다', () => {
    const combo = new ComboState()
    combo.update(0.01, true)
    step(combo, BASIC_COMBO[0]!.duration + 0.05, false)
    const events = combo.update(0.01, true)
    expect(events).toContainEqual({ type: 'start', index: 1 })
  })

  it('유예 시간이 지나면 처음부터 시작한다', () => {
    const combo = new ComboState()
    combo.update(0.01, true)
    step(combo, 1.5, false)
    const events = combo.update(0.01, true)
    expect(events).toContainEqual({ type: 'start', index: 0 })
  })
})

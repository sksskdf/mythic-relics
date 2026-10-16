import { describe, expect, it } from 'vitest'

import { MAX_FRAME_DELTA, frameDelta } from '../src/game/clock'

describe('frameDelta', () => {
  it('밀리초 차이를 초로 바꾼다', () => {
    expect(frameDelta(1000, 1016)).toBeCloseTo(0.016)
  })

  it('긴 멈춤 뒤에도 최대값을 넘지 않는다', () => {
    expect(frameDelta(0, 5000)).toBe(MAX_FRAME_DELTA)
  })

  it('시간이 거꾸로 가거나 잘못된 값이면 0을 돌려준다', () => {
    expect(frameDelta(2000, 1000)).toBe(0)
    expect(frameDelta(Number.NaN, 1000)).toBe(0)
  })
})

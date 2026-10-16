import { describe, expect, it } from 'vitest'

import { generateLayout } from '../src/world/layout'

const options = { seed: 7, halfExtent: 34, clearRadius: 5, count: 90 }

describe('generateLayout', () => {
  it('같은 시드면 같은 배치가 나온다', () => {
    expect(generateLayout(options)).toEqual(generateLayout(options))
  })

  it('시작 지점 주변은 비워 둔다', () => {
    for (const p of generateLayout(options)) {
      expect(Math.hypot(p.x, p.z)).toBeGreaterThanOrEqual(options.clearRadius)
    }
  })

  it('맵 범위를 벗어나지 않는다', () => {
    for (const p of generateLayout(options)) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(options.halfExtent)
      expect(Math.abs(p.z)).toBeLessThanOrEqual(options.halfExtent)
    }
  })
})

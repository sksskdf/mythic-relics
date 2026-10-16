import { describe, expect, it } from 'vitest'

import { computeRenderSize } from '../src/render/resolution'

describe('computeRenderSize', () => {
  it('1920×1080 화면은 480×270을 4배로 확대한다', () => {
    expect(computeRenderSize(1920, 1080)).toEqual({ width: 480, height: 270, scale: 4 })
  })

  it('확대 배율은 항상 정수이고, 렌더 크기에 배율을 곱하면 화면을 덮는다', () => {
    for (const [w, h] of [[1280, 720], [1366, 768], [2560, 1440], [800, 600], [390, 844]] as const) {
      const size = computeRenderSize(w, h)
      expect(Number.isInteger(size.scale)).toBe(true)
      expect(size.width * size.scale).toBeGreaterThanOrEqual(w)
      expect(size.height * size.scale).toBeGreaterThanOrEqual(h)
    }
  })

  it('아주 작은 화면에서도 배율이 1 아래로 내려가지 않는다', () => {
    expect(computeRenderSize(100, 50).scale).toBe(1)
    expect(computeRenderSize(0, 0)).toEqual({ width: 1, height: 1, scale: 1 })
  })
})

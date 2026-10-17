import { describe, expect, it } from 'vitest'

import { computeRenderSize, METERS_PER_PIXEL } from '../src/render/resolution'

describe('computeRenderSize', () => {
  it('세로 픽셀 수는 정한 대로 두고, 화면 세로에 꼭 맞게 키운다', () => {
    expect(computeRenderSize(1920, 1080, 270)).toEqual({ width: 480, height: 270, scale: 4 })
    const size = computeRenderSize(1280, 720, 255)
    expect(size.height).toBe(255)
    expect(size.height * size.scale).toBeCloseTo(720)
  })

  it('렌더 크기에 배율을 곱하면 화면을 덮는다', () => {
    for (const [w, h] of [[1280, 720], [1366, 768], [2560, 1440], [800, 600], [390, 844]] as const) {
      for (const target of [180, 330, 510]) {
        const size = computeRenderSize(w, h, target)
        expect(size.width * size.scale).toBeGreaterThanOrEqual(w)
        expect(size.height * size.scale).toBeCloseTo(h)
      }
    }
  })

  it('확대·축소해도 픽셀 하나가 덮는 월드 크기는 같다 (시야 ÷ 세로 픽셀 수)', () => {
    for (const view of [12, 22, 34]) {
      const size = computeRenderSize(1280, 720, view / METERS_PER_PIXEL)
      expect(view / size.height).toBeCloseTo(METERS_PER_PIXEL, 3)
    }
  })

  it('크기가 0인 화면에서도 깨지지 않는다', () => {
    const size = computeRenderSize(0, 0, 270)
    expect(size.height).toBe(270)
    expect(Number.isFinite(size.scale) && size.scale > 0).toBe(true)
    expect(size.width).toBeGreaterThanOrEqual(1)
  })
})

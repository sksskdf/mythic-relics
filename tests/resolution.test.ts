import { describe, expect, it } from 'vitest'

import { BASE_RENDER_HEIGHT, computeRenderSize, PORTRAIT_SPAN, renderHeightFor, renderHeightForScreen, visibleHeight } from '../src/render/resolution'

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

  it('가장 크게 확대했을 때(12m)가 기준이고, 축소하면 해상도를 천천히만 올린다', () => {
    expect(renderHeightFor(12)).toBe(BASE_RENDER_HEIGHT)
    const mid = renderHeightFor(19)
    const far = renderHeightFor(34)
    expect(mid).toBeGreaterThan(BASE_RENDER_HEIGHT)
    expect(far).toBeGreaterThan(mid)
    // 화면 픽셀 크기는 기준의 3분의 2 아래로 내려가지 않는다. (시야를 따라 그대로 늘리면 3분의 1까지 작아진다)
    expect(BASE_RENDER_HEIGHT / far).toBeGreaterThan(2 / 3)
  })

  it('세로 화면(휴대폰)은 가로에 시야 높이의 0.8배가 보이고, 1m에 드는 픽셀 수는 가로 화면과 같다 (E235)', () => {
    // 가로 화면은 그대로
    expect(visibleHeight(19, 1280, 720)).toBe(19)
    expect(visibleHeight(19, 844, 390)).toBe(19)
    // 390×844: 그대로 두면 가로가 8.8m뿐이다
    const tall = visibleHeight(19, 390, 844)
    expect((tall * 390) / 844).toBeCloseTo(19 * PORTRAIT_SPAN)
    // 가로·세로 비가 PORTRAIT_SPAN에서 이어진다 (껑충 뛰지 않는다)
    expect(visibleHeight(19, 800, 1000)).toBeCloseTo(19)
    expect(renderHeightForScreen(19, 1280, 720)).toBe(renderHeightFor(19))
    expect(renderHeightForScreen(19, 390, 844) / tall).toBeCloseTo(renderHeightFor(19) / 19, 0)
  })

  it('크기가 0인 화면에서도 깨지지 않는다', () => {
    const size = computeRenderSize(0, 0, 270)
    expect(size.height).toBe(270)
    expect(Number.isFinite(size.scale) && size.scale > 0).toBe(true)
    expect(size.width).toBeGreaterThanOrEqual(1)
  })
})

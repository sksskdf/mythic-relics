import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { QuarterViewCamera, snapToGrid } from '../src/render/QuarterViewCamera'

describe('snapToGrid', () => {
  it('가장 가까운 격자 칸에 맞춘다', () => {
    expect(snapToGrid(1.04, 0.1)).toBeCloseTo(1.0)
    expect(snapToGrid(1.06, 0.1)).toBeCloseTo(1.1)
    expect(snapToGrid(-0.26, 0.25)).toBeCloseTo(-0.25)
  })

  it('격자 간격이 0 이하면 값을 그대로 둔다', () => {
    expect(snapToGrid(1.234, 0)).toBe(1.234)
  })
})

describe('QuarterViewCamera', () => {
  it('대상을 화면 가운데 근처(1픽셀 이내)에 둔다', () => {
    const view = new QuarterViewCamera()
    view.setRenderSize(480, 270)
    const target = new THREE.Vector3(12.37, 0, -8.91)
    view.jumpTo(target)
    const projected = target.clone().project(view.camera)
    const pixelInNdc = 2 / 270
    expect(Math.abs(projected.x)).toBeLessThanOrEqual(pixelInNdc)
    expect(Math.abs(projected.y)).toBeLessThanOrEqual(pixelInNdc)
  })

  it('대상이 멀리 가도 카메라 앞쪽 범위 안에 있다', () => {
    const view = new QuarterViewCamera()
    view.setRenderSize(480, 270)
    const target = new THREE.Vector3(-30, 0, 30)
    view.jumpTo(target)
    const projected = target.clone().project(view.camera)
    expect(projected.z).toBeGreaterThan(-1)
    expect(projected.z).toBeLessThan(1)
  })
})

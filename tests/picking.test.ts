import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { screenToGround, screenToNdc } from '../src/render/picking'
import { QuarterViewCamera } from '../src/render/QuarterViewCamera'
import { computeRenderSize } from '../src/render/resolution'

describe('screenToNdc', () => {
  it('정확히 나누어떨어지는 화면에서는 가운데가 (0, 0)이다', () => {
    const size = computeRenderSize(1920, 1080)
    const ndc = screenToNdc(960, 540, 1080, size)
    expect(ndc.x).toBeCloseTo(0)
    expect(ndc.y).toBeCloseTo(0)
  })

  it('렌더가 화면보다 클 때는 왼쪽 아래 기준으로 보정한다', () => {
    const size = computeRenderSize(1281, 721)
    // 왼쪽 아래 구석은 항상 (-1, -1)
    const corner = screenToNdc(0, 721, 721, size)
    expect(corner.x).toBeCloseTo(-1)
    expect(corner.y).toBeCloseTo(-1)
  })
})

describe('screenToGround', () => {
  it('화면 가운데를 찍으면 카메라가 보고 있는 지점이 나온다', () => {
    const view = new QuarterViewCamera()
    const size = computeRenderSize(1920, 1080)
    view.setRenderSize(size.width, size.height)
    const focus = new THREE.Vector3(5, 0, -3)
    view.jumpTo(focus)
    const hit = screenToGround(960, 540, 1080, size, view.camera)
    expect(hit).not.toBeNull()
    expect(hit!.distanceTo(focus)).toBeLessThan(0.1)
  })
})

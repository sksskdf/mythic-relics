import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { screenToGround, screenToNdc, worldToScreen } from '../src/render/picking'
import { QuarterViewCamera } from '../src/render/QuarterViewCamera'
import { computeRenderSize } from '../src/render/resolution'
import { clampViewHeight, VIEW_HEIGHT } from '../src/save/settings'

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

describe('worldToScreen', () => {
  it('땅 위의 점을 화면으로 옮긴 뒤 다시 찍으면 같은 점이 나온다', () => {
    const view = new QuarterViewCamera()
    const size = computeRenderSize(1281, 721)
    view.setRenderSize(size.width, size.height)
    view.jumpTo(new THREE.Vector3(0, 0, 0))
    const point = new THREE.Vector3(3, 0, 2)
    const screen = worldToScreen(point, 721, size, view.camera)
    const back = screenToGround(screen.x, screen.y, 721, size, view.camera)
    expect(back!.distanceTo(point)).toBeLessThan(0.01)
  })
})

describe('확대·축소', () => {
  it('보이는 범위를 바꿔도 화면 좌표 ↔ 땅 좌표 변환이 맞는다', () => {
    const view = new QuarterViewCamera()
    const size = computeRenderSize(1280, 720)
    view.setRenderSize(size.width, size.height)
    view.jumpTo(new THREE.Vector3(2, 0, -1))
    for (const viewHeight of [12, 22, 34]) {
      view.setViewHeight(viewHeight)
      const point = new THREE.Vector3(5, 0, 1)
      const screen = worldToScreen(point, 720, size, view.camera)
      const back = screenToGround(screen.x, screen.y, 720, size, view.camera)
      expect(back!.distanceTo(point)).toBeLessThan(0.05)
    }
  })

  it('확대·축소는 정해진 범위를 넘지 않는다', () => {
    expect(clampViewHeight(5)).toBe(VIEW_HEIGHT.min)
    expect(clampViewHeight(100)).toBe(VIEW_HEIGHT.max)
    expect(clampViewHeight(20)).toBe(20)
  })
})

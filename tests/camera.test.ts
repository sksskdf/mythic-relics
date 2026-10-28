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

  it('세로 화면에서도 카메라를 실제 한 픽셀 간격에 맞춘다 (따라갈 때 외곽선이 기어다니지 않게, E235)', () => {
    const view = new QuarterViewCamera()
    view.viewHeight = 19
    view.setRenderSize(180, 390)
    const fixed = new THREE.Vector3(0, 0, 0)
    for (const target of [new THREE.Vector3(3.17, 0, -2.4), new THREE.Vector3(-7.9, 0, 11.03), new THREE.Vector3(0.41, 0, 0.77)]) {
      view.jumpTo(target)
      // 가만히 있는 점은 늘 픽셀 격자 위에 온다 (나머지는 subpixel이 메운다)
      const x = (fixed.clone().project(view.camera).x * 180) / 2
      const y = (fixed.clone().project(view.camera).y * 390) / 2
      expect(Math.abs(x - Math.round(x))).toBeLessThan(1e-4)
      expect(Math.abs(y - Math.round(y))).toBeLessThan(1e-4)
    }
  })

  it('세로 화면을 가장 넓게 봐도 화면 네 귀퉁이의 땅이 near·far 안에 있다 (E235)', () => {
    const view = new QuarterViewCamera()
    view.viewHeight = 34
    view.setRenderSize(180, 390)
    view.jumpTo(new THREE.Vector3(5, 0, 5))
    const ray = new THREE.Raycaster()
    const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
    for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      ray.setFromCamera(new THREE.Vector2(x, y), view.camera)
      const hit = ray.ray.intersectPlane(ground, new THREE.Vector3())
      expect(hit).not.toBeNull()
      const z = hit!.project(view.camera).z
      expect(z).toBeGreaterThan(-1)
      expect(z).toBeLessThan(1)
    }
  })
})

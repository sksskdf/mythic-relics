import * as THREE from 'three'

import type { RenderSize } from './resolution'

/** 카메라가 픽셀에 맞추며 버린 나머지 (저해상도 픽셀 단위) */
export interface Subpixel {
  readonly x: number
  readonly y: number
}
const NO_SUBPIXEL: Subpixel = { x: 0, y: 0 }

const raycaster = new THREE.Raycaster()
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const ndcVector = new THREE.Vector2()

/**
 * 화면 좌표(CSS 픽셀, 왼쪽 위 기준)를 카메라의 정규화 좌표(-1~1)로 바꾼다.
 * 저해상도 렌더는 화면보다 조금 크게 그려지고 왼쪽 아래 기준으로 잘리므로, 그만큼 보정한다.
 */
export function screenToNdc(
  x: number,
  y: number,
  screenHeight: number,
  size: RenderSize,
  subpixel: Subpixel = NO_SUBPIXEL,
): { x: number; y: number } {
  const fromBottom = screenHeight - y
  // 화면에 그릴 때 카메라의 1픽셀 미만 나머지(subpixel)만큼 밀어 그리므로, 같은 만큼 보정한다.
  return {
    x: ((x / size.scale + subpixel.x) / size.width) * 2 - 1,
    y: ((fromBottom / size.scale + subpixel.y) / size.height) * 2 - 1,
  }
}

/** 화면 좌표를 땅(y=0) 위의 월드 좌표로 바꾼다. 땅과 만나지 않으면 null. */
export function screenToGround(
  x: number,
  y: number,
  screenHeight: number,
  size: RenderSize,
  camera: THREE.Camera,
  out = new THREE.Vector3(),
  subpixel: Subpixel = NO_SUBPIXEL,
): THREE.Vector3 | null {
  const ndc = screenToNdc(x, y, screenHeight, size, subpixel)
  ndcVector.set(ndc.x, ndc.y)
  raycaster.setFromCamera(ndcVector, camera)
  return raycaster.ray.intersectPlane(ground, out)
}

const projected = new THREE.Vector3()

/** 월드 좌표를 화면 좌표(CSS 픽셀, 왼쪽 위 기준)로 바꾼다. screenToNdc의 반대 방향 */
export function worldToScreen(
  point: THREE.Vector3,
  screenHeight: number,
  size: RenderSize,
  camera: THREE.Camera,
  subpixel: Subpixel = NO_SUBPIXEL,
): { x: number; y: number } {
  projected.copy(point).project(camera)
  return {
    x: (((projected.x + 1) / 2) * size.width - subpixel.x) * size.scale,
    y: screenHeight - (((projected.y + 1) / 2) * size.height - subpixel.y) * size.scale,
  }
}

/** 화면 좌표에서 카메라가 쏘는 광선 */
export function screenRay(
  x: number,
  y: number,
  screenHeight: number,
  size: RenderSize,
  camera: THREE.Camera,
  subpixel: Subpixel = NO_SUBPIXEL,
): THREE.Ray {
  const ndc = screenToNdc(x, y, screenHeight, size, subpixel)
  ndcVector.set(ndc.x, ndc.y)
  raycaster.setFromCamera(ndcVector, camera)
  return raycaster.ray.clone()
}

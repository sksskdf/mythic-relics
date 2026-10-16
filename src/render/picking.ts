import * as THREE from 'three'

import type { RenderSize } from './resolution'

const raycaster = new THREE.Raycaster()
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
const ndcVector = new THREE.Vector2()

/**
 * 화면 좌표(CSS 픽셀, 왼쪽 위 기준)를 카메라의 정규화 좌표(-1~1)로 바꾼다.
 * 저해상도 렌더는 화면보다 조금 크게 그려지고 왼쪽 아래 기준으로 잘리므로, 그만큼 보정한다.
 */
export function screenToNdc(x: number, y: number, screenHeight: number, size: RenderSize): { x: number; y: number } {
  const spanWidth = size.width * size.scale
  const spanHeight = size.height * size.scale
  const fromBottom = screenHeight - y
  return {
    x: (x / spanWidth) * 2 - 1,
    y: (fromBottom / spanHeight) * 2 - 1,
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
): THREE.Vector3 | null {
  const ndc = screenToNdc(x, y, screenHeight, size)
  ndcVector.set(ndc.x, ndc.y)
  raycaster.setFromCamera(ndcVector, camera)
  return raycaster.ray.intersectPlane(ground, out)
}

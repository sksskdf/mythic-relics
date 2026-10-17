import * as THREE from 'three'

import { EFFECT_LAYER } from './PixelRenderer'

/** 렌더 순서: 배경(0) → 실루엣(1) → 실루엣을 가진 캐릭터(2) */
const SILHOUETTE_ORDER = 1
const OWNER_ORDER = 2

/**
 * 나무나 바위 뒤에 가려진 부분을 단색 실루엣으로 보여 준다.
 * 배경보다 뒤에 있을 때만(깊이가 더 클 때만) 그려지고, 캐릭터 자신은 실루엣보다 나중에 그려서
 * 보이는 부분이 실루엣을 덮게 한다. (렌더 순서가 지켜지도록 불투명 재질로 그린다) 효과 층에 있어서 외곽선 계산과 그림자에는 끼지 않는다.
 */
export function addSilhouette(root: THREE.Object3D, color: THREE.ColorRepresentation): THREE.Material {
  const material = silhouetteMaterial(color)
  const meshes: THREE.Mesh[] = []
  root.traverse((o) => {
    if (o instanceof THREE.Mesh) meshes.push(o)
  })
  for (const mesh of meshes) attachSilhouette(mesh, material)
  return material
}

export function silhouetteMaterial(color: THREE.ColorRepresentation): THREE.Material {
  return new THREE.MeshBasicMaterial({ color, depthFunc: THREE.GreaterDepth, depthWrite: false })
}

/** 메시 하나에 실루엣을 붙인다. (외형을 바꿔 끼운 새 메시에도 쓴다) */
export function attachSilhouette(mesh: THREE.Mesh, material: THREE.Material): void {
  mesh.renderOrder = OWNER_ORDER
  const ghost = new THREE.Mesh(mesh.geometry, material)
  ghost.renderOrder = SILHOUETTE_ORDER
  ghost.layers.set(EFFECT_LAYER)
  ghost.castShadow = false
  mesh.add(ghost)
}

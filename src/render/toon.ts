import * as THREE from 'three'

let gradient: THREE.DataTexture | null = null

/** 명암을 3단계로 끊는 셀 셰이딩용 그라디언트. 모든 툰 재질이 함께 쓴다. */
function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient
  const steps = new Uint8Array([70, 160, 255])
  gradient = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat)
  gradient.minFilter = THREE.NearestFilter
  gradient.magFilter = THREE.NearestFilter
  gradient.needsUpdate = true
  return gradient
}

/** 셀 셰이딩 재질을 만든다. */
export function toonMaterial(color: THREE.ColorRepresentation): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() })
}

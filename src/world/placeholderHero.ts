import * as THREE from 'three'

import { toonMaterial } from '../render/toon'

/** 모델이 나오기 전까지 쓰는 임시 주인공. 크기 감을 잡기 위한 용도다. */
export function buildPlaceholderHero(): THREE.Group {
  const hero = new THREE.Group()

  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 4, 8), toonMaterial(0x3f6fd8))
  body.position.y = 0.75
  hero.add(body)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), toonMaterial(0xe8c9a5))
  head.position.y = 1.55
  hero.add(head)

  const cape = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.08), toonMaterial(0x9b2f2f))
  cape.position.set(0, 0.95, -0.3)
  hero.add(cape)

  hero.traverse((child) => {
    child.castShadow = true
    child.receiveShadow = true
  })
  return hero
}

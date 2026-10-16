import * as THREE from 'three'

import { toonMaterial } from '../render/toon'

/** 걷기·회피 동작에 쓰는 관절들 */
export interface HeroRig {
  root: THREE.Group
  /** 몸통 전체 (위아래로 튀거나 숙일 때 쓴다) */
  body: THREE.Group
  leftArm: THREE.Group
  rightArm: THREE.Group
  leftLeg: THREE.Group
  rightLeg: THREE.Group
  cape: THREE.Group
}

const COLORS = {
  skin: 0xe2b896,
  tunic: 0x35588f,
  tunicDark: 0x284471,
  leather: 0x6b4a32,
  boots: 0x3f2c20,
  fur: 0xcbbfae,
  helmet: 0x9aa3ad,
  horn: 0xe8e0cc,
  cape: 0x8f2e2e,
  belt: 0x3a2a1f,
  beard: 0xb5692f,
}

function part(geometry: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, toonMaterial(color))
  m.position.set(x, y, z)
  m.castShadow = true
  m.receiveShadow = true
  return m
}

/** 관절(회전 기준점)을 만들고 그 아래에 매달린 부위를 붙인다. */
function joint(x: number, y: number, z: number, ...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.add(...children)
  return g
}

/**
 * 주인공 모델: 뿔 달린 투구, 털 망토, 붉은 망토를 두른 북방 모험가.
 * 키는 약 1.8미터이고, 발이 원점(y=0)에 닿는다.
 */
export function buildHeroModel(): HeroRig {
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  // 다리: 엉덩이 높이에 관절을 두고 아래로 매단다.
  const leg = (side: number) =>
    joint(
      side * 0.14,
      0.82,
      0,
      part(new THREE.BoxGeometry(0.2, 0.5, 0.22), COLORS.leather, 0, -0.25, 0),
      part(new THREE.BoxGeometry(0.22, 0.32, 0.3), COLORS.boots, 0, -0.66, 0.03),
    )
  const leftLeg = leg(-1)
  const rightLeg = leg(1)
  body.add(leftLeg, rightLeg)

  // 몸통
  body.add(part(new THREE.BoxGeometry(0.52, 0.62, 0.32), COLORS.tunic, 0, 1.12, 0))
  body.add(part(new THREE.BoxGeometry(0.56, 0.2, 0.36), COLORS.tunicDark, 0, 0.86, 0))
  body.add(part(new THREE.BoxGeometry(0.58, 0.08, 0.38), COLORS.belt, 0, 0.94, 0))
  body.add(part(new THREE.BoxGeometry(0.1, 0.1, 0.04), 0xd9b44a, 0, 0.94, 0.2))
  // 어깨를 덮는 털
  body.add(part(new THREE.BoxGeometry(0.74, 0.16, 0.42), COLORS.fur, 0, 1.44, 0))

  // 팔: 어깨에 관절
  const arm = (side: number) =>
    joint(
      side * 0.36,
      1.38,
      0,
      part(new THREE.BoxGeometry(0.16, 0.42, 0.18), COLORS.tunic, 0, -0.2, 0),
      part(new THREE.BoxGeometry(0.17, 0.2, 0.19), COLORS.leather, 0, -0.48, 0),
      part(new THREE.BoxGeometry(0.14, 0.12, 0.14), COLORS.skin, 0, -0.63, 0),
    )
  const leftArm = arm(-1)
  const rightArm = arm(1)
  body.add(leftArm, rightArm)

  // 머리, 수염, 투구, 뿔
  body.add(part(new THREE.BoxGeometry(0.32, 0.32, 0.32), COLORS.skin, 0, 1.68, 0))
  body.add(part(new THREE.BoxGeometry(0.3, 0.16, 0.08), COLORS.beard, 0, 1.56, 0.17))
  body.add(part(new THREE.BoxGeometry(0.38, 0.18, 0.38), COLORS.helmet, 0, 1.86, 0))
  body.add(part(new THREE.BoxGeometry(0.06, 0.14, 0.06), COLORS.helmet, 0, 1.73, 0.19))
  for (const side of [-1, 1]) {
    const horn = part(new THREE.ConeGeometry(0.06, 0.32, 5), COLORS.horn, side * 0.24, 1.98, 0)
    horn.rotation.z = -side * 0.9
    body.add(horn)
  }

  // 망토: 어깨 뒤에 관절을 두어 걸을 때 펄럭이게 한다.
  const cape = joint(0, 1.42, -0.2, part(new THREE.BoxGeometry(0.62, 0.95, 0.05), COLORS.cape, 0, -0.47, 0))
  body.add(cape)

  return { root, body, leftArm, rightArm, leftLeg, rightLeg, cape }
}

import * as THREE from 'three'

import { voxelMesh } from '../voxel/mesher'
import { HERO_VOXEL, heroArm, heroAxe, heroCape, heroHead, heroLeg, heroTorso } from '../voxel/models/hero'

/** 걷기·회피 동작에 쓰는 관절들 */
export interface HeroRig {
  root: THREE.Group
  /** 몸통 전체 (위아래로 튀거나 숙일 때 쓴다) */
  body: THREE.Group
  head: THREE.Object3D
  leftArm: THREE.Group
  rightArm: THREE.Group
  leftLeg: THREE.Group
  rightLeg: THREE.Group
  cape: THREE.Group
  /** 오른손에 쥔 무기. 유물을 끼면 이 자리에 다른 무기가 붙는다. */
  weapon: THREE.Group
}

/** 관절(회전 기준점)을 만들고 그 아래에 부위를 붙인다. */
function joint(x: number, y: number, z: number, child: THREE.Object3D): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.add(child)
  return g
}

/**
 * 복셀로 만든 주인공: 뿔 달린 투구, 땋은 수염, 털 어깨, 붉은 망토, 손도끼를 든 북방 모험가.
 * 투구 끝까지 약 2미터이고, 발이 원점(y=0)에 닿는다. 앞은 +z 방향이다.
 */
export function buildHeroModel(): HeroRig {
  const s = HERO_VOXEL
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const legGrid = heroLeg()
  const leg = () => voxelMesh(legGrid, { voxelSize: s, pivot: [1.5, 9, 1.5] })
  const hipY = 9 * s
  const leftLeg = joint(-1.5 * s, hipY, 0, leg())
  const rightLeg = joint(1.5 * s, hipY, 0, leg())
  body.add(leftLeg, rightLeg)

  const torso = voxelMesh(heroTorso(), { voxelSize: s, pivot: [5, 0, 3.5] })
  torso.position.y = hipY
  body.add(torso)

  const armGrid = heroArm()
  const arm = () => voxelMesh(armGrid, { voxelSize: s, pivot: [1.5, 8, 1.5] })
  const shoulderY = hipY + 7.5 * s
  const leftArm = joint(-5.5 * s, shoulderY, 0, arm())
  const rightArm = joint(5.5 * s, shoulderY, 0, arm())
  body.add(leftArm, rightArm)

  // 도끼는 오른손(팔 관절에서 손 높이)에 붙고, 날이 앞쪽 아래를 향하게 늘어뜨린다.
  const weapon = joint(0, -7.5 * s, 0.5 * s, voxelMesh(heroAxe(), { voxelSize: s, pivot: [1, 5.5, 1.5] }))
  weapon.rotation.x = 0.9
  rightArm.add(weapon)

  const head = voxelMesh(heroHead(), { voxelSize: s, pivot: [6, 2, 4] })
  head.position.y = hipY + 8 * s
  body.add(head)

  const cape = joint(0, shoulderY + s, -3 * s, voxelMesh(heroCape(), { voxelSize: s, pivot: [4, 12, 1] }))
  body.add(cape)

  return { root, body, head, leftArm, rightArm, leftLeg, rightLeg, cape, weapon }
}

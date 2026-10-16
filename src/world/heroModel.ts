import * as THREE from 'three'

import { voxelMesh } from '../voxel/mesher'
import { HERO_VOXEL, heroArm, heroCape, heroHead, heroLeg, heroTorso } from '../voxel/models/hero'

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

/** 관절(회전 기준점)을 만들고 그 아래에 부위를 붙인다. */
function joint(x: number, y: number, z: number, child: THREE.Object3D): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.add(child)
  return g
}

/**
 * 복셀로 만든 주인공: 뿔 달린 투구, 털 어깨, 붉은 망토를 두른 북방 모험가.
 * 키는 약 1.9미터이고, 발이 원점(y=0)에 닿는다. 앞은 +z 방향이다.
 */
export function buildHeroModel(): HeroRig {
  const s = HERO_VOXEL
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const legGrid = heroLeg()
  const leg = () => voxelMesh(legGrid, { voxelSize: s, pivot: [1.5, 10, 1.5] })
  const hipY = 10 * s
  const leftLeg = joint(-1.5 * s, hipY, 0, leg())
  const rightLeg = joint(1.5 * s, hipY, 0, leg())
  body.add(leftLeg, rightLeg)

  const torso = voxelMesh(heroTorso(), { voxelSize: s, pivot: [4.5, 0, 2.5] })
  torso.position.y = hipY
  body.add(torso)

  const armGrid = heroArm()
  const arm = () => voxelMesh(armGrid, { voxelSize: s, pivot: [1, 9, 1] })
  const shoulderY = hipY + 7.5 * s
  const leftArm = joint(-4.5 * s, shoulderY, 0, arm())
  const rightArm = joint(4.5 * s, shoulderY, 0, arm())
  body.add(leftArm, rightArm)

  const head = voxelMesh(heroHead(), { voxelSize: s, pivot: [5.5, 0, 3.5] })
  head.position.y = hipY + 8.5 * s
  body.add(head)

  const cape = joint(0, shoulderY, -2 * s, voxelMesh(heroCape(), { voxelSize: s, pivot: [3.5, 11, 1] }))
  body.add(cape)

  return { root, body, leftArm, rightArm, leftLeg, rightLeg, cape }
}

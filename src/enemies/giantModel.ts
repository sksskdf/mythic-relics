import * as THREE from 'three'

import { toonGradient } from '../render/toon'
import { voxelMesh } from '../voxel/mesher'
import { VoxelGrid } from '../voxel/VoxelGrid'
import { createRng } from '../world/rng'

export interface GiantRig {
  root: THREE.Group
  body: THREE.Group
  leftArm: THREE.Group
  rightArm: THREE.Group
  leftLeg: THREE.Group
  rightLeg: THREE.Group
  /** 맞았을 때 하얗게 번쩍이게 할 재질 */
  material: THREE.MeshToonMaterial
  /** 사망 때 흩어질 조각의 색 */
  palette: number[]
}

const FROST = {
  skin: 0x8fb4cb,
  skinShade: 0x6d92ab,
  skinDark: 0x55768e,
  eye: 0xc8f8ff,
  fur: 0x7c6750,
  furDark: 0x5e4c3a,
  bone: 0xe4dcc6,
  wood: 0x6a4a30,
  woodDark: 0x4e3622,
  iron: 0x6f7780,
  beard: 0xe9f4fa,
  gold: 0xe2b54a,
  ice: 0xa8e4f5,
  iceDeep: 0x6cbcd9,
  cape: 0x3b4f73,
}

export interface GiantOptions {
  /** 복셀 한 칸의 크기. 클수록 덩치가 커진다. */
  voxelSize: number
  /** 거인 왕: 왕관, 얼음 수염, 망토, 얼음 몽둥이 */
  king?: boolean
  seed?: number
}

function leg(): VoxelGrid {
  const g = new VoxelGrid(4, 9, 5)
  g.box(0, 0, 0, 3, 2, 4, FROST.furDark)
  g.box(0, 3, 0, 3, 8, 3, FROST.skin)
  g.box(0, 3, 0, 3, 8, 0, FROST.skinShade)
  g.box(0, 3, 0, 3, 3, 3, FROST.fur)
  return g
}

function torso(king: boolean, rng: () => number): VoxelGrid {
  const g = new VoxelGrid(12, 11, 8)
  // 배가 나온 몸통
  g.box(1, 2, 1, 10, 9, 6, FROST.skin)
  g.box(2, 2, 6, 9, 6, 7, FROST.skin)
  g.box(1, 2, 1, 10, 9, 1, FROST.skinShade)
  // 털 허리 가리개
  g.box(0, 0, 0, 11, 2, 7, FROST.fur)
  g.forEach((x, y, z, hex) => {
    if (hex === FROST.fur && y === 0 && rng() < 0.4) g.set(x, y, z, null)
    else if (hex === FROST.fur && rng() < 0.3) g.set(x, y, z, FROST.furDark)
  })
  // 어깨 뼈 장식
  g.box(0, 9, 2, 2, 10, 5, FROST.bone)
  g.box(9, 9, 2, 11, 10, 5, FROST.bone)
  // 가슴 흉터
  for (let i = 0; i < 4; i++) g.set(3 + i, 7 - i, 7, FROST.skinDark)
  if (king) g.box(1, 3, 6, 10, 3, 7, FROST.gold)
  return g
}

function arm(): VoxelGrid {
  const g = new VoxelGrid(4, 10, 4)
  g.box(0, 0, 0, 3, 9, 3, FROST.skin)
  g.box(0, 0, 0, 3, 9, 0, FROST.skinShade)
  g.box(0, 3, 0, 3, 4, 3, FROST.fur)
  g.box(0, 0, 0, 3, 1, 3, FROST.skinDark)
  return g
}

function head(king: boolean): VoxelGrid {
  const g = new VoxelGrid(10, 10, 9)
  g.box(2, 0, 1, 7, 5, 6, FROST.skin)
  g.box(2, 0, 1, 7, 5, 1, FROST.skinShade)
  // 튀어나온 이마와 빛나는 눈
  g.box(2, 4, 7, 7, 4, 7, FROST.skinShade)
  g.set(3, 3, 7, FROST.eye)
  g.set(6, 3, 7, FROST.eye)
  // 아래턱과 송곳니
  g.box(2, 0, 6, 7, 1, 7, FROST.skinDark)
  g.set(3, 2, 7, FROST.bone)
  g.set(6, 2, 7, FROST.bone)
  if (king) {
    // 얼음 수염과 왕관
    g.box(2, 0, 7, 7, 1, 8, FROST.beard)
    g.box(3, 0, 8, 6, 0, 8, FROST.ice)
    g.box(1, 6, 0, 8, 6, 7, FROST.gold)
    for (const x of [1, 4, 5, 8]) g.box(x, 7, x === 4 || x === 5 ? 3 : 0, x, 8, x === 4 || x === 5 ? 3 : 0, FROST.gold)
    for (const [x, z] of [[1, 7], [8, 7], [1, 0], [8, 0]] as const) g.box(x, 7, z, x, 7, z, FROST.gold)
    g.set(4, 8, 7, FROST.ice)
    g.set(5, 8, 7, FROST.ice)
  } else {
    // 듬성듬성한 머리털
    g.box(2, 6, 1, 7, 6, 5, FROST.fur)
    g.set(3, 7, 3, FROST.furDark)
    g.set(6, 7, 2, FROST.furDark)
  }
  return g
}

function club(king: boolean): VoxelGrid {
  const g = new VoxelGrid(5, 5, 16)
  // 손잡이가 앞(z+)으로 뻗는다. 쥐는 곳은 뒤쪽
  g.box(2, 2, 0, 2, 2, 9, FROST.woodDark)
  if (king) {
    // 거대한 얼음 결정 몽둥이
    g.box(1, 1, 9, 3, 3, 15, FROST.ice)
    g.box(0, 2, 10, 4, 2, 14, FROST.ice)
    g.box(2, 0, 10, 2, 4, 14, FROST.iceDeep)
    g.box(2, 2, 15, 2, 2, 15, FROST.beard)
  } else {
    // 돌을 묶은 나무 몽둥이
    g.box(1, 1, 9, 3, 3, 13, FROST.wood)
    g.box(0, 1, 11, 4, 3, 12, FROST.iron)
    g.set(2, 4, 12, FROST.bone)
  }
  return g
}

function cape(): VoxelGrid {
  const g = new VoxelGrid(10, 13, 1)
  g.box(0, 0, 0, 9, 12, 0, FROST.cape)
  g.box(0, 12, 0, 9, 12, 0, FROST.beard)
  for (const x of [1, 4, 7]) g.set(x, 0, 0, null)
  return g
}

function joint(x: number, y: number, z: number, child: THREE.Object3D): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  g.add(child)
  return g
}

/**
 * 서리 거인. 졸개는 칸 0.1m(키 약 2.6m), 거인 왕은 같은 모양을 크게 키우고 왕관과 얼음 몽둥이를 든다.
 * 재질은 거인마다 따로 만들어, 맞았을 때 그 거인만 번쩍이게 한다.
 */
export function buildGiantRig(options: GiantOptions): GiantRig {
  const s = options.voxelSize
  const king = options.king ?? false
  const rng = createRng(options.seed ?? 1)
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() })

  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  const mesh = (grid: VoxelGrid, pivot: [number, number, number]) => voxelMesh(grid, { voxelSize: s, pivot }, material)

  const legGrid = leg()
  const hipY = 9 * s
  const leftLeg = joint(-2.5 * s, hipY, 0, mesh(legGrid, [2, 9, 2]))
  const rightLeg = joint(2.5 * s, hipY, 0, mesh(legGrid, [2, 9, 2]))
  body.add(leftLeg, rightLeg)

  const torsoMesh = mesh(torso(king, rng), [6, 0, 4])
  torsoMesh.position.y = hipY
  body.add(torsoMesh)

  const armGrid = arm()
  const shoulderY = hipY + 9.5 * s
  const leftArm = joint(-7.5 * s, shoulderY, 0, mesh(armGrid, [2, 10, 2]))
  const rightArm = joint(7.5 * s, shoulderY, 0, mesh(armGrid, [2, 10, 2]))
  const clubMesh = mesh(club(king), [2.5, 2.5, 1.5])
  clubMesh.position.set(0, -9 * s, 0.5 * s)
  clubMesh.rotation.x = 0.7
  rightArm.add(clubMesh)
  body.add(leftArm, rightArm)

  const headMesh = mesh(head(king), [5, 0, 4])
  headMesh.position.y = hipY + 10 * s
  body.add(headMesh)

  if (king) {
    const capeJoint = joint(0, shoulderY + s, -4.5 * s, mesh(cape(), [5, 13, 1]))
    capeJoint.rotation.x = 0.15
    body.add(capeJoint)
  }

  const palette = king
    ? [FROST.skin, FROST.ice, FROST.gold, FROST.beard, FROST.cape]
    : [FROST.skin, FROST.skinShade, FROST.fur, FROST.bone]
  return { root, body, leftArm, rightArm, leftLeg, rightLeg, material, palette }
}

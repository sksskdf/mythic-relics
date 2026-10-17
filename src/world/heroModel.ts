import * as THREE from 'three'

import { type BodyLook, bodyKey, bodyPalette, DEFAULT_BODY } from '../looks/body'
import { BASE_OUTFIT, LOOK_SLOTS, type LookSlot } from '../looks/catalog'
import type { Outfit } from '../looks/outfit'
import { attachSilhouette, silhouetteMaterial } from '../render/silhouette'
import { toonGradient } from '../render/toon'
import { buildVoxelGeometry, type MeshOptions } from '../voxel/mesher'
import { HERO_VOXEL } from '../voxel/models/hero'
import { LOOK_MODELS } from '../voxel/models/looks'
import type { VoxelGrid } from '../voxel/VoxelGrid'

/** 걷기·공격 동작에 쓰는 관절들 */
export interface HeroRig {
  root: THREE.Group
  /** 몸통 전체 (위아래로 튀거나 숙일 때 쓴다) */
  body: THREE.Group
  head: THREE.Group
  leftArm: THREE.Group
  rightArm: THREE.Group
  leftLeg: THREE.Group
  rightLeg: THREE.Group
  cape: THREE.Group
  /** 발현 표식 자리 (등) */
  mark: THREE.Group
  /** 오른손에 쥔 무기 자리 */
  weapon: THREE.Group
  /** 주인공 전용 재질 (맞았을 때 번쩍이게 한다) */
  material: THREE.MeshToonMaterial
  /** 지금 걸친 외형 */
  readonly outfit: Outfit
  /** 외형을 바꿔 입는다. 바뀐 칸만 다시 만든다. */
  wear(outfit: Outfit): void
  /** 나무·바위 뒤에 가려질 때 보이는 단색 실루엣을 켠다. */
  setSilhouette(color: THREE.ColorRepresentation): void
  /** 처음에 고른 기본 모습(피부·머리카락·옷 색)을 바꾼다. 입은 외형을 모두 다시 칠한다. */
  setBody(body: BodyLook): void
  /** 발현 레벨: 표식은 레벨마다 다른 모양이다 (E6) */
  setMarkLevel(level: number): void
}

/** 칸마다 모델의 원점(관절 자리). 같은 칸의 모델은 같은 자리에 붙는다. */
function pivotFor(slot: LookSlot, grid: VoxelGrid): MeshOptions['pivot'] {
  switch (slot) {
    case 'head':
      return [6, 2, 4]
    case 'face':
      return [grid.sizeX / 2, 0, 0]
    case 'torso':
      return [5, 0, 3.5]
    case 'waist':
      return [grid.sizeX / 2, 0, grid.sizeZ / 2]
    case 'arms':
      return [grid.sizeX / 2, 8, grid.sizeZ / 2]
    case 'legs':
      return [1.5, 9, 1.5]
    case 'weapon':
      return [grid.sizeX / 2, 5.5, 1.5]
    case 'cape':
      return [4, 12, 1]
    case 'mark':
      return [grid.sizeX / 2, 0, grid.sizeZ]
  }
}

/** 외형 지오메트리는 한 번 만들어 모든 주인공(분신 포함)이 함께 쓴다. */
const geometries = new Map<string, THREE.BufferGeometry>()
function lookGeometry(id: string, slot: LookSlot, body: BodyLook, level: number): THREE.BufferGeometry | null {
  const build = LOOK_MODELS[id]
  if (!build) return null
  const key = `${id}|${bodyKey(body)}|${slot === 'mark' ? level : 1}`
  let geometry = geometries.get(key)
  if (!geometry) {
    const grid = build(level)
    // 처음에 고른 피부·머리카락·옷 색으로 바꿔 칠한다.
    const palette = bodyPalette(body)
    if (palette.size > 0) grid.forEach((x, y, z, hex) => palette.has(hex) && grid.set(x, y, z, palette.get(hex)!))
    geometry = buildVoxelGeometry(grid, { voxelSize: HERO_VOXEL, pivot: pivotFor(slot, grid) })
    geometries.set(key, geometry)
  }
  return geometry
}

/** 관절(회전 기준점) */
function joint(x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  return g
}

/**
 * 복셀로 만든 주인공. 투구 끝까지 약 2미터이고, 발이 원점(y=0)에 닿는다. 앞은 +z 방향이다.
 * 머리·얼굴·몸·허리·손·다리·무기·등·표식 칸에 외형 모델을 바꿔 끼운다. (E3)
 * 처음에는 어느 신도 떠올리지 않는 평범한 모험가 모습이다.
 */
export function buildHeroModel(outfit: Outfit = BASE_OUTFIT, initialBody: BodyLook = DEFAULT_BODY): HeroRig {
  let bodyLook = initialBody
  let markLevel = 1
  const s = HERO_VOXEL
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() })
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)

  const hipY = 9 * s
  const shoulderY = hipY + 7.5 * s
  const leftLeg = joint(-1.5 * s, hipY, 0)
  const rightLeg = joint(1.5 * s, hipY, 0)
  const torso = joint(0, hipY, 0)
  // 허리띠는 몸통 띠 높이에 한 칸 크게 두른다.
  const waist = joint(0, s, 0)
  torso.add(waist)
  const leftArm = joint(-5.5 * s, shoulderY, 0)
  const rightArm = joint(5.5 * s, shoulderY, 0)
  // 무기는 오른손(팔 관절에서 손 높이)에 붙고, 앞쪽 아래를 향하게 늘어뜨린다.
  const weapon = joint(0, -7.5 * s, 0.5 * s)
  weapon.rotation.x = 0.9
  rightArm.add(weapon)
  const head = joint(0, hipY + 8 * s, 0)
  // 가면은 얼굴 앞면(머리 원점에서 앞으로 3칸) 바로 앞, 눈썹 높이부터 덮는다.
  const face = joint(0, s, 4 * s)
  head.add(face)
  const cape = joint(0, shoulderY + s, -3 * s)
  // 표식은 어깨뼈 높이, 망토 바로 뒤에 붙는다. (벼락 고리, 두 뱀, 여섯 팔)
  const mark = joint(0, shoulderY - 2 * s, -3.6 * s)
  body.add(leftLeg, rightLeg, torso, leftArm, rightArm, head, cape, mark)

  /** 칸 → 모델을 붙이는 관절들 (팔·다리는 양쪽) */
  const mounts: Record<LookSlot, THREE.Group[]> = {
    head: [head],
    face: [face],
    torso: [torso],
    waist: [waist],
    arms: [leftArm, rightArm],
    legs: [leftLeg, rightLeg],
    weapon: [weapon],
    cape: [cape],
    mark: [mark],
  }
  const worn = new Map<LookSlot, THREE.Mesh[]>()
  let ghost: THREE.Material | null = null
  const current = Object.fromEntries(LOOK_SLOTS.map((slot) => [slot, null])) as Outfit

  const put = (slot: LookSlot, id: string | null) => {
    for (const mesh of worn.get(slot) ?? []) mesh.removeFromParent()
    worn.delete(slot)
    current[slot] = id
    const geometry = id ? lookGeometry(id, slot, bodyLook, markLevel) : null
    if (!geometry) return
    const meshes = mounts[slot].map((mount) => {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      if (ghost) attachSilhouette(mesh, ghost)
      mount.add(mesh)
      return mesh
    })
    worn.set(slot, meshes)
  }

  const rig: HeroRig = {
    root,
    body,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    cape,
    mark,
    weapon,
    material,
    outfit: current,
    wear(next) {
      for (const slot of LOOK_SLOTS) if (next[slot] !== current[slot]) put(slot, next[slot])
    },
    setMarkLevel(level) {
      if (level === markLevel) return
      markLevel = level
      put('mark', current.mark)
    },
    setBody(next) {
      bodyLook = next
      for (const slot of LOOK_SLOTS) put(slot, current[slot])
    },
    setSilhouette(color) {
      ghost = silhouetteMaterial(color)
      for (const meshes of worn.values()) for (const mesh of meshes) attachSilhouette(mesh, ghost)
    },
  }
  rig.wear(outfit)
  return rig
}

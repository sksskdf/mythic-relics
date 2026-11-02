import * as THREE from 'three'

import { attachSilhouette, silhouetteMaterial } from '../render/silhouette'
import { toonGradient } from '../render/toon'
import { buildVoxelGeometry } from '../voxel/mesher'
import { HERO_VOXEL } from '../voxel/models/hero'
import { GOAT_LEG, GOAT_LEGS, GOAT_SADDLE, GOAT_SADDLE_TOP, goatBody, goatLeg } from '../voxel/models/mount'

/** 주인공 엉덩이(다리 관절) 높이 (복셀, heroModel의 hipY) */
const HERO_HIP = 9
/** 탄 동안 주인공 몸을 이만큼(m) 올린다: 엉덩이가 산양 안장 윗면에 닿게 */
export const GOAT_SEAT = (GOAT_SADDLE_TOP - HERO_HIP) * HERO_VOXEL

/** 산양: 몸과 다리 관절 넷. 원점이 안장 가운데 아래 땅이고 앞은 +z (주인공과 같다) */
export interface GoatRig {
  root: THREE.Group
  /** 다리를 흔든다: 달리면 뛰는 걸음, 서 있으면 가만히 */
  animate(dt: number, moving: boolean): void
  /** 나무·바위 뒤에 가려질 때의 실루엣 */
  setSilhouette(color: THREE.ColorRepresentation): void
}

/** 지오메트리는 한 번만 만들어 탄 산양과 고개지기 곁 산양이 함께 쓴다 */
let shared: { body: THREE.BufferGeometry; leg: THREE.BufferGeometry; material: THREE.MeshToonMaterial } | null = null
function parts() {
  shared ??= {
    // 안장 가운데가 원점, 몸은 다리 위에서 시작
    body: buildVoxelGeometry(goatBody(), { voxelSize: HERO_VOXEL, pivot: [GOAT_SADDLE.x, -GOAT_LEG, GOAT_SADDLE.z] }),
    leg: buildVoxelGeometry(goatLeg(), { voxelSize: HERO_VOXEL, pivot: [1.5, GOAT_LEG, 1.5] }),
    material: new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }),
  }
  return shared
}

/** 고개지기의 산양 (E241-02). 탄 동안 주인공 발밑에 붙고, 고개지기 곁에도 하나 서 있다 */
export function buildGoat(): GoatRig {
  const { body, leg, material } = parts()
  const root = new THREE.Group()
  const meshes: THREE.Mesh[] = []
  const add = (geometry: THREE.BufferGeometry, parent: THREE.Object3D) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    parent.add(mesh)
    meshes.push(mesh)
  }
  add(body, root)
  const s = HERO_VOXEL
  const legs = GOAT_LEGS.map((p) => {
    const joint = new THREE.Group()
    joint.position.set((p.x - GOAT_SADDLE.x) * s, GOAT_LEG * s, (p.z - GOAT_SADDLE.z) * s)
    root.add(joint)
    add(leg, joint)
    return joint
  })
  let cycle = 0
  return {
    root,
    animate(dt, moving) {
      // 뛰는 걸음: 앞다리 둘이 함께, 뒷다리 둘이 반 박자 늦게 (산양이 바위를 뛰어오르듯)
      cycle += dt * (moving ? 16 : 0)
      const swing = moving ? 0.75 : 0
      legs.forEach((joint, i) => {
        const phase = cycle + (i < 2 ? 0 : Math.PI) + (i % 2) * 0.35
        joint.rotation.x = Math.sin(phase) * swing
      })
    },
    setSilhouette(color) {
      const ghost = silhouetteMaterial(color)
      for (const mesh of meshes) attachSilhouette(mesh, ghost)
    },
  }
}

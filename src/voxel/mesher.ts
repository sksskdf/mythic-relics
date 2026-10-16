import * as THREE from 'three'

import { toonMaterial } from '../render/toon'
import type { VoxelGrid } from './VoxelGrid'

interface Face {
  normal: [number, number, number]
  corners: [number, number, number][]
}

const RAW_FACES: Face[] = [
  { normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
  { normal: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { normal: [0, 1, 0], corners: [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]] },
  { normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  { normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { normal: [0, 0, -1], corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] },
]

/** 바깥에서 봤을 때 반시계 방향이 되도록 꼭짓점 순서를 맞춘다. */
const FACES: Face[] = RAW_FACES.map((face) => {
  const [a, b, c] = face.corners as [[number, number, number], [number, number, number], [number, number, number]]
  const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2])
  const ac = new THREE.Vector3(c[0] - a[0], c[1] - a[1], c[2] - a[2])
  const cross = ab.cross(ac)
  const n = new THREE.Vector3(...face.normal)
  return cross.dot(n) < 0 ? { normal: face.normal, corners: [...face.corners].reverse() } : face
})

export interface MeshOptions {
  /** 한 칸의 크기 (미터) */
  voxelSize: number
  /** 원점으로 삼을 격자 좌표 (칸 단위, 소수 가능). 기본은 바닥 가운데. */
  pivot?: [number, number, number]
}

/**
 * 복셀 격자를 메시용 지오메트리로 바꾼다.
 * 옆 칸이 차 있는 면은 보이지 않으므로 그리지 않는다.
 */
export function buildVoxelGeometry(grid: VoxelGrid, options: MeshOptions): THREE.BufferGeometry {
  const { voxelSize: s } = options
  const [px, py, pz] = options.pivot ?? [grid.sizeX / 2, 0, grid.sizeZ / 2]
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const color = new THREE.Color()

  grid.forEach((x, y, z, hex) => {
    color.setHex(hex)
    for (const face of FACES) {
      const [nx, ny, nz] = face.normal
      if (grid.get(x + nx, y + ny, z + nz)) continue
      const base = positions.length / 3
      for (const [cx, cy, cz] of face.corners) {
        positions.push((x + cx - px) * s, (y + cy - py) * s, (z + cz - pz) * s)
        normals.push(nx, ny, nz)
        colors.push(color.r, color.g, color.b)
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  })

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3))
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.setIndex(indices)
  geometry.computeBoundingSphere()
  return geometry
}

let sharedMaterial: THREE.MeshToonMaterial | null = null

/** 모든 복셀 모델이 함께 쓰는 셀 셰이딩 재질 (색은 정점 색으로 들어간다) */
export function voxelMaterial(): THREE.MeshToonMaterial {
  if (!sharedMaterial) {
    sharedMaterial = toonMaterial(0xffffff)
    sharedMaterial.vertexColors = true
  }
  return sharedMaterial
}

/** 복셀 격자로 그림자를 드리우는 메시를 만든다. */
export function voxelMesh(grid: VoxelGrid, options: MeshOptions, material: THREE.Material = voxelMaterial()): THREE.Mesh {
  const mesh = new THREE.Mesh(buildVoxelGeometry(grid, options), material)
  mesh.castShadow = true
  mesh.receiveShadow = true
  return mesh
}

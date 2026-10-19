import * as THREE from 'three'

import { toonMaterial } from '../render/toon'
import type { VoxelGrid } from './VoxelGrid'

export interface MeshOptions {
  /** 한 칸의 크기 (미터) */
  voxelSize: number
  /** 원점으로 삼을 격자 좌표 (칸 단위, 소수 가능). 기본은 바닥 가운데. */
  pivot?: [number, number, number]
}

/**
 * 복셀 격자를 메시용 지오메트리로 바꾼다.
 * 옆 칸이 차 있는 면은 보이지 않으므로 그리지 않는다.
 * 같은 평면에 붙은 같은 색 면은 큰 사각형 하나로 합친다(greedy meshing, E9 성능). 색은 정점 색이라 모양과 빛은 그대로다.
 */
export function buildVoxelGeometry(grid: VoxelGrid, options: MeshOptions): THREE.BufferGeometry {
  const { voxelSize: s } = options
  const [px, py, pz] = options.pivot ?? [grid.sizeX / 2, 0, grid.sizeZ / 2]
  const positions: number[] = []
  const normals: number[] = []
  const colors: number[] = []
  const indices: number[] = []
  const color = new THREE.Color()
  const size = [grid.sizeX, grid.sizeY, grid.sizeZ]
  const pivot = [px, py, pz]
  // 칸 번호 = x + y·sizeX + z·sizeX·sizeY
  const stride = [1, grid.sizeX, grid.sizeX * grid.sizeY]
  const cells = grid.cells

  // 축 d에 수직인 면들. u·v는 그 평면의 두 축이고 (u × v = +d), 면은 d의 + 또는 − 쪽을 본다
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3
    const v = (d + 2) % 3
    const su = size[u]!
    const sv = size[v]!
    const sd = size[d]!
    const [du, dv, dd] = [stride[u]!, stride[v]!, stride[d]!]
    const mask = new Uint8Array(su * sv)
    for (const sign of [1, -1]) {
      for (let i = 0; i < sd; i++) {
        // 이 판에서 보이는 면: 칸이 차 있고 그쪽 옆 칸이 비었다 (격자 밖은 빈칸)
        const edge = i + sign < 0 || i + sign >= sd
        for (let b = 0; b < sv; b++) {
          let index = i * dd + b * dv
          for (let a = 0; a < su; a++, index += du) {
            const here = cells[index]!
            mask[b * su + a] = here && (edge || !cells[index + sign * dd]) ? here : 0
          }
        }
        // 같은 색끼리 가장 큰 사각형으로 묶는다
        for (let b = 0; b < sv; b++) {
          for (let a = 0; a < su; ) {
            const c = mask[b * su + a]!
            if (!c) {
              a++
              continue
            }
            let w = 1
            while (a + w < su && mask[b * su + a + w] === c) w++
            let h = 1
            grow: while (b + h < sv) {
              for (let k = 0; k < w; k++) if (mask[(b + h) * su + a + k] !== c) break grow
              h++
            }
            for (let y = 0; y < h; y++) mask.fill(0, (b + y) * su + a, (b + y) * su + a + w)
            const plane = i + (sign > 0 ? 1 : 0)
            const corners: [number, number][] = [
              [a, b],
              [a + w, b],
              [a + w, b + h],
              [a, b + h],
            ]
            if (sign < 0) corners.reverse()
            color.setHex(grid.palette[c]!)
            const base = positions.length / 3
            const corner = [0, 0, 0]
            const normal = [0, 0, 0]
            normal[d] = sign
            for (const [cu, cv] of corners) {
              corner[d] = plane
              corner[u] = cu
              corner[v] = cv
              positions.push((corner[0]! - pivot[0]!) * s, (corner[1]! - pivot[1]!) * s, (corner[2]! - pivot[2]!) * s)
              normals.push(normal[0]!, normal[1]!, normal[2]!)
              colors.push(color.r, color.g, color.b)
            }
            indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
            a += w
          }
        }
      }
    }
  }

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

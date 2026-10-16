import * as THREE from 'three'

import { toonMaterial } from '../render/toon'
import { buildVoxelGeometry, voxelMaterial } from '../voxel/mesher'
import { VoxelGrid } from '../voxel/VoxelGrid'
import { createRng } from './rng'

/** 0~1 사이의 부드러운 값 노이즈 (사인파 합성). 같은 좌표면 항상 같은 값이 나온다. */
export function smoothNoise(x: number, z: number): number {
  const v =
    Math.sin(x * 0.21 + z * 0.13) * 0.5 +
    Math.sin(x * 0.07 - z * 0.19 + 1.7) * 0.3 +
    Math.sin(x * 0.43 + z * 0.37 + 4.1) * 0.2
  return v * 0.5 + 0.5
}

/** 얼어붙은 연못 자리. 이 주변은 땅을 평평하게 다진다. */
export const POND = { x: 9, z: -6, radius: 4 }

function rawHeight(x: number, z: number): number {
  return (smoothNoise(x, z) - 0.5) * 0.5
}

/** 땅 높이. 걷는 데 지장이 없도록 아주 완만하게만 오르내린다. */
export function heightAt(x: number, z: number): number {
  const h = rawHeight(x, z)
  const d = Math.hypot(x - POND.x, z - POND.z)
  const flatten = 1 - Math.min(1, Math.max(0, (d - POND.radius) / 2.5))
  return h + (pondLevel() - h) * flatten
}

/** 연못 수면 높이 */
export function pondLevel(): number {
  return rawHeight(POND.x, POND.z) - 0.05
}

const COLORS = {
  snow: new THREE.Color(0xe6edf4),
  snowShade: new THREE.Color(0xc9d5e1),
  snowBlue: new THREE.Color(0xb7c8da),
  trampled: new THREE.Color(0xb9b7b3),
  earth: new THREE.Color(0x6f5f50),
  stone: new THREE.Color(0x868d98),
}

/** 땅 색을 칠하는 칸의 크기 (미터). 저해상도 화면에서 1~2픽셀 정도로 보인다. */
const GROUND_TEXEL = 0.5

/** 지점의 땅 색을 정한다. 색을 섞지 않고 단계로 끊어서 픽셀 아트처럼 또렷하게 만든다. */
function groundColorAt(x: number, z: number, jitter: number, out: THREE.Color): THREE.Color {
  const n = smoothNoise(x * 1.7 + 13, z * 1.7 - 7) + jitter
  out.copy(COLORS.snow)
  if (n < 0.28) out.copy(COLORS.snowBlue)
  else if (n < 0.42) out.copy(COLORS.snowShade)

  // 시작 지점에서 뻗어 나가는 다져진 길
  const pathDist = Math.abs(z - Math.sin(x * 0.12) * 6)
  if (pathDist < 1.1 + jitter * 3) out.copy(COLORS.trampled)

  // 드문드문 눈이 녹아 드러난 흙과 바위
  const bare = smoothNoise(x * 0.9 - 31, z * 0.9 + 17) + jitter
  if (bare > 0.955) out.copy(COLORS.earth)
  else if (bare > 0.93) out.copy(COLORS.stone)
  return out
}

/** 기복이 있는 눈밭. 색은 0.5미터 칸 단위로 칠한 저해상도 텍스처로 입힌다. */
export function buildGround(halfExtent: number, seed = 11): THREE.Mesh {
  const size = halfExtent * 2 + 8
  // 격자 한 칸이 1m를 넘으면 땅 표면이 heightAt과 어긋나 바닥에 붙인 표시(예고·이동 표시)가 묻힌다.
  const segments = Math.ceil(size / 0.8)
  const geometry = new THREE.PlaneGeometry(size, size, segments, segments)
  geometry.rotateX(-Math.PI / 2)
  const position = geometry.attributes.position!
  for (let i = 0; i < position.count; i++) {
    position.setY(i, heightAt(position.getX(i), position.getZ(i)))
  }
  geometry.computeVertexNormals()

  const texels = Math.ceil(size / GROUND_TEXEL)
  const data = new Uint8Array(texels * texels * 4)
  const rng = createRng(seed)
  const color = new THREE.Color()
  for (let row = 0; row < texels; row++) {
    for (let col = 0; col < texels; col++) {
      // 평면의 v 좌표는 z와 반대 방향이다.
      const x = (col + 0.5) * GROUND_TEXEL - size / 2
      const z = size / 2 - (row + 0.5) * GROUND_TEXEL
      groundColorAt(x, z, (rng() - 0.5) * 0.06, color)
      color.convertLinearToSRGB()
      const i = (row * texels + col) * 4
      data[i] = Math.round(color.r * 255)
      data[i + 1] = Math.round(color.g * 255)
      data[i + 2] = Math.round(color.b * 255)
      data[i + 3] = 255
    }
  }
  const texture = new THREE.DataTexture(data, texels, texels, THREE.RGBAFormat)
  texture.magFilter = THREE.NearestFilter
  texture.minFilter = THREE.NearestFilter
  texture.colorSpace = THREE.SRGBColorSpace
  texture.needsUpdate = true

  const material = toonMaterial(0xffffff)
  material.map = texture
  const ground = new THREE.Mesh(geometry, material)
  ground.receiveShadow = true
  return ground
}

/** 눈 사이로 삐져나온 마른 풀, 자갈 같은 잔디테일. 인스턴싱으로 한 번에 그린다. */
export function buildScatter(halfExtent: number, seed = 23): THREE.Group {
  const group = new THREE.Group()
  const rng = createRng(seed)
  const dummy = new THREE.Object3D()

  // 마른 풀 한 포기: 길이가 다른 잎 세 가닥 (칸 0.07m)
  const tuftGrid = new VoxelGrid(3, 6, 3)
  tuftGrid.box(0, 0, 0, 0, 3, 0, 0x7a7448)
  tuftGrid.box(1, 0, 1, 1, 5, 1, 0x8c8452)
  tuftGrid.box(2, 0, 2, 2, 2, 2, 0x6a6440)
  const tufts = new THREE.InstancedMesh(buildVoxelGeometry(tuftGrid, { voxelSize: 0.07 }), voxelMaterial(), 300)
  let t = 0
  while (t < tufts.count) {
    // 풀은 무리 지어 난다.
    const cx = (rng() * 2 - 1) * halfExtent
    const cz = (rng() * 2 - 1) * halfExtent
    const blades = 2 + Math.floor(rng() * 3)
    for (let b = 0; b < blades && t < tufts.count; b++, t++) {
      const x = cx + (rng() - 0.5) * 0.5
      const z = cz + (rng() - 0.5) * 0.5
      dummy.position.set(x, heightAt(x, z) - 0.05, z)
      dummy.rotation.set(0, Math.floor(rng() * 4) * (Math.PI / 2), 0)
      dummy.scale.setScalar(0.8 + rng() * 0.5)
      dummy.updateMatrix()
      tufts.setMatrixAt(t, dummy.matrix)
    }
  }
  tufts.castShadow = true
  group.add(tufts)

  const pebbleGrid = new VoxelGrid(2, 1, 2)
  pebbleGrid.box(0, 0, 0, 1, 0, 1, 0x8a909a)
  pebbleGrid.set(1, 0, 1, 0x6f7681)
  const pebbles = new THREE.InstancedMesh(buildVoxelGeometry(pebbleGrid, { voxelSize: 0.1 }), voxelMaterial(), 260)
  for (let i = 0; i < pebbles.count; i++) {
    const x = (rng() * 2 - 1) * halfExtent
    const z = (rng() * 2 - 1) * halfExtent
    dummy.position.set(x, heightAt(x, z) - 0.03, z)
    dummy.rotation.set(0, Math.floor(rng() * 4) * (Math.PI / 2), 0)
    dummy.scale.set(0.8 + rng() * 0.6, 1, 0.8 + rng() * 0.6)
    dummy.updateMatrix()
    pebbles.setMatrixAt(i, dummy.matrix)
  }
  pebbles.castShadow = true
  group.add(pebbles)
  return group
}

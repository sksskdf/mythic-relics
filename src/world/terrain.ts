import * as THREE from 'three'

import { toonMaterial } from '../render/toon'
import { buildVoxelGeometry, voxelMaterial } from '../voxel/mesher'
import { VoxelGrid } from '../voxel/VoxelGrid'
import { createRng } from './rng'
import type { ThemeDef } from './themes'

/** 0~1 사이의 부드러운 값 노이즈 (사인파 합성). 같은 좌표면 항상 같은 값이 나온다. */
export function smoothNoise(x: number, z: number): number {
  const v =
    Math.sin(x * 0.21 + z * 0.13) * 0.5 +
    Math.sin(x * 0.07 - z * 0.19 + 1.7) * 0.3 +
    Math.sin(x * 0.43 + z * 0.37 + 4.1) * 0.2
  return v * 0.5 + 0.5
}

export interface Pond {
  x: number
  z: number
  radius: number
}

/**
 * 지금 땅의 원점 (세계 좌표, E19 떠다니는 원점). 게임은 지역 안 좌표로 돌지만, 땅 높이와 땅 무늬는
 * 세계 좌표로 재서 이웃 땅과 경계에서 어긋나지 않게 한다.
 */
let originX = 0
let originZ = 0
/** 지금 지역의 얼어붙은 연못들 (세계 좌표). 이 주변은 땅을 평평하게 다진다. (지역을 바꿀 때 setPonds) */
let ponds: readonly Pond[] = [{ x: 9, z: -6, radius: 4 }]

/** 지금 땅의 원점(세계 좌표)을 바꾼다. 연못은 setPonds로 다시 넣는다 */
export function setTerrainOrigin(x: number, z: number): void {
  originX = x
  originZ = z
}

/** 지역을 바꾼다: 땅 높이가 이 지역의 연못(지역 안 좌표)을 따른다. */
export function setPonds(next: readonly Pond[]): void {
  ponds = next.map((p) => ({ x: p.x + originX, z: p.z + originZ, radius: p.radius }))
}

/** 다른 땅(이웃 조각)의 원점과 연못으로 잠깐 바꿔 fn을 돌린다. 끝나면 되돌린다 */
export function withTerrainFrame<T>(origin: { x: number; z: number }, localPonds: readonly Pond[], fn: () => T): T {
  const keep = { x: originX, z: originZ, ponds }
  setTerrainOrigin(origin.x, origin.z)
  setPonds(localPonds)
  try {
    return fn()
  } finally {
    originX = keep.x
    originZ = keep.z
    ponds = keep.ponds
  }
}

/** 세계 좌표의 기복 */
function worldHeight(wx: number, wz: number): number {
  return (smoothNoise(wx, wz) - 0.5) * 0.5
}

function rawHeight(x: number, z: number): number {
  return worldHeight(x + originX, z + originZ)
}

/** 땅 높이 (지역 안 좌표). 걷는 데 지장이 없도록 아주 완만하게만 오르내린다. */
export function heightAt(x: number, z: number): number {
  let h = rawHeight(x, z)
  for (const pond of ponds) {
    const d = Math.hypot(x + originX - pond.x, z + originZ - pond.z)
    const flatten = 1 - Math.min(1, Math.max(0, (d - pond.radius) / 2.5))
    if (flatten > 0) h += (worldHeight(pond.x, pond.z) - 0.05 - h) * flatten
  }
  return h
}

/** 연못 수면 높이 (연못은 지역 안 좌표) */
export function pondLevel(pond: Pond): number {
  return rawHeight(pond.x, pond.z) - 0.05
}

/** 다져진 길: 점을 잇는 꺾은선과 폭 */
export interface GroundPath {
  points: readonly { x: number; z: number }[]
  width: number
}

/** 점에서 꺾은선까지의 거리 */
function distanceToPath(x: number, z: number, path: GroundPath): number {
  let best = Infinity
  for (let i = 1; i < path.points.length; i++) {
    const a = path.points[i - 1]!
    const b = path.points[i]!
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / len2))
    best = Math.min(best, Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t)))
  }
  return best
}

interface GroundColors {
  base: THREE.Color
  shade: THREE.Color
  alt: THREE.Color
  path: THREE.Color
  earth: THREE.Color
  stone: THREE.Color
}

/** 땅을 나눠 그리는 네모의 크기 (미터, 대략). 화면 밖 네모는 그리지 않는다 */
const GROUND_TILE = 25

/** 땅 색을 칠하는 칸의 크기 (미터). 저해상도 화면에서 1~2픽셀 정도로 보인다. */
const GROUND_TEXEL = 0.5

/** 지점의 땅 색을 정한다. 색을 섞지 않고 단계로 끊어서 픽셀 아트처럼 또렷하게 만든다. */
/** 길과 그 둘레 네모 (멀리 떨어진 칸은 길까지 거리를 재지 않고 건너뛴다) */
interface PathBox {
  path: GroundPath
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

function pathBoxes(paths: readonly GroundPath[]): PathBox[] {
  return paths.map((path) => {
    const pad = path.width / 2 + 0.2
    const xs = path.points.map((p) => p.x)
    const zs = path.points.map((p) => p.z)
    return { path, minX: Math.min(...xs) - pad, maxX: Math.max(...xs) + pad, minZ: Math.min(...zs) - pad, maxZ: Math.max(...zs) + pad }
  })
}

function groundColorAt(x: number, z: number, jitter: number, colors: GroundColors, paths: readonly PathBox[], out: THREE.Color): THREE.Color {
  const n = smoothNoise((x + originX) * 1.7 + 13, (z + originZ) * 1.7 - 7) + jitter
  out.copy(colors.base)
  if (n < 0.28) out.copy(colors.alt)
  else if (n < 0.42) out.copy(colors.shade)

  // 다져진 길 (지역 데이터의 paths)
  for (const { path, minX, maxX, minZ, maxZ } of paths) {
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue
    if (distanceToPath(x, z, path) < path.width / 2 + jitter * 3) {
      out.copy(colors.path)
      break
    }
  }

  // 드문드문 드러난 흙과 바위
  const bare = smoothNoise((x + originX) * 0.9 - 31, (z + originZ) * 0.9 + 17) + jitter
  if (bare > 0.955) out.copy(colors.earth)
  else if (bare > 0.93) out.copy(colors.stone)
  return out
}

function groundColors(g: ThemeDef['ground']): GroundColors {
  return {
    base: new THREE.Color(g.base),
    shade: new THREE.Color(g.shade),
    alt: new THREE.Color(g.alt),
    path: new THREE.Color(g.path),
    earth: new THREE.Color(g.earth),
    stone: new THREE.Color(g.stone),
  }
}

/** 칸 경계에서 이웃 땅 얼굴이 섞여 드는 너비 (m, 한쪽) */
export const EDGE_BLEND = 8

/**
 * 칸 경계를 물결처럼 흔드는 값 (m, 대개 ±3, 많아야 ±EDGE_BLEND). 세계 좌표로 재므로 양쪽 칸이 같은 값을 본다.
 * 경계에서 depth만큼 들어온 점은 이 값이 depth보다 크면 이웃 얼굴이다 → 양쪽이 같은 물결 선을 경계로 삼는다.
 */
export function edgeWave(x: number, z: number): number {
  return (smoothNoise((x + originX) * 0.35 + 5, (z + originZ) * 0.35 - 11) - 0.5) * 2 * EDGE_BLEND
}

/** 땅 가장자리에서 섞을 이웃 땅 얼굴과, 경계에서 들어온 거리 (m). 섞지 않으면 null */
export type GroundBlend = (x: number, z: number) => { theme: ThemeDef; depth: number } | null

/**
 * 기복이 있는 땅. 색은 0.5미터 칸 단위로 칠한 저해상도 텍스처로 입힌다. 색과 길은 지역마다 다르다.
 * blend가 있으면 경계 둘레를 물결 선(edgeWave) 너머는 이웃 땅의 색으로 칠한다 (E19-03: 경계 이음매 섞기).
 */
export function buildGround(halfExtent: number, theme: ThemeDef, paths: readonly GroundPath[], seed = 11, blend?: GroundBlend): THREE.Group {
  const colors = groundColors(theme.ground)
  const others = new Map<ThemeDef, GroundColors>()
  const boxes = pathBoxes(paths)
  const size = halfExtent * 2 + 8
  const texels = Math.ceil(size / GROUND_TEXEL)
  const data = new Uint8Array(texels * texels * 4)
  const rng = createRng(seed)
  const color = new THREE.Color()
  for (let row = 0; row < texels; row++) {
    for (let col = 0; col < texels; col++) {
      // 평면의 v 좌표는 z와 반대 방향이다.
      const x = (col + 0.5) * GROUND_TEXEL - size / 2
      const z = size / 2 - (row + 0.5) * GROUND_TEXEL
      const jitter = (rng() - 0.5) * 0.06
      const mix = blend?.(x, z)
      let palette = colors
      if (mix && edgeWave(x, z) + (rng() - 0.5) * 1.5 > mix.depth) {
        palette = others.get(mix.theme) ?? groundColors(mix.theme.ground)
        others.set(mix.theme, palette)
      }
      groundColorAt(x, z, jitter, palette, boxes, color)
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
  // 땅을 GROUND_TILE 네모로 나눠, 화면 밖 네모는 그리지 않게 한다 (이웃 땅 바닥이 통째로 그려지지 않게, E19)
  const group = new THREE.Group()
  const tiles = Math.max(1, Math.round(size / GROUND_TILE))
  const tile = size / tiles
  // 격자 한 칸이 1m를 넘으면 땅 표면이 heightAt과 어긋나 바닥에 붙인 표시(예고·이동 표시)가 묻힌다.
  const segments = Math.ceil(tile / 0.8)
  for (let tz = 0; tz < tiles; tz++) {
    for (let tx = 0; tx < tiles; tx++) {
      const cx = -size / 2 + (tx + 0.5) * tile
      const cz = -size / 2 + (tz + 0.5) * tile
      const geometry = new THREE.PlaneGeometry(tile, tile, segments, segments)
      geometry.rotateX(-Math.PI / 2)
      geometry.translate(cx, 0, cz)
      const position = geometry.attributes.position!
      const normal = geometry.attributes.normal!
      const uv = geometry.attributes.uv!
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i)
        const z = position.getZ(i)
        position.setY(i, heightAt(x, z))
        // 기울기로 법선을 구한다: 네모·조각 경계에서도 빛이 끊기지 않는다
        const e = 0.25
        const nx = heightAt(x - e, z) - heightAt(x + e, z)
        const nz = heightAt(x, z - e) - heightAt(x, z + e)
        const len = Math.hypot(nx, 2 * e, nz)
        normal.setXYZ(i, nx / len, (2 * e) / len, nz / len)
        // 텍스처는 땅 전체에 한 장 (평면의 v는 z와 반대 방향)
        uv.setXY(i, (x + size / 2) / size, (size / 2 - z) / size)
      }
      const mesh = new THREE.Mesh(geometry, material)
      mesh.receiveShadow = true
      group.add(mesh)
    }
  }
  return group
}

/** 땅 사이로 삐져나온 풀, 자갈 같은 잔디테일. 인스턴싱으로 한 번에 그린다. 색은 테마를 따른다. */
export function buildScatter(halfExtent: number, theme: ThemeDef, seed = 23): THREE.Group {
  const [t0, t1, t2] = theme.scatter.tuft
  const [p0, p1] = theme.scatter.pebble
  const group = new THREE.Group()
  const rng = createRng(seed)
  const dummy = new THREE.Object3D()

  // 마른 풀 한 포기: 길이가 다른 잎 세 가닥 (칸 0.07m)
  const tuftGrid = new VoxelGrid(3, 6, 3)
  tuftGrid.box(0, 0, 0, 0, 3, 0, t0)
  tuftGrid.box(1, 0, 1, 1, 5, 1, t1)
  tuftGrid.box(2, 0, 2, 2, 2, 2, t2)
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
  pebbleGrid.box(0, 0, 0, 1, 0, 1, p0)
  pebbleGrid.set(1, 0, 1, p1)
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

import * as THREE from 'three'

import { toonMaterial } from '../render/toon'
import { buildVoxelGeometry, voxelMaterial, voxelMesh } from '../voxel/mesher'
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

/** 땅 위의 한 점 (지역 안 좌표) */
export interface LandSpot {
  x: number
  z: number
}

/**
 * 계단 (E24-07): 아랫땅의 발치(from)에서 계단식 땅의 윗면(to)까지 너비 width의 비탈.
 * 걷는 높이는 발치에서 윗면까지 고르게 오르고, 모습은 0.25m 단마다 끊긴 돌계단이다
 */
export interface Stair {
  from: LandSpot
  to: LandSpot
  width: number
}

/** 계단식 땅 (E24-07): 둘레보다 높은 평평한 땅. 테두리는 절벽이라 계단으로만 오르내린다 */
export interface Terrace {
  /** 테두리 꼭짓점 (지역 안 좌표) */
  points: readonly LandSpot[]
  /** 윗면 높이 (m, TERRACE_STEP의 배수) */
  height: number
  stairs: readonly Stair[]
}

/** 땅 모양: 얼어붙은 연못과 계단식 땅 (지역 데이터에서 온다) */
export interface Land {
  ponds: readonly Pond[]
  terraces: readonly Terrace[]
}

/** 아무것도 없는 평평한 땅 (빈 칸의 숲) */
export const FLAT_LAND: Land = { ponds: [], terraces: [] }

/** 계단식 땅의 높이 단위 (m): 땅 복셀 한 칸 */
export const TERRACE_STEP = 0.5
/** 이만큼 넘게 높이가 갈리면 절벽이다 (m) */
const CLIFF_MIN = 0.4

/** 세계 좌표로 옮겨 둔 계단식 땅 (점 안에 드는지 빨리 보려고 네모를 함께 둔다) */
interface PlacedTerrace {
  xs: number[]
  zs: number[]
  height: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** 세계 좌표로 옮겨 둔 계단: 발치 a, 오르는 방향(단위), 길이, 반너비, 발치와 윗면 높이 */
interface PlacedStair {
  ax: number
  az: number
  dx: number
  dz: number
  len: number
  half: number
  low: number
  high: number
}

/**
 * 지금 땅의 원점 (세계 좌표, E19 떠다니는 원점). 게임은 지역 안 좌표로 돌지만, 땅 높이와 땅 무늬는
 * 세계 좌표로 재서 이웃 땅과 경계에서 어긋나지 않게 한다.
 */
let originX = 0
let originZ = 0
/** 지금 지역의 얼어붙은 연못들 (세계 좌표). 이 주변은 땅을 평평하게 다진다. (지역을 바꿀 때 setLand) */
let ponds: readonly Pond[] = [{ x: 9, z: -6, radius: 4 }]
/** 지금 지역의 계단식 땅과 계단 (세계 좌표) */
let terraces: readonly PlacedTerrace[] = []
let stairs: readonly PlacedStair[] = []

/** 지금 땅의 원점(세계 좌표)을 바꾼다. 땅 모양은 setLand로 다시 넣는다 */
export function setTerrainOrigin(x: number, z: number): void {
  originX = x
  originZ = z
}

/** 지역을 바꾼다: 땅 높이가 이 지역의 연못·계단식 땅(지역 안 좌표)을 따른다. */
export function setLand(land: Land): void {
  ponds = land.ponds.map((p) => ({ x: p.x + originX, z: p.z + originZ, radius: p.radius }))
  terraces = land.terraces.map((t) => {
    const xs = t.points.map((p) => p.x + originX)
    const zs = t.points.map((p) => p.z + originZ)
    return { xs, zs, height: t.height, minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
  })
  stairs = land.terraces.flatMap((t) =>
    t.stairs.map((s) => {
      const ax = s.from.x + originX
      const az = s.from.z + originZ
      const len = Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z) || 1
      const dx = (s.to.x - s.from.x) / len
      const dz = (s.to.z - s.from.z) / len
      return { ax, az, dx, dz, len, half: s.width / 2, low: levelWorld(ax, az), high: levelWorld(s.to.x + originX, s.to.z + originZ) }
    }),
  )
}

/** 다른 땅(이웃 조각)의 원점과 땅 모양으로 잠깐 바꿔 fn을 돌린다. 끝나면 되돌린다 */
export function withTerrainFrame<T>(origin: { x: number; z: number }, land: Land, fn: () => T): T {
  const keep = { x: originX, z: originZ, ponds, terraces, stairs }
  setTerrainOrigin(origin.x, origin.z)
  setLand(land)
  try {
    return fn()
  } finally {
    originX = keep.x
    originZ = keep.z
    ponds = keep.ponds
    terraces = keep.terraces
    stairs = keep.stairs
  }
}

/** 세계 좌표의 기복 */
function worldHeight(wx: number, wz: number): number {
  return (smoothNoise(wx, wz) - 0.5) * 0.5
}

/** 세계 좌표의 바탕 땅 높이: 기복과 연못 둘레 다짐 (계단식 땅은 빼고) */
function baseWorld(wx: number, wz: number): number {
  let h = worldHeight(wx, wz)
  for (const pond of ponds) {
    const d = Math.hypot(wx - pond.x, wz - pond.z)
    const flatten = 1 - Math.min(1, Math.max(0, (d - pond.radius) / 2.5))
    if (flatten > 0) h += (worldHeight(pond.x, pond.z) - 0.05 - h) * flatten
  }
  return h
}

/** 점이 꺾은선으로 둘러싼 땅 안에 있나 (짝홀 규칙) */
function insidePolygon(xs: readonly number[], zs: readonly number[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = xs.length - 1; i < xs.length; j = i++) {
    if (zs[i]! > z !== zs[j]! > z && x < ((xs[j]! - xs[i]!) * (z - zs[i]!)) / (zs[j]! - zs[i]!) + xs[i]!) inside = !inside
  }
  return inside
}

/** 세계 좌표의 계단식 땅 높이 (겹치면 높은 것). 계단식 땅 밖이면 -Infinity */
function terraceWorld(wx: number, wz: number): number {
  let best = -Infinity
  for (const t of terraces) {
    if (t.height <= best || wx < t.minX || wx > t.maxX || wz < t.minZ || wz > t.maxZ) continue
    if (insidePolygon(t.xs, t.zs, wx, wz)) best = t.height
  }
  return best
}

/** 계단을 빼고 본 높이: 바탕 땅과 계단식 땅 가운데 높은 것 */
function levelWorld(wx: number, wz: number): number {
  return Math.max(baseWorld(wx, wz), terraceWorld(wx, wz))
}

/** 세계 좌표가 계단 위면 그 계단과 오른 정도(0 발치 ~ 1 윗면), 아니면 null */
function stairAtWorld(wx: number, wz: number): { stair: PlacedStair; t: number } | null {
  for (const s of stairs) {
    const px = wx - s.ax
    const pz = wz - s.az
    const along = px * s.dx + pz * s.dz
    if (along < 0 || along > s.len || Math.abs(px * s.dz - pz * s.dx) > s.half) continue
    return { stair: s, t: along / s.len }
  }
  return null
}

/** 땅 높이 (지역 안 좌표). 바탕 땅은 아주 완만하게만 오르내리고, 계단식 땅은 평평한 윗면, 계단은 고른 비탈이다. */
export function heightAt(x: number, z: number): number {
  const wx = x + originX
  const wz = z + originZ
  if (stairs.length > 0) {
    const on = stairAtWorld(wx, wz)
    if (on) return on.stair.low + (on.stair.high - on.stair.low) * on.t
  }
  return terraces.length > 0 ? levelWorld(wx, wz) : baseWorld(wx, wz)
}

/** 바탕 땅 높이 (지역 안 좌표): 계단식 땅과 계단을 뺀 높이. 바닥 판을 이것으로 깔고 그 위에 계단식 땅을 쌓는다 */
export function baseHeightAt(x: number, z: number): number {
  return baseWorld(x + originX, z + originZ)
}

/** 계단 위인가 (지역 안 좌표). 풀·자갈은 계단에 두지 않는다 */
export function onStairs(x: number, z: number): boolean {
  return stairs.length > 0 && stairAtWorld(x + originX, z + originZ) !== null
}

/** 지금 땅에서 가장 높은 계단식 땅 (m). 없으면 0: 화면 → 땅 찾기가 평면 하나로 끝난다 */
export function highestLand(): number {
  return terraces.reduce((m, t) => Math.max(m, t.height), 0)
}

/**
 * 광선이 처음 닿는 땅 (지역 안 좌표). 계단식 땅이 있으면 위에서부터 걸음을 나눠 내려가며 찾는다.
 * 광선은 위에서 아래로 향해야 한다 (쿼터뷰 카메라). 땅과 만나지 않으면 null
 */
export function rayToLand<T extends { x: number; y: number; z: number }>(origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, out: T): T | null {
  if (dir.y >= 0) return null
  const top = highestLand() + 0.5
  // 높이 top에서 시작해 0.1m씩 (광선 길이로) 내려가며 땅 밑으로 들어가는 첫 걸음을 찾고, 그 걸음 안을 반으로 나눠 좁힌다
  let t = (origin.y - top) / -dir.y
  const step = 0.1 / Math.hypot(dir.x, dir.y, dir.z)
  const below = (tt: number) => origin.y + dir.y * tt <= heightAt(origin.x + dir.x * tt, origin.z + dir.z * tt)
  const end = (origin.y + 1) / -dir.y
  while (t < end && !below(t + step)) t += step
  let lo = t
  let hi = t + step
  for (let i = 0; i < 8; i++) {
    const mid = (lo + hi) / 2
    if (below(mid)) hi = mid
    else lo = mid
  }
  out.x = origin.x + dir.x * hi
  out.z = origin.z + dir.z * hi
  out.y = heightAt(out.x, out.z)
  return out
}

/**
 * 계단식 땅의 절벽을 막는 둥근 충돌 (지역 안 좌표, 0.5m마다). 계단이 지나는 곳과 높이가 같은 땅끼리 맞닿은 곳은 트여 있다.
 * 지금 땅 모양(setLand)을 기준으로 잰다
 */
export function cliffColliders(land: Land): { x: number; z: number; radius: number }[] {
  const out: { x: number; z: number; radius: number }[] = []
  for (const t of land.terraces) {
    const n = t.points.length
    for (let i = 0; i < n; i++) {
      const a = t.points[i]!
      const b = t.points[(i + 1) % n]!
      const len = Math.hypot(b.x - a.x, b.z - a.z)
      if (len === 0) continue
      // 변에 수직인 방향: 양쪽 땅 높이를 견준다
      const nx = (b.z - a.z) / len
      const nz = -(b.x - a.x) / len
      const count = Math.max(1, Math.round(len / 0.5))
      for (let k = 0; k <= count; k++) {
        const x = a.x + ((b.x - a.x) * k) / count
        const z = a.z + ((b.z - a.z) * k) / count
        if (onStairs(x, z) || onStairs(x + nx * 0.4, z + nz * 0.4) || onStairs(x - nx * 0.4, z - nz * 0.4)) continue
        const one = levelWorld(x + nx * 0.3 + originX, z + nz * 0.3 + originZ)
        const other = levelWorld(x - nx * 0.3 + originX, z - nz * 0.3 + originZ)
        if (Math.abs(one - other) < CLIFF_MIN) continue
        out.push({ x, z, radius: 0.25 })
      }
    }
    // 계단 옆: 계단이 둘레 땅보다 높거나(발치 쪽, 땅 위로 솟은 단) 낮은 곳(윗끝 쪽, 계단식 땅을 파고든 홈)은 옆으로 오르내리지 못한다
    for (const stair of t.stairs) {
      const len = Math.hypot(stair.to.x - stair.from.x, stair.to.z - stair.from.z)
      if (len === 0) continue
      const dx = (stair.to.x - stair.from.x) / len
      const dz = (stair.to.z - stair.from.z) / len
      const side = stair.width / 2 + 0.25
      const count = Math.max(1, Math.round(len / 0.5))
      for (let k = 0; k <= count; k++) {
        const along = (len * k) / count
        const cx = stair.from.x + dx * along
        const cz = stair.from.z + dz * along
        const height = heightAt(cx, cz)
        for (const sign of [-1, 1]) {
          const x = cx + dz * side * sign
          const z = cz - dx * side * sign
          if (onStairs(x, z)) continue
          if (Math.abs(levelWorld(x + originX, z + originZ) - height) < CLIFF_MIN) continue
          out.push({ x, z, radius: 0.25 })
        }
      }
    }
  }
  return out
}

/** 연못 수면 높이 (연못은 지역 안 좌표) */
export function pondLevel(pond: Pond): number {
  return worldHeight(pond.x + originX, pond.z + originZ) - 0.05
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

/** 지점의 땅 색 이름. 색을 섞지 않고 단계로 끊어서 픽셀 아트처럼 또렷하게 만든다. */
function groundKindAt(x: number, z: number, jitter: number, paths: readonly PathBox[]): keyof GroundColors {
  const n = smoothNoise((x + originX) * 1.7 + 13, (z + originZ) * 1.7 - 7) + jitter
  let kind: keyof GroundColors = n < 0.28 ? 'alt' : n < 0.42 ? 'shade' : 'base'

  // 다져진 길 (지역 데이터의 paths)
  for (const { path, minX, maxX, minZ, maxZ } of paths) {
    if (x < minX || x > maxX || z < minZ || z > maxZ) continue
    if (distanceToPath(x, z, path) < path.width / 2 + jitter * 3) {
      kind = 'path'
      break
    }
  }

  // 드문드문 드러난 흙과 바위
  const bare = smoothNoise((x + originX) * 0.9 - 31, (z + originZ) * 0.9 + 17) + jitter
  if (bare > 0.955) kind = 'earth'
  else if (bare > 0.93) kind = 'stone'
  return kind
}

function groundColorAt(x: number, z: number, jitter: number, colors: GroundColors, paths: readonly PathBox[], out: THREE.Color): THREE.Color {
  return out.copy(colors[groundKindAt(x, z, jitter, paths)])
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
  const steps = groundSteps(halfExtent, theme, paths, seed, blend)
  for (;;) {
    const step = steps.next()
    if (step.done) return step.value
  }
}

/** 땅을 색 칠하기·네모 줄마다 나눠 짓는다 (이웃 조각을 프레임마다 조금씩 지을 때) */
export function* groundSteps(halfExtent: number, theme: ThemeDef, paths: readonly GroundPath[], seed = 11, blend?: GroundBlend): Generator<void, THREE.Group> {
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
  yield
  // 땅을 GROUND_TILE 네모로 나눠, 화면 밖 네모는 그리지 않게 한다 (이웃 땅 바닥이 통째로 그려지지 않게, E19)
  const group = new THREE.Group()
  const tiles = Math.max(1, Math.round(size / GROUND_TILE))
  const tile = size / tiles
  // 격자 한 칸이 1m를 넘으면 땅 표면이 heightAt과 어긋나 바닥에 붙인 표시(예고·이동 표시)가 묻힌다.
  // 바닥 판은 바탕 땅 높이로 깔고, 계단식 땅과 계단은 그 위에 복셀로 쌓는다 (buildTerraces)
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
      // 높이를 한 줄 넓게 재 두고 이웃 높이 차로 법선을 구한다: 네모·조각 경계에서도 빛이 끊기지 않는다
      const step = tile / segments
      const span = segments + 3
      const x0 = cx - tile / 2 - step
      const z0 = cz - tile / 2 - step
      const heights = new Float32Array(span * span)
      for (let j = 0; j < span; j++) for (let k = 0; k < span; k++) heights[j * span + k] = baseHeightAt(x0 + k * step, z0 + j * step)
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i)
        const z = position.getZ(i)
        const k = Math.round((x - x0) / step)
        const j = Math.round((z - z0) / step)
        position.setY(i, heights[j * span + k]!)
        const nx = heights[j * span + k - 1]! - heights[j * span + k + 1]!
        const nz = heights[(j - 1) * span + k]! - heights[(j + 1) * span + k]!
        const len = Math.hypot(nx, 2 * step, nz)
        normal.setXYZ(i, nx / len, (2 * step) / len, nz / len)
        // 텍스처는 땅 전체에 한 장 (평면의 v는 z와 반대 방향)
        uv.setXY(i, (x + size / 2) / size, (size / 2 - z) / size)
      }
      const mesh = new THREE.Mesh(geometry, material)
      mesh.receiveShadow = true
      group.add(mesh)
    }
    if (tz < tiles - 1) yield
  }
  return group
}

/** 절벽 옆면의 켜: 윗면 바로 아래는 흙, 그 아래는 돌과 짙은 돌이 번갈아 든다 */
function cliffColor(theme: ThemeDef, depth: number, x: number, z: number): number {
  const g = theme.ground
  if (depth < 0.6) return g.earth
  const band = Math.floor((depth + smoothNoise(x * 0.8, z * 0.8) * 0.6) / 0.5)
  return band % 3 === 2 ? g.shade : g.stone
}

/**
 * 계단식 땅과 계단 (E24-07): 바닥 판 위에 복셀로 쌓는다. 계단식 땅은 0.5m 기둥(윗면은 바닥과 같은 땅 색·길, 옆면은 흙과 돌 켜),
 * 계단은 0.25m 단의 돌계단. 지금 땅 모양(setLand)을 따른다. 계단식 땅이 없으면 null
 */
export function buildTerraces(land: Land, theme: ThemeDef, paths: readonly GroundPath[], seed = 11): THREE.Group | null {
  if (land.terraces.length === 0) return null
  const group = new THREE.Group()
  const boxes = pathBoxes(paths)
  const rng = createRng(seed + 101)
  const s = TERRACE_STEP
  const bottom = -1
  const xs = land.terraces.flatMap((t) => t.points.map((p) => p.x))
  const zs = land.terraces.flatMap((t) => t.points.map((p) => p.z))
  const minX = Math.floor(Math.min(...xs) / s) * s
  const minZ = Math.floor(Math.min(...zs) / s) * s
  const nx = Math.ceil((Math.max(...xs) - minX) / s) + 1
  const nz = Math.ceil((Math.max(...zs) - minZ) / s) + 1
  const top = Math.max(...land.terraces.map((t) => t.height))
  const grid = new VoxelGrid(nx, Math.ceil((top - bottom) / s), nz)
  for (let i = 0; i < nx; i++) {
    for (let k = 0; k < nz; k++) {
      const x = minX + (i + 0.5) * s
      const z = minZ + (k + 0.5) * s
      const level = terraceWorld(x + originX, z + originZ)
      if (level === -Infinity || onStairs(x, z)) continue
      const rows = Math.round((level - bottom) / s)
      const kind = groundKindAt(x, z, (rng() - 0.5) * 0.06, boxes)
      for (let j = 0; j < rows; j++) {
        const depth = level - (bottom + (j + 1) * s)
        grid.set(i, j, k, j === rows - 1 ? theme.ground[kind] : cliffColor(theme, depth, x, z))
      }
    }
  }
  const terraceMesh = voxelMesh(grid, { voxelSize: s, pivot: [0, 0, 0] })
  terraceMesh.position.set(minX, bottom, minZ)
  group.add(terraceMesh)

  // 계단: 0.25m 칸으로 발치에서 윗면까지, 단마다 위 모서리를 밝은 돌로
  const fine = 0.25
  for (const terrace of land.terraces) {
    for (const stair of terrace.stairs) {
      const half = stair.width / 2
      const corners = [-1, 1].flatMap((side) =>
        [stair.from, stair.to].map((p) => {
          const len = Math.hypot(stair.to.x - stair.from.x, stair.to.z - stair.from.z) || 1
          return { x: p.x + ((stair.to.z - stair.from.z) / len) * half * side, z: p.z - ((stair.to.x - stair.from.x) / len) * half * side }
        }),
      )
      const sx = Math.floor(Math.min(...corners.map((c) => c.x)) / fine) * fine
      const sz = Math.floor(Math.min(...corners.map((c) => c.z)) / fine) * fine
      const cx = Math.ceil((Math.max(...corners.map((c) => c.x)) - sx) / fine) + 1
      const cz = Math.ceil((Math.max(...corners.map((c) => c.z)) - sz) / fine) + 1
      const high = heightAt(stair.to.x, stair.to.z)
      const steps = new VoxelGrid(cx, Math.ceil((high - bottom) / fine) + 1, cz)
      for (let i = 0; i < cx; i++) {
        for (let k = 0; k < cz; k++) {
          const x = sx + (i + 0.5) * fine
          const z = sz + (k + 0.5) * fine
          if (!onStairs(x, z)) continue
          // 걷는 비탈 높이를 단 높이로 올려 끊는다 (발이 단 위에 서도록)
          const rows = Math.ceil((heightAt(x, z) - bottom) / fine)
          for (let j = 0; j < rows; j++) steps.set(i, j, k, j === rows - 1 ? theme.ground.stone : j === rows - 2 ? theme.ground.shade : theme.ground.earth)
        }
      }
      const stepMesh = voxelMesh(steps, { voxelSize: fine, pivot: [0, 0, 0] })
      stepMesh.position.set(sx, bottom, sz)
      group.add(stepMesh)
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
      // 계단 위에는 두지 않는다 (땅 밑에 묻어 둔다)
      dummy.position.set(x, onStairs(x, z) ? -5 : heightAt(x, z) - 0.05, z)
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
    dummy.position.set(x, onStairs(x, z) ? -5 : heightAt(x, z) - 0.03, z)
    dummy.rotation.set(0, Math.floor(rng() * 4) * (Math.PI / 2), 0)
    dummy.scale.set(0.8 + rng() * 0.6, 1, 0.8 + rng() * 0.6)
    dummy.updateMatrix()
    pebbles.setMatrixAt(i, dummy.matrix)
  }
  pebbles.castShadow = true
  group.add(pebbles)
  return group
}

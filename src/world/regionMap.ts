import * as THREE from 'three'

import { buildVoxelGeometry, voxelMaterial } from '../voxel/mesher'
import {
  brazier,
  bush,
  deadTree,
  flame,
  pineTree,
  PROP_COLORS,
  rock,
  ruin,
  runestone,
  runestoneGlyph,
  snowMound,
} from '../voxel/models/props'
import {
  bamboo,
  cairn,
  campfire,
  cherryTree,
  column,
  cypress,
  fence,
  house,
  jangseung,
  lanternGlow,
  mapleTree,
  oliveTree,
  peachTree,
  spire,
  stoneLantern,
  torii,
  well,
} from '../voxel/models/landmarks'
import type { VoxelGrid } from '../voxel/VoxelGrid'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { toonMaterial } from '../render/toon'
import type { CircleCollider } from './colliders'
import { exitColor, type PropKind, type PropPlacement, type RegionDef } from '../data/regions'
import { CELL, type Cell, cellOrigin, inRect, type Rect, rectDistance, type RegionLink } from '../data/world'
import { createRng } from './rng'
import { buildGround, buildScatter, EDGE_BLEND, edgeWave, type GroundBlend, heightAt, type Pond, pondLevel, setPonds } from './terrain'
import { THEMES, type ThemeDef, type ThemeId } from './themes'

type Animator = (elapsed: number) => void

export interface Built {
  object: THREE.Object3D
  animate?: Animator
}

/** 소품마다 모양이 조금씩 다른 변형을 몇 개 만들어 두고 돌려 쓴다. */
const VARIANTS = 3

type VariantFactory = (variant: number, theme: ThemeId) => () => Built

/** 같은 모델을 테마 색으로 바꿔 칠한다 (팔레트만 바꾼다) */
function recolored(grid: VoxelGrid, theme: ThemeDef): VoxelGrid {
  for (let i = 1; i < grid.palette.length; i++) grid.palette[i] = theme.recolor[grid.palette[i]!] ?? grid.palette[i]!
  return grid
}

function cachedVoxel(make: (seed: number) => VoxelGrid, voxelSize: number): VariantFactory {
  const geometries = new Map<string, THREE.BufferGeometry>()
  return (variant, theme) => () => {
    const key = `${variant}|${theme}`
    let geometry = geometries.get(key)
    if (!geometry) {
      geometry = buildVoxelGeometry(recolored(make(variant * 101 + 17), THEMES[theme]), { voxelSize })
      geometries.set(key, geometry)
    }
    const mesh = new THREE.Mesh(geometry, voxelMaterial())
    return { object: mesh }
  }
}

/** 몸체와 빛나는 부분(빛을 받지 않고 스스로 빛남), 작은 불빛 */
function glowing(body: VoxelGrid, glow: VoxelGrid, voxelSize: number, light: { color: number; y: number; intensity: number }, phase: number): Built {
  const group = new THREE.Group()
  group.add(new THREE.Mesh(buildVoxelGeometry(body, { voxelSize }), voxelMaterial()))
  const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true })
  group.add(new THREE.Mesh(buildVoxelGeometry(glow, { voxelSize }), glowMaterial))
  const point = new THREE.PointLight(light.color, light.intensity, 5, 2)
  point.position.y = light.y
  group.add(point)
  const animate: Animator = (t) => {
    const pulse = 0.75 + Math.sin(t * 2.6 + phase) * 0.25
    glowMaterial.color.setScalar(0.7 + pulse * 0.3)
    point.intensity = light.intensity * pulse
  }
  return { object: own(group), animate }
}

function makeRunestone(variant: number): Built {
  const seed = variant * 37 + 5
  const group = new THREE.Group()
  group.add(new THREE.Mesh(buildVoxelGeometry(runestone(seed), { voxelSize: 0.12 }), voxelMaterial()))
  const glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true })
  const glyph = new THREE.Mesh(buildVoxelGeometry(runestoneGlyph(seed), { voxelSize: 0.12 }), glowMaterial)
  glyph.position.z = 0.005
  group.add(glyph)
  const light = new THREE.PointLight(PROP_COLORS.rune, 1.5, 4, 2)
  light.position.set(0, 1.1, 0.6)
  group.add(light)
  const phase = variant * 1.3
  const animate: Animator = (t) => {
    const pulse = 0.65 + Math.sin(t * 2.2 + phase) * 0.35
    glowMaterial.color.setScalar(0.6 + pulse * 0.4)
    light.intensity = 1 + pulse
  }
  return { object: own(group), animate }
}

function makeBrazier(variant: number, base: VoxelGrid = brazier(), flameY = 1.05): Built {
  const group = new THREE.Group()
  group.add(new THREE.Mesh(buildVoxelGeometry(base, { voxelSize: 0.1 }), voxelMaterial()))
  const flameMesh = new THREE.Mesh(buildVoxelGeometry(flame(), { voxelSize: 0.1 }), new THREE.MeshBasicMaterial({ vertexColors: true }))
  flameMesh.position.y = flameY
  group.add(flameMesh)
  const light = new THREE.PointLight(PROP_COLORS.fire, 4, 9, 1.6)
  light.position.y = 1.7
  group.add(light)
  const seed = variant * 2.1
  const animate: Animator = (t) => {
    const flicker = Math.sin(t * 13 + seed) * 0.5 + Math.sin(t * 7.3 + seed * 2) * 0.5
    flameMesh.scale.set(1 + flicker * 0.08, 1 + flicker * 0.2, 1 + flicker * 0.08)
    flameMesh.rotation.y = Math.round(t * 6) * (Math.PI / 2)
    light.intensity = 3.6 + flicker * 0.8
  }
  return { object: own(group), animate }
}

export const BUILDERS: Record<PropKind, VariantFactory> = {
  pine: cachedVoxel(pineTree, 0.2),
  rock: cachedVoxel(rock, 0.15),
  mound: cachedVoxel(snowMound, 0.2),
  ruin: cachedVoxel(ruin, 0.15),
  deadTree: cachedVoxel(deadTree, 0.12),
  bush: cachedVoxel(bush, 0.12),
  runestone: (variant) => () => makeRunestone(variant),
  brazier: (variant) => () => makeBrazier(variant),
  olive: cachedVoxel(oliveTree, 0.15),
  cypress: cachedVoxel(cypress, 0.15),
  column: cachedVoxel(column, 0.15),
  peach: cachedVoxel(peachTree, 0.12),
  spire: cachedVoxel(spire, 0.2),
  bamboo: cachedVoxel(bamboo, 0.1),
  cherry: cachedVoxel(cherryTree, 0.15),
  torii: cachedVoxel(() => torii(), 0.15),
  lantern: (variant) => () => glowing(stoneLantern(), lanternGlow(), 0.1, { color: 0xffd890, y: 1, intensity: 1.6 }, variant * 1.7),
  maple: cachedVoxel(mapleTree, 0.15),
  cairn: cachedVoxel(cairn, 0.12),
  jangseung: cachedVoxel(jangseung, 0.1),
  house: cachedVoxel(house, 0.2),
  campfire: (variant) => () => makeBrazier(variant, campfire(), 0.15),
  well: cachedVoxel(() => well(), 0.15),
  fence: cachedVoxel(() => fence(), 0.12),
}

/** 소품의 x축을 따라 늘어선 원들 (rotation.y만큼 돌아간 상태) */
function along(p: PropPlacement, offsets: readonly number[], radius: number): CircleCollider[] {
  const ax = Math.cos(p.rotation)
  const az = -Math.sin(p.rotation)
  return offsets.map((offset) => ({ x: p.x + ax * offset * p.size, z: p.z + az * offset * p.size, radius: radius * p.size }))
}

/** 소품 하나가 차지하는 충돌 영역. 둔덕·덤불은 밟고 지나갈 수 있어 충돌이 없다. */
export function collidersFor(p: PropPlacement): CircleCollider[] {
  const one = (radius: number) => [{ x: p.x, z: p.z, radius: radius * p.size }]
  switch (p.kind) {
    case 'pine':
      return one(0.75)
    case 'rock':
      return one(0.9)
    case 'deadTree':
      return one(0.3)
    case 'runestone':
      return one(0.5)
    case 'brazier':
      return one(0.45)
    case 'ruin':
      return along(p, [-1.1, 0, 1.1], 0.45)
    case 'olive':
      return one(0.6)
    case 'cypress':
      return one(0.45)
    case 'column':
      return one(0.6)
    case 'peach':
      return one(0.55)
    case 'spire':
      return one(1.1)
    case 'bamboo':
      return one(0.55)
    case 'cherry':
      return one(0.55)
    case 'torii':
      return along(p, [-1.05, 1.05], 0.3)
    case 'lantern':
      return one(0.4)
    case 'maple':
      return one(0.5)
    case 'cairn':
      return one(0.55)
    case 'jangseung':
      return one(0.35)
    case 'house':
      return along(p, [-1.5, -0.5, 0.5, 1.5], 1.25)
    case 'campfire':
      return one(0.6)
    case 'well':
      return one(0.85)
    case 'fence':
      return along(p, [-0.9, 0, 0.9], 0.3)
    case 'mound':
    case 'bush':
      return []
  }
}

function castAndReceive(object: THREE.Object3D): THREE.Object3D {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh && !(child.material instanceof THREE.MeshBasicMaterial)) {
      child.castShadow = true
      child.receiveShadow = true
    }
  })
  return object
}

function flatMesh(geometry: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, toonMaterial(color))
  m.position.set(x, y, z)
  return m
}

function buildPond(radius: number, water: ThemeDef['water']): THREE.Group {
  const pond = new THREE.Group()
  const ice = flatMesh(new THREE.CircleGeometry(radius, 20), water.surface)
  ice.rotation.x = -Math.PI / 2
  ice.receiveShadow = true
  pond.add(ice)
  const deep = flatMesh(new THREE.CircleGeometry(radius * 0.55, 16), water.deep, radius * 0.15, 0.01, -radius * 0.08)
  deep.rotation.x = -Math.PI / 2
  pond.add(deep)
  // 얼음 위의 금, 물이면 잔물결
  if (!water.frozen) {
    const ripple = new THREE.MeshBasicMaterial({ color: 0xe8f7ff, transparent: true, opacity: 0.6 })
    for (const [x, z, len] of [[-1, 0.6, 1.2], [1.1, -0.9, 0.9], [0.3, 1.5, 0.7]] as const) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(len, 0.01, 0.06), ripple)
      line.position.set(x * radius * 0.25, 0.02, z * radius * 0.25)
      pond.add(line)
    }
    return pond
  }
  const crackMaterial = new THREE.MeshBasicMaterial({ color: 0xe8f7ff })
  for (const [x, z, len, rot] of [[-1.2, 0.8, 1.6, 0.4], [1.4, -1.1, 1.2, -0.7], [0.2, 1.8, 0.9, 1.2]] as const) {
    const crack = new THREE.Mesh(new THREE.BoxGeometry(len, 0.01, 0.05), crackMaterial)
    crack.position.set(x, 0.02, z)
    crack.rotation.y = rot
    pond.add(crack)
  }
  return pond
}

/** 움직일 수 있는 범위 밖에 둘러치는 숲의 두께 (m) */
const BORDER_DEPTH = 30

/**
 * 맵 가장자리 밖을 빽빽한 숲과 바위로 둘러친다. 길을 막는 벽 역할이자, 축소했을 때 맵 끝을 가리는 배경이다.
 * 밖으로는 나갈 수 없으므로 충돌체는 두지 않는다.
 */
function buildBorder(seed: number, halfExtent: number, theme: ThemeId): THREE.Group {
  const group = new THREE.Group()
  const rng = createRng(seed * 31 + 5)
  const inner = halfExtent + 1
  const outer = halfExtent + BORDER_DEPTH - 2
  const kinds = THEMES[theme].border as readonly PropKind[]
  let placed = 0
  for (let tries = 0; placed < 420 && tries < 5000; tries++) {
    const x = (rng() * 2 - 1) * outer
    const z = (rng() * 2 - 1) * outer
    // 안쪽 사각형(움직일 수 있는 곳) 밖의 띠에만 둔다. 가장자리에 가까울수록 빽빽하게.
    const edge = Math.max(Math.abs(x), Math.abs(z))
    if (edge < inner) continue
    if (rng() > 1 - (edge - inner) / (outer - inner) * 0.5) continue
    const kind = kinds[Math.floor(rng() * kinds.length)]!
    const built = BUILDERS[kind](placed % VARIANTS, theme)()
    const prop = castAndReceive(built.object)
    prop.position.set(x, heightAt(x, z), z)
    prop.scale.multiplyScalar(0.9 + rng() * 0.6)
    prop.rotation.y = rng() * Math.PI * 2
    group.add(prop)
    placed += 1
  }
  return group
}

/** 숲 칸의 간격 (m). 칸마다 조금 흔들어 놓아 줄이 보이지 않게 한다 */
const FOREST_STEP = 2.1
/** 숲을 이만한 네모(m)로 나눠 그린다. 화면 밖 네모는 그리지 않는다 (시야 거르기) */
const FOREST_TILE = 10
/** 트인 땅에서 이 거리(m) 안의 숲 가장자리는 빽빽하게 심고 그림자를 드리운다. 그 안쪽 깊은 숲은 성기게, 크게, 그림자 없이 */
const FOREST_EDGE = 6

/**
 * 하나로 이어진 세계의 숲 (E19): 칸(한 변 CELL) 안에서 트인 땅 밖(depth > 0)을 나무로 채운다.
 * depth(x, z)는 트인 땅(움직일 수 있는 곳과 그 둘레)까지의 거리다. 칸마다 수천 그루라, 숲 네모(FOREST_TILE)와
 * 모양(종류·변형)마다 InstancedMesh 하나로 그린다. 충돌체는 없다 (움직일 수 있는 곳 밖이라).
 */
function buildForest(seed: number, theme: ThemeId, depth: (x: number, z: number) => number, mix: EdgeMix | null = null): THREE.Group {
  const group = new THREE.Group()
  const rng = createRng(seed * 31 + 5)
  const spots = new Map<string, THREE.Matrix4[]>()
  const dummy = new THREE.Object3D()
  const half = CELL / 2
  for (let x = -half + FOREST_STEP / 2; x < half; x += FOREST_STEP) {
    for (let z = -half + FOREST_STEP / 2; z < half; z += FOREST_STEP) {
      const px = x + (rng() - 0.5) * FOREST_STEP * 0.8
      const pz = z + (rng() - 0.5) * FOREST_STEP * 0.8
      // 칸 가장자리에서는 이웃 땅의 나무가 섞여 든다
      const edgeMix = mix?.(px, pz)
      const face = edgeMix && edgeWave(px, pz) + (rng() - 0.5) * 2 > edgeMix.depth ? edgeMix.theme : theme
      const kinds = THEMES[face].border as readonly PropKind[]
      const kind = kinds[Math.floor(rng() * kinds.length)]!
      const variant = Math.floor(rng() * VARIANTS)
      const skip = rng()
      const grow = rng()
      const d = depth(px, pz)
      if (d <= 0) continue
      const edge = d < FOREST_EDGE
      // 깊은 숲은 위에서 내려다보면 우듬지만 보이므로, 덜 심고 크게 키워 틈을 메운다
      if (skip < (edge ? 0.1 : 0.4)) continue
      dummy.position.set(px, heightAt(px, pz), pz)
      dummy.rotation.set(0, rng() * Math.PI * 2, 0)
      dummy.scale.setScalar(edge ? 0.9 + grow * 0.6 : 1.2 + grow * 0.6)
      dummy.updateMatrix()
      const key = `${face}|${kind}|${variant}|${edge ? 1 : 0}|${Math.floor((px + half) / FOREST_TILE)}|${Math.floor((pz + half) / FOREST_TILE)}`
      const list = spots.get(key) ?? []
      list.push(dummy.matrix.clone())
      spots.set(key, list)
    }
  }
  for (const [key, matrices] of spots) {
    const [face, kind, variant, edge] = key.split('|') as [ThemeId, PropKind, string, string]
    const mesh = BUILDERS[kind](Number(variant), face)().object
    if (!(mesh instanceof THREE.Mesh)) continue
    const trees = new THREE.InstancedMesh(mesh.geometry, mesh.material, matrices.length)
    matrices.forEach((m, i) => trees.setMatrixAt(i, m))
    trees.instanceMatrix.needsUpdate = true
    trees.computeBoundingSphere()
    trees.castShadow = edge === '1'
    trees.receiveShadow = true
    trees.userData.instanced = true
    group.add(trees)
  }
  return group
}

/** 칸 가장자리의 한 점: 가장 가까운 변 너머 이웃 땅 얼굴과, 그 변에서 들어온 거리 (m). 섞지 않으면 null */
type EdgeMix = (x: number, z: number) => { theme: ThemeId; depth: number } | null

/** 칸 자리마다의 땅 얼굴: 지역이 있으면 그 지역, 빈 칸이면 가장 가까운 지역 (어느 땅에서 보든 같은 얼굴) */
export function cellTheme(regions: Readonly<Record<string, RegionDef>>, cell: Cell): ThemeId {
  const o = cellOrigin(cell)
  let best: RegionDef | null = null
  let bestD = Infinity
  for (const r of Object.values(regions)) {
    if (!r.cell) continue
    const p = cellOrigin(r.cell)
    const d = Math.hypot(p.x - o.x, p.z - o.z)
    if (d < bestD - 1e-6 || (Math.abs(d - bestD) < 1e-6 && best && r.id < best.id)) {
      best = r
      bestD = d
    }
  }
  return best?.theme ?? 'snow'
}

/**
 * 칸 가장자리 섞기 (E19-03): 가장 가까운 변 너머 이웃 칸의 땅 얼굴. 경계를 물결 선(edgeWave)으로 흔들어,
 * 양쪽 칸이 같은 선을 경계로 삼으므로 일직선으로 끊기지 않고 덩어리져 넘어간다.
 */
function edgeMixer(cell: Cell, own: ThemeId, themeAt: (cell: Cell) => ThemeId): EdgeMix {
  const half = CELL / 2
  const cache = new Map<string, ThemeId>()
  const at = (c: Cell) => {
    const key = `${c.col},${c.row}`
    let t = cache.get(key)
    if (t === undefined) cache.set(key, (t = themeAt(c)))
    return t
  }
  return (x, z) => {
    const dx = half - Math.abs(x)
    const dz = half - Math.abs(z)
    const d = Math.min(dx, dz)
    if (d >= EDGE_BLEND) return null
    // 옆 칸은 같은 줄, 위아래 칸은 반 칸 어긋난 줄 (북쪽 = −z = 다음 줄)
    const next = dx <= dz ? { col: cell.col + Math.sign(x), row: cell.row } : { col: cell.col + (x < 0 ? -0.5 : 0.5), row: cell.row + (z < 0 ? 1 : -1) }
    const theme = at(next)
    if (theme === own) return null
    return { theme, depth: Math.max(0, d) }
  }
}

/** 땅 텍스처에 쓰는 모양으로 */
function groundMix(mix: EdgeMix | null): GroundBlend | undefined {
  if (!mix) return undefined
  return (x, z) => {
    const m = mix(x, z)
    return m && { theme: THEMES[m.theme], depth: m.depth }
  }
}

/** 숲까지의 거리: 트인 땅 네모들 가운데 가장 가까운 것까지 (안이면 0 이하) */
function openDepth(open: readonly Rect[]): (x: number, z: number) => number {
  return (x, z) => {
    let d = Infinity
    for (const r of open) d = Math.min(d, inRect(r, x, z) ? 0 : rectDistance(r, x, z))
    return d
  }
}

/** 소품 하나를 장면에 놓는다. (지도 편집기도 같은 것을 쓴다) */
export function placeProp(placement: PropPlacement, variant: number, theme: ThemeId = 'snow'): Built {
  const built = BUILDERS[placement.kind](variant % VARIANTS, theme)()
  const prop = castAndReceive(built.object)
  prop.position.set(placement.x, heightAt(placement.x, placement.z), placement.z)
  prop.scale.multiplyScalar(placement.size)
  prop.rotation.y = placement.rotation
  return built
}

/**
 * 땅 조각 하나 (E19): 지역 하나의 땅·숲·소품·문, 또는 지역이 없는 빈 칸의 숲.
 * 지역 조각은 그 지역의 지역 안 좌표로 짓고, 무대(Stage)가 칸 자리에 맞춰 옮겨 놓는다.
 */
export class Chunk {
  readonly group = new THREE.Group()
  readonly colliders: CircleCollider[] = []
  readonly animators: Animator[] = []

  constructor(
    readonly region: RegionDef | null,
    readonly cell: Cell | null,
  ) {}

  /** 불꽃, 룬 빛처럼 움직이는 것들을 갱신한다. */
  update(elapsed: number): void {
    for (const animate of this.animators) animate(elapsed)
  }

  /** 이 조각만 쓰던 것(땅·흩뿌림·연못·문·숲 인스턴스)을 GPU에서 내린다. 소품 모델은 조각끼리 함께 써서 남긴다 */
  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.InstancedMesh && o.userData.instanced) {
        o.dispose()
        return
      }
      if (!(o instanceof THREE.Mesh) || !o.userData.ownGeometry) return
      // 재질은 소품과 함께 쓰는 것이 있어 남기고, 땅 색 텍스처만 내린다
      o.geometry.dispose()
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) (m as THREE.MeshBasicMaterial).map?.dispose()
    })
    this.group.removeFromParent()
  }
}

/**
 * 지역 하나의 조각을 짓는다. 땅 높이는 지금 땅 원점(`setTerrainOrigin`) 기준이므로, 이웃 조각은 `withTerrainFrame` 안에서 짓는다.
 * links: 이 지역에서 이웃으로 가는 통로 (숲을 이 자리만 비운다). 세계 칸이 없는 균열 층은 예전처럼 네모 둘레를 숲으로 두른다.
 */
export function buildChunk(region: RegionDef, links: readonly RegionLink[] = [], themeAt?: (cell: Cell) => ThemeId): Chunk {
  return finish(chunkSteps(region, links, themeAt))
}

/** 조각 짓기를 끝까지 돌린다 */
function finish(steps: Generator<void, Chunk>): Chunk {
  for (;;) {
    const step = steps.next()
    if (step.done) return step.value
  }
}

/**
 * 조각을 땅·숲·소품 단계로 나눠 짓는다 (E19: 이웃 조각을 프레임마다 한 단계씩 지어 멈칫하지 않게).
 * 단계마다 땅 높이 원점이 이 조각의 것이어야 한다 (`withTerrainFrame` 안에서 next를 부른다).
 */
export function* chunkSteps(region: RegionDef, links: readonly RegionLink[] = [], themeAt?: (cell: Cell) => ThemeId): Generator<void, Chunk> {
  const chunk = new Chunk(region, region.cell)
  const theme = THEMES[region.theme]
  // 땅 높이가 이 지역의 연못을 따르게 한 뒤 땅과 소품을 놓는다
  setPonds(region.ponds)
  const half = region.halfExtent
  if (region.cell) {
    // 땅은 칸 전체를 덮어 이웃 칸의 땅과 맞닿는다. 움직일 수 있는 네모와 통로 밖은 빽빽한 숲. 가장자리는 이웃 얼굴과 섞는다
    const mix = themeAt ? edgeMixer(region.cell, region.theme, themeAt) : null
    chunk.group.add(own(buildGround(CELL / 2 - 4, theme, region.paths, undefined, groundMix(mix))))
    yield
    chunk.group.add(buildForest(region.seed, region.theme, openDepth(openRects(half, links)), mix))
    yield
  } else {
    // 땅은 움직일 수 있는 범위보다 넓게 깔아서, 멀리 축소해도 맵 끝이 허공으로 보이지 않게 한다.
    chunk.group.add(own(buildGround(half + BORDER_DEPTH, theme, region.paths)))
    chunk.group.add(buildBorder(region.seed, half, region.theme))
  }
  chunk.group.add(own(buildScatter(half, theme)))
  for (const pond of region.ponds) chunk.group.add(own(pondMesh(pond, theme)))
  region.props.forEach((placement, index) => {
    const built = placeProp(placement, index, region.theme)
    chunk.group.add(built.object)
    chunk.colliders.push(...collidersFor(placement))
    if (built.animate) chunk.animators.push(built.animate)
  })
  // 마을 사람은 비켜 간다
  for (const npc of region.npcs) chunk.colliders.push({ x: npc.x, z: npc.z, radius: 0.45 })
  // 출구: 통로 입구의 문과 갈 곳의 빛기둥 (글 없이 색으로 어디로 가는지 알린다)
  for (const exit of region.exits) {
    const gate = buildGate(exitColor(exit.to))
    own(gate.object)
    gate.object.position.set(exit.x, heightAt(exit.x, exit.z), exit.z)
    // 문은 지역 가운데를 바라본다
    gate.object.rotation.y = Math.atan2(-exit.x, -exit.z)
    chunk.group.add(gate.object)
    chunk.animators.push(gate.animate!)
  }
  return chunk
}

/**
 * 그 땅의 트인 땅 (지역 안 좌표): 움직일 수 있는 네모를 조금 넓힌 것과, 통로를 양옆으로 조금 넓힌 것.
 * 이 밖이 숲이다. 빈 칸의 숲도 이웃 땅의 이것을 옮겨 받아 가장자리를 맞춘다.
 */
export function openRects(halfExtent: number, links: readonly RegionLink[]): Rect[] {
  const h = halfExtent + 1.2
  return [
    { minX: -h, maxX: h, minZ: -h, maxZ: h },
    ...links.map(({ rect: r, axis }) =>
      axis === 'x' ? { ...r, minZ: r.minZ - 1.5, maxZ: r.maxZ + 1.5 } : { ...r, minX: r.minX - 1.5, maxX: r.maxX + 1.5 },
    ),
  ]
}

/** 지역이 없는 빈 칸: 그 칸 전체를 숲으로 채운다 (이웃 칸 사이를 메우고, 세계 끝을 가린다). open은 이웃 땅의 트인 땅 (이 칸 좌표) */
export function buildFillerChunk(cell: Cell, theme: ThemeId, open: readonly Rect[] = [], themeAt?: (cell: Cell) => ThemeId): Chunk {
  return finish(fillerSteps(cell, theme, open, themeAt))
}

/** 빈 칸 조각을 땅·숲 단계로 나눠 짓는다 */
export function* fillerSteps(cell: Cell, theme: ThemeId, open: readonly Rect[] = [], themeAt?: (cell: Cell) => ThemeId): Generator<void, Chunk> {
  const chunk = new Chunk(null, cell)
  setPonds([])
  const mix = themeAt ? edgeMixer(cell, theme, themeAt) : null
  chunk.group.add(own(buildGround(CELL / 2 - 4, THEMES[theme], [], undefined, groundMix(mix))))
  yield
  const seed = Math.round(cell.col * 2 + 1000) * 131 + Math.round(cell.row + 1000)
  chunk.group.add(buildForest(seed, theme, open.length ? openDepth(open) : () => Infinity, mix))
  return chunk
}

/**
 * 지금 땅의 맵 (E7-01, E19에서 조각을 받아 쓰게 바뀜). 지역을 바꾸거나 편집기로 고치면 load로 다시 짓고,
 * 걸어서 이웃 땅으로 넘어가면 이미 지어 둔 이웃 조각을 adopt로 넘겨받는다.
 * 같은 객체(group·colliders 배열)를 그대로 두고 속만 바꾸므로, 이것을 쥔 쪽은 다시 받아 갈 필요가 없다.
 */
export class RegionMap {
  readonly group = new THREE.Group()
  readonly colliders: CircleCollider[] = []
  region: RegionDef
  chunk: Chunk

  constructor(region: RegionDef, links: readonly RegionLink[] = [], themeAt?: (cell: Cell) => ThemeId) {
    this.region = region
    this.chunk = buildChunk(region, links, themeAt)
    this.take(this.chunk)
  }

  /** 그 지역의 조각을 새로 지어 지금 땅으로 삼는다 (앞 조각은 GPU에서 내린다) */
  load(region: RegionDef, links: readonly RegionLink[] = [], themeAt?: (cell: Cell) => ThemeId): void {
    this.chunk.dispose()
    this.take(buildChunk(region, links, themeAt))
  }

  /** 이미 지어 둔 조각(걸어 넘어간 이웃)을 지금 땅으로 삼는다. 앞 조각은 돌려준다 (무대가 이웃으로 둔다) */
  adopt(chunk: Chunk): Chunk {
    const previous = this.chunk
    previous.group.removeFromParent()
    this.take(chunk)
    return previous
  }

  private take(chunk: Chunk): void {
    this.chunk = chunk
    this.region = chunk.region!
    chunk.group.position.set(0, 0, 0)
    this.group.add(chunk.group)
    this.colliders.length = 0
    this.colliders.push(...chunk.colliders)
  }

  /** 불꽃, 룬 빛처럼 움직이는 것들을 갱신한다. */
  update(elapsed: number): void {
    this.chunk.update(elapsed)
  }
}

function pondMesh(pond: Pond, theme: ThemeDef): THREE.Group {
  const mesh = buildPond(pond.radius, theme.water)
  mesh.position.set(pond.x, pondLevel(pond) + 0.03, pond.z)
  return mesh
}

/** 이 지역만 쓰는 것으로 표시한다 (지역을 바꿀 때 GPU에서 내린다) */
function own<T extends THREE.Object3D>(object: T): T {
  object.traverse((o) => {
    if (o instanceof THREE.Mesh) o.userData.ownGeometry = true
  })
  return object
}

/** 출구 문: 나무 기둥 둘과 가로대, 갈 곳의 색 빛기둥과 바닥 고리 */
function buildGate(color: number): Built {
  const group = new THREE.Group()
  const wood = toonMaterial(0x6a4e34)
  for (const x of [-1.3, 1.3]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.6, 0.3), wood)
    post.position.set(x, 1.3, 0)
    post.castShadow = true
    group.add(post)
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.3, 0.35), wood)
  beam.position.y = 2.6
  beam.castShadow = true
  group.add(beam)
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.06), toonMaterial(color))
  banner.position.set(0, 2.05, 0.05)
  group.add(banner)
  const lightMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide })
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 7, 8, 1, true), lightMaterial)
  pillar.position.y = 3.5
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.4, 24), lightMaterial)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.05
  for (const mesh of [pillar, ring]) {
    mesh.layers.set(EFFECT_LAYER)
    mesh.renderOrder = 12
    group.add(mesh)
  }
  const animate: Animator = (t) => {
    lightMaterial.opacity = 0.2 + Math.sin(t * 2.4) * 0.08
  }
  return { object: group, animate }
}

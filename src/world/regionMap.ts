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
import { createRng } from './rng'
import { buildGround, buildScatter, heightAt, type Pond, pondLevel, setPonds } from './terrain'
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
  return { object: group, animate }
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
  return { object: group, animate }
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
  return { object: group, animate }
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
 * 지금 지역의 맵 (E7-01). 지역을 바꾸거나 편집기로 고치면 load로 다시 짓는다.
 * 같은 객체(group·colliders 배열)를 그대로 두고 속만 바꾸므로, 이것을 쥔 쪽은 다시 받아 갈 필요가 없다.
 */
export class RegionMap {
  readonly group = new THREE.Group()
  readonly colliders: CircleCollider[] = []
  region: RegionDef
  private animators: Animator[] = []

  constructor(region: RegionDef) {
    this.region = region
    this.load(region)
  }

  load(region: RegionDef): void {
    this.region = region
    const theme = THEMES[region.theme]
    // 땅 높이가 이 지역의 연못을 따르게 한 뒤 땅과 소품을 놓는다
    setPonds(region.ponds)
    for (const child of [...this.group.children]) this.group.remove(child)
    this.colliders.length = 0
    this.animators = []
    const half = region.halfExtent
    // 땅은 움직일 수 있는 범위보다 넓게 깔아서, 멀리 축소해도 맵 끝이 허공으로 보이지 않게 한다.
    this.group.add(buildGround(half + BORDER_DEPTH, theme, region.paths))
    this.group.add(buildBorder(region.seed, half, region.theme))
    this.group.add(buildScatter(half, theme))
    for (const pond of region.ponds) this.group.add(pondMesh(pond, theme))
    region.props.forEach((placement, index) => {
      const built = placeProp(placement, index, region.theme)
      this.group.add(built.object)
      this.colliders.push(...collidersFor(placement))
      if (built.animate) this.animators.push(built.animate)
    })
    // 마을 사람은 비켜 간다
    for (const npc of region.npcs) this.colliders.push({ x: npc.x, z: npc.z, radius: 0.45 })
    // 출구: 길 끝의 문과 갈 곳의 빛기둥 (글 없이 색으로 어디로 가는지 알린다)
    for (const exit of region.exits) {
      const gate = buildGate(exitColor(exit.to))
      gate.object.position.set(exit.x, heightAt(exit.x, exit.z), exit.z)
      // 문은 지역 가운데를 바라본다
      gate.object.rotation.y = Math.atan2(-exit.x, -exit.z)
      this.group.add(gate.object)
      this.animators.push(gate.animate!)
    }
  }

  /** 불꽃, 룬 빛처럼 움직이는 것들을 갱신한다. */
  update(elapsed: number): void {
    for (const animate of this.animators) animate(elapsed)
  }
}

function pondMesh(pond: Pond, theme: ThemeDef): THREE.Group {
  const mesh = buildPond(pond.radius, theme.water)
  mesh.position.set(pond.x, pondLevel(pond) + 0.03, pond.z)
  return mesh
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

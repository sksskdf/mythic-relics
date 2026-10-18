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
import type { VoxelGrid } from '../voxel/VoxelGrid'
import { toonMaterial } from '../render/toon'
import type { CircleCollider } from './colliders'
import type { PropPlacement, RegionDef } from '../data/regions'
import { createRng } from './rng'
import { buildGround, buildScatter, heightAt, type Pond, pondLevel, setPonds } from './terrain'

type Animator = (elapsed: number) => void

export interface Built {
  object: THREE.Object3D
  animate?: Animator
}

/** 소품마다 모양이 조금씩 다른 변형을 몇 개 만들어 두고 돌려 쓴다. */
const VARIANTS = 3

type VariantFactory = (variant: number) => () => Built

function cachedVoxel(make: (seed: number) => VoxelGrid, voxelSize: number): VariantFactory {
  const geometries = new Map<number, THREE.BufferGeometry>()
  return (variant) => () => {
    let geometry = geometries.get(variant)
    if (!geometry) {
      geometry = buildVoxelGeometry(make(variant * 101 + 17), { voxelSize })
      geometries.set(variant, geometry)
    }
    const mesh = new THREE.Mesh(geometry, voxelMaterial())
    return { object: mesh }
  }
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

function makeBrazier(variant: number): Built {
  const group = new THREE.Group()
  group.add(new THREE.Mesh(buildVoxelGeometry(brazier(), { voxelSize: 0.1 }), voxelMaterial()))
  const flameMesh = new THREE.Mesh(buildVoxelGeometry(flame(), { voxelSize: 0.1 }), new THREE.MeshBasicMaterial({ vertexColors: true }))
  flameMesh.position.y = 1.05
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

export const BUILDERS: Record<PropPlacement['kind'], VariantFactory> = {
  pine: cachedVoxel(pineTree, 0.2),
  rock: cachedVoxel(rock, 0.15),
  mound: cachedVoxel(snowMound, 0.2),
  ruin: cachedVoxel(ruin, 0.15),
  deadTree: cachedVoxel(deadTree, 0.12),
  bush: cachedVoxel(bush, 0.12),
  runestone: (variant) => () => makeRunestone(variant),
  brazier: (variant) => () => makeBrazier(variant),
}

/** 소품 하나가 차지하는 충돌 영역. 눈 둔덕과 덤불은 밟고 지나갈 수 있어 충돌이 없다. */
export function collidersFor(p: PropPlacement): CircleCollider[] {
  switch (p.kind) {
    case 'pine':
      return [{ x: p.x, z: p.z, radius: 0.75 * p.size }]
    case 'rock':
      return [{ x: p.x, z: p.z, radius: 0.9 * p.size }]
    case 'deadTree':
      return [{ x: p.x, z: p.z, radius: 0.3 * p.size }]
    case 'runestone':
      return [{ x: p.x, z: p.z, radius: 0.5 * p.size }]
    case 'brazier':
      return [{ x: p.x, z: p.z, radius: 0.45 * p.size }]
    case 'ruin': {
      // 기둥 세 개가 소품의 x축 방향으로 늘어서 있다. (rotation.y 만큼 돌아간 상태)
      const ax = Math.cos(p.rotation)
      const az = -Math.sin(p.rotation)
      return [-1.1, 0, 1.1].map((offset) => ({
        x: p.x + ax * offset * p.size,
        z: p.z + az * offset * p.size,
        radius: 0.45 * p.size,
      }))
    }
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

const ICE = { ice: 0x86c3dc, deep: 0x5d9fbf }

function flatMesh(geometry: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, toonMaterial(color))
  m.position.set(x, y, z)
  return m
}

function buildPond(radius: number): THREE.Group {
  const pond = new THREE.Group()
  const ice = flatMesh(new THREE.CircleGeometry(radius, 20), ICE.ice)
  ice.rotation.x = -Math.PI / 2
  ice.receiveShadow = true
  pond.add(ice)
  const deep = flatMesh(new THREE.CircleGeometry(radius * 0.55, 16), ICE.deep, radius * 0.15, 0.01, -radius * 0.08)
  deep.rotation.x = -Math.PI / 2
  pond.add(deep)
  // 얼음 위의 반짝임과 금
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
function buildBorder(seed: number, halfExtent: number): THREE.Group {
  const group = new THREE.Group()
  const rng = createRng(seed * 31 + 5)
  const inner = halfExtent + 1
  const outer = halfExtent + BORDER_DEPTH - 2
  const kinds: PropPlacement['kind'][] = ['pine', 'pine', 'pine', 'pine', 'rock', 'deadTree', 'mound']
  let placed = 0
  for (let tries = 0; placed < 420 && tries < 5000; tries++) {
    const x = (rng() * 2 - 1) * outer
    const z = (rng() * 2 - 1) * outer
    // 안쪽 사각형(움직일 수 있는 곳) 밖의 띠에만 둔다. 가장자리에 가까울수록 빽빽하게.
    const edge = Math.max(Math.abs(x), Math.abs(z))
    if (edge < inner) continue
    if (rng() > 1 - (edge - inner) / (outer - inner) * 0.5) continue
    const kind = kinds[Math.floor(rng() * kinds.length)]!
    const built = BUILDERS[kind](placed % VARIANTS)()
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
export function placeProp(placement: PropPlacement, variant: number): Built {
  const built = BUILDERS[placement.kind](variant % VARIANTS)()
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
    // 땅 높이가 이 지역의 연못을 따르게 한 뒤 땅과 소품을 놓는다
    setPonds(region.ponds)
    for (const child of [...this.group.children]) this.group.remove(child)
    this.colliders.length = 0
    this.animators = []
    const half = region.halfExtent
    // 땅은 움직일 수 있는 범위보다 넓게 깔아서, 멀리 축소해도 맵 끝이 허공으로 보이지 않게 한다.
    this.group.add(buildGround(half + BORDER_DEPTH))
    this.group.add(buildBorder(region.seed, half))
    this.group.add(buildScatter(half))
    for (const pond of region.ponds) this.group.add(pondMesh(pond))
    region.props.forEach((placement, index) => {
      const built = placeProp(placement, index)
      this.group.add(built.object)
      this.colliders.push(...collidersFor(placement))
      if (built.animate) this.animators.push(built.animate)
    })
  }

  /** 불꽃, 룬 빛처럼 움직이는 것들을 갱신한다. */
  update(elapsed: number): void {
    for (const animate of this.animators) animate(elapsed)
  }
}

function pondMesh(pond: Pond): THREE.Group {
  const mesh = buildPond(pond.radius)
  mesh.position.set(pond.x, pondLevel(pond) + 0.03, pond.z)
  return mesh
}

import * as THREE from 'three'

import { toonMaterial } from '../render/toon'
import type { CircleCollider } from './colliders'
import { generateLayout, type PropPlacement } from './layout'
import { buildGround, buildScatter, heightAt, POND, pondLevel } from './terrain'

/** 플레이어가 움직일 수 있는 범위 (맵 한 변의 절반, 미터) */
export const MAP_HALF_EXTENT = 38

export interface TestMap {
  group: THREE.Group
  colliders: CircleCollider[]
  /** 불꽃, 룬 빛처럼 움직이는 것들을 갱신한다. */
  update(elapsed: number): void
}

const PALETTE = {
  snow: 0xeef3f8,
  snowShade: 0xcfdae5,
  ice: 0x86c3dc,
  iceDeep: 0x5d9fbf,
  rock: 0x7b8592,
  rockDark: 0x5c6470,
  pine: 0x2f5d4b,
  pineDark: 0x214438,
  trunk: 0x5b4636,
  deadWood: 0x6e5a4a,
  bush: 0x4a5e3c,
  berry: 0xb8343a,
  ruin: 0xa89f93,
  ruinDark: 0x857c71,
  rune: 0x6fe3ff,
  iron: 0x3d3a3a,
  fire: 0xffb347,
  fireCore: 0xfff1a8,
}

type Animator = (elapsed: number) => void

interface Built {
  object: THREE.Object3D
  animate?: Animator
}

function mesh(geometry: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geometry, toonMaterial(color))
  m.position.set(x, y, z)
  return m
}

function makePine(): Built {
  const tree = new THREE.Group()
  tree.add(mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.9, 6), PALETTE.trunk, 0, 0.45))
  const tiers: [number, number, number, number][] = [
    [1.15, 1.4, 1.2, PALETTE.pineDark],
    [0.9, 1.25, 1.9, PALETTE.pine],
    [0.62, 1.05, 2.6, PALETTE.pine],
    [0.36, 0.8, 3.2, PALETTE.pine],
  ]
  for (const [radius, height, y, color] of tiers) {
    tree.add(mesh(new THREE.ConeGeometry(radius, height, 7), color, 0, y))
    // 가지 위에 쌓인 눈
    const snow = mesh(new THREE.ConeGeometry(radius * 0.92, height * 0.32, 7), PALETTE.snow, 0, y + height * 0.12)
    snow.scale.y = 0.6
    tree.add(snow)
  }
  tree.add(mesh(new THREE.ConeGeometry(0.2, 0.3, 6), PALETTE.snow, 0, 3.7))
  return { object: tree }
}

function makeDeadTree(): Built {
  const tree = new THREE.Group()
  tree.add(mesh(new THREE.CylinderGeometry(0.1, 0.2, 2.2, 5), PALETTE.deadWood, 0, 1.1))
  const branches: [number, number, number, number][] = [
    [0.6, 1.4, 0.9, 0.5],
    [-0.5, 1.8, -0.8, 0.45],
    [0.3, 2.1, 0.6, -0.9],
  ]
  for (const [tilt, y, len, yaw] of branches) {
    const b = mesh(new THREE.CylinderGeometry(0.04, 0.07, len, 4), PALETTE.deadWood)
    b.position.y = y
    b.rotation.set(0, yaw, tilt)
    b.translateY(len / 2)
    tree.add(b)
  }
  return { object: tree }
}

function makeRock(): Built {
  const group = new THREE.Group()
  const big = mesh(new THREE.DodecahedronGeometry(0.7, 0), PALETTE.rock, 0, 0.25)
  big.scale.set(1.25, 0.8, 1)
  big.rotation.set(0.3, 0.5, 0.1)
  group.add(big)
  const small = mesh(new THREE.DodecahedronGeometry(0.32, 0), PALETTE.rockDark, 0.8, 0.12, 0.45)
  small.rotation.set(0.6, 0.2, 0.4)
  group.add(small)
  return { object: group }
}

function makeMound(): Built {
  const mound = mesh(new THREE.SphereGeometry(1.2, 10, 6), PALETTE.snowShade)
  mound.scale.set(1.4, 0.32, 1)
  return { object: mound }
}

function makeBush(): Built {
  const bush = new THREE.Group()
  const puffs: [number, number, number, number][] = [
    [0, 0.35, 0, 0.45],
    [0.35, 0.3, 0.1, 0.35],
    [-0.3, 0.28, 0.15, 0.32],
  ]
  for (const [x, y, z, r] of puffs) bush.add(mesh(new THREE.IcosahedronGeometry(r, 0), PALETTE.bush, x, y, z))
  for (let i = 0; i < 4; i++) {
    bush.add(mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), PALETTE.berry, Math.cos(i * 1.7) * 0.35, 0.5, Math.sin(i * 1.7) * 0.35))
  }
  bush.add(mesh(new THREE.SphereGeometry(0.4, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), PALETTE.snow, 0, 0.62))
  return { object: bush }
}

function makeRuin(): Built {
  const ruin = new THREE.Group()
  const heights = [2.4, 1.4, 0.8]
  heights.forEach((h, i) => {
    const pillar = mesh(new THREE.BoxGeometry(0.6, h, 0.6), i === 1 ? PALETTE.ruinDark : PALETTE.ruin, i * 1.1 - 1.1, h / 2, 0)
    ruin.add(pillar)
    ruin.add(mesh(new THREE.BoxGeometry(0.66, 0.1, 0.66), PALETTE.snow, i * 1.1 - 1.1, h + 0.05, 0))
  })
  ruin.add(mesh(new THREE.BoxGeometry(1.8, 0.35, 0.7), PALETTE.ruin, -0.55, 2.55, 0))
  ruin.add(mesh(new THREE.BoxGeometry(0.9, 0.3, 0.5), PALETTE.ruinDark, 0.9, 0.15, 0.8))
  return { object: ruin }
}

function makeRunestone(): Built {
  const group = new THREE.Group()
  const stone = mesh(new THREE.BoxGeometry(0.7, 2.0, 0.35), PALETTE.rockDark, 0, 1.0)
  stone.rotation.z = 0.06
  group.add(stone)
  const runeMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.rune })
  const strokes: [number, number, number, number][] = [
    [0, 1.45, 0.06, 0.5],
    [0.1, 1.3, 0.25, 0.06],
    [-0.08, 0.95, 0.06, 0.4],
    [0.02, 0.75, 0.3, 0.06],
  ]
  for (const [x, y, w, h] of strokes) {
    const stroke = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.02), runeMaterial)
    stroke.position.set(x, y, 0.18)
    group.add(stroke)
  }
  const light = new THREE.PointLight(PALETTE.rune, 1.5, 4, 2)
  light.position.set(0, 1.2, 0.6)
  group.add(light)
  const animate: Animator = (t) => {
    const pulse = 0.65 + Math.sin(t * 2.2) * 0.35
    runeMaterial.color.setHex(PALETTE.rune).multiplyScalar(0.7 + pulse * 0.3)
    light.intensity = 1 + pulse
  }
  return { object: group, animate }
}

function makeBrazier(): Built {
  const group = new THREE.Group()
  group.add(mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.9, 6), PALETTE.iron, 0, 0.45))
  group.add(mesh(new THREE.CylinderGeometry(0.45, 0.28, 0.3, 8), PALETTE.iron, 0, 1.0))
  const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 6), new THREE.MeshBasicMaterial({ color: PALETTE.fire }))
  flameOuter.position.y = 1.5
  const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.5, 5), new THREE.MeshBasicMaterial({ color: PALETTE.fireCore }))
  flameInner.position.y = 1.4
  group.add(flameOuter, flameInner)
  const light = new THREE.PointLight(PALETTE.fire, 4, 9, 1.6)
  light.position.y = 1.8
  group.add(light)
  const seed = Math.random() * 10
  const animate: Animator = (t) => {
    const flicker = Math.sin(t * 13 + seed) * 0.5 + Math.sin(t * 7.3 + seed * 2) * 0.5
    flameOuter.scale.set(1 + flicker * 0.08, 1 + flicker * 0.18, 1 + flicker * 0.08)
    flameInner.scale.y = 1 - flicker * 0.15
    flameOuter.rotation.y = t * 2
    light.intensity = 3.6 + flicker * 0.8
  }
  return { object: group, animate }
}

const BUILDERS: Record<PropPlacement['kind'], () => Built> = {
  pine: makePine,
  rock: makeRock,
  mound: makeMound,
  ruin: makeRuin,
  deadTree: makeDeadTree,
  bush: makeBush,
  runestone: makeRunestone,
  brazier: makeBrazier,
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

function buildPond(): THREE.Group {
  const pond = new THREE.Group()
  const ice = mesh(new THREE.CircleGeometry(4, 20), PALETTE.ice)
  ice.rotation.x = -Math.PI / 2
  ice.receiveShadow = true
  pond.add(ice)
  const deep = mesh(new THREE.CircleGeometry(2.2, 16), PALETTE.iceDeep, 0.6, 0.01, -0.3)
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

/** 북유럽 설원 느낌의 테스트 맵을 만든다. */
export function buildTestMap(seed = 7): TestMap {
  const map = new THREE.Group()
  const colliders: CircleCollider[] = []
  const animators: Animator[] = []

  map.add(buildGround(MAP_HALF_EXTENT))
  map.add(buildScatter(MAP_HALF_EXTENT))

  const pond = buildPond()
  pond.position.set(POND.x, pondLevel() + 0.03, POND.z)
  map.add(pond)

  for (const placement of generateLayout({ seed, halfExtent: 34, clearRadius: 5, count: 110 })) {
    if (Math.hypot(placement.x - POND.x, placement.z - POND.z) < POND.radius + 1) continue
    const built = BUILDERS[placement.kind]()
    const prop = castAndReceive(built.object)
    prop.position.set(placement.x, heightAt(placement.x, placement.z), placement.z)
    prop.scale.multiplyScalar(placement.size)
    prop.rotation.y = placement.rotation
    map.add(prop)
    colliders.push(...collidersFor(placement))
    if (built.animate) animators.push(built.animate)
  }

  return {
    group: map,
    colliders,
    update(elapsed) {
      for (const animate of animators) animate(elapsed)
    },
  }
}

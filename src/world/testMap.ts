import * as THREE from 'three'

import { toonMaterial } from '../render/toon'
import type { CircleCollider } from './colliders'
import { generateLayout, type PropPlacement } from './layout'

/** 플레이어가 움직일 수 있는 범위 (맵 한 변의 절반, 미터) */
export const MAP_HALF_EXTENT = 38

export interface TestMap {
  group: THREE.Group
  colliders: CircleCollider[]
}

const PALETTE = {
  snow: 0xdfe7ee,
  snowShade: 0xc7d3de,
  ice: 0x8fc8de,
  rock: 0x7d8794,
  pine: 0x2f5a4a,
  pineDark: 0x24473b,
  trunk: 0x5b4636,
  ruin: 0xa59d92,
}

function castAndReceive(object: THREE.Object3D): THREE.Object3D {
  object.traverse((child) => {
    child.castShadow = true
    child.receiveShadow = true
  })
  return object
}

function makePine(): THREE.Object3D {
  const tree = new THREE.Group()
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.8, 6), toonMaterial(PALETTE.trunk))
  trunk.position.y = 0.4
  tree.add(trunk)
  const tiers: [number, number, number, number][] = [
    [1.1, 1.4, 1.2, PALETTE.pineDark],
    [0.85, 1.2, 1.9, PALETTE.pine],
    [0.55, 1.0, 2.6, PALETTE.pine],
  ]
  for (const [radius, height, y, color] of tiers) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(radius, height, 7), toonMaterial(color))
    cone.position.y = y
    tree.add(cone)
  }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.35, 7), toonMaterial(PALETTE.snow))
  cap.position.y = 3.05
  tree.add(cap)
  return tree
}

function makeRock(): THREE.Object3D {
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.7, 0), toonMaterial(PALETTE.rock))
  rock.scale.set(1.2, 0.7, 1)
  rock.position.y = 0.35
  return rock
}

function makeMound(): THREE.Object3D {
  const mound = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 6), toonMaterial(PALETTE.snowShade))
  mound.scale.set(1.4, 0.35, 1)
  return mound
}

function makeRuin(): THREE.Object3D {
  const ruin = new THREE.Group()
  const pillarMaterial = toonMaterial(PALETTE.ruin)
  const heights = [2.4, 1.4, 0.8]
  heights.forEach((h, i) => {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.6, h, 0.6), pillarMaterial)
    pillar.position.set(i * 1.1 - 1.1, h / 2, 0)
    ruin.add(pillar)
  })
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.35, 0.7), pillarMaterial)
  lintel.position.set(-0.55, 2.55, 0)
  ruin.add(lintel)
  return ruin
}

const BUILDERS: Record<PropPlacement['kind'], () => THREE.Object3D> = {
  pine: makePine,
  rock: makeRock,
  mound: makeMound,
  ruin: makeRuin,
}

/** 소품 하나가 차지하는 충돌 영역. 눈 둔덕은 밟고 지나갈 수 있어 충돌이 없다. */
export function collidersFor(p: PropPlacement): CircleCollider[] {
  switch (p.kind) {
    case 'pine':
      return [{ x: p.x, z: p.z, radius: 0.75 * p.size }]
    case 'rock':
      return [{ x: p.x, z: p.z, radius: 0.85 * p.size }]
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
      return []
  }
}

/** 북유럽 설원 느낌의 테스트 맵을 만든다. */
export function buildTestMap(seed = 7): TestMap {
  const map = new THREE.Group()
  const colliders: CircleCollider[] = []

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), toonMaterial(PALETTE.snow))
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  map.add(ground)

  const pond = new THREE.Mesh(new THREE.CircleGeometry(4, 20), toonMaterial(PALETTE.ice))
  pond.rotation.x = -Math.PI / 2
  pond.position.set(9, 0.02, -6)
  pond.receiveShadow = true
  map.add(pond)

  for (const placement of generateLayout({ seed, halfExtent: 34, clearRadius: 5, count: 90 })) {
    if (Math.hypot(placement.x - 9, placement.z + 6) < 5) continue
    const prop = castAndReceive(BUILDERS[placement.kind]())
    prop.position.x = placement.x
    prop.position.z = placement.z
    prop.scale.multiplyScalar(placement.size)
    prop.rotation.y = placement.rotation
    map.add(prop)
    colliders.push(...collidersFor(placement))
  }
  return { group: map, colliders }
}

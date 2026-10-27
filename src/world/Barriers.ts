import * as THREE from 'three'

import type { RegionLink } from '../data/world'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { buildVoxelGeometry, voxelMaterial } from '../voxel/mesher'
import { runestone } from '../voxel/models/props'
import { heightAt } from './terrain'

/** 결계 벽 높이 (m) */
const WALL_HEIGHT = 3.6
/** 결계가 풀리는 데 걸리는 시간 (초) */
const OPEN_TIME = 1.4

/** 결계 무늬: 아래가 밝고 위로 옅어지며, 세로 빛줄이 촘촘히 선다 (낮은 해상도에서도 벽으로 읽히게) */
function sealTexture(): THREE.DataTexture {
  const w = 8
  const h = 16
  const data = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const fade = (1 - y / (h - 1)) ** 1.4
      const stripe = x % 4 === 0 ? 1 : 0.45
      const rim = y === 0 ? 1.4 : 1
      const i = (y * w + x) * 4
      data.set([255, 255, 255, Math.min(255, Math.round(255 * fade * stripe * rim))], i)
    }
  }
  const texture = new THREE.DataTexture(data, w, h)
  texture.magFilter = THREE.NearestFilter
  texture.wrapS = THREE.RepeatWrapping
  texture.needsUpdate = true
  return texture
}

/** 막힌 통로 하나의 결계 */
interface Seal {
  to: string
  x: number
  z: number
  group: THREE.Group
  wall: THREE.MeshBasicMaterial
  base: THREE.MeshBasicMaterial
  /** 풀리기 시작한 뒤 흐른 시간 (안 풀리고 있으면 null) */
  opening: number | null
}

/**
 * 결계 (E22-02): 아직 열리지 않은 땅으로 가는 통로 입구에 그 땅의 신화권 색으로 빛의 벽이 선다.
 * 걸음을 막는 것은 걸을 수 있는 곳에서 그 통로를 빼는 쪽(World)이고, 여기는 모습과 풀리는 연출만 맡는다.
 */
export class Barriers {
  readonly object = new THREE.Group()
  private seals: Seal[] = []
  private time = 0
  private readonly stoneGeometry = buildVoxelGeometry(runestone(77), { voxelSize: 0.12 })
  private readonly texture = sealTexture()

  /** 지금 땅의 막힌 통로마다 결계를 세운다. half: 땅 반너비 (결계는 땅 끝, 통로 입구에 선다) */
  set(half: number, links: readonly RegionLink[], color: (to: string) => number): void {
    this.clear()
    for (const link of links) {
      const r = link.rect
      const along = link.dir * half
      const x = link.axis === 'x' ? along : (r.minX + r.maxX) / 2
      const z = link.axis === 'z' ? along : (r.minZ + r.maxZ) / 2
      const width = link.axis === 'x' ? r.maxZ - r.minZ : r.maxX - r.minX
      this.seals.push(this.build(link.to, x, z, width, link.axis, color(link.to)))
    }
  }

  /** 그 땅으로 가는 결계가 풀린다. 풀리는 결계가 있었으면 그 자리 */
  open(to: string): { x: number; z: number } | null {
    const seal = this.seals.find((s) => s.to === to && s.opening === null)
    if (!seal) return null
    seal.opening = 0
    return { x: seal.x, z: seal.z }
  }

  /** 서 있는 결계들 (지도·점검용) */
  get spots(): { to: string; x: number; z: number }[] {
    return this.seals.filter((s) => s.opening === null).map(({ to, x, z }) => ({ to, x, z }))
  }

  update(dt: number): void {
    this.time += dt
    const pulse = 0.5 + Math.sin(this.time * 2.4) * 0.5
    for (let i = this.seals.length - 1; i >= 0; i--) {
      const seal = this.seals[i]!
      if (seal.opening === null) {
        seal.wall.opacity = 0.55 + pulse * 0.25
        seal.base.opacity = 0.6 + pulse * 0.3
        continue
      }
      // 풀림: 벽이 위로 솟으며 옅어진다
      seal.opening += dt
      const t = Math.min(1, seal.opening / OPEN_TIME)
      seal.wall.opacity = 0.8 * (1 - t)
      seal.base.opacity = 1 - t
      seal.group.children[0]!.scale.y = 1 + t * 2.5
      if (t >= 1) {
        this.dispose(seal)
        this.seals.splice(i, 1)
      }
    }
  }

  clear(): void {
    for (const seal of this.seals) this.dispose(seal)
    this.seals = []
  }

  private build(to: string, x: number, z: number, width: number, axis: 'x' | 'z', color: number): Seal {
    const group = new THREE.Group()
    const y = heightAt(x, z)
    group.position.set(x, y, z)
    // 통로를 가로지르게 돌린다 (x로 뻗은 통로면 벽은 z로 선다)
    if (axis === 'x') group.rotation.y = Math.PI / 2
    const wall = new THREE.MeshBasicMaterial({ color, map: this.texture, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
    const base = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending })
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, WALL_HEIGHT), wall)
    // 빛줄 간격이 결계 너비와 상관없이 0.5m쯤
    this.texture.repeat.set(width / 4, 1)
    plane.geometry.translate(0, WALL_HEIGHT / 2, 0)
    const line = new THREE.Mesh(new THREE.BoxGeometry(width, 0.08, 0.3), base)
    line.position.y = 0.05
    for (const mesh of [plane, line]) {
      mesh.layers.set(EFFECT_LAYER)
      mesh.renderOrder = 12
      group.add(mesh)
    }
    // 양 끝의 룬석 둘
    for (const side of [-1, 1]) {
      const stone = new THREE.Mesh(this.stoneGeometry, voxelMaterial())
      stone.position.set(side * (width / 2 + 0.5), 0, 0)
      stone.castShadow = true
      group.add(stone)
    }
    this.object.add(group)
    return { to, x, z, group, wall, base, opening: null }
  }

  private dispose(seal: Seal): void {
    this.object.remove(seal.group)
    seal.group.traverse((o) => {
      if (o instanceof THREE.Mesh && o.geometry !== this.stoneGeometry) o.geometry.dispose()
    })
    seal.wall.dispose()
    seal.base.dispose()
  }
}

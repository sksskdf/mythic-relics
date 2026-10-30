import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'
import { buildVoxelGeometry, voxelMaterial } from '../voxel/mesher'
import { runestone } from '../voxel/models/props'
import type { Point2 } from '../world/colliders'
import { heightAt } from '../world/terrain'

/**
 * 지금 땅의 성소: 둥글게 선 룬스톤 여섯과 바닥의 룬 고리, 한가운데가 귀환 화로다 (E304).
 * 원정이 무르익으면(`beacon`) 빛기둥이 서고 룬이 밝게 빛난다 (글 대신 빛으로 알려 준다).
 * 승급 전설(결계 안의 싸움)은 E305-03에서 걷었다 (맹세가 그 자리를 맡는다).
 */
export class Sanctuary {
  readonly object = new THREE.Group()
  private readonly glyphMaterial = new THREE.MeshBasicMaterial({
    color: 0x7fd4ff,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
  })
  private readonly beamMaterial = new THREE.MeshBasicMaterial({
    color: 0x9fe3ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  })
  private readonly stones: THREE.Mesh[] = []
  private time = 0
  center: Point2 = { x: 0, z: 0 }
  /** 성소 둘레 반지름 (지역 데이터의 sanctuary.radius) */
  radius = 0
  /** 이 지역에 성소가 있나 (마을에는 없다) */
  present = true
  /** 빛기둥을 세운다 (원정이 무르익어 귀환할 수 있을 때, ExpeditionSystem이 정한다) */
  beacon = false

  constructor(center: Point2, radius: number) {
    const stoneGeometry = buildVoxelGeometry(runestone(41), { voxelSize: 0.12 })
    for (let i = 0; i < 6; i++) {
      const stone = new THREE.Mesh(stoneGeometry, voxelMaterial())
      stone.rotation.y = (i / 6) * Math.PI * 2 + Math.PI
      stone.castShadow = true
      this.stones.push(stone)
      this.object.add(stone)
    }
    const glyph = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.6, 6, 1), this.glyphMaterial)
    glyph.rotation.x = -Math.PI / 2
    glyph.position.y = 0.06
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 9, 6, 1, true), this.beamMaterial)
    beam.position.y = 4.5
    for (const mesh of [glyph, beam]) {
      mesh.layers.set(EFFECT_LAYER)
      mesh.renderOrder = 12
      this.object.add(mesh)
    }
    this.moveTo(center, radius)
  }

  /** 성소를 옮긴다 (지역을 바꾸거나 편집기로 옮길 때). null이면 이 지역에는 성소가 없다 */
  moveTo(center: Point2 | null, radius = 0): void {
    this.present = center !== null
    this.object.visible = this.present
    if (!center) return
    this.center = { x: center.x, z: center.z }
    this.radius = radius
    const y = heightAt(center.x, center.z)
    this.object.position.set(center.x, y, center.z)
    this.stones.forEach((stone, i) => {
      const a = (i / 6) * Math.PI * 2
      const sx = Math.sin(a) * 3.4
      const sz = Math.cos(a) * 3.4
      stone.position.set(sx, heightAt(center.x + sx, center.z + sz) - y, sz)
    })
  }

  /** 빛기둥이 서 있나 (점검·봇이 화면에 보이는 것으로 읽는다) */
  get lit(): boolean {
    return this.beacon && this.present
  }

  /** 매 프레임: 빛기둥과 룬 고리의 밝기 */
  update(dt: number): void {
    this.time += dt
    const pulse = 0.5 + Math.sin(this.time * 3) * 0.5
    this.beamMaterial.opacity = this.lit ? 0.18 + pulse * 0.12 : 0
    this.glyphMaterial.opacity = this.lit ? 0.5 + pulse * 0.4 : 0.2
  }
}

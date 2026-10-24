import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'
import { voxelMesh } from '../voxel/mesher'
import { RELIC_VOXEL } from '../voxel/models/relics'
import { relicGrid } from '../relics/model'
import { heightAt } from '../world/terrain'
import { GRADE_COLORS } from '../art/palette'
import { godDef, isRelicId, relicDef } from '../relics/data'
import type { GearItem } from './roll'

/** 주울 수 있는 거리 (m) */
const PICK_RADIUS = 1.1

interface Pickup {
  /** 유물 id 또는 일반 장비 id */
  id: string
  /** 일반 장비면 그 내용 */
  gear?: GearItem
  root: THREE.Group
  model: THREE.Object3D
  beam: THREE.MeshBasicMaterial
  x: number
  z: number
  /** 주인공이 한 번 벗어나야 주울 수 있다. (방금 빼서 떨군 유물을 바로 다시 줍지 않게) */
  armed: boolean
  phase: number
}

/**
 * 땅에 놓인 유물. 빛기둥으로 위치를 알리고, 주인공이 밟고 지나가면 저절로 줍는다. (조작 최소화)
 */
/** 땅 유물이 화면에 보이는 높이 (떠 있는 모델의 위 끝, 미터). 설명 카드를 띄우는 범위에 쓴다 */
export const PICKUP_TOP = 1.8

export class Pickups {
  readonly object = new THREE.Group()
  private readonly items: Pickup[] = []

  get list(): readonly { id: string; x: number; z: number; gear?: GearItem }[] {
    return this.items
  }

  /** 땅의 일반 장비 */
  gearOf(id: string): GearItem | undefined {
    return this.items.find((i) => i.id === id)?.gear
  }

  /** 유물(또는 일반 장비)을 놓는다. armed가 false면 주인공이 한 번 떨어졌다 와야 주울 수 있다. 빛기둥은 유물이면 신의 색, 장비면 등급 색 */
  drop(id: string, x: number, z: number, armed = true, gear?: GearItem): void {
    const root = new THREE.Group()
    root.position.set(x, heightAt(x, z), z)
    let model: THREE.Object3D
    if (gear || !isRelicId(id)) {
      // 일반 장비: 등급 색 상자 (부위별 모델은 E13-02-5)
      const tint = new THREE.Color(gear ? GRADE_COLORS[gear.grade] : '#ffffff')
      model = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshLambertMaterial({ color: tint }))
    } else model = voxelMesh(relicGrid(relicDef(id)), { voxelSize: RELIC_VOXEL * 1.2 })
    model.position.y = 0.9
    root.add(model)

    const color = new THREE.Color(gear ? GRADE_COLORS[gear.grade] : isRelicId(id) ? godDef(relicDef(id).god).color : '#ffffff')
    const beam = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false })
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 6, 8, 1, true), beam)
    column.position.y = 3
    column.layers.set(EFFECT_LAYER)
    column.renderOrder = 12
    root.add(column)

    this.object.add(root)
    this.items.push({ id, ...(gear ? { gear } : {}), root, model, beam, x, z, armed, phase: Math.random() * 6 })
  }

  /** 땅의 유물을 줍지 않고 없앤다 (점검용) */
  remove(id: string): void {
    const index = this.items.findIndex((item) => item.id === id)
    if (index < 0) return
    this.items[index]!.root.removeFromParent()
    this.items.splice(index, 1)
  }

  /** 프레임마다 떠오르고 돌게 하고, 주인공이 닿은 유물을 주워 돌려준다. */
  /** 땅의 유물을 모두 치운다 (다른 지역으로 갈 때) */
  clear(): void {
    for (const item of [...this.items]) this.remove(item.id)
  }

  /** reach: 그것을 줍는 거리 (편의 자동화의 자동 줍기·재료 자동 모음, 없으면 발밑) */
  update(dt: number, heroX: number, heroZ: number, canPick: (id: string) => boolean, reach?: (id: string, gear?: GearItem) => number): { id: string; gear?: GearItem }[] {
    const picked: { id: string; gear?: GearItem }[] = []
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!
      item.phase += dt
      item.model.position.y = 0.9 + Math.sin(item.phase * 2.2) * 0.12
      item.model.rotation.y += dt * 1.6
      item.beam.opacity = 0.25 + Math.sin(item.phase * 3) * 0.08
      const dist = Math.hypot(heroX - item.x, heroZ - item.z)
      if (!item.armed) {
        if (dist > PICK_RADIUS * 1.5) item.armed = true
        continue
      }
      if (dist <= Math.max(PICK_RADIUS, reach?.(item.id, item.gear) ?? 0) && canPick(item.id)) {
        picked.push({ id: item.id, ...(item.gear ? { gear: item.gear } : {}) })
        item.root.removeFromParent()
        this.items.splice(i, 1)
      }
    }
    return picked
  }
}

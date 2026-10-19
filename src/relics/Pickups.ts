import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'
import { voxelMesh } from '../voxel/mesher'
import { RELIC_VOXEL } from '../voxel/models/relics'
import { relicGrid } from './model'
import { heightAt } from '../world/terrain'
import { godDef, relicDef, type RelicId } from './data'

/** 주울 수 있는 거리 (m) */
const PICK_RADIUS = 1.1

interface Pickup {
  id: RelicId
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

  get list(): readonly { id: RelicId; x: number; z: number }[] {
    return this.items
  }

  /** 유물을 놓는다. armed가 false면 주인공이 한 번 떨어졌다 와야 주울 수 있다. */
  drop(id: RelicId, x: number, z: number, armed = true): void {
    const root = new THREE.Group()
    root.position.set(x, heightAt(x, z), z)
    const grid = relicGrid(relicDef(id))
    const model = voxelMesh(grid, { voxelSize: RELIC_VOXEL * 1.2 })
    model.position.y = 0.9
    root.add(model)

    const color = new THREE.Color(godDef(relicDef(id).god).color)
    const beam = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false })
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 6, 8, 1, true), beam)
    column.position.y = 3
    column.layers.set(EFFECT_LAYER)
    column.renderOrder = 12
    root.add(column)

    this.object.add(root)
    this.items.push({ id, root, model, beam, x, z, armed, phase: Math.random() * 6 })
  }

  /** 땅의 유물을 줍지 않고 없앤다 (점검용) */
  remove(id: RelicId): void {
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

  update(dt: number, heroX: number, heroZ: number, canPick: (id: RelicId) => boolean): RelicId[] {
    const picked: RelicId[] = []
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
      if (dist <= PICK_RADIUS && canPick(item.id)) {
        picked.push(item.id)
        item.root.removeFromParent()
        this.items.splice(i, 1)
      }
    }
    return picked
  }
}

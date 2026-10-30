import * as THREE from 'three'
import { GRADES } from '../data/gearData'

import { EFFECT_LAYER } from '../render/PixelRenderer'
import { voxelMesh } from '../voxel/mesher'
import { RELIC_VOXEL } from '../voxel/models/relics'
import { relicGrid } from '../relics/model'
import { heightAt } from '../world/terrain'
import { GRADE_COLORS } from '../art/palette'
import { godDef, isRelicId, relicDef } from '../relics/data'
import { gearGrid } from '../voxel/models/gearLooks'
import { GEAR, type GearItem } from './roll'

/** 땅에 남는 일반 장비 수 끝 (E303) */
const GROUND_GEAR_CAP = 24
/** 주울 수 있는 거리 (m) */
const PICK_RADIUS = 1.1
/** 주운 것이 주인공 품으로 날아드는 시간 (초) */
const FLY_SECONDS = 0.35

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
  /** 플레이어가 내려놓은 것: 자동 줍기(엔딩 뒤 자동화)로는 줍지 않고 밟아야 줍는다 */
  placed: boolean
  phase: number
}

/** 땅 유물이 화면에 보이는 높이 (떠 있는 모델의 위 끝, 미터). 설명 카드를 띄우는 범위에 쓴다 */
export const PICKUP_TOP = 1.8
/** 빛기둥 모양: 모든 땅 물건이 같이 쓴다 */
const COLUMN_GEOMETRY = new THREE.CylinderGeometry(0.28, 0.42, 6, 8, 1, true)

/**
 * 땅에 놓인 유물과 장비. 빛기둥으로 위치를 알리고, 주인공이 밟고 지나가면 줍는다 (누르면 그리로 걸어간다, 조작 최소화)
 */
export class Pickups {
  readonly object = new THREE.Group()
  private readonly items: Pickup[] = []
  /** 주워서 주인공에게 날아드는 중인 것 (모습만, 이미 주운 것) */
  private readonly flying: { item: Pickup; t: number }[] = []

  get list(): readonly { id: string; x: number; z: number; gear?: GearItem }[] {
    return this.items
  }

  /** 땅의 일반 장비 */
  gearOf(id: string): GearItem | undefined {
    return this.items.find((i) => i.id === id)?.gear
  }

  /**
   * 유물(또는 일반 장비)을 놓는다. armed가 false면(플레이어가 내려놓은 것) 주인공이 한 번 떨어졌다 와야 주울 수 있고,
   * 자동 줍기로는 다시 줍지 않는다. 빛기둥은 유물이면 신의 색, 장비면 등급 색
   */
  drop(id: string, x: number, z: number, armed = true, gear?: GearItem): void {
    const root = new THREE.Group()
    root.position.set(x, heightAt(x, z), z)
    let model: THREE.Object3D
    if (gear) {
      // 일반 장비: 부위·바탕 모양에 등급 색 장식 (끼면 몸에 보이는 것과 같은 모델, E18-04-5)
      const parts = GEAR.parts[gear.part]
      const grid = gearGrid(gear.part, Math.max(0, parts.bases.indexOf(gear.base)), gear.grade, false)
      // 몸 칸 격자는 커서 작게 줄여 놓는다 (머리·몸 0.5m 안팎)
      const scale = { weapon: 1.2, head: 0.7, body: 0.75, hands: 1.1, feet: 1.1, trinket: 1.6 }[gear.part]
      model = voxelMesh(grid, { voxelSize: RELIC_VOXEL * scale })
    } else if (!isRelicId(id)) {
      model = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.34, 0.34), new THREE.MeshLambertMaterial({ color: 0xffffff }))
    } else model = voxelMesh(relicGrid(relicDef(id)), { voxelSize: RELIC_VOXEL * 1.2 })
    model.position.y = 0.9
    root.add(model)

    const color = new THREE.Color(gear ? GRADE_COLORS[gear.grade] : isRelicId(id) ? godDef(relicDef(id).god).color : '#ffffff')
    const beam = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false })
    const column = new THREE.Mesh(COLUMN_GEOMETRY, beam)
    column.position.y = 3
    column.layers.set(EFFECT_LAYER)
    column.renderOrder = 12
    root.add(column)

    this.object.add(root)
    this.items.push({ id, ...(gear ? { gear } : {}), root, model, beam, x, z, armed, placed: !armed, phase: Math.random() * 6 })
    // 땅에 남는 일반 장비는 24개까지 (E303, 성능): 넘치면 가장 낮은 등급의 오래된 것부터 사라진다.
    // 플레이어가 일부러 내려놓은 것은 지우지 않는다
    const gearOnGround = this.items.filter((i) => i.gear && !i.placed)
    if (gearOnGround.length > GROUND_GEAR_CAP) {
      const rank = (g: GearItem) => GRADES.indexOf(g.grade)
      const lowest = gearOnGround.reduce((a, b) => (rank(b.gear!) < rank(a.gear!) ? b : a))
      this.discard(this.items.indexOf(lowest))
    }
  }

  /** 땅의 유물을 줍지 않고 없앤다 (점검용) */
  remove(id: string): void {
    const index = this.items.findIndex((item) => item.id === id)
    if (index < 0) return
    this.discard(index)
  }

  /** 땅의 유물을 모두 치운다 (다른 지역으로 갈 때) */
  clear(): void {
    for (let i = this.items.length - 1; i >= 0; i--) this.discard(i)
    for (const f of this.flying.splice(0)) this.dispose(f.item)
  }

  /**
   * 원점이 옮겨졌다 (E19: 걸어서 이웃 땅으로 넘어감). 떨어진 것도 같은 만큼 옮겨 제자리에 그대로 둔다.
   * 지금 땅의 이웃보다 멀어진 것(far 밖)은 치운다.
   */
  shift(dx: number, dz: number, far: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i]!
      item.x += dx
      item.z += dz
      item.root.position.x += dx
      item.root.position.z += dz
      if (Math.max(Math.abs(item.x), Math.abs(item.z)) > far) this.discard(i)
    }
    for (const f of this.flying) f.item.root.position.set(f.item.root.position.x + dx, f.item.root.position.y, f.item.root.position.z + dz)
  }

  /** 땅에서 걷어 내고 모델과 빛기둥 재질을 GPU에서 내린다 (드랍마다 쌓이지 않게) */
  private discard(index: number): void {
    const [item] = this.items.splice(index, 1)
    if (item) this.dispose(item)
  }

  private dispose(item: Pickup): void {
    item.root.removeFromParent()
    item.model.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
    })
    item.beam.dispose()
  }

  /**
   * 프레임마다 떠오르고 돌게 하고, 주인공이 닿은 유물을 주워 돌려준다.
   * reach: 그것을 줍는 거리 (엔딩 뒤 자동화의 자동 줍기: 장비는 둘레, 재료 유물은 어디서나. 없으면 발밑). 내려놓은 것은 늘 발밑.
   * 주운 것은 빛기둥이 꺼지며 주인공 품으로 날아들어 사라진다 (사용자 의견 2026-10-28: 얻는 표현이 모자라다)
   */
  update(dt: number, heroX: number, heroZ: number, canPick: (id: string, gear?: GearItem) => boolean, reach?: (id: string, gear?: GearItem) => number): { id: string; gear?: GearItem }[] {
    const picked: { id: string; gear?: GearItem }[] = []
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i]!
      f.t += dt / FLY_SECONDS
      const k = Math.min(1, f.t)
      const ease = k * k
      const root = f.item.root.position
      root.x += (heroX - root.x) * Math.min(1, ease * 1.6)
      root.z += (heroZ - root.z) * Math.min(1, ease * 1.6)
      root.y += (heightAt(heroX, heroZ) + 0.2 - root.y) * Math.min(1, ease)
      f.item.model.position.y = 0.9 + k * 0.3
      f.item.model.scale.setScalar(1 - k * 0.75)
      f.item.model.rotation.y += dt * 12
      f.item.beam.opacity = 0.3 * (1 - k)
      if (k >= 1) {
        this.flying.splice(i, 1)
        this.dispose(f.item)
      }
    }
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
      const far = item.placed ? 0 : (reach?.(item.id, item.gear) ?? 0)
      if (dist <= Math.max(PICK_RADIUS, far) && canPick(item.id, item.gear)) {
        picked.push({ id: item.id, ...(item.gear ? { gear: item.gear } : {}) })
        this.items.splice(i, 1)
        this.flying.push({ item, t: 0 })
      }
    }
    return picked
  }
}

import { type GearPart, SLOT_PARTS } from '../data/gearData'
import type { StatKind } from '../data/mythAlways'
import { type God, isRelicId, type RelicId } from '../relics/data'
import { type LoadoutState, resolveLoadout } from '../myth/manifest'
import { relicPart } from './mythRelic'
import { type GearItem, isGearUid } from './roll'

/** 장비 칸 수 (E13: 무기·머리·몸·손·발·장신구 둘) */
export const SLOT_COUNT = SLOT_PARTS.length
/** 재료 하나를 가질 수 있는 수 (저장을 읽을 때도 이만큼에서 자른다) */
export const MATERIAL_CAP = 9999

/** 칸·가방에 들어가는 것: 유물 id 또는 일반 장비 id(`g:`로 시작) */
export type EquipId = string

/**
 * 장비 칸 7과 가방 (E13-02). 유물도 장비라 자기 부위 칸을 차지한다 (묠니르는 무기).
 * 주운 것은 그 부위의 빈 칸에 바로 들어가고(조작 최소화), 칸이 차 있으면 가방으로 간다.
 * 일반 장비의 내용은 `gear`에, 유물의 단계는 `stages`에, 재료는 `materials`에 둔다.
 */
export class Loadout {
  readonly slots: (EquipId | null)[] = Array.from({ length: SLOT_COUNT }, () => null)
  /** 칸에 끼지 않은 장비·유물 */
  readonly bag: EquipId[] = []
  /** 가진 일반 장비 (칸·가방에 있는 것) */
  readonly gear = new Map<string, GearItem>()
  /** 유물 단계 1~4 (없으면 1) */
  readonly stages = new Map<RelicId, number>()
  /** 재료 개수 (재료가 된 유물, E13-04의 재료) */
  readonly materials = new Map<string, number>()
  /** 대장간에서 만든 유물이 바탕 장비에서 물려받은 수치 (E13-05) */
  readonly inherited = new Map<RelicId, { kind: StatKind; value: number }>()
  /** 고른 신화 (E12-04: 열린 신화 가운데 하나, 유물 수와 상관없다) */
  chosen: God | null = null

  get state(): LoadoutState {
    return resolveLoadout(this.relics, this.chosen)
  }

  /** 칸에 낀 유물들 (칸 순서, 빈 칸과 일반 장비는 null) */
  get relics(): (RelicId | null)[] {
    return this.slots.map((id) => (id && isRelicId(id) ? id : null))
  }

  /** 칸에 낀 유물이 물려받은 수치들 */
  get wornInherited(): { kind: StatKind; value: number }[] {
    return this.relics.flatMap((id) => (id && this.inherited.has(id) ? [this.inherited.get(id)!] : []))
  }

  /** 칸에 낀 일반 장비들 */
  get wornGear(): GearItem[] {
    return this.slots.flatMap((id) => (isGearUid(id) && this.gear.has(id) ? [this.gear.get(id)!] : []))
  }

  /** 칸과 가방의 모든 것 */
  get owned(): EquipId[] {
    return [...this.slots.filter((id): id is EquipId => id !== null), ...this.bag]
  }

  /** 가진 유물 (칸과 가방) */
  get ownedRelics(): RelicId[] {
    return this.owned.filter((id): id is RelicId => isRelicId(id))
  }

  has(id: EquipId): boolean {
    return this.slots.includes(id) || this.bag.includes(id)
  }

  /** 그 장비·유물의 부위 */
  partOf(id: EquipId): GearPart | null {
    if (isGearUid(id)) return this.gear.get(id)?.part ?? null
    return isRelicId(id) ? relicPart(id) : null
  }

  /** 그 칸에 낄 수 있는가 (부위가 맞는가) */
  fits(id: EquipId, slot: number): boolean {
    return slot >= 0 && slot < SLOT_COUNT && this.partOf(id) === SLOT_PARTS[slot]
  }

  stage(id: RelicId): number {
    return this.stages.get(id) ?? 1
  }

  /** 일반 장비를 가진 것으로 적는다 (칸·가방에 넣기 전에) */
  addGear(item: GearItem): void {
    this.gear.set(item.uid, item)
  }

  addMaterial(id: string, count = 1): void {
    this.materials.set(id, Math.min(MATERIAL_CAP, (this.materials.get(id) ?? 0) + count))
  }

  /** 재료를 쓴다. 모자라면 쓰지 않고 false */
  useMaterial(id: string, count: number): boolean {
    const have = this.materials.get(id) ?? 0
    if (have < count) return false
    if (have === count) this.materials.delete(id)
    else this.materials.set(id, have - count)
    return true
  }

  /** 그 부위의 빈 칸에 끼운다. 빈 칸이 없으면 가방에 넣는다. 끼운 칸 번호를 돌려준다(가방이면 -1). */
  equip(id: EquipId): number {
    if (this.has(id)) return this.slots.indexOf(id)
    const free = this.slots.findIndex((s, i) => s === null && this.fits(id, i))
    if (free < 0) {
      this.bag.push(id)
      return -1
    }
    this.slots[free] = id
    return free
  }

  /** 칸을 비운다. 빼낸 것을 돌려준다. */
  unequip(slot: number): EquipId | null {
    const id = this.slots[slot] ?? null
    this.slots[slot] = null
    return id
  }

  /** 칸의 것을 가방에 넣는다. (장비 화면) */
  stow(slot: number): EquipId | null {
    const id = this.unequip(slot)
    if (id) this.bag.push(id)
    return id
  }

  /** 가방의 것을 칸에 끼운다. 부위가 맞아야 하고, 칸에 있던 것은 가방으로 간다. (장비 화면) */
  wield(id: EquipId, slot: number): EquipId | null {
    const index = this.bag.indexOf(id)
    if (index < 0 || !this.fits(id, slot)) return null
    this.bag.splice(index, 1)
    const previous = this.stow(slot)
    this.slots[slot] = id
    return previous
  }

  /** 가방의 일반 장비를 버린다 (분해하기 전에 빼 둔다) */
  discard(id: EquipId): boolean {
    const index = this.bag.indexOf(id)
    if (index < 0) return false
    this.bag.splice(index, 1)
    if (isGearUid(id)) this.gear.delete(id)
    return true
  }

  /** 바꿔 끼면 고른 신화·가호가 어떻게 되는지 미리 본다. slot에 id를 끼운다고 친다. (id가 null이면 비운다고 친다) */
  preview(slot: number, id: EquipId | null): LoadoutState {
    const next = [...this.slots]
    const already = next.indexOf(id)
    if (id && already >= 0) next[already] = null
    next[slot] = id
    return resolveLoadout(
      next.map((x) => (x && isRelicId(x) ? x : null)),
      this.chosen,
    )
  }
}

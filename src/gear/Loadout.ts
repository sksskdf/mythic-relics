import { type GearPart, SLOT_PARTS } from '../data/gearData'
import { type God, isRelicId, type RelicId } from '../relics/data'
import { type LoadoutState, resolveLoadout } from '../myth/manifest'
import { emptyPantheon, type Pantheon } from '../myth/pantheon'
import { mergeGear, mergeGroups } from './merge'
import { type GearItem, isGearUid } from './roll'

/** 장비 칸 수 (E13: 무기·머리·몸·손·발·장신구 둘) */
export const SLOT_COUNT = SLOT_PARTS.length
/** 가방 칸 수 (E303, 휴대폰 세로 4×3). 가방이 차면 새 장비는 땅에 남는다 */
export const BAG_SIZE = 12
/** 재료 하나를 가질 수 있는 수 (저장을 읽을 때도 이만큼에서 자른다) */
export const MATERIAL_CAP = 9999

/** 칸·가방에 들어가는 것: 일반 장비 id(`g:`로 시작). 신화의 유물은 유물표에 켜진다 */
export type EquipId = string

/**
 * 장비 칸 7과 가방 (E13-02), 유물표 (E303-04, `CYCLE.md` 4.4).
 * 칸과 가방에는 일반 장비만 든다. 주운 것은 그 부위의 빈 칸에 바로 들어가고(조작 최소화), 칸이 차 있으면 가방으로 간다.
 * 신화의 유물은 칸을 차지하지 않고 유물표(`lit`)에 켜진다. 그 신이 자리에 들면 유물의 행동·오라가 깨어난다.
 * 유물표에는 처음 만든 영웅·전설 고유 효과도 켜진다(`uniquesSeen`). 켠 칸마다 모든 피해 +1%.
 * 일반 장비의 내용은 `gear`에, 유물의 단계는 `stages`에, 재료는 `materials`에 둔다.
 */
export class Loadout {
  readonly slots: (EquipId | null)[] = Array.from({ length: SLOT_COUNT }, () => null)
  /** 칸에 끼지 않은 일반 장비 */
  readonly bag: EquipId[] = []
  /** 유물표에 켠 신화의 유물 (얻은 차례) */
  readonly lit: RelicId[] = []
  /** 유물표에 켠 고유 효과 (처음 만든 영웅·전설의 것) */
  readonly uniquesSeen = new Set<string>()
  /** 가진 일반 장비 (칸·가방에 있는 것) */
  readonly gear = new Map<string, GearItem>()
  /** 유물 단계 1~4 (없으면 1) */
  readonly stages = new Map<RelicId, number>()
  /** 재료 개수 (재료가 된 유물, E13-04의 재료) */
  readonly materials = new Map<string, number>()
  /** 신의 자리 셋 (E302): 손의 신이 무기·리듬, 심장의 신이 궁극기, 숨의 신들이 패시브. 자리에 든 신의 유물이 깨어난다 */
  pantheon: Pantheon = emptyPantheon()
  /** 깨우는 중인 신 (E238): 조각 2(그 신의 유물)부터 그 신의 유물이 빌린 칸처럼 깨어난다 */
  waking: God | null = null

  get state(): LoadoutState {
    return resolveLoadout(this.relics, this.pantheon.hand)
  }

  /** 유물표에 켠 유물들 (얻은 차례) */
  get relics(): RelicId[] {
    return [...this.lit]
  }

  /** 유물표에 켠 칸 수 (유물 + 고유 효과) */
  get litCount(): number {
    return this.lit.length + this.uniquesSeen.size
  }

  /** 유물을 유물표에 켠다 (땅에서 주운 재료 유물은 재료 주머니로 가니 여기 오는 것은 신화의 유물과 점검용). 새로 켰으면 true */
  light(id: RelicId): boolean {
    if (this.lit.includes(id)) return false
    this.lit.push(id)
    return true
  }

  /** 유물표에서 끈다 (개발 도구) */
  unlight(id: RelicId): boolean {
    const i = this.lit.indexOf(id)
    if (i < 0) return false
    this.lit.splice(i, 1)
    return true
  }

  /** 칸에 낀 일반 장비들 */
  get wornGear(): GearItem[] {
    return this.slots.flatMap((id) => (isGearUid(id) && this.gear.has(id) ? [this.gear.get(id)!] : []))
  }

  /** 칸과 가방의 모든 것 */
  get owned(): EquipId[] {
    return [...this.slots.filter((id): id is EquipId => id !== null), ...this.bag]
  }

  /** 가진 유물 (유물표) */
  get ownedRelics(): RelicId[] {
    return [...this.lit]
  }

  has(id: EquipId): boolean {
    return this.slots.includes(id) || this.bag.includes(id) || (isRelicId(id) && this.lit.includes(id))
  }

  /** 그 장비의 부위 (유물은 칸에 들지 않아 없다) */
  partOf(id: EquipId): GearPart | null {
    return isGearUid(id) ? (this.gear.get(id)?.part ?? null) : null
  }

  /** 그 칸에 낄 수 있는가 (부위가 맞는가) */
  fits(id: EquipId, slot: number): boolean {
    return slot >= 0 && slot < SLOT_COUNT && this.partOf(id) === SLOT_PARTS[slot]
  }

  stage(id: RelicId): number {
    return this.stages.get(id) ?? 1
  }

  /** 일반 장비를 가진 것으로 적는다 (칸·가방에 넣기 전에). 고유 효과는 유물표에 켠다 */
  addGear(item: GearItem): void {
    this.gear.set(item.uid, item)
    for (const u of [item.unique, item.unique2]) if (u) this.uniquesSeen.add(u)
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

  /** 그 부위의 빈 칸에 끼운다. 빈 칸이 없으면 가방에 넣는다. 끼운 칸 번호를 돌려준다(가방·유물표면 -1). 신화의 유물은 유물표에 켠다 */
  equip(id: EquipId): number {
    if (isRelicId(id)) {
      this.light(id)
      return -1
    }
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

  /** 가방이 찼는가 */
  get bagFull(): boolean {
    return this.bag.length >= BAG_SIZE
  }

  /** 그 부위의 장비를 더 들 수 있는가: 그 부위 빈 칸이 있거나 가방에 자리가 있다 */
  canTake(part: GearPart): boolean {
    return !this.bagFull || this.slots.some((s, i) => s === null && SLOT_PARTS[i] === part)
  }

  /** 가방에서 합칠 수 있는 셋 묶음 (E303, 낀 것은 먹이에서 빠진다) */
  mergeable(): GearItem[][] {
    return mergeGroups(this.bag.flatMap((id) => (isGearUid(id) && this.gear.has(id) ? [this.gear.get(id)!] : [])))
  }

  /** 가방의 셋을 합쳐 한 등급 위 하나를 가방에 넣는다 (E303). 못 합치면 null */
  merge(uids: readonly string[], rng: () => number): GearItem | null {
    if (uids.some((u) => !this.bag.includes(u))) return null
    const out = mergeGear(
      uids.map((u) => this.gear.get(u)!).filter(Boolean),
      rng,
    )
    if (!out) return null
    for (const u of uids) this.discard(u)
    this.addGear(out)
    this.bag.push(out.uid)
    return out
  }

  /** 가방의 일반 장비를 버린다 (분해하기 전에 빼 둔다) */
  discard(id: EquipId): boolean {
    const index = this.bag.indexOf(id)
    if (index < 0) return false
    this.bag.splice(index, 1)
    if (isGearUid(id)) this.gear.delete(id)
    return true
  }

  /** 바꿔 끼면 고른 신화·가호가 어떻게 되는지 미리 본다 (유물은 칸에 들지 않아 장비를 바꿔도 같다) */
  preview(_slot: number, _id: EquipId | null): LoadoutState {
    return this.state
  }
}

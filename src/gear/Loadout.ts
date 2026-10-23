import { type God, godDef, type RelicId } from '../relics/data'
import { countByGod, type LoadoutState, resolveLoadout } from '../myth/manifest'

/** 유물 슬롯 수 */
export const SLOT_COUNT = 4

/** 유물 슬롯 4칸. 주운 유물은 빈 칸에 바로 들어간다. (조작 최소화) */
export class Loadout {
  readonly slots: (RelicId | null)[] = Array.from({ length: SLOT_COUNT }, () => null)
  /** 슬롯이 꽉 차서 끼지 못한 유물 */
  readonly bag: RelicId[] = []

  get state(): LoadoutState {
    return resolveLoadout(this.slots)
  }

  /**
   * 아직 아무 신도 발현하지 않았는데, 칸과 가방을 합치면 발현할 수 있는 신 (E6-07).
   * 칸이 다른 신 유물로 차서 세 번째 유물이 가방에 들어간 경우를 알려 주려고 쓴다. 이미 발현했으면 바꿀지는 플레이어의 몫이다.
   */
  manifestable(): God | null {
    if (this.state.manifested) return null
    for (const [god, count] of countByGod([...this.slots, ...this.bag])) if (count >= godDef(god).manifestCount) return god
    return null
  }

  has(id: RelicId): boolean {
    return this.slots.includes(id) || this.bag.includes(id)
  }

  /** 빈 칸에 끼운다. 칸이 없으면 가방에 넣는다. 끼운 칸 번호를 돌려준다(가방이면 -1). */
  equip(id: RelicId): number {
    if (this.has(id)) return this.slots.indexOf(id)
    const free = this.slots.indexOf(null)
    if (free < 0) {
      this.bag.push(id)
      return -1
    }
    this.slots[free] = id
    return free
  }

  /** 칸을 비운다. 빼낸 유물을 돌려준다. */
  unequip(slot: number): RelicId | null {
    const id = this.slots[slot] ?? null
    this.slots[slot] = null
    return id
  }

  /** 칸의 유물을 가방에 넣는다. (유물 화면) */
  stow(slot: number): RelicId | null {
    const id = this.unequip(slot)
    if (id) this.bag.push(id)
    return id
  }

  /** 가방의 유물을 칸에 끼운다. 칸에 다른 유물이 있으면 그것은 가방으로 간다. (유물 화면) */
  wield(id: RelicId, slot: number): RelicId | null {
    const index = this.bag.indexOf(id)
    if (index < 0 || slot < 0 || slot >= SLOT_COUNT) return null
    this.bag.splice(index, 1)
    const previous = this.stow(slot)
    this.slots[slot] = id
    return previous
  }

  /** 바꿔 끼면 발현·가호가 어떻게 되는지 미리 본다. slot에 id를 끼운다고 친다. (id가 null이면 비운다고 친다) */
  preview(slot: number, id: RelicId | null): LoadoutState {
    const next = [...this.slots]
    const already = next.indexOf(id)
    if (id && already >= 0) next[already] = null
    next[slot] = id
    return resolveLoadout(next)
  }
}

import { type God, godDef, relicDef, type RelicId } from './data'
import { relicGods } from './model'

/** 유물 슬롯 수 */
export const SLOT_COUNT = 4
/** 같은 신의 유물이 이 개수 이상이면 클래스가 발현된다. (신마다 다를 수 있다: gods.json의 manifestCount) */
export const MANIFEST_COUNT = 3

export interface LoadoutState {
  /** 발현된 신. 없으면 null */
  manifested: God | null
  /** 가호로 붙은 신들 */
  blessings: God[]
}

/** 유물들을 신마다 센다. 두 신이 함께 쓰는 유물(쿠사나기 등)은 두 신 모두에게 센다 */
export function countByGod(relics: readonly (RelicId | null)[]): Map<God, number> {
  const counts = new Map<God, number>()
  for (const id of relics) {
    if (!id) continue
    for (const god of relicGods(relicDef(id))) counts.set(god, (counts.get(god) ?? 0) + 1)
  }
  return counts
}

/**
 * 장착한 유물로 발현과 가호를 정한다. (DESIGN.md 4.2)
 * - 그 신의 발현 수(보통 3, 아수라왕 4)를 채운 신 가운데 가장 많은 신이 발현된다.
 * - 나머지 신은 가호로 붙는다. 발현 수를 채운 신끼리 수가 같으면 발현 없이 모두 가호다.
 */
export function resolveLoadout(relics: readonly (RelicId | null)[]): LoadoutState {
  const counts = countByGod(relics)
  let best: God | null = null
  let bestCount = 0
  let tie = false
  for (const [god, count] of counts) {
    if (count < godDef(god).manifestCount) continue
    if (count > bestCount) {
      best = god
      bestCount = count
      tie = false
    } else if (count === bestCount) {
      tie = true
    }
  }
  const manifested = best && !tie ? best : null
  const blessings = [...counts.keys()].filter((god) => god !== manifested)
  return { manifested, blessings }
}

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

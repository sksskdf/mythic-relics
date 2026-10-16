import { type God, relicDef, type RelicId } from './data'

/** 유물 슬롯 수 */
export const SLOT_COUNT = 4
/** 같은 신의 유물이 이 개수 이상이면 클래스가 발현된다. */
export const MANIFEST_COUNT = 3

export interface LoadoutState {
  /** 발현된 신. 없으면 null */
  manifested: God | null
  /** 가호로 붙은 신들 */
  blessings: God[]
}

/**
 * 장착한 유물로 발현과 가호를 정한다. (DESIGN.md 4.2)
 * - 같은 신의 유물이 3개 이상이고 가장 많으면 그 신이 발현된다.
 * - 나머지 신은 가호로 붙는다. 가장 많은 신이 둘 이상이면 발현 없이 모두 가호다.
 */
export function resolveLoadout(relics: readonly (RelicId | null)[]): LoadoutState {
  const counts = new Map<God, number>()
  for (const id of relics) {
    if (!id) continue
    const god = relicDef(id).god
    counts.set(god, (counts.get(god) ?? 0) + 1)
  }
  let best: God | null = null
  let bestCount = 0
  let tie = false
  for (const [god, count] of counts) {
    if (count > bestCount) {
      best = god
      bestCount = count
      tie = false
    } else if (count === bestCount) {
      tie = true
    }
  }
  const manifested = best && !tie && bestCount >= MANIFEST_COUNT ? best : null
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
}

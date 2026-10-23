import { type God, godDef, relicDef, type RelicId } from '../relics/data'
import { relicGods } from '../relics/model'

/**
 * 신화 판정 (E11-05에서 gear/Loadout에서 뗌).
 * 지금은 1차 스프린트 규칙: 장비한 유물을 신마다 세어 발현(지금 신화)과 가호를 정한다.
 * E12에서 "열린 신화(영구) + 고른 신화"로 바뀐다 (DESIGN.md 4.2).
 */

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


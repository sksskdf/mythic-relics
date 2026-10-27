import { type God, godDef, relicDef, type RelicId } from '../relics/data'
import { relicGods } from '../relics/model'

/**
 * 신화 판정 (E12-04, DESIGN.md 4.2).
 * - 지금 신화(코드 이름 manifested) = 고른 신화. 열린 신화 가운데 플레이어가 고른다. 유물 수로 정하지 않는다.
 * - 장비한 유물의 다른 신들은 가호(blessings)로 센다. 그 유물은 잠들어 기본 수치만 낸다 (E21-04).
 * - 1차 스프린트 규칙(같은 신 유물 셋이면 발현)은 히든 신화 열기와 옛 저장 옮기기에만 쓴다 (`legacyManifest`).
 */

/** 1차 스프린트: 같은 신의 유물이 이 개수 이상이면 발현 (gods.json의 manifestCount, 히든 신화를 여는 수) */
export const MANIFEST_COUNT = 3

export interface LoadoutState {
  /** 고른 신화. 없으면 null */
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

/** 고른 신화와 장착한 유물로 지금 신화와 가호를 정한다. */
export function resolveLoadout(relics: readonly (RelicId | null)[], chosen: God | null): LoadoutState {
  const blessings = [...countByGod(relics).keys()].filter((god) => god !== chosen)
  return { manifested: chosen, blessings }
}

/**
 * 1차 스프린트 규칙: 그 신의 발현 수(보통 3, 아수라왕 4)를 채운 신 가운데 가장 많은 신.
 * 발현 수를 채운 신끼리 수가 같으면 없다. 옛 저장의 고른 신화를 정할 때 쓴다.
 */
export function legacyManifest(relics: readonly (RelicId | null)[]): God | null {
  return legacyResolve(relics).manifested
}

/** 히든 신화(아수라왕): 그 신 유물을 발현 수만큼 가지면 열린다 (칸과 가방을 함께 센다) */
export function hiddenUnlocked(relics: readonly (RelicId | null)[]): God[] {
  return [...countByGod(relics)].filter(([god, n]) => godDef(god).hidden && n >= godDef(god).manifestCount).map(([god]) => god)
}

function legacyResolve(relics: readonly (RelicId | null)[]): LoadoutState {
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


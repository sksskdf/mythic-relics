import type { ClassPassive } from '../data/classKit'
import { type God, godDef } from '../relics/data'

/**
 * 신위 칸 (E237, MYTHBUILD.md 3.1): 깨운 신을 칸에 모아 함께 빌려 쓴다.
 * - 첫 칸(주신)은 지금까지의 고른 신화와 같다: 무기 휘두르기·리듬·궁극기·모습·패시브 전부·피해 배율
 * - 나머지 칸(빌린 힘)은 그 신의 대표 패시브 하나(`gods.json`의 lend)를 신 단계만큼, 그 신의 유물을 끼면 유물이 깨어난다
 * - 칸은 큰 체크포인트마다 하나씩 는다: 첫 신이 깨어나면 1, 두 번째 신 2, 장 보스(거인 왕·키마이라)마다 하나 더
 */

/** 칸은 넷까지 */
export const MAX_SLOTS = 4
/** 칸을 하나씩 더 주는 장 보스의 땅 (거인 왕·키마이라) */
export const SLOT_BOSSES: readonly string[] = ['utgard', 'lycia']
/** 빌린 신이 받는 경험치 비율 (주신은 다 받는다) */
export const BORROWED_XP = 0.5

/** 지금 쓸 수 있는 칸 수: 깨어난 신 수와 이긴 장 보스로 정한다 */
export function slotCount(awakened: number, beatenBosses: number): number {
  if (awakened <= 0) return 0
  return Math.min(MAX_SLOTS, 1 + (awakened >= 2 ? 1 : 0) + beatenBosses)
}

const lent = new Map<God, ClassPassive>()

/** 빌려주는 힘: 그 신의 대표 패시브 부품 하나만. 빌린 힘은 신 단계 1부터 켜진다 (주신일 때 늦게 켜지는 부품도) */
export function lentPassive(god: God): ClassPassive {
  let out = lent.get(god)
  if (!out) {
    const def = godDef(god)
    const part = def.passive[def.lend]!
    out = { damageScale: 1, attackSpeed: 1, [def.lend]: 'minLevel' in part ? { ...part, minLevel: 1 } : part }
    lent.set(god, out)
  }
  return out
}

/** 주신을 바꾼다: 고른 신이 맨 앞으로, 앞의 주신은 빌린 칸 맨 앞으로 (칸이 모자라면 뒤에서 빠진다) */
export function withMain(slots: readonly God[], god: God, count: number): God[] {
  return [god, ...slots.filter((g) => g !== god)].slice(0, Math.max(1, count))
}

/** 빌린 칸에 넣는다. 칸이 다 찼거나 이미 칸에 있으면 그대로 */
export function withLent(slots: readonly God[], god: God, count: number): God[] {
  if (slots.length === 0 || slots.includes(god) || slots.length >= count) return [...slots]
  return [...slots, god]
}

/** 빌린 칸에서 뺀다 (주신은 빼지 않는다) */
export function withoutLent(slots: readonly God[], god: God): God[] {
  return slots.filter((g, i) => i === 0 || g !== god)
}

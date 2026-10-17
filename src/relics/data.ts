import { DATA } from '../data'
import type { GodDef, RelicDef } from '../data/schema'

export type { GodDef, RelicDef } from '../data/schema'

/** 신 id (gods.json의 키) */
export type God = string
/** 유물 id (relics.json의 키) */
export type RelicId = string
/** 원천 (DESIGN.md 6장): 불꽃·사냥·바람·바위 */
export type { SourceId as Source } from '../data/schema'

/** 신·클래스 데이터 (src/data/gods.json) */
export const GODS: Readonly<Record<God, GodDef>> = DATA.gods
/** 유물 데이터 (src/data/relics.json) */
export const RELICS: Readonly<Record<RelicId, RelicDef>> = DATA.relics
export const RELIC_IDS: readonly RelicId[] = Object.keys(RELICS)

export function isRelicId(value: unknown): value is RelicId {
  return typeof value === 'string' && Object.hasOwn(RELICS, value)
}

/** 유물 데이터. 없는 id면 실패한다. (저장 검사 등으로 걸러진 id만 들어온다) */
export function relicDef(id: RelicId): RelicDef {
  const def = RELICS[id]
  if (!def) throw new Error(`없는 유물: ${id}`)
  return def
}

/** 신·클래스 데이터. 없는 id면 실패한다. */
export function godDef(id: God): GodDef {
  const def = GODS[id]
  if (!def) throw new Error(`없는 신: ${id}`)
  return def
}

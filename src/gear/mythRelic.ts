import type { GearPart } from '../data/gearData'
import type { StatKind } from '../data/mythAlways'
import type { SourceId } from '../data/schema'
import { LOOKS, type LookSlot } from '../looks/catalog'
import { type God, godDef, GODS, relicDef, type RelicId, RELIC_IDS } from '../relics/data'
import { createRng } from '../world/rng'
import { GEAR, landTier, roundStat, tierScale } from './roll'

/**
 * 신화의 유물 (E13-03 → E21-04, DESIGN.md 4.4): 신화마다 하나. 장비라 자기 부위를 차지하고, 대장간에서 단계를 올린다.
 * - 기본 수치는 같은 단계 영웅 장비보다 조금 못하다 (수치 넷 대신 셋, `relicStats`).
 * - 그 신화를 고르면 유물 효과가 한 단계 위로 돈다 (`effectStage`). 그래서 칸마다 "유물인가, 영웅 장비인가"가 신화에 따라 갈린다.
 * - 나머지 유물(메긴교르드·야른그레이프르 등)은 엔딩 뒤에만 떨어지는 재료다.
 */

/** 유물 단계 수 */
export const RELIC_STAGES = 4
/** 데모(첫 엔딩까지)에서 올릴 수 있는 유물 단계 (3·4단계는 엔딩 뒤) */
export const DEMO_RELIC_STAGES = 2
/** 유물 효과 단계마다 피해 배율 (5는 4단계 유물을 그 신화로 쓸 때) */
export const STAGE_DAMAGE: readonly number[] = [1, 1.3, 1.65, 2.1, 2.6]
/** 유물의 기본 수치 개수 (영웅 장비는 넷) */
export const RELIC_STAT_COUNT = 3
/** 단계마다 주는 원천 수치 (DESIGN.md 6.1) */
export const STAGE_SOURCE: readonly number[] = [2, 3, 4, 5]

/** 외형 칸 → 장비 부위 (얼굴은 머리, 망토는 몸, 허리는 장신구) */
const LOOK_PART: Readonly<Record<LookSlot, GearPart>> = {
  weapon: 'weapon',
  head: 'head',
  face: 'head',
  torso: 'body',
  cape: 'body',
  arms: 'hands',
  legs: 'feet',
  waist: 'trinket',
  mark: 'trinket',
}

/** 유물 → 그 유물이 신화의 유물인 신 */
const OWNER = new Map<RelicId, God>(Object.values(GODS).map((g) => [g.relic, g.id]))

/** 신화의 유물들 (신화마다 하나, 21개) */
export const MYTH_RELICS: readonly RelicId[] = [...OWNER.keys()]
/** 재료가 된 유물들 */
export const MATERIAL_RELICS: readonly RelicId[] = RELIC_IDS.filter((id) => !OWNER.has(id))

export const isMythRelic = (id: string): boolean => OWNER.has(id)
/** 그 유물이 신화의 유물인 신 (재료면 없음) */
export const relicMyth = (id: RelicId): God | undefined => OWNER.get(id)
/** 그 신화의 유물 */
export const mythRelic = (god: God): RelicId => godDef(god).relic

/** 유물이 차지하는 장비 부위 (외형 칸으로 정한다) */
export function relicPart(id: RelicId): GearPart {
  return LOOK_PART[LOOKS[relicDef(id).look]!.slot]
}

/** 유물이 주는 원천: 그 신화의 원천 */
export function relicSource(id: RelicId, stage: number): { id: SourceId; value: number } {
  const god = relicMyth(id) ?? relicDef(id).god
  return { id: godDef(god).source, value: STAGE_SOURCE[Math.max(1, Math.min(RELIC_STAGES, stage)) - 1]! }
}

/** 그 유물을 깨우는 신화: 신화의 유물이면 그 신화, 재료가 된 유물이면 그 신 */
export function relicOwner(id: RelicId): God {
  return relicMyth(id) ?? relicDef(id).god
}

/** 유물의 힘(지속·행동 효과)은 그 신화를 골랐을 때만 깨어난다 (E21-04). 아니면 기본 수치만 */
export function relicAwake(id: RelicId, chosen: God | null): boolean {
  return chosen !== null && relicOwner(id) === chosen
}

/** 유물 효과가 도는 단계: 그 신화를 골랐으면 한 단계 위 (E21-04) */
export function effectStage(id: RelicId, stage: number, chosen: God | null): number {
  return Math.min(STAGE_DAMAGE.length, Math.max(1, stage) + (chosen !== null && relicMyth(id) === chosen ? 1 : 0))
}

/** 유물 효과 피해 배율 */
export function effectScale(id: RelicId, stage: number, chosen: God | null): number {
  return STAGE_DAMAGE[effectStage(id, stage, chosen) - 1]!
}

/** 유물의 장비 단계: 그 신화권 장의 단계 + 유물 단계 − 1 (히든 신화는 1장) */
export function relicTier(id: RelicId, stage: number): number {
  const god = godDef(relicMyth(id) ?? relicDef(id).god)
  return landTier(god.realm) + Math.max(1, stage) - 1
}

/**
 * 유물의 기본 수치 (E21-04): 그 부위 수치 가운데 셋(유물마다 정해짐)을 영웅 등급·그 단계의 가운데 값으로.
 * 같은 단계 영웅 장비(수치 넷)보다 조금 못하다.
 */
export function relicStats(id: RelicId, stage: number): { kind: StatKind; value: number }[] {
  const pool = [...GEAR.parts[relicPart(id)].stats]
  let seed = 0
  for (const c of id) seed = (seed * 31 + c.charCodeAt(0)) >>> 0
  const rng = createRng(seed)
  const scale = GEAR.grades.hero.scale * tierScale(relicTier(id, stage))
  const out: { kind: StatKind; value: number }[] = []
  for (let i = 0; i < RELIC_STAT_COUNT && pool.length > 0; i++) {
    const kind = pool.splice(Math.floor(rng() * pool.length), 1)[0]!
    const [lo, hi] = GEAR.ranges[kind]
    out.push({ kind, value: roundStat(kind, ((lo + hi) / 2) * scale) })
  }
  return out
}

/** 단계 이름: 1단계는 유물 이름, 2~4단계는 데이터의 이름 또는 「깨어난 ○○ / 빛나는 ○○ / 신화의 ○○」 */
export function stageName(id: RelicId, stage: number): string {
  const def = relicDef(id)
  if (stage <= 1) return def.name
  const names = def.stages ?? [`깨어난 ${def.name}`, `빛나는 ${def.name}`, `신화의 ${def.name}`]
  return names[Math.min(RELIC_STAGES, stage) - 2]!
}

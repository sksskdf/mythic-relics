import type { GearPart } from '../data/gearData'
import type { SourceId } from '../data/schema'
import { LOOKS, type LookSlot } from '../looks/catalog'
import { type God, godDef, GODS, relicDef, type RelicId, RELIC_IDS } from '../relics/data'

/**
 * 신화의 유물 (E13-03, DESIGN.md 4.4): 신화마다 하나. 장비라 자기 부위를 차지하고, 대장간에서 4단계까지 올린다.
 * 나머지 유물(메긴교르드·야른그레이프르 등)은 상위 단계 재료가 된다.
 */

/** 유물 단계 수 */
export const RELIC_STAGES = 4
/** 단계마다 유물 효과 피해 배율 */
export const STAGE_DAMAGE: readonly number[] = [1, 1.3, 1.65, 2.1]
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

/** 단계 이름: 1단계는 유물 이름, 2~4단계는 데이터의 이름 또는 「깨어난 ○○ / 빛나는 ○○ / 신화의 ○○」 */
export function stageName(id: RelicId, stage: number): string {
  const def = relicDef(id)
  if (stage <= 1) return def.name
  const names = def.stages ?? [`깨어난 ${def.name}`, `빛나는 ${def.name}`, `신화의 ${def.name}`]
  return names[Math.min(RELIC_STAGES, stage) - 2]!
}

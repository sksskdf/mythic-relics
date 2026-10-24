import { DATA } from '../data'
import type { GearPart, Grade } from '../data/gearData'
import type { StatKind } from '../data/mythAlways'
import { type God, godDef, GODS, relicDef, type RelicId } from '../relics/data'
import type { Loadout } from './Loadout'
import { bossMaterial, mythMaterial, realmMaterial } from './materials'
import { MATERIAL_RELICS, mythRelic, RELIC_STAGES, relicPart } from './mythRelic'
import { isGearUid } from './roll'

/**
 * 대장간 (E13-05, DESIGN.md 4.4): 제작법은 규칙으로 만든다 (신화마다 손으로 적지 않는다).
 * - 1단계(처음 제작): 같은 부위 일반 장비(바탕, 사라진다) + 그 신화 고유 재료 ×6 + 그 신화권 공통 재료 ×10.
 *   바탕 장비의 첫 수치는 유물이 물려받는다 (바탕 등급이 높을수록 좋다).
 * - 2·3단계: 유물 + 재료가 된 그 신의 유물 하나씩(메긴교르드 → 야른그레이프르) + 그 땅 보스의 귀한 재료 + 고유 재료.
 * - 4단계: 유물 + 보스 재료 ×3 + 고유 재료 ×20 + 공통 재료 ×30.
 */
export interface Recipe {
  relic: RelicId
  /** 올라갈 단계 (1이면 처음 제작) */
  stage: number
  /** 바탕이 될 일반 장비의 부위 (처음 제작만) */
  base?: GearPart
  /** 쓰는 재료와 개수 */
  materials: { id: string; count: number }[]
}

/** 신화의 땅 보스: 그 신화권 지역 보스 (히든 신화는 거인 왕) */
function realmBoss(god: God): string {
  const realm = godDef(god).realm
  const boss = Object.values(DATA.enemies).find((e) => e.boss && e.realm === realm && e.role === 'boss')
  return boss?.boss ?? 'giantKing'
}

/** 그 신의 재료가 된 유물들 (2·3단계에 하나씩) */
export function stageRelics(god: God): RelicId[] {
  return MATERIAL_RELICS.filter((id) => relicDef(id).god === god || relicDef(id).also.includes(god))
}

/** 그 신화의 유물을 stage 단계로 만드는(올리는) 제작법 */
export function recipeFor(god: God, stage: number): Recipe {
  const relic = mythRelic(god)
  const own = mythMaterial(god)!
  const def = godDef(god)
  const common = realmMaterial(def.realm)
  const boss = bossMaterial(realmBoss(god))
  const extra = stageRelics(god)
  const m: { id: string; count: number }[] = []
  const add = (id: string | undefined, count: number) => id && count > 0 && m.push({ id, count })
  if (stage === 1) {
    add(own, 6)
    // 히든 신화는 신화권이 없어 공통 재료 대신 재료가 된 유물 둘을 쓴다
    if (common) add(common, 10)
    else for (const id of extra) add(id, 1)
    return { relic, stage, base: relicPart(relic), materials: m }
  }
  if (stage <= 3) {
    add(extra[stage - 2] ?? extra[0], 1)
    add(boss, stage - 1)
    add(own, stage === 2 ? 10 : 15)
    return { relic, stage, materials: m }
  }
  add(boss, 3)
  add(own, 20)
  add(common ?? own, 30)
  return { relic, stage, materials: m }
}

/** 모든 제작법 (신화 21 × 4단계) */
export function allRecipes(): Recipe[] {
  return Object.keys(GODS).flatMap((god) => Array.from({ length: RELIC_STAGES }, (_, i) => recipeFor(god, i + 1)))
}

/** 지금 할 수 있는 다음 제작: 유물이 없으면 1단계, 있으면 다음 단계 (4단계면 없음) */
export function nextRecipe(loadout: Loadout, god: God): Recipe | null {
  const relic = mythRelic(god)
  if (!loadout.has(relic)) return recipeFor(god, 1)
  const stage = loadout.stage(relic)
  return stage < RELIC_STAGES ? recipeFor(god, stage + 1) : null
}

/** 모자란 재료 (없으면 빈 목록) */
export function missing(loadout: Loadout, recipe: Recipe): { id: string; count: number }[] {
  return recipe.materials.flatMap(({ id, count }) => {
    const have = loadout.materials.get(id) ?? 0
    return have >= count ? [] : [{ id, count: count - have }]
  })
}

/** 바탕으로 쓸 수 있는 일반 장비: 그 부위, 가방에 있는 것부터 (낀 것도 쓸 수 있다) */
export function baseCandidates(loadout: Loadout, part: GearPart): string[] {
  return [...loadout.bag, ...loadout.slots.filter((x): x is string => x !== null)].filter((id) => isGearUid(id) && loadout.gear.get(id)?.part === part)
}

/** 유물이 바탕 장비에서 물려받은 수치 */
export type Inherited = { kind: StatKind; value: number }

/**
 * 만든다 (올린다). 재료가 모자라거나 바탕이 없으면 아무것도 쓰지 않고 null.
 * 처음 제작이면 바탕 장비를 없애고(낀 칸이었으면 그 칸에 유물을 낀다) 유물을 가방이나 칸에 넣는다.
 * @returns 만든 유물과 단계
 */
export function craft(loadout: Loadout, god: God, baseId?: string): { relic: RelicId; stage: number; inherited?: Inherited; slot: number } | null {
  const recipe = nextRecipe(loadout, god)
  if (!recipe || missing(loadout, recipe).length > 0) return null
  let inherited: Inherited | undefined
  let slot = -1
  if (recipe.stage === 1) {
    const base = baseId ?? baseCandidates(loadout, recipe.base!)[0]
    const item = base ? loadout.gear.get(base) : undefined
    if (!base || !item || item.part !== recipe.base) return null
    inherited = item.stats[0] ? { ...item.stats[0] } : undefined
    // 바탕이 낀 칸에 있었으면 그 칸을 유물에 물려준다
    slot = loadout.slots.indexOf(base)
    if (slot >= 0) loadout.unequip(slot)
    else loadout.bag.splice(loadout.bag.indexOf(base), 1)
    loadout.gear.delete(base)
  }
  for (const { id, count } of recipe.materials) loadout.useMaterial(id, count)
  if (recipe.stage === 1) {
    if (inherited) loadout.inherited.set(recipe.relic, inherited)
    if (slot >= 0) loadout.slots[slot] = recipe.relic
    else slot = loadout.equip(recipe.relic)
  } else {
    loadout.stages.set(recipe.relic, recipe.stage)
    slot = loadout.slots.indexOf(recipe.relic)
  }
  return { relic: recipe.relic, stage: recipe.stage, ...(inherited ? { inherited } : {}), slot }
}

/** 분해하면 나오는 그 땅 공통 재료 수 (E13-07-3) */
export const SALVAGE: Readonly<Record<Grade, number>> = { common: 1, good: 2, rare: 4, hero: 8 }

/** 일반 장비를 분해한다: 칸이나 가방에서 없애고 공통 재료를 준다. 나온 재료와 수 (장비가 아니면 null) */
export function salvage(loadout: Loadout, id: string, realm: string): { material: string; count: number; slot: number } | null {
  const item = loadout.gear.get(id)
  const material = realmMaterial(realm)
  if (!item || !material || !loadout.has(id)) return null
  const slot = loadout.slots.indexOf(id)
  if (slot >= 0) loadout.unequip(slot)
  else loadout.bag.splice(loadout.bag.indexOf(id), 1)
  loadout.gear.delete(id)
  const count = SALVAGE[item.grade]
  loadout.addMaterial(material, count)
  return { material, count, slot }
}


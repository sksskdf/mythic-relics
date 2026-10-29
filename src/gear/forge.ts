import { DATA } from '../data'
import { type God, godDef, GODS, type RelicId } from '../relics/data'
import type { Loadout } from './Loadout'
import { bossMaterial, PROTOTYPE } from './materials'
import { PROTOTYPE_VALUE } from './merge'
import { mythRelic, RELIC_STAGES } from './mythRelic'
import { GEAR, landTier } from './roll'

/**
 * 대장간 (E13-05 → E21-04 → E303-04, `CYCLE.md` 5.5): 제작법은 규칙으로 만든다 (신화마다 손으로 적지 않는다).
 * 유물 단계는 보스가 연다: 단계 s는 (그 신화의 장 + s − 1)번째 장 보스의 재료 하나와 원형.
 * - 1단계(처음 제작): 자기 장 보스 재료 ×1 + 원형 ×30 (토르: 거인 왕의 심장)
 * - 2단계: 다음 장 보스 재료 ×1 + 원형 ×60 (토르: 키마이라의 불꽃)
 * - 3·4단계는 엔딩 뒤 (×120, ×240). 장이 끝나면 첫 장으로 돈다.
 * 일반 장비는 합치거나, 녹여 원형이 된다 (`melt`: 장비 탭의 「녹이기」·자동 녹이기·귀환)
 */
export interface Recipe {
  relic: RelicId
  /** 올라갈 단계 (1이면 처음 제작) */
  stage: number
  /** 쓰는 재료와 개수 */
  materials: { id: string; count: number }[]
}

/** 단계마다 드는 원형 수 */
export const RECIPE_REALM_COUNT: readonly number[] = [30, 60, 120, 240]

/** 그 신화권의 장 보스 (enemies.json에서 그 신화권의 보스) */
function realmBoss(realm: string): string | undefined {
  return Object.values(DATA.enemies).find((e) => e.boss && e.realm === realm && e.role === 'boss')?.boss
}

/** n번째 장의 신화권 (장 수를 넘으면 첫 장으로 돈다) */
function chapterRealm(n: number): string {
  const order = Object.entries(GEAR.tiers.realms).sort((a, b) => a[1] - b[1]).map(([realm]) => realm)
  return order[(((n - 1) % order.length) + order.length) % order.length]!
}

/** 그 신화의 유물을 stage 단계로 만드는(올리는) 제작법 */
export function recipeFor(god: God, stage: number): Recipe {
  const relic = mythRelic(god)
  const realm = chapterRealm(landTier(godDef(god).realm) + stage - 1)
  const materials: { id: string; count: number }[] = []
  const boss = realmBoss(realm)
  const bossId = boss ? bossMaterial(boss) : undefined
  if (bossId) materials.push({ id: bossId, count: 1 })
  materials.push({ id: PROTOTYPE, count: RECIPE_REALM_COUNT[stage - 1] ?? RECIPE_REALM_COUNT.at(-1)! })
  return { relic, stage, materials }
}

/** 모든 제작법 (신화 21 × 4단계) */
export function allRecipes(): Recipe[] {
  return Object.keys(GODS).flatMap((god) => Array.from({ length: RELIC_STAGES }, (_, i) => recipeFor(god, i + 1)))
}

/** 지금 할 수 있는 다음 제작: 유물이 없으면 1단계, 있으면 다음 단계. maxStage(데모 2, 엔딩 뒤 4)까지 올렸으면 없음 */
export function nextRecipe(loadout: Loadout, god: God, maxStage = RELIC_STAGES): Recipe | null {
  const relic = mythRelic(god)
  if (!loadout.has(relic)) return recipeFor(god, 1)
  const stage = loadout.stage(relic)
  return stage < Math.min(RELIC_STAGES, maxStage) ? recipeFor(god, stage + 1) : null
}

/** 모자란 재료 (없으면 빈 목록) */
export function missing(loadout: Loadout, recipe: Recipe): { id: string; count: number }[] {
  return recipe.materials.flatMap(({ id, count }) => {
    const have = loadout.materials.get(id) ?? 0
    return have >= count ? [] : [{ id, count: count - have }]
  })
}

/**
 * 만든다 (올린다). 재료가 모자라면 아무것도 쓰지 않고 null.
 * 처음 제작이면 유물을 유물표에 켠다 (E303-04).
 * @returns 만든 유물과 단계
 */
export function craft(loadout: Loadout, god: God, maxStage = RELIC_STAGES): { relic: RelicId; stage: number } | null {
  const recipe = nextRecipe(loadout, god, maxStage)
  if (!recipe || missing(loadout, recipe).length > 0) return null
  for (const { id, count } of recipe.materials) loadout.useMaterial(id, count)
  if (recipe.stage === 1) loadout.light(recipe.relic)
  else loadout.stages.set(recipe.relic, recipe.stage)
  return { relic: recipe.relic, stage: recipe.stage }
}

/** 일반 장비를 녹인다 (E303-04): 칸이나 가방에서 없애고 그 등급의 원형 값을 준다 (자동 녹이기, 귀환 E304). 장비가 아니면 null */
export function melt(loadout: Loadout, id: string): { material: string; count: number; slot: number } | null {
  const item = loadout.gear.get(id)
  if (!item || !loadout.has(id)) return null
  const slot = loadout.slots.indexOf(id)
  if (slot >= 0) loadout.unequip(slot)
  else loadout.bag.splice(loadout.bag.indexOf(id), 1)
  loadout.gear.delete(id)
  const count = PROTOTYPE_VALUE[item.grade]
  loadout.addMaterial(PROTOTYPE, count)
  return { material: PROTOTYPE, count, slot }
}

/** 지금 바로 벼릴 수 있는가: 재료가 다 찼다 */
export function forgeReady(loadout: Loadout, god: God, maxStage = RELIC_STAGES): boolean {
  const recipe = nextRecipe(loadout, god, maxStage)
  return recipe !== null && missing(loadout, recipe).length === 0
}


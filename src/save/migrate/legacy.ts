import { DATA } from '../../data'
import { REGIONS } from '../../data/regions'
import { MASTERY_TO_OPEN, XP_TO_PROMOTE } from '../../myth/ClassProgress'
import { isMythRelic } from '../../gear/mythRelic'
import { BAG_SIZE, MATERIAL_CAP } from '../../gear/Loadout'
import { bossMaterial, MATERIALS, PROTOTYPE, realmMaterial } from '../../gear/materials'
import { PROTOTYPE_VALUE } from '../../gear/merge'
import { type GearItem, gearScore } from '../../gear/roll'
import { GRADES, SLOT_PARTS } from '../../data/gearData'
import { hiddenUnlocked } from '../../myth/manifest'
import { relicGods } from '../../relics/model'
import { type ChapterData, parseChapterData } from '../../progress/Chapters'
import type { ConvenienceData } from '../../progress/Conveniences'
import type { ThreatData } from '../../progress/Threat'
import { STARTING_LOOKS } from '../../looks/catalog'
import { type God, godDef, GODS, isRelicId, relicDef, type RelicId } from '../../relics/data'
import type { SaveData } from '../SaveData'

/**
 * 옛 저장 옮기기 (E301-03, `CYCLE.md` 9장): 옛 버전을 지금 모양으로 올릴 때만 쓰는 것을 한곳에 모았다.
 * `parseSave`가 버전을 보고 부른다. v14부터는 버전마다 `migrate/v14.ts`처럼 하나씩 둔다
 */

const isRelic = isRelicId

/** v8 이하의 신화 고유 재료 → 그 신 (E21-04에서 없앰. 그 신의 신화권 재료로 하나씩 바꿔 준다, 히든은 북유럽) */
export const OLD_MYTH_MATERIALS: Readonly<Record<string, God>> = {
  thunderShard: 'thor',
  shadowThread: 'loki',
  runeChip: 'odin',
  goldenBristle: 'freyr',
  boltChip: 'zeus',
  seaSalt: 'poseidon',
  underworldAsh: 'hades',
  silverFeather: 'artemis',
  monkeyHair: 'wukong',
  osmanthusLeaf: 'change',
  pearlDust: 'longwang',
  lotusPetal: 'nezha',
  sunBead: 'amaterasu',
  moonDew: 'tsukuyomi',
  thunderCloud: 'raijin',
  stormSand: 'susanoo',
  crowFeather: 'haemosu',
  flowerSeed: 'bari',
  goblinEmber: 'dokkaebi',
  mountainStone: 'mago',
  bladeShard: 'asura',
}

/** 옛 순환 성장 → 재료 (E14-06) */
export const CYCLE_REFUND = { essencePer: 100, essenceTo: 'frostShard', essenceMax: 300, ashPer: 3, ashTo: 'giantHeart', ashMax: 20 } as const

/** v10 이하 → v11: 모은 경험치를 신화 경험치로 짐작한다 (E236). 신화마다 연 문턱·단계 문턱·지금 경험치의 합 가운데 가장 큰 것 */
export function oldTrainingXp(classes: SaveData['classes']): number {
  let best = 0
  for (const record of Object.values(classes)) {
    if (!record) continue
    const spent = record.level >= 1 ? MASTERY_TO_OPEN + XP_TO_PROMOTE.slice(0, record.level - 1).reduce((a, b) => a + b, 0) : 0
    best = Math.max(best, spent + record.xp)
  }
  return best
}

/** v5 이하 → v6: 원천 결정과 윤회의 재를 재료로 바꿔 준다 */
export function refundCycle(raw: unknown, materials: Record<string, number>): void {
  if (typeof raw !== 'object' || raw === null) return
  const o = raw as Record<string, unknown>
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
  const essence = typeof o.essence === 'object' && o.essence !== null ? Object.values(o.essence as Record<string, unknown>).reduce<number>((a, v) => a + n(v), 0) : 0
  const r = CYCLE_REFUND
  const shards = Math.min(r.essenceMax, Math.floor(essence / r.essencePer))
  const hearts = Math.min(r.ashMax, Math.floor(n(o.ash) / r.ashPer))
  if (shards > 0) materials[r.essenceTo] = Math.min(9999, (materials[r.essenceTo] ?? 0) + shards)
  if (hearts > 0) materials[r.ashTo] = Math.min(9999, (materials[r.ashTo] ?? 0) + hearts)
}

/** v5 이하의 별자리(E4.5)에서 밝힌 별 수 → 성좌판의 별 (E17-05) */
export function oldStars(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) return 0
  const stars = (raw as Record<string, unknown>).stars
  if (typeof stars !== 'object' || stars === null) return 0
  return Object.values(stars as Record<string, unknown>).reduce<number>((s, v) => s + (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(10, Math.round(v)) : 0), 0)
}

/** 성좌판의 별 하나를 바꿔 주는 명성 (E305-03, `CYCLE.md` 9장 v17) */
export const LEGACY_STAR_RENOWN = 20

/**
 * v16 이하 → v17: 성좌판(E17-05)을 걷었으니 밝힌 별과 남은 별 하나마다 명성 20을 준다.
 * 밝힌 별은 있는 신만 세고, v5 이하 별자리의 별(`oldStars`)은 남은 별로 친다
 */
export function legacyStarRenown(rift: unknown, cycle: unknown, version: number): number {
  const o = (typeof rift === 'object' && rift !== null ? rift : {}) as Record<string, unknown>
  const left = typeof o.stars === 'number' && Number.isFinite(o.stars) ? Math.max(0, Math.min(999, Math.round(o.stars))) : 0
  const lit = new Set((Array.isArray(o.lit) ? o.lit : []).filter((g): g is God => typeof g === 'string' && Object.hasOwn(GODS, g))).size
  return (left + lit + (version < 6 ? oldStars(cycle) : 0)) * LEGACY_STAR_RENOWN
}

/** v8 이하 → v9: 신화 고유 재료를 그 신의 신화권 재료로 하나씩 바꿔 준다 (E21-04) */
export function refundMythMaterials(materials: Record<string, number>): void {
  for (const [id, god] of Object.entries(OLD_MYTH_MATERIALS)) {
    const n = materials[id]
    if (!n) continue
    delete materials[id]
    const to = realmMaterial(godDef(god).realm) ?? 'frostShard'
    materials[to] = Math.min(MATERIAL_CAP, (materials[to] ?? 0) + n)
  }
}

/** 신화권 재료 하나 = 원형 몇 (E303-04: 원형이 나오는 수와 대장간 값을 셋 배로 올린 만큼) */
export const REALM_TO_PROTOTYPE = 3

/** v14 이하 → v15: 신화권 재료를 원형 셋씩으로 바꿔 준다 (모아 둔 재료로 벼릴 수 있던 만큼 그대로) */
export function realmToPrototype(materials: Record<string, number>): void {
  for (const [id, n] of Object.entries(materials)) {
    if (MATERIALS[id]?.kind !== 'realm') continue
    delete materials[id]
    materials[PROTOTYPE] = Math.min(MATERIAL_CAP, (materials[PROTOTYPE] ?? 0) + n * REALM_TO_PROTOTYPE)
  }
}

/** v14 이하 → v15: 가방은 12칸이 끝이라 넘친 일반 장비는 낮은 등급부터 녹여 원형으로 (E303-02·04). 남은 가방 */
export function meltOverflow(bag: readonly string[], gear: ReadonlyMap<string, GearItem>, materials: Record<string, number>): string[] {
  const over = bag.length - BAG_SIZE
  if (over <= 0) return [...bag]
  const melt = new Set(
    bag
      .filter((id) => gear.has(id))
      .sort((a, b) => GRADES.indexOf(gear.get(a)!.grade) - GRADES.indexOf(gear.get(b)!.grade) || gear.get(a)!.tier - gear.get(b)!.tier)
      .slice(0, over),
  )
  for (const id of melt) materials[PROTOTYPE] = Math.min(MATERIAL_CAP, (materials[PROTOTYPE] ?? 0) + PROTOTYPE_VALUE[gear.get(id)!.grade])
  return bag.filter((id) => !melt.has(id))
}

/** v14 이하 → v15: 신화의 유물이 비운 장비 칸을 가방의 가장 좋은 장비로 채운다 (E303-04). 남은 가방 */
export function fillEmptySlots(slots: (string | null)[], bag: readonly string[], gear: ReadonlyMap<string, GearItem>): string[] {
  const rest = [...bag]
  for (let i = 0; i < Math.min(slots.length, SLOT_PARTS.length); i++) {
    if (slots[i] !== null) continue
    const fits = rest.filter((id) => gear.get(id)?.part === SLOT_PARTS[i])
    const best = fits.sort((a, b) => gearScore(gear.get(b)!) - gearScore(gear.get(a)!))[0]
    if (!best) continue
    slots[i] = best
    rest.splice(rest.indexOf(best), 1)
  }
  return rest
}

/** v9 이하 → v10: 장 진행을 그때까지 한 것에서 짐작한다 (E22) */
export function oldChapters(region: SaveData['region'], conveniences: ConvenienceData, threat: ThreatData, materials: Record<string, number>, owned: readonly RelicId[]): ChapterData {
  const entered = new Set<string>([...(region ? [region.id] : []), ...conveniences.visited])
  const beaten = (realm: string) => {
    const boss = Object.values(DATA.enemies).find((e) => e.boss && e.realm === realm && e.role === 'boss')?.boss
    const material = boss ? bossMaterial(boss) : undefined
    return (threat.cleared[realm] ?? 0) > 0 || (material !== undefined && (materials[material] ?? 0) > 0) || owned.some((id) => isMythRelic(id) && godDef(relicDef(id).god).realm === realm)
  }
  const bosses = Object.values(REGIONS)
    .filter((r) => r.zone === 'boss' && r.boss && !r.finale && r.realm && beaten(r.realm))
    .map((r) => r.id)
  for (const id of bosses) entered.add(id)
  return parseChapterData({ entered: [...entered], bosses })
}

/** 옛 저장의 칸 그대로 (1차 발현 규칙으로 고른 신화를 정할 때) */
export function legacySlots(raw: unknown): (RelicId | null)[] {
  return (Array.isArray(raw) ? raw : []).map((id) => (isRelic(id) ? id : null))
}

/** v3 → v4: 가진 유물의 신화를 1단계로 연다 (E12-04 규칙: 그 신 유물을 손에 넣으면 열린다. 히든은 유물 수) */
export function openOwned(classes: SaveData['classes'], owned: readonly (RelicId | null)[]): SaveData['classes'] {
  const out: SaveData['classes'] = { ...classes }
  const gods = new Set<God>(hiddenUnlocked(owned))
  for (const id of owned) if (id) for (const god of relicGods(relicDef(id))) if (!godDef(god).hidden) gods.add(god)
  for (const god of gods) if ((out[god]?.level ?? 0) < 1) out[god] = { level: 1, xp: 0 }
  return out
}

/** v1 → v2: 그때까지 가진 유물과 발현해 본 클래스의 외형을 얻은 것으로 친다. 고른 것은 모두 "자동" */
export function migrateLooks(slots: (RelicId | null)[], bag: RelicId[], classes: SaveData['classes']): SaveData['looks'] {
  const unlocked = new Set(STARTING_LOOKS)
  for (const id of [...slots, ...bag]) if (id) unlocked.add(relicDef(id).look)
  for (const god of Object.keys(classes)) for (const look of Object.values(godDef(god).looks)) unlocked.add(look)
  return { unlocked: [...unlocked], choices: {} }
}

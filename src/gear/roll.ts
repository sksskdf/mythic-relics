import gearJson from '../data/gear.json'
import { GEAR_PARTS, type GearData, type GearPart, type Grade, GRADES, type LandZone, parseGear } from '../data/gearData'
import type { StatKind } from '../data/mythAlways'
import { SOURCE_IDS, type SourceId } from '../data/schema'

/** 검사를 마친 일반 장비 데이터 */
export const GEAR: GearData = parseGear(gearJson)

/** 일반 장비 하나 (E13-02): 부위·바탕 이름·등급·단계·수치·원천, 영웅이면 고유 효과 */
export interface GearItem {
  /** 장비를 가리키는 id (칸·가방에는 이 값이 들어간다) */
  uid: string
  part: GearPart
  base: string
  grade: Grade
  /** 장비 단계 (E21-03): 나온 땅의 단계. 단계마다 수치 ×1.4 */
  tier: number
  stats: { kind: StatKind; value: number }[]
  /** 원천 수치: 등급 수치와 따로 늘 하나 (DESIGN.md 4.3.1) */
  source: { id: SourceId; value: number }
  /** 고유 효과: 영웅 하나, 전설은 둘(unique2) */
  unique?: string
  unique2?: string
}

/** 장비 id는 이 글자로 시작한다 (유물 id와 섞여 칸에 들어가므로) */
export const GEAR_PREFIX = 'g:'
export const isGearUid = (id: string | null | undefined): id is string => typeof id === 'string' && id.startsWith(GEAR_PREFIX)

const pick = <T>(rng: () => number, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!

/** 장비 단계의 수치 배율 (1단계 = 1) */
export function tierScale(tier: number, data: GearData = GEAR): number {
  return data.tiers.scale ** (Math.max(1, tier) - 1)
}

/** 그 신화권 땅의 단계 (장 순서). 신화권이 없거나 모르면 1 */
export function landTier(realm: string | null | undefined, data: GearData = GEAR): number {
  return (realm && data.tiers.realms[realm]) || 1
}

/** 땅 자리(입구·깊은 땅·보스의 땅)의 등급 확률 (자리가 없으면 데이터의 기본 확률) */
export function landChances(zone: LandZone | null | undefined, data: GearData = GEAR): Record<Grade, number> {
  if (zone) return { ...data.lands[zone].chances }
  return Object.fromEntries(GRADES.map((g) => [g, data.grades[g].chance])) as Record<Grade, number>
}

/** 비율 수치는 0.1% 단위, 생명 같은 수는 0.1 단위로 */
export function roundStat(kind: StatKind, value: number): number {
  const flat = kind === 'maxHp' || kind === 'healOnKill'
  if (flat) return Math.round(value)
  if (kind === 'regen') return Math.round(value * 10) / 10
  return Math.round(value * 1000) / 1000
}

/** 등급을 굴린다. min보다 낮으면 min으로 올린다 (보스). chances가 있으면 데이터 확률 대신 (위협 단계, E14-03) */
export function rollGrade(rng: () => number, min: Grade = 'common', data: GearData = GEAR, chances?: Readonly<Record<Grade, number>>): Grade {
  let r = rng()
  let grade: Grade = 'common'
  for (const g of GRADES) {
    r -= chances?.[g] ?? data.grades[g].chance
    grade = g
    if (r < 0) break
  }
  return GRADES.indexOf(grade) < GRADES.indexOf(min) ? min : grade
}

/** 장비를 굴린다: 부위(없으면 무작위) → 등급 → 수치(부위 목록에서 겹치지 않게, 단계 배율) → 원천 → 영웅이면 고유 효과. 같은 난수면 같은 장비 */
export function rollGear(rng: () => number, options: { part?: GearPart; grade?: Grade; minGrade?: Grade; chances?: Readonly<Record<Grade, number>>; tier?: number } = {}, data: GearData = GEAR): GearItem {
  const part = options.part ?? pick(rng, GEAR_PARTS)
  const grade = options.grade ?? rollGrade(rng, options.minGrade, data, options.chances)
  const tier = Math.max(1, Math.round(options.tier ?? 1))
  const g = data.grades[grade]
  const scale = g.scale * tierScale(tier, data)
  const pool = [...data.parts[part].stats]
  const stats: GearItem['stats'] = []
  for (let i = 0; i < g.stats && pool.length > 0; i++) {
    const kind = pool.splice(Math.floor(rng() * pool.length), 1)[0]!
    const [lo, hi] = data.ranges[kind]
    stats.push({ kind, value: roundStat(kind, (lo + (hi - lo) * rng()) * scale) })
  }
  const [slo, shi] = g.source
  const source = { id: pick(rng, SOURCE_IDS), value: slo + Math.floor(rng() * (shi - slo + 1)) }
  const uid = GEAR_PREFIX + Math.floor(rng() * 36 ** 8).toString(36).padStart(8, '0')
  const item: GearItem = { uid, part, base: pick(rng, data.parts[part].bases), grade, tier, stats, source }
  if (grade === 'hero' || grade === 'legend') item.unique = pick(rng, Object.keys(data.uniques))
  if (grade === 'legend') item.unique2 = pick(rng, Object.keys(data.uniques).filter((u) => u !== item.unique))
  return item
}

/** 장비 이름: 「희귀 철 투구」 */
export function gearName(item: GearItem, data: GearData = GEAR): string {
  return `${data.grades[item.grade].name} ${item.base}`
}

/** 저장에서 읽은 장비가 맞는 모양인지 보고 바로잡는다. 틀리면 null (E13-06) */
export function parseGearItem(raw: unknown, data: GearData = GEAR): GearItem | null {
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (typeof o.uid !== 'string' || !isGearUid(o.uid) || o.uid.length > 20) return null
  if (!GEAR_PARTS.includes(o.part as GearPart) || !GRADES.includes(o.grade as Grade) || typeof o.base !== 'string') return null
  const part = o.part as GearPart
  const grade = o.grade as Grade
  const stats = (Array.isArray(o.stats) ? o.stats : [])
    .filter((s): s is { kind: StatKind; value: number } => {
      const x = s as Record<string, unknown>
      return typeof s === 'object' && s !== null && data.parts[part].stats.includes(x.kind as StatKind) && typeof x.value === 'number' && Number.isFinite(x.value)
    })
    .slice(0, data.grades[grade].stats)
  const src = o.source as Record<string, unknown> | undefined
  if (!src || !SOURCE_IDS.includes(src.id as SourceId) || typeof src.value !== 'number') return null
  // 단계가 없던 옛 저장(E21 전)은 1단계
  const tier = typeof o.tier === 'number' && Number.isFinite(o.tier) ? Math.max(1, Math.min(9, Math.round(o.tier))) : 1
  const item: GearItem = { uid: o.uid, part, base: o.base.slice(0, 20), grade, tier, stats: stats.map((s) => ({ kind: s.kind, value: s.value })), source: { id: src.id as SourceId, value: Math.max(0, Math.min(5, Math.round(src.value))) } }
  if ((grade === 'hero' || grade === 'legend') && typeof o.unique === 'string' && data.uniques[o.unique]) item.unique = o.unique
  if (grade === 'legend' && typeof o.unique2 === 'string' && data.uniques[o.unique2] && o.unique2 !== item.unique) item.unique2 = o.unique2
  return item
}

/** 장비의 대략적인 좋음: 수치마다 그 범위의 큰 쪽에 견준 크기의 합 + 원천 (봇이 바꿔 낄지 정할 때). 단계 배율이 수치에 들어 있다 */
export function gearScore(item: GearItem, data: GearData = GEAR): number {
  let score = item.source.value * 0.3
  for (const s of item.stats) {
    const [lo, hi] = data.ranges[s.kind]
    score += Math.abs(s.value) / Math.max(Math.abs(lo), Math.abs(hi))
  }
  return score + (item.unique ? 1 : 0) + (item.unique2 ? 1 : 0)
}


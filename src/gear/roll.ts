import gearJson from '../data/gear.json'
import { GEAR_PARTS, type GearData, type GearPart, type Grade, GRADES, parseGear } from '../data/gearData'
import type { StatKind } from '../data/mythAlways'
import { SOURCE_IDS, type SourceId } from '../data/schema'

/** 검사를 마친 일반 장비 데이터 */
export const GEAR: GearData = parseGear(gearJson)

/** 일반 장비 하나 (E13-02): 부위·바탕 이름·등급·수치·원천, 영웅이면 고유 효과 */
export interface GearItem {
  /** 장비를 가리키는 id (칸·가방에는 이 값이 들어간다) */
  uid: string
  part: GearPart
  base: string
  grade: Grade
  stats: { kind: StatKind; value: number }[]
  /** 원천 수치: 등급 수치와 따로 늘 하나 (DESIGN.md 4.3.1) */
  source: { id: SourceId; value: number }
  unique?: string
}

/** 장비 id는 이 글자로 시작한다 (유물 id와 섞여 칸에 들어가므로) */
export const GEAR_PREFIX = 'g:'
export const isGearUid = (id: string | null | undefined): id is string => !!id && id.startsWith(GEAR_PREFIX)

const pick = <T>(rng: () => number, list: readonly T[]): T => list[Math.floor(rng() * list.length)]!

/** 비율 수치는 0.1% 단위, 생명 같은 수는 0.1 단위로 */
function round(kind: StatKind, value: number): number {
  const flat = kind === 'maxHp' || kind === 'healOnKill'
  if (flat) return Math.round(value)
  if (kind === 'regen') return Math.round(value * 10) / 10
  return Math.round(value * 1000) / 1000
}

/** 등급을 굴린다. min보다 낮으면 min으로 올린다 (보스) */
export function rollGrade(rng: () => number, min: Grade = 'common', data: GearData = GEAR): Grade {
  let r = rng()
  let grade: Grade = 'common'
  for (const g of GRADES) {
    r -= data.grades[g].chance
    grade = g
    if (r < 0) break
  }
  return GRADES.indexOf(grade) < GRADES.indexOf(min) ? min : grade
}

/** 장비를 굴린다: 부위(없으면 무작위) → 등급 → 수치(부위 목록에서 겹치지 않게) → 원천 → 영웅이면 고유 효과. 같은 난수면 같은 장비 */
export function rollGear(rng: () => number, options: { part?: GearPart; grade?: Grade; minGrade?: Grade } = {}, data: GearData = GEAR): GearItem {
  const part = options.part ?? pick(rng, GEAR_PARTS)
  const grade = options.grade ?? rollGrade(rng, options.minGrade, data)
  const g = data.grades[grade]
  const pool = [...data.parts[part].stats]
  const stats: GearItem['stats'] = []
  for (let i = 0; i < g.stats && pool.length > 0; i++) {
    const kind = pool.splice(Math.floor(rng() * pool.length), 1)[0]!
    const [lo, hi] = data.ranges[kind]
    stats.push({ kind, value: round(kind, (lo + (hi - lo) * rng()) * g.scale) })
  }
  const [slo, shi] = g.source
  const source = { id: pick(rng, SOURCE_IDS), value: slo + Math.floor(rng() * (shi - slo + 1)) }
  const uid = GEAR_PREFIX + Math.floor(rng() * 36 ** 8).toString(36).padStart(8, '0')
  const item: GearItem = { uid, part, base: pick(rng, data.parts[part].bases), grade, stats, source }
  if (grade === 'hero') item.unique = pick(rng, Object.keys(data.uniques))
  return item
}

/** 장비 이름: 「희귀 철 투구」 */
export function gearName(item: GearItem, data: GearData = GEAR): string {
  return `${data.grades[item.grade].name} ${item.base}`
}

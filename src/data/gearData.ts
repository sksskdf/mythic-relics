/**
 * 일반 장비 (E13-01·02, DESIGN.md 4.3.1): 부위·등급·수치 범위·드랍 확률·영웅 고유 효과.
 * 수치 종류는 상시 효과와 같은 21종(src/data/mythAlways.ts의 STAT_KINDS)을 쓴다.
 * 이 파일은 three.js 등 다른 모듈에 기대지 않는다.
 */
import { DataError, num, type Obj, obj, onlyKeys, str, table } from './check'
import { STAT_KINDS, type StatKind } from './mythAlways'

/** 장비 칸 7: 무기·머리·몸·손·발·장신구 둘. 칸 번호 → 부위 */
export const GEAR_PARTS = ['weapon', 'head', 'body', 'hands', 'feet', 'trinket'] as const
export type GearPart = (typeof GEAR_PARTS)[number]
export const SLOT_PARTS: readonly GearPart[] = ['weapon', 'head', 'body', 'hands', 'feet', 'trinket', 'trinket']

export const GRADES = ['common', 'good', 'rare', 'hero'] as const
export type Grade = (typeof GRADES)[number]

export interface GearData {
  parts: Record<GearPart, { name: string; bases: string[]; stats: StatKind[] }>
  grades: Record<Grade, { name: string; stats: number; scale: number; source: [number, number]; chance: number }>
  /** 보통 등급의 수치 범위 [작은 쪽, 큰 쪽] (줄어드는 수치는 음수) */
  ranges: Record<StatKind, [number, number]>
  drop: { grunt: number; elite: number; boss: number; bossMinGrade: Grade }
  uniques: Record<string, { name: string; text: string }>
}

function pair(o: Obj, key: string, path: string): [number, number] {
  const v = o[key]
  if (!Array.isArray(v) || v.length !== 2) throw new DataError(`${path}.${key}`, '[작은 쪽, 큰 쪽] 두 개여야 합니다')
  const a = num(v as unknown as Obj, '0', `${path}.${key}`)
  const b = num(v as unknown as Obj, '1', `${path}.${key}`)
  if (a > b) throw new DataError(`${path}.${key}`, '작은 쪽이 앞에 와야 합니다')
  return [a, b]
}

export function parseGear(raw: unknown, path = 'gear.json'): GearData {
  const o = obj(raw, path)
  onlyKeys(o, path, ['slots', 'grades', 'ranges', 'drop', 'uniques'])

  const sp = `${path}.slots`
  const slots = obj(o.slots, sp)
  onlyKeys(slots, sp, GEAR_PARTS)
  const parts = {} as GearData['parts']
  for (const part of GEAR_PARTS) {
    const p = `${sp}.${part}`
    const s = obj(slots[part], p)
    onlyKeys(s, p, ['name', 'bases', 'stats'])
    const bases = s.bases
    if (!Array.isArray(bases) || bases.length === 0 || bases.some((b) => typeof b !== 'string' || !b)) throw new DataError(`${p}.bases`, '바탕 이름이 하나 이상이어야 합니다')
    const stats = s.stats
    if (!Array.isArray(stats) || stats.length < 4) throw new DataError(`${p}.stats`, '영웅 등급(수치 넷)을 굴리려면 수치가 넷 이상이어야 합니다')
    for (const k of stats) if (!STAT_KINDS.includes(k as StatKind)) throw new DataError(`${p}.stats`, `없는 수치입니다 ("${String(k)}")`)
    if (new Set(stats).size !== stats.length) throw new DataError(`${p}.stats`, '같은 수치가 두 번 있습니다')
    parts[part] = { name: str(s, 'name', p), bases: bases as string[], stats: stats as StatKind[] }
  }

  const gp = `${path}.grades`
  const gradesRaw = obj(o.grades, gp)
  onlyKeys(gradesRaw, gp, GRADES)
  const grades = {} as GearData['grades']
  let total = 0
  for (const grade of GRADES) {
    const p = `${gp}.${grade}`
    const g = obj(gradesRaw[grade], p)
    onlyKeys(g, p, ['name', 'stats', 'scale', 'source', 'chance'])
    grades[grade] = {
      name: str(g, 'name', p),
      stats: num(g, 'stats', p, { min: 1, max: 4 }),
      scale: num(g, 'scale', p, { min: 1 }),
      source: pair(g, 'source', p),
      chance: num(g, 'chance', p, { min: 0, max: 1 }),
    }
    total += grades[grade].chance
  }
  if (Math.abs(total - 1) > 1e-6) throw new DataError(gp, `등급 확률의 합이 1이어야 합니다 (${total})`)

  const rp = `${path}.ranges`
  const rangesRaw = obj(o.ranges, rp)
  onlyKeys(rangesRaw, rp, STAT_KINDS)
  const ranges = {} as GearData['ranges']
  for (const kind of STAT_KINDS) ranges[kind] = pair(rangesRaw, kind, rp)
  for (const part of GEAR_PARTS) for (const k of parts[part].stats) if (!rangesRaw[k]) throw new DataError(`${sp}.${part}.stats`, `범위가 없는 수치입니다 ("${k}")`)

  const dp = `${path}.drop`
  const d = obj(o.drop, dp)
  onlyKeys(d, dp, ['grunt', 'elite', 'boss', 'bossMinGrade'])
  const bossMinGrade = str(d, 'bossMinGrade', dp) as Grade
  if (!GRADES.includes(bossMinGrade)) throw new DataError(`${dp}.bossMinGrade`, `없는 등급입니다 ("${bossMinGrade}")`)
  const drop = { grunt: num(d, 'grunt', dp, { min: 0, max: 1 }), elite: num(d, 'elite', dp, { min: 0, max: 1 }), boss: num(d, 'boss', dp, { min: 0, max: 1 }), bossMinGrade }

  const uniques: GearData['uniques'] = {}
  for (const [id, u] of table(o.uniques, `${path}.uniques`)) {
    onlyKeys(u, `${path}.uniques.${id}`, ['name', 'text'])
    uniques[id] = { name: str(u, 'name', `${path}.uniques.${id}`), text: str(u, 'text', `${path}.uniques.${id}`) }
  }
  if (Object.keys(uniques).length === 0) throw new DataError(`${path}.uniques`, '영웅 고유 효과가 하나도 없습니다')
  return { parts, grades, ranges, drop, uniques }
}

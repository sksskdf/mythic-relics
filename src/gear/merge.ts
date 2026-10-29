import { GEAR_PARTS, type GearData, type GearPart, type Grade, GRADES } from '../data/gearData'
import { GEAR, type GearItem, rollGear, roundStat } from './roll'

/**
 * 합치기 (E303, `CYCLE.md` 5장, 템빨용사식): 같은 등급 일반 장비 셋 → 한 등급 위 하나.
 * - 보통·좋음은 부위를 가리지 않는다 (먹이를 넓게). 희귀부터는 같은 부위 셋
 * - 결과: 부위 = 가장 단계가 높은 것(보통·좋음은 가장 많은 부위), 단계 = 셋 가운데 가장 높은 단계,
 *   수치는 새 등급대로 다시 굴리되 셋 가운데 가장 좋은 수치 하나를 이어받는다, 원천 = 셋 가운데 가장 큰 것 +1 (다섯까지)
 * - 영웅은 합쳐야만 나오고 고유 효과 하나, 전설은 영웅 셋이고 고유 효과 둘(하나는 먹이에서 물려받음)
 */

/** 한 번에 합치는 수 */
export const MERGE_COUNT = 3
/** 원천 수치 끝 */
const SOURCE_MAX = 5

/** 등급마다 원형 값 (먹이 하나를 원형으로 대신할 때, 귀환하면 녹는 값, E304) */
export const PROTOTYPE_VALUE: Readonly<Record<Grade, number>> = { common: 1, good: 3, rare: 9, hero: 27, legend: 81 }

/** 한 등급 위 (전설이면 없음) */
export function nextGrade(grade: Grade): Grade | null {
  return GRADES[GRADES.indexOf(grade) + 1] ?? null
}

/** 그 등급은 부위를 가리지 않고 합치나 (보통·좋음) */
export const anyPart = (grade: Grade): boolean => grade === 'common' || grade === 'good'

/** 셋을 합칠 수 있는가. 안 되면 까닭 */
export function mergeBlock(items: readonly GearItem[]): string | null {
  if (items.length !== MERGE_COUNT) return `${MERGE_COUNT}개가 있어야 합친다`
  if (new Set(items.map((i) => i.uid)).size !== MERGE_COUNT) return '같은 장비를 두 번 넣을 수 없다'
  const grade = items[0]!.grade
  if (items.some((i) => i.grade !== grade)) return '같은 등급끼리만 합친다'
  if (!nextGrade(grade)) return '전설은 더 합칠 수 없다'
  if (!anyPart(grade) && items.some((i) => i.part !== items[0]!.part)) return '희귀부터는 같은 부위끼리만 합친다'
  return null
}

/** 결과의 부위: 보통·좋음은 가장 많은 부위(같으면 단계가 높은 쪽), 그 위는 셋이 같은 부위 */
function resultPart(items: readonly GearItem[]): GearPart {
  const count = new Map<GearPart, number>()
  for (const i of items) count.set(i.part, (count.get(i.part) ?? 0) + 1)
  const best = Math.max(...count.values())
  const top = [...items].sort((a, b) => b.tier - a.tier).find((i) => count.get(i.part) === best)!
  return top.part
}

/** 수치 한 줄이 그 범위에서 얼마나 좋은가 (0~1쯤, 등급·단계 배율을 걷어낸 값) */
function lineScore(item: GearItem, line: GearItem['stats'][number], data: GearData): number {
  const [lo, hi] = data.ranges[line.kind]
  const scale = data.grades[item.grade].scale * data.tiers.scale ** (Math.max(1, item.tier) - 1)
  return Math.abs(line.value / scale) / Math.max(Math.abs(lo), Math.abs(hi))
}

/**
 * 셋을 합친다. 합칠 수 없으면 null. 같은 난수면 같은 결과.
 * 이어받는 수치: 셋의 수치 가운데 범위에 견줘 가장 좋은 한 줄. 결과 부위에 그 수치가 있으면 그 줄을 같은 비율로 새 등급 크기로 올린다
 */
export function mergeGear(items: readonly GearItem[], rng: () => number, data: GearData = GEAR): GearItem | null {
  if (mergeBlock(items)) return null
  const grade = nextGrade(items[0]!.grade)!
  const part = resultPart(items)
  const tier = Math.max(...items.map((i) => i.tier))
  const out = rollGear(rng, { part, grade, tier }, data)
  // 가장 좋은 수치 한 줄을 이어받는다
  let best: { line: GearItem['stats'][number]; score: number } | null = null
  for (const item of items) {
    for (const line of item.stats) {
      if (!data.parts[part].stats.includes(line.kind)) continue
      const score = lineScore(item, line, data)
      if (!best || score > best.score) best = { line, score }
    }
  }
  if (best) {
    const [lo, hi] = data.ranges[best.line.kind]
    const scale = data.grades[grade].scale * data.tiers.scale ** (tier - 1)
    const inherited = Math.sign(best.line.value || 1) * Math.min(1, best.score) * Math.max(Math.abs(lo), Math.abs(hi)) * scale
    const at = out.stats.findIndex((s) => s.kind === best!.line.kind)
    const value = roundStat(best.line.kind, inherited)
    if (at >= 0) {
      if (Math.abs(value) > Math.abs(out.stats[at]!.value)) out.stats[at] = { kind: best.line.kind, value }
    } else if (out.stats.length > 0) out.stats[out.stats.length - 1] = { kind: best.line.kind, value }
  }
  // 원천: 셋 가운데 가장 큰 것 +1
  const source = [...items].sort((a, b) => b.source.value - a.source.value)[0]!.source
  out.source = { id: source.id, value: Math.min(SOURCE_MAX, source.value + 1) }
  // 전설은 먹이의 고유 효과 하나를 물려받는다
  if (grade === 'legend') {
    const inheritedUnique = items.find((i) => i.unique)?.unique
    if (inheritedUnique) {
      out.unique = inheritedUnique
      const others = Object.keys(data.uniques).filter((u) => u !== inheritedUnique)
      out.unique2 = others[Math.floor(rng() * others.length)]
    }
  }
  return out
}

/**
 * 가방에서 합칠 수 있는 셋 묶음을 찾는다 (가방 칸이 빛나는 곳, 자동 합치기). 낮은 등급부터, 같은 부위 먼저.
 * 한 장비는 한 묶음에만 든다
 */
export function mergeGroups(items: readonly GearItem[]): GearItem[][] {
  const out: GearItem[][] = []
  const used = new Set<string>()
  for (const grade of GRADES) {
    if (!nextGrade(grade)) continue
    const same = items.filter((i) => i.grade === grade && !used.has(i.uid))
    // 같은 부위 셋부터
    for (const part of GEAR_PARTS) {
      const pool = same.filter((i) => i.part === part && !used.has(i.uid))
      while (pool.length >= MERGE_COUNT) {
        const group = pool.splice(0, MERGE_COUNT)
        for (const i of group) used.add(i.uid)
        out.push(group)
      }
    }
    // 보통·좋음은 남은 것끼리 부위를 섞어서
    if (anyPart(grade)) {
      const rest = same.filter((i) => !used.has(i.uid))
      while (rest.length >= MERGE_COUNT) {
        const group = rest.splice(0, MERGE_COUNT)
        for (const i of group) used.add(i.uid)
        out.push(group)
      }
    }
  }
  return out
}

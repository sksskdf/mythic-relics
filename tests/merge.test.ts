import { describe, expect, it } from 'vitest'

import { type GearPart, type Grade, GRADES } from '../src/data/gearData'
import { MERGE_COUNT, mergeBlock, mergeGear, mergeGroups, nextGrade, PROTOTYPE_VALUE } from '../src/gear/merge'
import { GEAR, rollGear } from '../src/gear/roll'
import { createRng } from '../src/world/rng'

const make = (seed: number, part: GearPart, grade: Grade, tier = 1) => rollGear(createRng(seed), { part, grade, tier })

describe('합치기 (E303)', () => {
  it('셋 → 한 등급 위, 전설 위는 없다, 원형 값은 등급마다 셋 배', () => {
    expect(MERGE_COUNT).toBe(3)
    expect(GRADES.map(nextGrade)).toEqual(['good', 'rare', 'hero', 'legend', null])
    for (let i = 1; i < GRADES.length; i++) expect(PROTOTYPE_VALUE[GRADES[i]!]).toBe(PROTOTYPE_VALUE[GRADES[i - 1]!] * 3)
  })

  it('보통·좋음은 부위를 섞어도 되고, 희귀부터는 같은 부위·같은 등급만', () => {
    expect(mergeBlock([make(1, 'weapon', 'common'), make(2, 'head', 'common'), make(3, 'feet', 'common')])).toBeNull()
    expect(mergeBlock([make(1, 'weapon', 'rare'), make(2, 'head', 'rare'), make(3, 'weapon', 'rare')])).not.toBeNull()
    expect(mergeBlock([make(1, 'weapon', 'rare'), make(2, 'weapon', 'rare'), make(3, 'weapon', 'rare')])).toBeNull()
    expect(mergeBlock([make(1, 'weapon', 'common'), make(2, 'weapon', 'good'), make(3, 'weapon', 'common')])).not.toBeNull()
    expect(mergeBlock([make(1, 'weapon', 'legend'), make(2, 'weapon', 'legend'), make(3, 'weapon', 'legend')])).not.toBeNull()
    const one = make(1, 'weapon', 'common')
    expect(mergeBlock([one, one, make(3, 'weapon', 'common')])).not.toBeNull()
    expect(mergeBlock([one, make(3, 'weapon', 'common')])).not.toBeNull()
  })

  it('결과: 다음 등급, 가장 높은 단계, 원천은 가장 큰 것 +1, 가장 좋은 수치를 이어받는다', () => {
    const feed = [make(11, 'weapon', 'rare', 1), make(12, 'weapon', 'rare', 2), make(13, 'weapon', 'rare', 1)]
    const out = mergeGear(feed, createRng(5))!
    expect(out.grade).toBe('hero')
    expect(out.part).toBe('weapon')
    expect(out.tier).toBe(2)
    expect(out.unique).toBeDefined()
    expect(out.source.value).toBe(Math.min(5, Math.max(...feed.map((i) => i.source.value)) + 1))
    // 이어받은 줄: 셋 가운데 가장 좋은 종류가 결과에 있다
    const kinds = new Set(out.stats.map((s) => s.kind))
    expect(feed.some((i) => i.stats.some((s) => kinds.has(s.kind)))).toBe(true)
    // 같은 난수면 같은 결과
    expect(mergeGear(feed, createRng(5))).toEqual(out)
  })

  it('보통 셋을 섞으면 가장 많은 부위로, 전설은 먹이의 고유 효과 하나를 물려받는다', () => {
    const mixed = mergeGear([make(1, 'feet', 'common'), make(2, 'head', 'common'), make(3, 'feet', 'common')], createRng(9))!
    expect(mixed.part).toBe('feet')
    expect(mixed.grade).toBe('good')
    const heroes = [make(21, 'body', 'hero'), make(22, 'body', 'hero'), make(23, 'body', 'hero')]
    const legend = mergeGear(heroes, createRng(4))!
    expect(legend.grade).toBe('legend')
    expect(legend.unique).toBe(heroes[0]!.unique)
    expect(legend.unique2).toBeDefined()
    expect(legend.unique2).not.toBe(legend.unique)
    expect(legend.stats.length).toBe(Math.min(GEAR.grades.legend.stats, GEAR.parts.body.stats.length))
  })

  it('가방에서 합칠 묶음: 같은 부위 셋 먼저, 보통·좋음은 남은 것끼리 섞어서, 한 장비는 한 묶음에만', () => {
    const bag = [make(1, 'weapon', 'common'), make(2, 'weapon', 'common'), make(3, 'head', 'common'), make(4, 'weapon', 'common'), make(5, 'feet', 'common'), make(6, 'body', 'common'), make(7, 'hands', 'rare'), make(8, 'hands', 'rare'), make(9, 'head', 'rare')]
    const groups = mergeGroups(bag)
    expect(groups).toHaveLength(2)
    expect(groups[0]!.every((i) => i.part === 'weapon')).toBe(true)
    expect(new Set(groups.flat().map((i) => i.uid)).size).toBe(6)
    expect(groups.every((g) => mergeBlock(g) === null)).toBe(true)
  })
})

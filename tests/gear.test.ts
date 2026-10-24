import { describe, expect, it } from 'vitest'

import gearJson from '../src/data/gear.json'
import { GEAR_PARTS, GRADES, parseGear, SLOT_PARTS } from '../src/data/gearData'
import { DataError } from '../src/data/check'
import { GEAR, gearName, isGearUid, rollGear, rollGrade } from '../src/gear/roll'
import { createRng } from '../src/world/rng'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

describe('장비 규칙 (E13-01)', () => {
  it('장비 칸 7: 무기·머리·몸·손·발·장신구 둘', () => {
    expect(SLOT_PARTS).toEqual(['weapon', 'head', 'body', 'hands', 'feet', 'trinket', 'trinket'])
  })

  it('등급 넷, 수치 개수 1~4, 확률 합 1', () => {
    expect(GRADES.map((g) => GEAR.grades[g].stats)).toEqual([1, 2, 3, 4])
    expect(GRADES.reduce((s, g) => s + GEAR.grades[g].chance, 0)).toBeCloseTo(1)
  })

  it('잘못 적으면 어느 값이 왜 틀렸는지 알려 준다', () => {
    const broken = (edit: (d: any) => void) => () => {
      const d = clone(gearJson)
      edit(d)
      return parseGear(d)
    }
    expect(broken((d) => (d.grades.hero.chance = 0.5))).toThrow(/확률의 합/)
    expect(broken((d) => d.slots.weapon.stats.push('luck'))).toThrow(/없는 수치/)
    expect(broken((d) => (d.slots.feet.stats = ['moveSpeed']))).toThrow(DataError)
    expect(broken((d) => (d.ranges.damage = [0.04, 0.02]))).toThrow(/작은 쪽/)
  })
})

describe('장비 굴리기 (E13-02)', () => {
  it('같은 시드면 같은 장비가 나온다', () => {
    expect(rollGear(createRng(7))).toEqual(rollGear(createRng(7)))
    expect(rollGear(createRng(7))).not.toEqual(rollGear(createRng(8)))
  })

  it('모든 부위·등급: 수치 개수, 겹치지 않는 종류, 부위 목록 안, 범위 × 등급 배율 안, 원천 하나', () => {
    const rng = createRng(1)
    for (const part of GEAR_PARTS) {
      for (const grade of GRADES) {
        for (let i = 0; i < 30; i++) {
          const item = rollGear(rng, { part, grade })
          const g = GEAR.grades[grade]
          expect(item.stats.length).toBe(g.stats)
          expect(new Set(item.stats.map((s) => s.kind)).size).toBe(g.stats)
          for (const s of item.stats) {
            expect(GEAR.parts[part].stats).toContain(s.kind)
            const [lo, hi] = GEAR.ranges[s.kind]
            // 생명 같은 수는 정수로 반올림한다
            const slack = s.kind === 'maxHp' || s.kind === 'healOnKill' ? 0.5 : 0.06
            const a = Math.min(lo * g.scale, hi * g.scale) - slack
            const b = Math.max(lo * g.scale, hi * g.scale) + slack
            expect(s.value).toBeGreaterThanOrEqual(a)
            expect(s.value).toBeLessThanOrEqual(b)
          }
          expect(item.source.value).toBeGreaterThanOrEqual(g.source[0])
          expect(item.source.value).toBeLessThanOrEqual(g.source[1])
          expect(item.unique !== undefined).toBe(grade === 'hero')
          expect(isGearUid(item.uid)).toBe(true)
          expect(gearName(item)).toContain(item.base)
        }
      }
    }
  })

  it('등급 확률을 따르고, 보스는 최소 등급 아래로 나오지 않는다', () => {
    const rng = createRng(3)
    const counts = { common: 0, good: 0, rare: 0, hero: 0 }
    for (let i = 0; i < 20000; i++) counts[rollGrade(rng)] += 1
    for (const g of GRADES) expect(counts[g] / 20000).toBeCloseTo(GEAR.grades[g].chance, 1)
    for (let i = 0; i < 200; i++) expect(['rare', 'hero']).toContain(rollGrade(rng, 'rare'))
  })
})

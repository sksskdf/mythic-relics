import { describe, expect, it } from 'vitest'

import gearJson from '../src/data/gear.json'
import { GEAR_PARTS, GRADES, LAND_ZONES, parseGear, SLOT_PARTS } from '../src/data/gearData'
import { REGION_ZONES } from '../src/data/regions'
import { DataError } from '../src/data/check'
import { GEAR, gearName, isGearUid, landChances, landTier, parseGearItem, rollGear, rollGrade, tierScale } from '../src/gear/roll'
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

describe('장비 단계와 땅의 드랍 표 (E21-03)', () => {
  it('등급 배율은 1 / 1.3 / 1.7 / 2.2, 단계마다 ×1.4', () => {
    expect(GRADES.map((g) => GEAR.grades[g].scale)).toEqual([1, 1.3, 1.7, 2.2])
    expect(tierScale(1)).toBe(1)
    expect(tierScale(3)).toBeCloseTo(1.96)
  })

  it('땅 단계는 장 순서: 북유럽 1, 그리스 2, 모르는 땅(마을)은 1', () => {
    expect(landTier('norse')).toBe(1)
    expect(landTier('greek')).toBe(2)
    expect(landTier(null)).toBe(1)
  })

  it('같은 난수면 2단계 장비의 수치는 1단계의 1.4배, 그리스의 보통 장비가 북유럽 좋음 장비쯤', () => {
    const one = rollGear(createRng(3), { part: 'weapon', grade: 'common' })
    const two = rollGear(createRng(3), { part: 'weapon', grade: 'common', tier: 2 })
    expect(two.tier).toBe(2)
    expect(two.stats[0]!.value / one.stats[0]!.value).toBeCloseTo(1.4, 1)
    expect(tierScale(2) * GEAR.grades.common.scale).toBeGreaterThanOrEqual(GEAR.grades.good.scale)
  })

  it('땅 자리마다 드랍 표: 깊을수록 좋은 등급이 잦고 더 자주 떨어진다', () => {
    expect([...LAND_ZONES]).toEqual([...REGION_ZONES])
    const hero = LAND_ZONES.map((z) => landChances(z).hero)
    expect(hero[0]).toBeLessThan(hero[1]!)
    expect(hero[1]).toBeLessThan(hero[2]!)
    expect(GEAR.lands.entrance.rate).toBeLessThan(GEAR.lands.boss.rate)
    expect(landChances(null)).toEqual(Object.fromEntries(GRADES.map((g) => [g, GEAR.grades[g].chance])))
  })

  it('단계가 없던 옛 저장의 장비는 1단계로 읽는다', () => {
    const item = rollGear(createRng(5), { tier: 2 })
    const { tier: _tier, ...old } = item
    expect(parseGearItem(old)!.tier).toBe(1)
    expect(parseGearItem(item)!.tier).toBe(2)
  })
})

import { describe, expect, it } from 'vitest'

import { allRecipes, craft, forgeReady, missing, nextRecipe, melt, recipeFor } from '../src/gear/forge'
import { Loadout } from '../src/gear/Loadout'
import { MATERIALS, PROTOTYPE } from '../src/gear/materials'
import { PROTOTYPE_VALUE } from '../src/gear/merge'
import { DEMO_RELIC_STAGES, effectScale, RELIC_STAT_COUNT, relicStats, relicTier, STAGE_DAMAGE } from '../src/gear/mythRelic'
import { GEAR, rollGear } from '../src/gear/roll'
import { GODS } from '../src/relics/data'
import { createRng } from '../src/world/rng'

/** 그 제작법의 재료를 모두 채운다 */
function fill(loadout: Loadout, god: string): void {
  for (const { id, count } of nextRecipe(loadout, god)!.materials) loadout.addMaterial(id, count)
}

describe('대장간 제작법 (E13-05 → E21-04)', () => {
  it('21신화 × 4단계 모두 제작법이 있고, 재료는 보스 재료와 원형 둘뿐이다', () => {
    const recipes = allRecipes()
    expect(recipes.length).toBe(Object.keys(GODS).length * 4)
    for (const r of recipes) {
      const kinds = r.materials.map((m) => MATERIALS[m.id]?.kind)
      expect(kinds.sort(), `${r.relic} ${r.stage}단계`).toEqual(['boss', 'prototype'])
    }
  })

  it('유물 단계는 장 보스가 연다: 토르는 1단계 거인 왕, 2단계 키마이라, 제우스는 1단계 키마이라', () => {
    expect(recipeFor('thor', 1).materials).toEqual([{ id: 'giantHeart', count: 1 }, { id: PROTOTYPE, count: 30 }])
    expect(recipeFor('thor', 2).materials).toEqual([{ id: 'chimeraFlame', count: 1 }, { id: PROTOTYPE, count: 60 }])
    expect(recipeFor('zeus', 1).materials.map((m) => m.id)).toContain('chimeraFlame')
  })

  it('처음 제작: 재료가 모자라면 아무것도 쓰지 않고, 채우면 유물을 그 부위 칸에 낀다 (바탕 장비는 쓰지 않는다)', () => {
    const loadout = new Loadout()
    const hammer = rollGear(createRng(1), { part: 'weapon', grade: 'rare' })
    loadout.addGear(hammer)
    loadout.equip(hammer.uid)
    expect(craft(loadout, 'thor')).toBeNull()
    expect(missing(loadout, nextRecipe(loadout, 'thor')!).length).toBeGreaterThan(0)
    fill(loadout, 'thor')
    const made = craft(loadout, 'thor')!
    expect(made).toMatchObject({ relic: 'mjolnir', stage: 1 })
    expect(loadout.gear.has(hammer.uid)).toBe(true)
    expect(loadout.has('mjolnir')).toBe(true)
    expect(loadout.materials.size).toBe(0)
  })

  it('데모는 유물 2단계까지: 그 위는 엔딩 뒤', () => {
    const loadout = new Loadout()
    loadout.equip('mjolnir')
    fill(loadout, 'thor')
    expect(craft(loadout, 'thor', DEMO_RELIC_STAGES)?.stage).toBe(2)
    expect(nextRecipe(loadout, 'thor', DEMO_RELIC_STAGES)).toBeNull()
    for (const { id, count } of recipeFor('thor', 3).materials) loadout.addMaterial(id, count)
    expect(forgeReady(loadout, 'thor', DEMO_RELIC_STAGES)).toBe(false)
    expect(forgeReady(loadout, 'thor')).toBe(true)
  })

  it('단계 올리기: 2 → 3 → 4, 4단계면 더 없다', () => {
    const loadout = new Loadout()
    loadout.equip('mjolnir')
    for (const stage of [2, 3, 4]) {
      fill(loadout, 'thor')
      expect(craft(loadout, 'thor')?.stage).toBe(stage)
      expect(loadout.stage('mjolnir')).toBe(stage)
    }
    expect(nextRecipe(loadout, 'thor')).toBeNull()
  })

  it('녹이기: 등급의 원형 값(셋 배씩)이 나오고 장비는 사라진다 (낀 것도), 유물은 녹지 않는다', () => {
    const loadout = new Loadout()
    const ring = rollGear(createRng(4), { part: 'trinket', grade: 'rare' })
    loadout.addGear(ring)
    loadout.equip(ring.uid)
    expect(melt(loadout, ring.uid)).toEqual({ material: PROTOTYPE, count: PROTOTYPE_VALUE.rare, slot: 5 })
    expect(loadout.slots[5]).toBeNull()
    expect(loadout.gear.has(ring.uid)).toBe(false)
    expect(loadout.materials.get(PROTOTYPE)).toBe(9)
    expect(melt(loadout, 'mjolnir')).toBeNull()
  })
})


describe('유물 역할 (E21-04)', () => {
  it('기본 수치는 수치 셋, 같은 단계 영웅 장비의 가운데 값이다 (단계가 오르면 ×1.4)', () => {
    const one = relicStats('mjolnir', 1)
    expect(one.length).toBe(RELIC_STAT_COUNT)
    expect(relicStats('mjolnir', 1)).toEqual(one)
    expect(relicTier('mjolnir', 1)).toBe(1)
    expect(relicTier('mjolnir', 2)).toBe(2)
    expect(relicTier('keraunos', 1)).toBe(2)
    const two = relicStats('mjolnir', 2)
    for (let i = 0; i < one.length; i++) {
      expect(two[i]!.kind).toBe(one[i]!.kind)
      const [lo, hi] = GEAR.ranges[one[i]!.kind]
      expect(one[i]!.value).toBeCloseTo(((lo + hi) / 2) * GEAR.grades.hero.scale, 1)
      expect(two[i]!.value / one[i]!.value).toBeCloseTo(GEAR.tiers.scale, 1)
    }
  })

  it('그 신화를 고르면 유물 효과가 한 단계 위로 돈다 (다른 신화면 그대로)', () => {
    expect(effectScale('mjolnir', 1, null)).toBe(STAGE_DAMAGE[0])
    expect(effectScale('mjolnir', 1, 'loki')).toBe(STAGE_DAMAGE[0])
    expect(effectScale('mjolnir', 1, 'thor')).toBe(STAGE_DAMAGE[1])
    expect(effectScale('mjolnir', 4, 'thor')).toBe(STAGE_DAMAGE[4])
  })
})

import { describe, expect, it } from 'vitest'

import { allRecipes, craft, missing, nextRecipe, recipeFor, salvage, SALVAGE, stageRelics } from '../src/gear/forge'
import { Loadout } from '../src/gear/Loadout'
import { MATERIALS } from '../src/gear/materials'
import { relicPart } from '../src/gear/mythRelic'
import { rollGear } from '../src/gear/roll'
import { DEFAULT_DROPS, DropTable } from '../src/gear/DropTable'
import { GODS } from '../src/relics/data'
import { createRng } from '../src/world/rng'

/** 그 제작법의 재료를 모두 채운다 */
function fill(loadout: Loadout, god: string): void {
  for (const { id, count } of nextRecipe(loadout, god)!.materials) loadout.addMaterial(id, count)
}

describe('대장간 제작법 (E13-05)', () => {
  it('21신화 × 4단계 모두 제작법이 있고, 모든 재료는 얻을 수 있다', () => {
    const recipes = allRecipes()
    expect(recipes.length).toBe(Object.keys(GODS).length * 4)
    // 재료가 된 유물 가운데 무작위로 나오는 것 (모든 신화권을 돌며)
    const droppable = new Set<string>()
    for (const realm of ['norse', 'greek', 'china', 'japan', 'korea'] as const) {
      const drops = new DropTable(createRng(4), { ...DEFAULT_DROPS, base: 1, foreign: 1 })
      drops.realm = realm
      for (let i = 0; i < 3000; i++) {
        const id = drops.roll(new Set())
        if (id) droppable.add(id)
      }
    }
    for (const r of recipes) {
      expect(r.materials.length, `${r.relic} ${r.stage}`).toBeGreaterThan(0)
      for (const { id } of r.materials) expect(MATERIALS[id] !== undefined || droppable.has(id), `${r.relic} ${r.stage}단계 ${id}`).toBe(true)
      if (r.stage === 1) expect(r.base).toBe(relicPart(r.relic))
      // 같은 재료가 두 줄로 들지 않는다 (두 줄이면 모자란지 셀 때 한 줄씩만 본다)
      const ids = r.materials.map((m) => m.id)
      expect(new Set(ids).size, `${r.relic} ${r.stage}단계`).toBe(ids.length)
    }
  })

  it('2·3단계에는 그 신의 재료가 된 유물을 하나씩 쓴다 (묠니르: 메긴교르드 → 야른그레이프르)', () => {
    expect(stageRelics('thor')).toEqual(['megingjord', 'jarngreipr'])
    expect(recipeFor('thor', 2).materials.map((m) => m.id)).toContain('megingjord')
    expect(recipeFor('thor', 3).materials.map((m) => m.id)).toContain('jarngreipr')
    // 모든 신화가 2·3단계에 쓸 재료 유물을 갖는다
    for (const god of Object.keys(GODS)) expect(stageRelics(god).length, god).toBeGreaterThanOrEqual(1)
  })

  it('처음 제작: 재료가 모자라면 아무것도 쓰지 않고, 채우면 바탕 장비를 써서 유물을 만들고 첫 수치를 물려받는다', () => {
    const loadout = new Loadout()
    const hammer = rollGear(createRng(1), { part: 'weapon', grade: 'rare' })
    loadout.addGear(hammer)
    loadout.equip(hammer.uid)
    expect(craft(loadout, 'thor')).toBeNull()
    expect(missing(loadout, nextRecipe(loadout, 'thor')!).length).toBeGreaterThan(0)
    fill(loadout, 'thor')
    const made = craft(loadout, 'thor')!
    expect(made).toMatchObject({ relic: 'mjolnir', stage: 1, slot: 0 })
    expect(loadout.slots[0]).toBe('mjolnir')
    expect(loadout.gear.has(hammer.uid)).toBe(false)
    expect(loadout.inherited.get('mjolnir')).toEqual(hammer.stats[0])
    expect(loadout.materials.size).toBe(0)
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

  it('분해: 등급만큼 그 땅의 공통 재료가 나오고 장비는 사라진다 (낀 것도)', () => {
    const loadout = new Loadout()
    const ring = rollGear(createRng(4), { part: 'trinket', grade: 'rare' })
    loadout.addGear(ring)
    loadout.equip(ring.uid)
    expect(salvage(loadout, ring.uid, 'greek')).toEqual({ material: 'olympusMarble', count: SALVAGE.rare, slot: 5 })
    expect(loadout.slots[5]).toBeNull()
    expect(loadout.gear.has(ring.uid)).toBe(false)
    expect(loadout.materials.get('olympusMarble')).toBe(4)
    expect(salvage(loadout, 'mjolnir', 'greek')).toBeNull()
  })
})


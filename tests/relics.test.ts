import { describe, expect, it } from 'vitest'

import { Loadout } from '../src/gear/Loadout'
import { rollGear } from '../src/gear/roll'
import { createRng } from '../src/world/rng'
import { hiddenUnlocked, legacyManifest, resolveLoadout } from '../src/myth/manifest'
import { godDef, RELIC_IDS, relicDef } from '../src/relics/data'

describe('고른 신화와 가호 (E12-04)', () => {
  it('유물이 없고 고른 신화도 없으면 아무것도 없다', () => {
    expect(resolveLoadout([null, null, null, null], null)).toEqual({ manifested: null, blessings: [] })
  })

  it('지금 신화는 유물 수가 아니라 고른 신화다. 장착한 다른 신 유물은 가호', () => {
    expect(resolveLoadout(['mjolnir', 'megingjord', 'jarngreipr', 'lokiMask'], null)).toEqual({ manifested: null, blessings: ['thor', 'loki'] })
    expect(resolveLoadout(['mjolnir', 'lokiMask', null, null], 'zeus')).toEqual({ manifested: 'zeus', blessings: ['thor', 'loki'] })
    expect(resolveLoadout(['mjolnir', 'lokiMask', null, null], 'thor')).toEqual({ manifested: 'thor', blessings: ['loki'] })
  })

  it('1차 스프린트 규칙은 옛 저장 옮기기와 히든 신화에만 남는다', () => {
    expect(legacyManifest(['mjolnir', 'megingjord', 'jarngreipr', 'lokiMask'])).toBe('thor')
    expect(legacyManifest(['mjolnir', 'megingjord', null, null])).toBeNull()
    const asura = RELIC_IDS.filter((id) => relicDef(id).god === 'asura' || relicDef(id).also?.includes('asura'))
    expect(hiddenUnlocked(asura.slice(0, godDef('asura').manifestCount - 1))).toEqual([])
    expect(hiddenUnlocked(asura.slice(0, godDef('asura').manifestCount))).toEqual(['asura'])
  })
})

describe('장비 칸 (E13-02)', () => {
  it('신화의 유물은 칸에 들지 않고 유물표에 켜진다, 같은 것은 한 번만 (E303-04)', () => {
    const loadout = new Loadout()
    expect(loadout.slots.length).toBe(7)
    expect(loadout.equip('mjolnir')).toBe(-1)
    expect(loadout.equip('lokiMask')).toBe(-1)
    expect(loadout.equip('mjolnir')).toBe(-1)
    expect(loadout.lit).toEqual(['mjolnir', 'lokiMask'])
    expect(loadout.slots.every((s) => s === null)).toBe(true)
    expect(loadout.bag).toEqual([])
    expect(loadout.has('mjolnir')).toBe(true)
    expect(loadout.litCount).toBe(2)
  })

  it('가방이 차면 칸의 것을 가방에 넣지 않는다 (E303: 12칸)', () => {
    const loadout = new Loadout()
    for (let i = 0; i < 12; i++) {
      const g = rollGear(createRng(100 + i), { part: 'trinket' })
      loadout.addGear(g)
      loadout.bag.push(g.uid)
    }
    const boots = rollGear(createRng(5), { part: 'feet' })
    loadout.addGear(boots)
    loadout.equip(boots.uid)
    expect(loadout.stow(4)).toBeNull()
    expect(loadout.slots[4]).toBe(boots.uid)
    expect(loadout.bag).toHaveLength(12)
  })

  it('영웅·전설 장비를 가지면 그 고유 효과가 유물표에 켜진다 (E303-04)', () => {
    const loadout = new Loadout()
    const hero = rollGear(createRng(9), { part: 'weapon', grade: 'hero' })
    loadout.addGear(hero)
    expect(hero.unique).toBeTruthy()
    expect([...loadout.uniquesSeen]).toEqual([hero.unique])
    expect(loadout.litCount).toBe(1)
  })

  it('일반 장비도 부위 칸에, 가방의 것은 맞는 부위 칸에만 낀다', () => {
    const loadout = new Loadout()
    const boots = rollGear(createRng(1), { part: 'feet' })
    const ring = rollGear(createRng(2), { part: 'trinket' })
    const ring2 = rollGear(createRng(3), { part: 'trinket' })
    for (const g of [boots, ring, ring2]) loadout.addGear(g)
    expect(loadout.equip(boots.uid)).toBe(4)
    expect(loadout.equip(ring.uid)).toBe(5)
    expect(loadout.equip(ring2.uid)).toBe(6)
    expect(loadout.wornGear.map((g) => g.uid)).toEqual([boots.uid, ring.uid, ring2.uid])
    loadout.stow(4)
    expect(loadout.wield(boots.uid, 0)).toBeNull()
    expect(loadout.slots[0]).toBeNull()
    loadout.wield(boots.uid, 4)
    expect(loadout.slots[4]).toBe(boots.uid)
  })

  it('재료는 개수만 센다', () => {
    const loadout = new Loadout()
    loadout.addMaterial('megingjord', 2)
    expect(loadout.useMaterial('megingjord', 3)).toBe(false)
    expect(loadout.useMaterial('megingjord', 2)).toBe(true)
    expect(loadout.materials.has('megingjord')).toBe(false)
  })
})

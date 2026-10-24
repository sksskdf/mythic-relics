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
  it('주운 것은 그 부위의 빈 칸에 들어가고, 같은 것은 다시 들어가지 않는다. 부위 칸이 차 있으면 가방으로', () => {
    const loadout = new Loadout()
    expect(loadout.slots.length).toBe(7)
    // 묠니르는 무기, 로키의 가면은 머리, 메긴교르드(허리)는 장신구
    expect(loadout.equip('mjolnir')).toBe(0)
    expect(loadout.equip('lokiMask')).toBe(1)
    expect(loadout.equip('megingjord')).toBe(5)
    expect(loadout.equip('mjolnir')).toBe(0)
    // 무기 칸이 차 있으니 궁니르는 가방으로
    expect(loadout.equip('gungnir')).toBe(-1)
    expect(loadout.bag).toEqual(['gungnir'])
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

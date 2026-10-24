import { describe, expect, it } from 'vitest'

import { Loadout } from '../src/gear/Loadout'
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

describe('유물 슬롯', () => {
  it('주운 유물은 빈 칸에 차례로 들어가고, 같은 유물은 다시 들어가지 않는다', () => {
    const loadout = new Loadout()
    expect(loadout.equip('megingjord')).toBe(0)
    expect(loadout.equip('lokiMask')).toBe(1)
    expect(loadout.equip('megingjord')).toBe(0)
    loadout.unequip(0)
    expect(loadout.equip('mjolnir')).toBe(0)
    expect(loadout.slots).toEqual(['mjolnir', 'lokiMask', null, null])
  })
})

import { describe, expect, it } from 'vitest'

import { Loadout, resolveLoadout } from '../src/relics/Loadout'

describe('발현과 가호', () => {
  it('유물이 없으면 아무것도 없다', () => {
    expect(resolveLoadout([null, null, null, null])).toEqual({ manifested: null, blessings: [] })
  })

  it('같은 신 유물 1~2개는 가호', () => {
    expect(resolveLoadout(['mjolnir', 'megingjord', null, null])).toEqual({ manifested: null, blessings: ['thor'] })
  })

  it('같은 신 유물 3개면 발현, 섞어 낀 신은 가호', () => {
    expect(resolveLoadout(['mjolnir', 'megingjord', 'jarngreipr', 'lokiMask'])).toEqual({
      manifested: 'thor',
      blessings: ['loki'],
    })
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

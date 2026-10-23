import { describe, expect, it } from 'vitest'

import { Loadout } from '../src/gear/Loadout'
import { resolveLoadout } from '../src/myth/manifest'

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

describe('가방까지 합친 발현 조합 (E6-07)', () => {
  it('칸이 토르 둘·로키 둘로 차고 세 번째 로키 유물이 가방에 들어가면 로키로 발현할 수 있다고 알려 준다', () => {
    const loadout = new Loadout()
    for (const id of ['mjolnir', 'megingjord', 'lokiMask', 'laevateinn', 'mistletoe'] as const) loadout.equip(id)
    expect(loadout.state.manifested).toBeNull()
    expect(loadout.bag).toEqual(['mistletoe'])
    expect(loadout.manifestable()).toBe('loki')
    loadout.wield('mistletoe', 0)
    expect(loadout.state.manifested).toBe('loki')
    expect(loadout.manifestable()).toBeNull()
  })
})

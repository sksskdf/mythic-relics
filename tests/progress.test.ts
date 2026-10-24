import { describe, expect, it } from 'vitest'

import { ClassProgress, MASTERY_TO_OPEN, masteryShares, SHARE_TO_OTHERS, XP_TO_PROMOTE } from '../src/myth/ClassProgress'
import { DATA } from '../src/data'
import { DEFAULT_DROPS, DropTable, representatives } from '../src/gear/DropTable'
import { MATERIAL_RELICS, MYTH_RELICS } from '../src/gear/mythRelic'
import { godDef, type RelicId, relicDef } from '../src/relics/data'
import { createRng } from '../src/world/rng'

describe('신화 성장 (E12-02)', () => {
  it('숙련이 문턱을 넘으면 신화가 열리고, 한 번 열면 영구다', () => {
    const progress = new ClassProgress()
    expect(progress.level('thor')).toBe(0)
    expect(progress.title('thor')).toBe('천둥의 신')
    expect(progress.addXp('thor', MASTERY_TO_OPEN - 1)).toBeNull()
    expect(progress.isOpen('thor')).toBe(false)
    expect(progress.readyToPromote('thor')).toBe(false)
    expect(progress.addXp('thor', 1)).toBe('opened')
    expect(progress.level('thor')).toBe(1)
    expect(progress.opened).toEqual(['thor'])
    // 다시 숙련을 쌓아도 다시 열리지 않는다
    expect(progress.addXp('thor', 10)).toBeNull()
  })

  it('숙련 바가 가득 차야 전설로 단계가 오르고, 가득 찬 뒤에는 더 쌓이지 않는다', () => {
    const progress = new ClassProgress()
    progress.open('thor')
    progress.addXp('thor', 100)
    expect(progress.promote('thor')).toBe(false)
    progress.addXp('thor', 99999)
    expect(progress.record('thor').xp).toBe(XP_TO_PROMOTE[0])
    expect(progress.readyToPromote('thor')).toBe(true)
    expect(progress.promote('thor')).toBe(true)
    expect(progress.title('thor')).toBe('천둥군주')
    expect(progress.record('thor').xp).toBe(0)
  })

  it('열릴 때 남은 숙련은 다음 바로 넘어간다', () => {
    const progress = new ClassProgress()
    expect(progress.addXp('odin', MASTERY_TO_OPEN + 50)).toBe('opened')
    expect(progress.record('odin').xp).toBe(50)
    progress.addXp('loki', 1e9)
    expect(progress.readyToPromote('loki')).toBe(true)
  })

  it('승급하면 그 원천 숙련과 총 승급 횟수가 오른다. 못 연 신화는 세지 않는다', () => {
    const progress = new ClassProgress()
    progress.addXp('zeus', 10)
    progress.addXp('thor', 1e9)
    progress.promote('thor')
    expect(progress.mastery('flame')).toBe(1)
    expect(progress.mastery('wind')).toBe(0)
    expect(progress.promotions).toBe(1)
  })

  it('숙련은 그 신화권 신들에게 나눠 쌓이고, 고른 신화는 전부 받는다', () => {
    const gods = Object.values(DATA.gods)
    const norse = gods.filter((g) => g.realm === 'norse').map((g) => g.id)
    const shares = masteryShares(20, 'norse', 'thor', gods)
    expect([...shares.keys()].sort()).toEqual([...norse].sort())
    expect(shares.get('thor')).toBe(20)
    for (const god of norse.filter((g) => g !== 'thor')) expect(shares.get(god)).toBe(20 * SHARE_TO_OTHERS)
    // 고른 신화가 다른 신화권이어도 고른 신화는 받는다
    const away = masteryShares(20, 'greek', 'thor', gods)
    expect(away.get('thor')).toBe(20)
    expect(away.get('zeus')).toBe(20 * SHARE_TO_OTHERS)
    // 고른 신화가 없으면 그 신화권 신들이 전부 받는다 (첫 신화가 빨리 열린다, E13)
    expect(masteryShares(20, 'norse', null, gods).get('odin')).toBe(20)
    // 히든 신화는 몬스터로 쌓이지 않는다 (고르면 받는다)
    expect(masteryShares(20, 'norse', null, gods).has('asura')).toBe(false)
    expect(masteryShares(20, undefined, null, gods).size).toBe(0)
  })
})

/** 정해진 값을 차례로 돌려주는 가짜 난수 */
function sequence(...values: number[]) {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('유물 드랍', () => {
  it('거인 왕은 묠니르가 없으면 반드시 떨어뜨린다 (북유럽 땅에서만)', () => {
    const drops = new DropTable(sequence(0.99))
    expect(drops.roll(new Set(), 'giantKing')).toBe('mjolnir')
    const greek = new DropTable(sequence(0.99))
    greek.realm = 'greek'
    expect(greek.roll(new Set(), 'giantKing')).not.toBe('mjolnir')
  })

  it('이미 가진 유물은 나오지 않는다', () => {
    // 토르·로키 유물만 나오는 표로 줄여 본다
    const drops = new DropTable(sequence(0, 0), DEFAULT_DROPS, ['megingjord', 'jarngreipr', 'lokiMask', 'laevateinn', 'mistletoe'])
    const owned = new Set<RelicId>(['mjolnir', 'megingjord', 'jarngreipr'])
    for (const id of ['lokiMask', 'laevateinn', 'mistletoe'] as const) {
      expect(drops.roll(owned)).toBe(id)
      owned.add(id)
    }
    expect(drops.roll(owned)).toBeNull()
  })

  it('이미 유물을 가진 신의 남은 유물이 더 잘 나온다', () => {
    // 후보: 메긴교르드(토르, 가중치 1 + 4), 로키 유물 셋(각 1). 합 8에서 0.3이면 앞쪽 2.4라 메긴교르드
    const drops = new DropTable(sequence(0, 0.3), DEFAULT_DROPS, ['megingjord', 'lokiMask', 'laevateinn', 'mistletoe'])
    expect(drops.roll(new Set<RelicId>(['jarngreipr']))).toBe('megingjord')
  })

  it('지역 보스는 그 땅 신들의 대표 유물 가운데 없는 것을 반드시 떨어뜨린다 (E7-06)', () => {
    expect(representatives('greek')).toEqual(['keraunos', 'triaina', 'helmOfDarkness', 'silverBow'])
    expect(representatives('norse')[0]).toBe('mjolnir')
    for (const realm of ['norse', 'greek', 'china', 'japan', 'korea'] as const) expect(representatives(realm)).toHaveLength(4)
    const drops = new DropTable(sequence(0.99))
    drops.realm = 'greek'
    const owned = new Set<RelicId>()
    for (let i = 0; i < 4; i++) {
      const id = drops.roll(owned, 'giantKing')!
      expect(representatives('greek')).toContain(id)
      owned.add(id)
    }
    // 대표 유물을 다 모으면 보스도 보통 드랍 (확률 0.7, 0.99는 실패)
    expect(drops.roll(owned, 'giantKing')).toBeNull()
  })

  describe('신화권 드랍 (E6-18)', () => {
    const realmOf = (id: RelicId) => godDef(relicDef(id).god).realm
    /** 아무것도 갖지 않은 채 많이 굴려 신화권별로 센다 (가진 것 제외 규칙이 끼지 않게 매번 빈 손) */
    function tally(realm: (typeof DATA.gods)[string]['realm'], rolls = 2000) {
      const drops = new DropTable(createRng(7), { ...DEFAULT_DROPS, base: 1 })
      drops.realm = realm
      const out = new Map<string, number>()
      for (let i = 0; i < rolls; i++) {
        const id = drops.roll(new Set())
        if (id) out.set(realmOf(id), (out.get(realmOf(id)) ?? 0) + 1)
      }
      return out
    }

    for (const realm of ['norse', 'greek', 'china', 'japan', 'korea'] as const) {
      it(`${realm} 지역에서는 그 신화권 유물이 거의 다다 (다른 신화권은 드물게)`, () => {
        const out = tally(realm)
        const total = [...out.values()].reduce((a, b) => a + b, 0)
        const local = out.get(realm) ?? 0
        expect(local / total).toBeGreaterThan(0.75)
        expect(local / total).toBeLessThan(1)
      })
    }

    it('히든 클래스만의 유물(후츠노미타마·아메노오하바리)은 무작위로 나오지 않고, 스사노오와 함께 쓰는 칼은 나온다', () => {
      const drops = new DropTable(createRng(3), { ...DEFAULT_DROPS, base: 1 })
      drops.realm = 'japan'
      const seen = new Set<RelicId>()
      for (let i = 0; i < 3000; i++) {
        const id = drops.roll(new Set())
        if (id) seen.add(id)
      }
      expect(seen.has('futsu')).toBe(false)
      expect(seen.has('ohabari')).toBe(false)
      // 쿠사나기는 스사노오 신화의 유물이라 무작위로 나오지 않고(지역 보스·대장간, E13-03), 토츠카는 재료로 나온다
      expect(seen.has('kusanagi')).toBe(false)
      expect(seen.has('totsuka')).toBe(true)
    })

    it('재료가 된 1차 신화권 유물은 모두 언젠가는 무작위로 나온다 (E13-03)', () => {
      const seen = new Set<RelicId>()
      for (const realm of ['norse', 'greek', 'china', 'japan', 'korea'] as const) {
        const drops = new DropTable(createRng(11), { ...DEFAULT_DROPS, base: 1 })
        drops.realm = realm
        for (let i = 0; i < 2000; i++) {
          const id = drops.roll(new Set())
          if (id) seen.add(id)
        }
      }
      const expected = MATERIAL_RELICS.filter((id) => !godDef(relicDef(id).god).hidden)
      for (const id of MYTH_RELICS) expect(seen.has(id), `${id}은 신화의 유물이라 무작위로 나오지 않는다`).toBe(false)
      for (const id of expected) expect(seen.has(id as RelicId), id).toBe(true)
    })
  })

  it('안 나올수록 확률이 오르고, 나오면 처음으로 돌아간다 (불운 보정)', () => {
    const drops = new DropTable(sequence(0.5))
    const start = drops.chance
    for (let i = 0; i < 5; i++) expect(drops.roll(new Set())).toBeNull()
    expect(drops.chance).toBeGreaterThan(start)
    // 확률이 0.5를 넘으면 나온다.
    let got = null
    for (let i = 0; i < 300 && !got; i++) got = drops.roll(new Set())
    expect(got).not.toBeNull()
    expect(drops.chance).toBe(start)
  })
})

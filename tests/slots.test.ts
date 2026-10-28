import { describe, expect, it } from 'vitest'

import { computeBuild } from '../src/build/BuildState'
import { PASSIVE_PARTS } from '../src/data/classKit'
import { relicAwake } from '../src/gear/mythRelic'
import { masteryShares } from '../src/myth/ClassProgress'
import { lendText } from '../src/myth/levelGains'
import { BORROWED_XP, lentPassive, MAX_SLOTS, slotCount, withLent, withMain, withoutLent } from '../src/myth/slots'
import { GODS, godDef } from '../src/relics/data'

describe('신위 칸 (E237)', () => {
  it('칸 수: 첫 신 1, 두 번째 신 2, 장 보스마다 하나 더, 넷까지', () => {
    expect(slotCount(0, 0)).toBe(0)
    expect(slotCount(1, 0)).toBe(1)
    expect(slotCount(2, 0)).toBe(2)
    expect(slotCount(4, 1)).toBe(3)
    expect(slotCount(8, 2)).toBe(MAX_SLOTS)
    expect(slotCount(20, 9)).toBe(MAX_SLOTS)
  })

  it('주신을 바꾸면 앞의 주신이 빌린 칸 맨 앞으로, 칸이 모자라면 뒤에서 빠진다', () => {
    expect(withMain([], 'thor', 1)).toEqual(['thor'])
    expect(withMain(['thor', 'loki'], 'odin', 3)).toEqual(['odin', 'thor', 'loki'])
    expect(withMain(['thor', 'loki', 'odin'], 'odin', 3)).toEqual(['odin', 'thor', 'loki'])
    expect(withMain(['thor', 'loki'], 'odin', 2)).toEqual(['odin', 'thor'])
  })

  it('빌린 칸은 빈 칸이 있을 때만 넣고, 주신은 빼지 않는다', () => {
    expect(withLent([], 'loki', 2)).toEqual([])
    expect(withLent(['thor'], 'loki', 2)).toEqual(['thor', 'loki'])
    expect(withLent(['thor', 'loki'], 'odin', 2)).toEqual(['thor', 'loki'])
    expect(withLent(['thor', 'loki'], 'loki', 3)).toEqual(['thor', 'loki'])
    expect(withoutLent(['thor', 'loki'], 'loki')).toEqual(['thor'])
    expect(withoutLent(['thor', 'loki'], 'thor')).toEqual(['thor', 'loki'])
  })

  it('신마다 빌려주는 힘이 그 신의 패시브에 있고, 빌린 힘은 단계 1부터 켜지는 부품 하나뿐이다', () => {
    for (const god of Object.values(GODS)) {
      expect(PASSIVE_PARTS, god.id).toContain(god.lend)
      const lent = lentPassive(god.id)
      const parts = PASSIVE_PARTS.filter((k) => lent[k] !== undefined)
      expect(parts, god.id).toEqual([god.lend])
      expect(lent.damageScale).toBe(1)
      const part = lent[god.lend] as { minLevel?: number }
      if ('minLevel' in part) expect(part.minLevel, god.id).toBe(1)
      expect(lendText(god.id, 1).length, god.id).toBeGreaterThan(4)
    }
    // 아르테미스의 동료는 3단계부터지만, 빌려주는 것은 화살 갈래라 1단계부터
    expect(godDef('artemis').lend).toBe('volley')
  })

  it('빌린 신의 유물도 깨어나고, 피해 배율은 주신의 것만 붙는다', () => {
    expect(relicAwake('lokiMask', 'thor')).toBe(false)
    expect(relicAwake('lokiMask', 'thor', ['loki'])).toBe(true)
    expect(relicAwake('mjolnir', null, ['loki'])).toBe(false)
    const base = { open: new Map([['thor', 1], ['loki', 1]]), gear: ['lokiMask'], promotions: 0 }
    const alone = computeBuild({ ...base, chosen: ['thor'] })
    const lent = computeBuild({ ...base, chosen: ['thor', 'loki'] })
    expect(lent.chosen).toBe('thor')
    expect(lent.borrowed).toEqual(['loki'])
    expect(lent.damageScale).toBeCloseTo(alone.damageScale)
    expect(lent.attack).toBe(godDef('thor').attack)
    // 로키 가면의 지속 효과가 빌린 칸에서 깨어난다
    expect(lent.modifiers).not.toEqual(alone.modifiers)
  })

  it('경험치는 주신이 다, 빌린 신은 절반', () => {
    const gods = Object.values(GODS)
    const shares = masteryShares(100, 'greek', 'thor', gods, ['loki', 'zeus'])
    expect(shares.get('thor')).toBe(100)
    expect(shares.get('loki')).toBe(100 * BORROWED_XP)
    expect(shares.get('zeus')).toBe(100 * BORROWED_XP)
    expect(shares.has('poseidon')).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'

import { computeBuild } from '../src/build/BuildState'
import { PASSIVE_PARTS } from '../src/data/classKit'
import { lendText } from '../src/myth/levelGains'
import { autoFill, breathCount, breathPassive, DEMO_BREATH, emptyPantheon, focusGod, fromChosen, MAX_BREATH, oathPantheon, oathSlots, partLevel, pantheonGods, seatedSlots, slotsPantheon, withoutBreath, withPart } from '../src/myth/pantheon'
import { GODS, godDef } from '../src/relics/data'

describe('신의 자리 셋 (E302)', () => {
  it('숨 칸 수: 첫 신 1, 두 번째 신 2, 장 보스마다 하나 더, 넷까지', () => {
    expect(breathCount(0, 0)).toBe(0)
    expect(breathCount(1, 0)).toBe(1)
    expect(breathCount(2, 0)).toBe(2)
    expect(breathCount(4, 1)).toBe(3)
    expect(breathCount(8, 2)).toBe(DEMO_BREATH)
    expect(breathCount(20, 9)).toBe(DEMO_BREATH)
    // 홀로의 맹세 (E305-01): 하나 더, 엔딩 뒤에는 다섯까지
    expect(breathCount(2, 1, 1)).toBe(4)
    expect(breathCount(8, 2, 1)).toBe(DEMO_BREATH)
    expect(breathCount(8, 2, 1, MAX_BREATH)).toBe(MAX_BREATH)
  })

  it('손·심장은 바꿔 끼고, 숨은 빈 칸이 있을 때만 넣는다', () => {
    const p = { hand: 'thor', heart: 'thor', breath: ['thor'] }
    expect(withPart(p, 'hand', 'odin', 1)).toEqual({ hand: 'odin', heart: 'thor', breath: ['thor'] })
    expect(withPart(p, 'heart', 'odin', 1)).toEqual({ hand: 'thor', heart: 'odin', breath: ['thor'] })
    expect(withPart(p, 'breath', 'odin', 1)).toBe(p)
    expect(withPart(p, 'breath', 'odin', 2).breath).toEqual(['thor', 'odin'])
    expect(withPart(p, 'breath', 'thor', 2)).toBe(p)
    expect(withoutBreath(p, 'thor').breath).toEqual([])
  })

  it('한 신에 모아도 덤은 없다: 힘은 그 신의 단계 그대로 돌고, 만나기만 한 신(단계 0)은 1단계 값으로 돈다', () => {
    expect(focusGod({ hand: 'thor', heart: 'thor', breath: ['loki', 'thor'] })).toBe('thor')
    expect(focusGod({ hand: 'thor', heart: 'odin', breath: ['thor'] })).toBeNull()
    expect(focusGod({ hand: 'thor', heart: 'thor', breath: ['loki'] })).toBeNull()
    expect(focusGod(emptyPantheon())).toBeNull()
    expect(partLevel(2)).toBe(2)
    expect(partLevel(0)).toBe(1)
    expect(partLevel(4)).toBe(4)
    expect(partLevel(9)).toBe(4)
  })

  it('새 부품은 빈 자리에만 저절로 들어간다 (손이 낡은 검이면 쥔다)', () => {
    const start = autoFill(emptyPantheon(), 'thor', ['hand'], 0)
    expect(start.next.hand).toBe('thor')
    expect(start.placed).toEqual(['hand'])
    const second = autoFill({ hand: 'thor', heart: 'thor', breath: ['thor'] }, 'odin', ['hand', 'heart', 'breath'], 2)
    expect(second.next).toEqual({ hand: 'thor', heart: 'thor', breath: ['thor', 'odin'] })
    expect(second.placed).toEqual(['breath'])
    expect(pantheonGods(second.next)).toEqual(['thor', 'odin'])
  })

  it('옛 주신·빌린 신 칸은 주신을 손·심장·숨 첫 칸으로, 빌린 신을 숨으로', () => {
    expect(fromChosen([])).toEqual(emptyPantheon())
    expect(fromChosen(['thor', 'loki'])).toEqual({ hand: 'thor', heart: 'thor', breath: ['thor', 'loki'] })
  })

  it('숨의 패시브는 그 신의 부품 전부, 대표 힘은 1단계부터, 피해 배율·빠르기는 손의 몫', () => {
    for (const god of Object.values(GODS)) {
      expect(PASSIVE_PARTS, god.id).toContain(god.lend)
      const breath = breathPassive(god.id)
      expect(breath.damageScale).toBe(1)
      expect(breath.attackSpeed).toBe(1)
      for (const k of PASSIVE_PARTS) expect(breath[k] !== undefined, `${god.id}.${k}`).toBe(god.passive[k] !== undefined)
      const part = breath[god.lend] as { minLevel?: number }
      if ('minLevel' in part) expect(part.minLevel, god.id).toBe(1)
      expect(lendText(god.id, 1).length, god.id).toBeGreaterThan(4)
    }
  })

  it('칸에 든 유물 힘은 그 신이 자리에 없어도 돌고, 공격 동작·피해 배율은 무기의 신을 따른다 (P2)', () => {
    const base = { open: new Map([['thor', 1], ['loki', 1]]), gear: [], promotions: 0 }
    const alone = computeBuild({ ...base, hand: 'thor' })
    const mixed = computeBuild({ ...base, hand: 'thor', present: ['thor', 'loki'], gear: ['lokiMask'] })
    expect(mixed.chosen).toBe('thor')
    expect(mixed.borrowed).toEqual(['loki'])
    expect(mixed.damageScale).toBeCloseTo(alone.damageScale)
    expect(mixed.attack).toBe(godDef('thor').attack)
    expect(mixed.modifiers).not.toEqual(alone.modifiers)
    // 로키가 자리에 없어도 유물 힘이 칸에 있으면 같은 지속 효과가 돈다
    expect(computeBuild({ ...base, hand: 'thor', gear: ['lokiMask'] }).modifiers).toEqual(mixed.modifiers)
    const lokiHand = computeBuild({ ...base, hand: 'loki', present: ['loki', 'thor'] })
    expect(lokiHand.attack).toBe(godDef('loki').attack)
  })

  it('맹세를 건 동안 도는 자리 (E305-01): 빈 손은 손만, 홀로는 숨 앞 하나만, 원본은 그대로', () => {
    const p = { hand: 'thor', heart: 'odin', breath: ['thor', 'odin', 'freyr'] }
    expect(oathPantheon(p, { emptyHand: false, breath: null })).toBe(p)
    expect(oathPantheon(p, { emptyHand: true, breath: null })).toEqual({ hand: null, heart: 'odin', breath: ['thor', 'odin', 'freyr'] })
    expect(oathPantheon(p, { emptyHand: false, breath: 1 })).toEqual({ hand: 'thor', heart: 'odin', breath: ['thor'] })
    expect(p.breath).toHaveLength(3)
  })

  it('자리 셋은 칸에서 읽는다 (P2): 손 = 칸 무기의 신, 심장 = 칸 궁극기의 신, 숨 = 칸의 패시브 힘의 신들', () => {
    expect(slotsPantheon({ weapon: null, ultimate: null, auras: [] })).toEqual(emptyPantheon())
    const slots = { weapon: 'weapon:odin', ultimate: 'ultimate:thor', auras: ['aura:thor.basicLightning', 'relic:lokiMask', 'aura:odin.companions', 'aura:thor.skyStrike'] }
    // 유물 힘의 신은 숨에 들지 않고, 같은 신의 패시브 힘이 둘이어도 숨에는 한 번
    expect(slotsPantheon(slots)).toEqual({ hand: 'odin', heart: 'thor', breath: ['thor', 'odin'] })
    // 자리 셋 모양으로 채운 칸은 같은 자리 셋으로 읽힌다
    const p = { hand: 'thor', heart: 'odin', breath: ['loki', 'thor'] }
    expect(slotsPantheon(seatedSlots(p, ['mjolnir']))).toEqual(p)
  })

  it('맹세를 건 동안 도는 칸: 빈 손은 무기만 비고, 홀로는 패시브 힘을 앞의 신 것만 남긴다. 유물 힘과 원본은 그대로', () => {
    const slots = { weapon: 'weapon:thor', ultimate: 'ultimate:odin', auras: ['aura:thor.basicLightning', 'relic:mjolnir', 'aura:odin.companions', 'aura:thor.skyStrike'] }
    expect(oathSlots(slots, { emptyHand: false, breath: null })).toBe(slots)
    expect(oathSlots(slots, { emptyHand: true, breath: null })).toEqual({ ...slots, weapon: null })
    expect(oathSlots(slots, { emptyHand: false, breath: 1 }).auras).toEqual(['aura:thor.basicLightning', 'relic:mjolnir', 'aura:thor.skyStrike'])
    expect(slots.auras).toHaveLength(4)
  })
})

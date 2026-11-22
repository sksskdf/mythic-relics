import { describe, expect, it } from 'vitest'

import { STYLES } from '../src/combat/styles'
import {
  activeCombos,
  AURA_SLOTS,
  auraSlots,
  COMBOS,
  DEMO_GODS,
  godPowers,
  isPowerId,
  offer,
  OFFER_COUNT,
  partId,
  POWERS,
  power,
  relicPowerId,
  ultimateId,
  weaponId,
} from '../src/data/powers'
import { parsePowers, PowerProgress } from '../src/progress/Powers'
import { GODS, RELICS } from '../src/relics/data'
import { powersFromV17 } from '../src/save/migrate/v18'

const ids = (god: string) => godPowers(god).map((p) => p.id)

describe('힘의 자료 (gods.json·relics.json에서 만든다)', () => {
  it('힘의 id는 겹치지 않고, 모두 실제 자료를 가리킨다', () => {
    expect(new Set(POWERS.map((p) => p.id)).size).toBe(POWERS.length)
    for (const p of POWERS) {
      const god = GODS[p.god]
      expect(god, p.id).toBeDefined()
      const s = p.source
      if (s.from === 'attack') {
        expect(p.kind).toBe('weapon')
        expect(s.style).toBe(god!.attack)
        expect(STYLES[s.style]).toBeDefined()
      } else if (s.from === 'ultimate') {
        expect(p.kind).toBe('ultimate')
        expect(p.name).toBe(god!.ultimate.name)
      } else if (s.from === 'passive') {
        expect(p.kind).toBe('aura')
        expect(s.parts.length).toBeGreaterThan(0)
        for (const part of s.parts) expect(god!.passive[part], `${p.id}: ${part}`).toBeDefined()
      } else {
        expect(p.kind).toBe('aura')
        expect(RELICS[s.relic]?.god, p.id).toBe(p.god)
      }
    }
  })

  it('신마다 무기와 궁극기가 하나씩이고, 도는 힘이 셋 이상이다', () => {
    for (const god of Object.keys(GODS)) {
      const list = godPowers(god)
      expect(list.filter((p) => p.kind === 'weapon').map((p) => p.id), god).toEqual([weaponId(god)])
      expect(list.filter((p) => p.kind === 'ultimate').map((p) => p.id), god).toEqual([ultimateId(god)])
      expect(list.filter((p) => p.kind === 'aura').length, god).toBeGreaterThanOrEqual(3)
    }
  })

  it('신의 패시브 부품과 유물은 빠짐없이 어느 힘에 든다 (옮겨 붙는 번개는 번개와 한 힘)', () => {
    for (const [god, def] of Object.entries(GODS)) {
      const parts = godPowers(god).flatMap((p) => (p.source.from === 'passive' ? p.source.parts : []))
      const own = Object.entries(def.passive).filter(([, v]) => typeof v === 'object' && v !== null).map(([k]) => k)
      expect([...parts].sort(), god).toEqual(own.sort())
    }
    for (const relic of Object.keys(RELICS)) expect(isPowerId(relicPowerId(relic)), relic).toBe(true)
    expect(power(partId('thor', 'basicLightning'))?.source).toEqual({ from: 'passive', god: 'thor', parts: ['basicLightning', 'chainLightning'] })
    expect(isPowerId(partId('thor', 'chainLightning'))).toBe(false)
  })

  it('첫 판의 신은 북유럽 넷이고, 그 힘만 첫 판 표시가 붙는다', () => {
    expect([...DEMO_GODS].sort()).toEqual(['freyr', 'loki', 'odin', 'thor'])
    for (const god of DEMO_GODS) expect(GODS[god]?.realm, god).toBe('norse')
    for (const p of POWERS) expect(p.demo, p.id).toBe(DEMO_GODS.includes(p.god))
  })

  it('힘마다 이름과 한 줄이 있고, 한 줄은 짧고 숫자 배율을 말하지 않는다', () => {
    for (const p of POWERS) {
      expect(p.name.length, p.id).toBeGreaterThan(0)
      expect(p.line.length, p.id).toBeGreaterThan(0)
      expect(p.line.length, `${p.id}: ${p.line}`).toBeLessThanOrEqual(60)
      expect(p.line, p.id).not.toMatch(/×|%$/)
    }
  })
})

describe('조합', () => {
  it('첫 판에 넷 이상이고, 재료는 모두 첫 판의 서로 다른 힘 둘이다', () => {
    expect(COMBOS.length).toBeGreaterThanOrEqual(4)
    expect(new Set(COMBOS.map((c) => c.id)).size).toBe(COMBOS.length)
    expect(new Set(COMBOS.map((c) => c.name)).size).toBe(COMBOS.length)
    for (const c of COMBOS) {
      expect(c.needs[0]).not.toBe(c.needs[1])
      for (const id of c.needs) expect(power(id)?.demo, `${c.id}: ${id}`).toBe(true)
      expect(c.line.length, c.id).toBeGreaterThan(0)
    }
  })

  it('절반 이상이 서로 다른 신의 힘끼리다', () => {
    const cross = COMBOS.filter((c) => power(c.needs[0])!.god !== power(c.needs[1])!.god)
    expect(cross.length * 2).toBeGreaterThanOrEqual(COMBOS.length)
  })

  it('토르와 오딘의 힘만으로 켤 수 있는 조합이 넷이다 (첫 원정에서 닿는 것)', () => {
    const two = COMBOS.filter((c) => c.needs.every((id) => ['thor', 'odin'].includes(power(id)!.god)))
    expect(two.map((c) => c.id)).toEqual(['valkyrie', 'thunderSpear', 'returningThunder', 'herald'])
  })

  it('두 힘이 함께 칸에 있을 때만 켜진다', () => {
    const [a, b] = COMBOS[0]!.needs
    expect(activeCombos([])).toEqual([])
    expect(activeCombos([a])).toEqual([])
    expect(activeCombos([b, a]).map((c) => c.id)).toEqual([COMBOS[0]!.id])
    // 번개 하나가 여러 조합의 재료다
    const lightning = partId('thor', 'basicLightning')
    expect(activeCombos([lightning, partId('odin', 'companions'), relicPowerId('gungnir'), relicPowerId('mjolnir')]).map((c) => c.id)).toEqual(['valkyrie', 'thunderSpear', 'returningThunder'])
  })
})

describe('칸 규칙', () => {
  it('도는 힘의 칸은 셋에서 귀환마다 하나씩, 여섯까지', () => {
    expect([0, 1, 2, 3, 4, 9].map(auraSlots)).toEqual([3, 4, 5, 6, 6, 6])
    expect(auraSlots(-2)).toBe(AURA_SLOTS.start)
  })
})

describe('내밀기', () => {
  const fresh = { owned: [], met: [] }

  it('같은 씨앗·출처·상태면 늘 같은 셋이고, 씨앗이나 출처가 다르면 달라질 수 있다', () => {
    const state = { owned: [], met: ['thor', 'odin', 'loki'] }
    for (const source of ['trace:thor', 'guardian:odin', 'pack:midgard:1', 'boss:utgard']) {
      expect(offer(source, state, 77)).toEqual(offer(source, state, 77))
      expect(offer(source, state, 77)).toHaveLength(OFFER_COUNT)
    }
    const seen = new Set(Array.from({ length: 30 }, (_, seed) => offer('pack:midgard:1', state, seed).join()))
    expect(seen.size).toBeGreaterThan(5)
    const bySource = new Set(Array.from({ length: 30 }, (_, n) => offer(`pack:midgard:${n}`, state, 77).join()))
    expect(bySource.size).toBeGreaterThan(5)
  })

  it('흔적은 그 신의 힘 셋을 내밀고, 무기가 아직 없으면 무기를 꼭 낀다', () => {
    for (const god of DEMO_GODS) {
      for (let seed = 0; seed < 40; seed++) {
        const three = offer(`trace:${god}`, fresh, seed)
        expect(three).toHaveLength(3)
        expect(new Set(three).size).toBe(3)
        expect(three).toContain(weaponId(god))
        for (const id of three) expect(power(id)!.god).toBe(god)
      }
    }
    // 무기를 이미 가졌으면 나머지에서 셋
    const three = offer('trace:thor', { owned: [weaponId('thor')], met: ['thor'] }, 3)
    expect(three).toHaveLength(3)
    expect(three).not.toContain(weaponId('thor'))
  })

  it('이미 가진 힘은 내밀지 않고, 모자라면 있는 만큼, 다 가졌으면 빈 목록', () => {
    const all = ids('thor')
    for (let seed = 0; seed < 20; seed++) {
      const owned = all.slice(0, 4)
      for (const id of offer('trace:thor', { owned, met: ['thor'] }, seed)) expect(owned).not.toContain(id)
    }
    expect(offer('trace:thor', { owned: all.slice(0, -2), met: ['thor'] }, 1).sort()).toEqual(all.slice(-2).sort())
    expect(offer('trace:thor', { owned: all, met: ['thor'] }, 1)).toEqual([])
    expect(offer('pack:a', { owned: all, met: ['thor'] }, 1)).toEqual([])
  })

  it('수호자는 그 신의 남은 것부터 내밀고, 모자라면 만난 신들의 것으로 채운다', () => {
    const thor = ids('thor')
    const own = offer('guardian:thor', { owned: thor.slice(0, 2), met: ['thor', 'odin'] }, 5)
    for (const id of own) expect(power(id)!.god).toBe('thor')
    const short = offer('guardian:thor', { owned: thor.slice(0, -1), met: ['thor', 'odin'] }, 5)
    expect(short).toHaveLength(3)
    expect(short[0]).toBe(thor.at(-1))
    expect(short.slice(1).every((id) => power(id)!.god === 'odin')).toBe(true)
    // 만난 신이 그 신뿐이면 있는 만큼
    expect(offer('guardian:thor', { owned: thor.slice(0, -1), met: ['thor'] }, 5)).toEqual([thor.at(-1)])
  })

  it('무리·장 보스는 만난 신들의 아직 없는 힘에서 섞는다 (신이 겹치지 않게 앞세운다)', () => {
    for (let seed = 0; seed < 40; seed++) {
      const three = offer('boss:utgard', { owned: [weaponId('thor')], met: ['thor', 'odin', 'loki'] }, seed)
      expect(three).toHaveLength(3)
      expect(new Set(three.map((id) => power(id)!.god)).size).toBe(3)
      expect(three).not.toContain(weaponId('thor'))
    }
    // 만난 신이 없으면 내밀 것이 없다
    expect(offer('pack:a', fresh, 1)).toEqual([])
    // 만나지 않은 신의 힘은 섞이지 않는다
    for (const id of offer('pack:a', { owned: [], met: ['odin'] }, 9)) expect(power(id)!.god).toBe('odin')
  })

  it('모르는 꼴의 출처·없는 신은 빈 목록', () => {
    for (const source of ['', 'thor', 'trace:', 'trace:arthur', 'guardian:nobody', 'gift:thor', ':thor']) expect(offer(source, { owned: [], met: ['thor'] }, 1), source).toEqual([])
  })
})

describe('힘의 진행', () => {
  const make = (returns = 0) => new PowerProgress(() => returns, 42)

  it('흔적에서 고르면 그 신을 만나고, 힘을 갖고, 빈 칸에 끼운다', () => {
    const p = make()
    const three = p.offer('trace:thor')
    expect(p.claim('trace:thor', weaponId('thor'))).toBe(true)
    expect(three).toContain(weaponId('thor'))
    expect(p.met).toEqual(['thor'])
    expect(p.owned).toEqual([weaponId('thor')])
    expect(p.slots.weapon).toBe(weaponId('thor'))
  })

  it('출처마다 한 번만 고른다', () => {
    const p = make()
    const [first, second] = p.offer('trace:thor')
    expect(p.canClaim('trace:thor')).toBe(true)
    expect(p.claim('trace:thor', first!)).toBe(true)
    expect(p.canClaim('trace:thor')).toBe(false)
    expect(p.offer('trace:thor')).toEqual([])
    expect(p.claim('trace:thor', second!)).toBe(false)
    expect(p.owned).toEqual([first])
    // 다른 출처는 따로 센다
    expect(p.canClaim('guardian:thor')).toBe(true)
    expect(p.canClaim('엉뚱한 곳')).toBe(false)
  })

  it('내밀지 않은 힘은 고를 수 없다', () => {
    const p = make()
    expect(p.claim('trace:thor', weaponId('odin'))).toBe(false)
    expect(p.claim('trace:thor', 'weapon:nobody')).toBe(false)
    expect(p.canClaim('trace:thor')).toBe(true)
    expect(p.owned).toEqual([])
    expect(p.met).toEqual([])
  })

  it('새로 고른 힘은 빈 칸이 있을 때만 들어가고, 찬 칸은 건드리지 않는다', () => {
    const p = make()
    p.grantAll('thor')
    const before = p.toData().slots
    expect(before.auras).toHaveLength(3)
    p.claim('trace:odin', weaponId('odin'))
    expect(p.has(weaponId('odin'))).toBe(true)
    expect(p.slots).toEqual(before)
  })

  it('가진 힘만 칸에 끼우고, 무기·궁극기는 바뀌며, 도는 힘은 칸 수까지', () => {
    const p = make()
    expect(p.slot(weaponId('thor'))).toBe(false)
    p.grantAll('thor')
    p.grantAll('odin')
    // 무기·궁극기는 뒤에 받은 오딘의 것으로 바뀌었고, 도는 힘 셋은 토르의 것 그대로
    expect(p.slots.weapon).toBe(weaponId('odin'))
    expect(p.slots.ultimate).toBe(ultimateId('odin'))
    expect(p.slots.auras).toEqual(ids('thor').filter((id) => power(id)!.kind === 'aura').slice(0, 3))
    expect(p.slot(weaponId('thor'))).toBe(true)
    expect(p.slots.weapon).toBe(weaponId('thor'))
    expect(p.slot(weaponId('thor'))).toBe(false)
    const ravens = partId('odin', 'companions')
    expect(p.slot(ravens)).toBe(false)
    expect(p.unslot(p.slots.auras[0]!)).toBe(true)
    expect(p.slot(ravens)).toBe(true)
    expect(p.slots.auras).toHaveLength(3)
    expect(p.unslot(relicPowerId('gungnir'))).toBe(false)
    // 뺀 힘도 그대로 갖는다
    expect(p.owned).toHaveLength(ids('thor').length + ids('odin').length)
    expect(p.unslot(weaponId('thor'))).toBe(true)
    expect(p.slots.weapon).toBeNull()
  })

  it('귀환하면 도는 힘의 칸이 하나씩 는다', () => {
    let returns = 0
    const p = new PowerProgress(() => returns, 1)
    p.grantAll('thor')
    expect(p.slots.auras).toHaveLength(3)
    const fourth = ids('thor').filter((id) => power(id)!.kind === 'aura')[3]!
    expect(p.slot(fourth)).toBe(false)
    returns = 1
    expect(p.auraSlots).toBe(4)
    expect(p.slot(fourth)).toBe(true)
  })

  it('지름길 grantAll: 그 신을 만나고 힘을 모두 갖는다 (두 번 불러도 같다)', () => {
    const p = make(3)
    p.grantAll('thor')
    p.grantAll('thor')
    p.grantAll('nobody')
    expect(p.met).toEqual(['thor'])
    expect(p.owned).toEqual(ids('thor'))
    expect(p.slotted).toEqual(ids('thor'))
  })

  it('고르는 대로 조합이 켜지고, 칸에서 빼면 꺼진다', () => {
    const p = make()
    p.grantAll('odin')
    expect(activeCombos(p.slotted)).toEqual([])
    p.meet('thor')
    p.owned.push(partId('thor', 'basicLightning'))
    p.unslot(relicPowerId('draupnir'))
    p.slot(partId('thor', 'basicLightning'))
    expect(activeCombos(p.slotted).map((c) => c.id)).toEqual(['valkyrie', 'thunderSpear'])
    p.unslot(partId('odin', 'companions'))
    expect(activeCombos(p.slotted).map((c) => c.id)).toEqual(['thunderSpear'])
  })

  it('저장 왕복: 쓰고 읽어도 같고, 같은 씨앗이라 같은 셋을 내민다', () => {
    const p = make(1)
    p.claim('trace:thor', weaponId('thor'))
    p.claim('guardian:thor', p.offer('guardian:thor')[0]!)
    p.meet('odin')
    const data = parsePowers(JSON.parse(JSON.stringify(p.toData())))
    expect(data).toEqual(p.toData())
    const q = new PowerProgress(() => 1)
    q.load(data)
    expect(q.toData()).toEqual(p.toData())
    expect(q.offer('pack:midgard:2')).toEqual(p.offer('pack:midgard:2'))
    expect(q.canClaim('trace:thor')).toBe(false)
  })

  it('불러올 때 칸 수를 넘친 도는 힘은 칸에서만 빠진다', () => {
    const p = make(3)
    p.grantAll('thor')
    expect(p.slots.auras).toHaveLength(5)
    const q = make(0)
    q.load(p.toData())
    expect(q.slots.auras).toEqual(p.slots.auras.slice(0, 3))
    expect(q.owned).toEqual(p.owned)
  })
})

describe('힘의 저장 검사', () => {
  it('없는 힘·신·모르는 꼴의 출처는 버리고, 칸에는 가진 힘만 제 종류대로', () => {
    const data = parsePowers({
      owned: ['weapon:thor', 'weapon:thor', 'weapon:arthur', 7, 'relic:mjolnir', 'ultimate:odin'],
      slots: { weapon: 'ultimate:odin', ultimate: 'ultimate:thor', auras: ['relic:mjolnir', 'relic:mjolnir', 'weapon:thor', 'relic:gungnir'], feet: 'x' },
      claimed: ['trace:thor', 'trace:thor', 'gift:thor', 3],
      met: ['thor', 'arthur', 'thor'],
      seed: 9,
      extra: true,
    })
    expect(data).toEqual({ owned: ['weapon:thor', 'relic:mjolnir', 'ultimate:odin'], slots: { weapon: null, ultimate: null, auras: ['relic:mjolnir'] }, claimed: ['trace:thor'], met: ['thor'], seed: 9 })
  })

  it('어긋난 값은 빈 기록으로, 씨앗이 없으면 받은 씨앗으로', () => {
    for (const junk of [null, 3, 'x', [], { owned: 'x', slots: 3, claimed: {}, met: 1, seed: -1 }, { seed: 1.5 }, { seed: 1e12 }]) {
      expect(parsePowers(junk, 55), JSON.stringify(junk)).toEqual({ owned: [], slots: { weapon: null, ultimate: null, auras: [] }, claimed: [], met: [], seed: 55 })
    }
  })
})

describe('저장 v17 → v18: 신 단위에서 힘으로', () => {
  const base = { classes: {}, pantheon: { hand: null, heart: null, breath: [] }, lit: [], returns: 0 }

  it('깨운 신은 만난 신이고 그 신의 힘을 모두 가진다. 흔적과 수호자는 이미 고른 출처다', () => {
    const data = powersFromV17({ ...base, classes: { thor: { level: 2 }, odin: { level: 1 }, freyr: { level: 0 } } })
    expect(data.met).toEqual(['thor', 'odin'])
    expect(data.owned).toEqual([...ids('thor'), ...ids('odin')])
    expect(data.claimed).toEqual(['trace:thor', 'guardian:thor', 'trace:odin', 'guardian:odin'])
    // 자리에 든 신이 없으면 칸은 빈다
    expect(data.slots).toEqual({ weapon: null, ultimate: null, auras: [] })
  })

  it('깨우는 도중인 신의 힘은 주지 않는다 (P5: 힘은 고른 것만. 그 신의 수호자를 이기면 빛에서 고른다). 켠 유물의 힘은 가진 힘이다', () => {
    const data = powersFromV17({ ...base, classes: { thor: { level: 1 } }, pantheon: { hand: 'thor', heart: 'thor', breath: ['thor'] }, lit: ['mjolnir', 'gungnir'], returns: 3 })
    expect(data.met).toEqual(['thor'])
    expect(data.owned).toEqual(expect.arrayContaining([...ids('thor'), relicPowerId('gungnir')]))
    expect(data.owned).not.toContain(weaponId('odin'))
    expect(data.claimed).toEqual(['trace:thor', 'guardian:thor'])
    // 깨우지도 자리에 넣지도 않은 신의 켠 유물은 가진 힘으로만 남는다
    expect(data.slots.auras).toEqual([relicPowerId('mjolnir'), partId('thor', 'basicLightning'), partId('thor', 'skyStrike')])
    expect(data.slots.auras).not.toContain(relicPowerId('gungnir'))
    const p = new PowerProgress()
    p.load(data)
    expect(p.canClaim('trace:odin')).toBe(true)
  })

  it('자리 셋에 든 신의 힘을 칸에 끼운다: 손은 무기, 심장은 궁극기, 도는 힘은 손의 신의 켠 유물 → 숨의 패시브 부품 → 나머지 켠 유물', () => {
    const data = powersFromV17({
      ...base,
      classes: { thor: { level: 2 }, odin: { level: 1 }, loki: { level: 1 } },
      pantheon: { hand: 'thor', heart: 'odin', breath: ['odin'] },
      lit: ['mjolnir', 'lokiMask', 'gungnir'],
      returns: 1,
    })
    expect(data.slots.weapon).toBe(weaponId('thor'))
    expect(data.slots.ultimate).toBe(ultimateId('odin'))
    // 로키는 자리에 없어 가면은 가진 힘으로만 남는다
    expect(data.slots.auras).toEqual([relicPowerId('mjolnir'), partId('odin', 'companions'), relicPowerId('gungnir')])
    expect(data.owned).toContain(relicPowerId('lokiMask'))
  })

  it('도는 힘은 칸 수까지만 끼우고, 넘친 것은 가진 힘으로 남는다', () => {
    const o = { ...base, classes: { thor: { level: 3 }, odin: { level: 1 }, freyr: { level: 1 } }, pantheon: { hand: 'thor', heart: 'thor', breath: ['thor', 'odin', 'freyr'] }, lit: ['mjolnir', 'gungnir'] }
    // 칸이 셋뿐이어도 손에 쥔 토르의 묠니르는 패시브에 밀려 빠지지 않는다 (기본 공격에 얽힌 행동이라 앞세운다)
    expect(powersFromV17(o).slots.auras).toEqual([relicPowerId('mjolnir'), partId('thor', 'basicLightning'), partId('thor', 'skyStrike')])
    expect(powersFromV17({ ...o, returns: 5 }).slots.auras).toHaveLength(6)
    expect(powersFromV17(o).owned).toContain(relicPowerId('gungnir'))
  })

  it('옮긴 기록은 저장 검사를 그대로 지나고, 같은 옛 저장은 늘 같은 씨앗을 받는다', () => {
    const o = { ...base, classes: { thor: { level: 2 }, zeus: { level: 1 } }, pantheon: { hand: 'thor', heart: 'zeus', breath: ['thor', 'zeus'] }, lit: ['mjolnir', 'keraunos'], returns: 2 }
    const data = powersFromV17(o)
    expect(parsePowers(JSON.parse(JSON.stringify(data)))).toEqual(data)
    expect(powersFromV17(o).seed).toBe(data.seed)
    expect(powersFromV17({ ...o, returns: 3 }).seed).not.toBe(data.seed)
  })
})

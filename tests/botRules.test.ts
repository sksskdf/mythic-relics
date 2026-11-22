import { describe, expect, it } from 'vitest'

import enemies from '../src/data/enemies.json'
import { bossTurn, holdOf, OLD_BRANCH_ORDER, pickPower, returnBranch, selfReturn, soaksFalling, staysInHold } from '../src/dev/botRules'
import { pickAwaken } from '../src/data/wake'
import type { God } from '../src/relics/data'
import { LEASH_REENGAGE } from '../src/enemies/Giant'

describe('봇의 귀환 갈래 (E307 0C)', () => {
  const flames = ['flame:flame', 'flame:hunt', 'flame:wind', 'flame:stone']

  it('승천할 신이 있으면 늘 승천한다: 손의 신부터, 손의 신이 다 올랐으면 다른 신', () => {
    const ids = ['ascend:odin', 'ascend:thor', ...flames]
    for (let returns = 0; returns < 6; returns++) expect(returnBranch(ids, 'thor', returns, 'ascend')).toBe('ascend:thor')
    // 손의 신(토르)이 끝까지 올라 갈래에 없으면 오를 수 있는 다른 신
    expect(returnBranch(['ascend:odin', ...flames], 'thor', 2, 'ascend')).toBe('ascend:odin')
  })

  it('승천할 신이 없을 때만 불씨를 고른다 (불꽃)', () => {
    expect(returnBranch(flames, 'thor', 1, 'ascend')).toBe('flame:flame')
    expect(returnBranch(flames, null, 0, 'ascend')).toBe('flame:flame')
  })

  it('옛 차례(--branch=old)는 귀환마다 승천 → 불꽃 → 승천 → 사냥, 그 뒤로는 승천이다', () => {
    const ids = ['ascend:thor', ...flames]
    expect(OLD_BRANCH_ORDER).toEqual(['ascend', 'flame:flame', 'ascend', 'flame:hunt'])
    expect([0, 1, 2, 3, 4, 5].map((returns) => returnBranch(ids, 'thor', returns, 'old'))).toEqual(['ascend:thor', 'flame:flame', 'ascend:thor', 'flame:hunt', 'ascend:thor', 'ascend:thor'])
    // 옛 차례에서도 승천 차례에 승천할 신이 없으면 불꽃
    expect(returnBranch(flames, 'thor', 2, 'old')).toBe('flame:flame')
  })

  it('두 법이 갈리는 것은 둘째·넷째 귀환뿐이다 (엔딩까지 귀환 넷: 늘 승천은 승천 넷, 옛 차례는 승천 둘)', () => {
    const ids = ['ascend:thor', ...flames]
    const picks = (mode: 'ascend' | 'old') => [0, 1, 2, 3].map((returns) => returnBranch(ids, 'thor', returns, mode))
    expect(picks('ascend').filter((id) => id.startsWith('ascend:'))).toHaveLength(4)
    expect(picks('old').filter((id) => id.startsWith('ascend:'))).toHaveLength(2)
  })
})

describe('봇이 목표 보스를 치는 때 (E307 0C)', () => {
  it('보스가 20m 안이면 둘레에 졸개가 몇이든 보스를 친다', () => {
    expect(bossTurn({ hp: 0.9, distance: 12, engaged: false, strays: 5 })).toBe(true)
    expect(bossTurn({ hp: 0.9, distance: 19.9, engaged: false, strays: 2 })).toBe(true)
  })

  it('문턱은 20m다: 쉬는 보스가 딱 20m면 졸개 하나만 있어도 졸개부터, 바로 안쪽(19.99m)이면 보스다', () => {
    expect(bossTurn({ hp: 0.9, distance: 20, engaged: false, strays: 1 })).toBe(false)
    expect(bossTurn({ hp: 0.9, distance: 19.99, engaged: false, strays: 1 })).toBe(true)
    // 문턱 바로 밖도 둘레가 비었거나 보스가 싸움에 끼어들었으면 친다
    expect(bossTurn({ hp: 0.9, distance: 20, engaged: false, strays: 0 })).toBe(true)
    expect(bossTurn({ hp: 0.9, distance: 20, engaged: true, strays: 1 })).toBe(true)
  })

  it('보스가 싸움에 끼어들었으면 멀어도, 졸개가 있어도 보스를 친다', () => {
    expect(bossTurn({ hp: 0.9, distance: 35, engaged: true, strays: 4 })).toBe(true)
  })

  it('보스가 멀고 쉬고 있으면 둘레의 졸개부터 치운다. 둘레가 비면 보스에게 간다', () => {
    expect(bossTurn({ hp: 0.9, distance: 35, engaged: false, strays: 1 })).toBe(false)
    expect(bossTurn({ hp: 0.9, distance: 35, engaged: false, strays: 0 })).toBe(true)
  })

  it('주인공의 생명이 60% 아래면 보스를 치지 않는다', () => {
    expect(bossTurn({ hp: 0.6, distance: 5, engaged: true, strays: 0 })).toBe(false)
    expect(bossTurn({ hp: 0.61, distance: 5, engaged: true, strays: 0 })).toBe(true)
  })

  it('옛 규칙(졸개 하나 이하이고 20m 안)에서 치던 때는 지금도 친다', () => {
    for (const strays of [0, 1]) expect(bossTurn({ hp: 0.7, distance: 15, engaged: false, strays })).toBe(true)
  })
})

describe('큰 싸움에서 떨어지는 것을 맞으며 붙는가 (E307 0C)', () => {
  it('수호자는 생명 50% 위, 목표 보스는 60% 위(치기 시작하는 문턱)에서 맞으며 붙는다', () => {
    expect(soaksFalling('guardian', 0.51)).toBe(true)
    expect(soaksFalling('guardian', 0.5)).toBe(false)
    expect(soaksFalling('boss', 0.61)).toBe(true)
    // 딱 문턱(60%)이면 피한다: 보스를 치기 시작하는 문턱과 같은 값이다
    expect(soaksFalling('boss', 0.6)).toBe(false)
    expect(bossTurn({ hp: 0.6, distance: 5, engaged: true, strays: 0 })).toBe(false)
    expect(soaksFalling('boss', 0.55)).toBe(false)
  })

  it('큰 싸움이 아니면 늘 피한다', () => {
    expect(soaksFalling(null, 1)).toBe(false)
  })
})

describe('보스를 줄 밖으로 끌고 나가지 않는 자리 (E307 0C)', () => {
  // 거인 왕의 줄은 30m, 돌아가던 보스가 다시 쫓는 몫은 0.75: 붙드는 원은 22.5m.
  // 원은 봇이 쓰는 그 함수(`holdOf`)로 만든다: 봇이 0.75를 빼먹고 줄 끝까지 피하면 보스가 돌아가 생명이 되찬다
  const specs = enemies as unknown as Record<string, { leashRange: number }>
  const home = { x: 10, z: -4 }
  const hold = holdOf({ home, spec: specs.king! })
  const at = (d: number) => ({ x: hold.home.x + d, z: hold.home.z })

  it('붙드는 원은 그 보스의 집에서 줄 × 0.75다: 거인 왕·키마이라 22.5m, 갈라진 하늘의 왕 30m', () => {
    expect(LEASH_REENGAGE).toBe(0.75)
    expect([specs.king!.leashRange, specs.chimera!.leashRange, specs.skyKing!.leashRange]).toEqual([30, 30, 40])
    expect(hold).toEqual({ home, radius: 22.5 })
    expect(holdOf({ home, spec: specs.chimera! }).radius).toBe(22.5)
    expect(holdOf({ home, spec: specs.skyKing! }).radius).toBe(30)
    // 줄 끝(30m)은 원 밖이다
    expect(staysInHold(at(specs.king!.leashRange), at(20), hold)).toBe(false)
  })

  it('원 안의 자리는 되고, 원 밖으로 나가는 자리는 안 된다', () => {
    expect(staysInHold(at(15), at(10), hold)).toBe(true)
    expect(staysInHold(at(22.5), at(20), hold)).toBe(true)
    expect(staysInHold(at(23), at(20), hold)).toBe(false)
    expect(staysInHold({ x: hold.home.x, z: hold.home.z + 30 }, at(20), hold)).toBe(false)
  })

  it('이미 원 밖이면 집에 더 가까워지는 자리만 된다', () => {
    expect(staysInHold(at(25), at(28), hold)).toBe(true)
    expect(staysInHold(at(28), at(28), hold)).toBe(false)
    expect(staysInHold(at(31), at(28), hold)).toBe(false)
  })

  it('붙드는 싸움이 없으면 어디든 된다', () => {
    expect(staysInHold({ x: 500, z: 500 }, { x: 0, z: 0 }, null)).toBe(true)
  })
})

describe('차례 없는 흔적의 봇 (2026-11-22)', () => {
  it('수호자·장 보스를 이긴 원정이고 이 땅에 성소가 있으면 스스로 귀환한다 (깊이 봇·장 흐름 밖은 제 규칙)', () => {
    const now = { chapters: true, deepen: false, bosses: 1, sanctuary: true, canReturn: true }
    expect(selfReturn(now)).toBe(true)
    expect(selfReturn({ ...now, bosses: 0 })).toBe(false)
    expect(selfReturn({ ...now, sanctuary: false })).toBe(false)
    expect(selfReturn({ ...now, canReturn: false })).toBe(false)
    expect(selfReturn({ ...now, deepen: true })).toBe(false)
    expect(selfReturn({ ...now, chapters: false })).toBe(false)
  })

  it('다음 깨우는 일: --first의 신, 서 있는 수호자, 지금 땅의 가까운 흔적, 장 할 일의 땅의 흔적 차례', () => {
    type T = { god: God; kind: 'trace' | 'guardian'; region: string; d: number }
    const thor: T = { god: 'thor', kind: 'trace', region: 'midgard', d: 30 }
    const odin: T = { god: 'odin', kind: 'trace', region: 'midgard', d: 10 }
    const loki: T = { god: 'loki', kind: 'trace', region: 'jotunheim', d: 0 }
    const freyr: T = { god: 'freyr', kind: 'guardian', region: 'muspel', d: 0 }
    const pick = (all: T[], here: string, first: God | null = null, prefer?: string) => pickAwaken(all, { here, prefer, first, distance: (t) => t.d })?.god ?? null
    // 지금 땅의 가장 가까운 흔적
    expect(pick([thor, odin, loki], 'midgard')).toBe('odin')
    // 다른 땅에 있으면 장 할 일의 땅(prefer)의 것, 없으면 차례대로
    expect(pick([thor, loki], 'village', null, 'jotunheim')).toBe('loki')
    expect(pick([thor, loki], 'village')).toBe('thor')
    // 서 있는 수호자가 흔적보다 먼저
    expect(pick([thor, odin, freyr], 'midgard')).toBe('freyr')
    // --first가 있으면 그 신부터 (할 일 가운데 없으면 여느 차례)
    expect(pick([thor, odin, loki, freyr], 'midgard', 'loki')).toBe('loki')
    expect(pick([thor, odin], 'midgard', 'loki')).toBe('odin')
    expect(pick([], 'midgard')).toBeNull()
  })
})

describe('봇이 힘 카드에서 고르는 법 (재미 재설계 P5)', () => {
  const rows = [
    { id: 'aura:thor.skyStrike', kind: 'aura' as const },
    { id: 'ultimate:thor', kind: 'ultimate' as const },
    { id: 'weapon:thor', kind: 'weapon' as const },
  ]
  const empty = { weapon: null, ultimate: null }

  it('기본: 무기 칸이 비었으면 무기, 궁극기 칸이 비었으면 궁극기, 그다음 끼우면 조합이 켜지는 힘, 없으면 첫째 줄', () => {
    expect(pickPower(rows, empty, 'rule')).toBe('weapon:thor')
    expect(pickPower(rows, { weapon: 'weapon:odin', ultimate: null }, 'rule')).toBe('ultimate:thor')
    const full = { weapon: 'weapon:odin', ultimate: 'ultimate:odin' }
    expect(pickPower(rows, full, 'rule')).toBe('aura:thor.skyStrike')
    const combo = [rows[0]!, { id: 'relic:mjolnir', kind: 'aura' as const, combo: '돌아오는 천둥' }]
    expect(pickPower(combo, full, 'rule')).toBe('relic:mjolnir')
    // 칸이 차서 가진 힘으로만 남는 줄은 조합을 완성하지 못한다
    expect(pickPower([rows[0]!, { ...combo[1]!, spare: true }], full, 'rule')).toBe('aura:thor.skyStrike')
    // 첫째 줄은 칸에 바로 드는 줄 가운데 첫째: 찬 무기 칸을 바꿔 끼우는 무기·남기만 하는 도는 힘보다 빈 칸에 드는 도는 힘
    const trace = [{ id: 'weapon:odin', kind: 'weapon' as const }, { id: 'relic:draupnir', kind: 'aura' as const, spare: true }, { id: 'aura:odin.companions', kind: 'aura' as const }]
    expect(pickPower(trace, full, 'rule')).toBe('aura:odin.companions')
    // 다 칸에 들지 못하면 첫째 줄
    expect(pickPower(trace.slice(0, 2), full, 'rule')).toBe('weapon:odin')
  })

  it('first·last는 늘 그 줄, 줄이 없으면 null', () => {
    expect(pickPower(rows, empty, 'first')).toBe('aura:thor.skyStrike')
    expect(pickPower(rows, empty, 'last')).toBe('weapon:thor')
    for (const mode of ['rule', 'first', 'last'] as const) expect(pickPower([], empty, mode)).toBeNull()
  })
})

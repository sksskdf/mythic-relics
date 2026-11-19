import { describe, expect, it } from 'vitest'

import enemies from '../src/data/enemies.json'
import { bossTurn, type Hold, OLD_BRANCH_ORDER, returnBranch, soaksFalling, staysInHold } from '../src/dev/botRules'
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
    expect(soaksFalling('boss', 0.55)).toBe(false)
  })

  it('큰 싸움이 아니면 늘 피한다', () => {
    expect(soaksFalling(null, 1)).toBe(false)
  })
})

describe('보스를 줄 밖으로 끌고 나가지 않는 자리 (E307 0C)', () => {
  // 거인 왕의 줄은 30m, 돌아가던 보스가 다시 쫓는 몫은 0.75: 붙드는 원은 22.5m
  const specs = enemies as Record<string, { leashRange?: number }>
  const leash = specs.king!.leashRange!
  const hold: Hold = { home: { x: 10, z: -4 }, radius: leash * LEASH_REENGAGE }
  const at = (d: number) => ({ x: hold.home.x + d, z: hold.home.z })

  it('붙드는 원은 그 보스의 줄 × 0.75다: 거인 왕·키마이라 22.5m, 갈라진 하늘의 왕 30m', () => {
    expect(LEASH_REENGAGE).toBe(0.75)
    expect([specs.king!.leashRange, specs.chimera!.leashRange, specs.skyKing!.leashRange]).toEqual([30, 30, 40])
    expect(hold.radius).toBe(22.5)
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

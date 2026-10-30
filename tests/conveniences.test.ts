import { describe, expect, it } from 'vitest'

import { ALWAYS_ON, Conveniences, CONVENIENCES } from '../src/progress/Conveniences'

describe('편의 자동화 (E14-05, E21-06)', () => {
  it('엔딩 뒤: 세기가 차면 차례대로 하나씩 열린다 (자동 줍기도, 처음에는 밟거나 눌러서 줍는다). 성소 워프는 처음부터 (E239-05)', () => {
    expect(ALWAYS_ON).toEqual(['warp'])
    expect(new Conveniences(() => false).has('warp')).toBe(true)
    expect(CONVENIENCES.map((d) => d.id)).not.toContain('warp')
    const c = new Conveniences()
    expect(c.has('autoPickup')).toBe(false)
    for (const def of CONVENIENCES.filter((d) => !ALWAYS_ON.includes(d.id))) {
      expect(c.has(def.id)).toBe(false)
      const opened = c.count(def.counter, def.need, 'set')
      expect(opened.map((o) => o.id)).toContain(def.id)
      expect(c.has(def.id)).toBe(true)
    }
    // 한 번 열린 것은 다시 알리지 않는다
    expect(c.count('pickups', 100)).toEqual([])
    c.autoSalvage = false
    expect(c.salvaging).toBe(false)
  })

  it('엔딩 전에는 세기만 쌓이고 열리지 않다가, 엔딩을 보면 한꺼번에 열린다', () => {
    let ended = false
    const c = new Conveniences(() => ended)
    expect(c.count('salvaged', 50)).toEqual([])
    expect(c.has('autoSalvage')).toBe(false)
    expect(c.has('autoPickup')).toBe(false)
    ended = true
    expect(c.catchUp().map((o) => o.id)).toEqual(['autoSalvage'])
    expect(c.has('autoSalvage')).toBe(true)
  })
})

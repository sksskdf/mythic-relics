import { describe, expect, it } from 'vitest'

import { Encounter } from '../src/game/Encounter'
import { type LegendHost, UtgardLegend } from '../src/game/Legend'

function setup(ready = true) {
  const encounter = new Encounter({ camps: [], boss: { x: 30, z: 30 } }, [], 38)
  const legend = new UtgardLegend({ x: 0, z: 0 }, 11)
  const events: string[] = []
  const state = { alive: true, arena: null as unknown, ready }
  const host: LegendHost = {
    ready: () => state.ready,
    heroAlive: () => state.alive,
    heroPosition: () => ({ x: 0, z: 0 }),
    setArena: (arena) => {
      state.arena = arena
    },
    onStart: () => events.push('start'),
    // 승급하면 경험치 바가 비어 다시 들어갈 수 없다.
    onWin: () => {
      events.push('win')
      state.ready = false
    },
    onFail: () => events.push('fail'),
  }
  const world = {
    hero: { x: 0, z: 0, radius: 0.4, alive: true },
    halfExtent: 38,
    staticColliders: [],
    hitHero: () => {},
    impact: () => {},
    effects: legend.object,
  }
  /** 전설에 나온 거인을 모두 쓰러뜨리고, 조각으로 흩어질 때까지 진행한다. */
  const clear = () => {
    for (const giant of encounter.alive) {
      if (giant.spec.boss !== 'giantKing') giant.takeHit(99999, 1, 0, 0)
    }
    for (let i = 0; i < 60; i++) {
      encounter.update(1 / 60, world)
      legend.update(1 / 60, encounter, host)
    }
  }
  return { encounter, legend, events, state, host, clear }
}

describe('승급 전설 「우트가르드 원정」', () => {
  it('준비가 안 됐으면 성소에 서도 시작하지 않는다', () => {
    const { encounter, legend, host } = setup(false)
    legend.update(1 / 60, encounter, host)
    expect(legend.phase).toBe('idle')
  })

  it('무리 두 번 뒤 우트가르드의 왕이 나오고, 쓰러뜨리면 승급한다', () => {
    const { encounter, legend, host, events, state, clear } = setup()
    legend.update(1 / 60, encounter, host)
    expect(events).toEqual(['start'])
    expect(state.arena).not.toBeNull()
    expect(legend.phase).toBe('wave')
    clear()
    expect(legend.phase).toBe('wave')
    clear()
    expect(legend.phase).toBe('boss')
    expect(legend.boss?.spec.boss).toBe('utgardKing')
    clear()
    expect(events).toEqual(['start', 'win'])
    expect(legend.phase).toBe('idle')
    expect(state.arena).toBeNull()
  })

  it('도중에 쓰러지면 결계가 풀리고 전설의 거인들이 사라진다', () => {
    const { encounter, legend, host, events, state } = setup()
    legend.update(1 / 60, encounter, host)
    const before = encounter.giants.length
    expect(before).toBeGreaterThan(1)
    state.alive = false
    legend.update(1 / 60, encounter, host)
    expect(events).toEqual(['start', 'fail'])
    expect(encounter.giants.length).toBe(1)
    expect(state.arena).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import type { GameContext } from '../src/game/context'
import type { DialogScene } from '../src/game/DialogScene'
import { EventBus, type GameEvents } from '../src/game/events'
import { Storyline } from '../src/game/Storyline'
import type { Villagers } from '../src/game/Villagers'

/** 장면 재생기 흉내: 연 장면을 적고, finish로 끝낸다 */
function setup(region = 'midgard') {
  const bus = new EventBus<GameEvents>()
  const seen = new Set<string>()
  const played: string[] = []
  let current: string | null = null
  let paused = false
  let holding = false
  const scenes = {
    get active() {
      return current !== null
    },
    get current() {
      return current
    },
    play(id: string) {
      if (current) return false
      current = id
      played.push(id)
      return true
    },
  }
  const ctx = {
    bus,
    scenesSeen: seen,
    map: { region: { id: region } },
    threat: { level: 1, reached: 1 },
    encounter: { boss: null, bossEngaged: false },
    legend: { active: false },
  } as unknown as GameContext
  const story = new Storyline({ ctx, scenes: scenes as unknown as DialogScene, villagers: {} as Villagers, paused: () => paused, holding: () => holding })
  const finish = () => {
    if (current) seen.add(current)
    current = null
    story.next()
  }
  return { bus, story, played, finish, setPaused: (p: boolean) => (paused = p), setHolding: (h: boolean) => (holding = h) }
}

describe('대화 장면 순서 (E15-06)', () => {
  it('신화 넷이 함께 열리면 고른 신화의 장면만 나오고, 나머지는 그 신화를 처음 고를 때 나온다', () => {
    const { bus, played, finish } = setup()
    // 고른 신화가 없을 때 첫 신화는 바로 골라진다 (Relics가 manifested를 먼저 보낸다)
    bus.emit('manifested', { god: 'thor' })
    for (const god of ['thor', 'loki', 'odin', 'freyr']) bus.emit('mythOpened', { god })
    finish()
    finish()
    expect(played).toEqual(['mythThor'])
    bus.emit('manifested', { god: 'loki' })
    expect(played).toEqual(['mythThor', 'mythLoki'])
  })

  it('정보 화면이 열려 있으면 장면을 미뤘다가 닫힌 뒤 연다', () => {
    const { bus, story, played, setPaused } = setup('village')
    setPaused(true)
    bus.emit('forged', { relic: 'mjolnir', stage: 1 })
    expect(played).toEqual([])
    setPaused(false)
    story.next()
    expect(played).toEqual(['forgeFirst'])
  })

  it('본 장면은 다시 열지 않는다', () => {
    const { bus, played, finish } = setup()
    bus.emit('manifested', { god: 'thor' })
    finish()
    bus.emit('manifested', { god: 'thor' })
    expect(played).toEqual(['mythThor'])
  })

  it('큰 카드·장면 같은 순간을 보이는 중이면 짧은 대화는 그 뒤에 (E23-01), 순간이 연 장면은 바로', () => {
    const { story, played, setHolding } = setup('village')
    setHolding(true)
    expect(story.play('forgeFirst')).toBe(true)
    story.next()
    expect(played).toEqual([])
    setHolding(false)
    story.next()
    expect(played).toEqual(['forgeFirst'])
    const other = setup()
    other.setHolding(true)
    expect(other.story.play('downKing', true)).toBe(true)
    expect(other.played).toEqual(['downKing'])
  })

  it('미뤄 둔 장면을 순간이 열면(now) 미룬 줄에서 꺼내 바로 연다 (첫 신화: 장면 뒤에 큰 카드)', () => {
    const { bus, story, played, setHolding } = setup()
    setHolding(true)
    bus.emit('manifested', { god: 'thor' })
    expect(played).toEqual([])
    expect(story.play('mythThor', true)).toBe(true)
    expect(played).toEqual(['mythThor'])
    setHolding(false)
    story.next()
    expect(played).toEqual(['mythThor'])
  })
})

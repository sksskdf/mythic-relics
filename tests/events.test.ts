import { describe, expect, it } from 'vitest'

import { EventBus } from '../src/game/events'

interface TestEvents {
  hit: { damage: number }
  done: Record<string, never>
}

describe('이벤트 버스', () => {
  it('보낸 사건을 듣는 쪽 모두에게 순서대로 바로 전한다', () => {
    const bus = new EventBus<TestEvents>()
    const got: string[] = []
    bus.on('hit', ({ damage }) => got.push(`a${damage}`))
    bus.on('hit', ({ damage }) => got.push(`b${damage}`))
    bus.on('done', () => got.push('done'))
    bus.emit('hit', { damage: 3 })
    bus.emit('done', {})
    expect(got).toEqual(['a3', 'b3', 'done'])
  })

  it('그만 듣기를 부르면 더는 받지 않는다. 듣는 중에 그만둬도 이번 사건은 다른 쪽에 다 간다', () => {
    const bus = new EventBus<TestEvents>()
    const got: number[] = []
    const off = bus.on('hit', () => {
      got.push(1)
      off()
    })
    bus.on('hit', () => got.push(2))
    bus.emit('hit', { damage: 0 })
    bus.emit('hit', { damage: 0 })
    expect(got).toEqual([1, 2, 2])
  })
})

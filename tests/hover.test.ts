import { describe, expect, it } from 'vitest'

import { itemUnderPointer } from '../src/relics/hover'

const relic = (id: string, x: number, baseY: number, topY: number) => ({ item: id, base: { x, y: baseY }, top: { x, y: topY } })

describe('땅 유물 설명 카드: 커서 아래의 유물', () => {
  const items = [relic('a', 100, 300, 220), relic('b', 400, 300, 220)]

  it('떠 있는 모델 위나 빛기둥 중간, 발밑 어디에 올려도 그 유물을 고른다', () => {
    expect(itemUnderPointer(items, { x: 100, y: 222 }, 28)).toBe('a')
    expect(itemUnderPointer(items, { x: 110, y: 260 }, 28)).toBe('a')
    expect(itemUnderPointer(items, { x: 95, y: 305 }, 28)).toBe('a')
  })

  it('모양에서 범위만큼 벗어나면 고르지 않는다', () => {
    expect(itemUnderPointer(items, { x: 100, y: 180 }, 28)).toBeNull()
    expect(itemUnderPointer(items, { x: 250, y: 260 }, 28)).toBeNull()
  })

  it('둘이 겹치면 더 가까운 쪽을 고른다', () => {
    const close = [relic('a', 100, 300, 220), relic('b', 120, 300, 220)]
    expect(itemUnderPointer(close, { x: 115, y: 250 }, 28)).toBe('b')
    expect(itemUnderPointer(close, { x: 104, y: 250 }, 28)).toBe('a')
  })

  it('모델이 화면에서 한 점으로 보일 때(발밑과 위가 같을 때)도 동작한다', () => {
    expect(itemUnderPointer([relic('a', 50, 50, 50)], { x: 60, y: 50 }, 28)).toBe('a')
  })
})

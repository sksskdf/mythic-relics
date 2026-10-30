import { describe, expect, it } from 'vitest'

import { DEFAULT_BINDINGS, mouseCode, resolveAction } from '../src/input/bindings'
import { chordChange } from '../src/input/Input'

describe('기본 조작 (조작 최소화)', () => {
  it('마우스 왼쪽·오른쪽 버튼 모두 이동', () => {
    expect(resolveAction(DEFAULT_BINDINGS, mouseCode(0))).toBe('move')
    expect(resolveAction(DEFAULT_BINDINGS, mouseCode(2))).toBe('move')
  })

  it('키보드는 쓰지 않는다', () => {
    for (const key of ['Space', 'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyF']) {
      expect(resolveAction(DEFAULT_BINDINGS, key)).toBeUndefined()
    }
  })
})

describe('겹쳐 누른 마우스 버튼', () => {
  it('pointermove가 실어 온 버튼 바뀜을 누름·뗌으로 읽는다', () => {
    // 왼쪽을 누른 채 오른쪽을 누름 → 오른쪽 뗌 없이 왼쪽을 뗌
    expect(chordChange(2, 1 | 2)).toBe('press')
    expect(chordChange(0, 2)).toBe('release')
    // 버튼이 바뀌지 않은 보통 움직임
    expect(chordChange(-1, 1)).toBeNull()
  })
})

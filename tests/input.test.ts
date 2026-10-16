import { describe, expect, it } from 'vitest'

import { DEFAULT_BINDINGS, mouseCode, resolveAction } from '../src/input/bindings'

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

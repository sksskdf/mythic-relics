import { describe, expect, it } from 'vitest'

import { DEFAULT_BINDINGS, keyLabel, mouseCode, resolveAction } from '../src/input/bindings'

describe('기본 조작', () => {
  it('우클릭 이동, 좌클릭 공격, Space 회피, Q/W/E/R 스킬, F 궁극기', () => {
    expect(resolveAction(DEFAULT_BINDINGS, mouseCode(2))).toBe('move')
    expect(resolveAction(DEFAULT_BINDINGS, mouseCode(0))).toBe('attack')
    expect(resolveAction(DEFAULT_BINDINGS, 'Space')).toBe('dodge')
    expect(['KeyQ', 'KeyW', 'KeyE', 'KeyR'].map((k) => resolveAction(DEFAULT_BINDINGS, k))).toEqual([
      'skill1',
      'skill2',
      'skill3',
      'skill4',
    ])
    expect(resolveAction(DEFAULT_BINDINGS, 'KeyF')).toBe('ultimate')
  })

  it('묶이지 않은 키는 무시한다', () => {
    expect(resolveAction(DEFAULT_BINDINGS, 'KeyZ')).toBeUndefined()
  })

  it('HUD에 보여 줄 키 이름', () => {
    expect(keyLabel(DEFAULT_BINDINGS, 'skill2')).toBe('W')
    expect(keyLabel(DEFAULT_BINDINGS, 'dodge')).toBe('Space')
  })
})

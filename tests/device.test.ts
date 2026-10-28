import { describe, expect, it } from 'vitest'

import { detectTouch, wantsPortrait } from '../src/input/device'

describe('휴대폰 알아보기 (E235)', () => {
  it('주 포인터가 손가락이거나 주소에 ?touch가 있으면 터치 기기', () => {
    expect(detectTouch('', true)).toBe(true)
    expect(detectTouch('', false)).toBe(false)
    expect(detectTouch('?touch', false)).toBe(true)
    expect(detectTouch('?dev&touch', false)).toBe(true)
  })

  it('터치 기기를 가로로 들 때만 세로로 돌려 달라고 한다 (컴퓨터는 그대로)', () => {
    expect(wantsPortrait(true, 844, 390)).toBe(true)
    expect(wantsPortrait(true, 390, 844)).toBe(false)
    expect(wantsPortrait(false, 1280, 720)).toBe(false)
  })
})

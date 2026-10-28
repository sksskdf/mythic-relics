import { describe, expect, it } from 'vitest'

import { detectTouch, wantsPortrait } from '../src/input/device'

describe('휴대폰 알아보기 (E235)', () => {
  it('주 포인터가 손가락이거나 주소에 ?touch가 있으면 터치 기기', () => {
    expect(detectTouch('', true)).toBe(true)
    expect(detectTouch('', false)).toBe(false)
    expect(detectTouch('?touch', false)).toBe(true)
    expect(detectTouch('?dev&touch', false)).toBe(true)
  })

  it('휴대폰을 가로로 들 때만 세로로 돌려 달라고 한다 (컴퓨터·태블릿은 그대로)', () => {
    expect(wantsPortrait(true, 844, 390)).toBe(true)
    expect(wantsPortrait(true, 390, 844)).toBe(false)
    expect(wantsPortrait(false, 1280, 720)).toBe(false)
    // 태블릿 가로(짧은 변 600 이상)는 막지 않는다
    expect(wantsPortrait(true, 1180, 820)).toBe(false)
    expect(wantsPortrait(true, 1024, 768)).toBe(false)
  })
})

describe('말풍선을 화면 안으로 (E235)', () => {
  it('가장자리 밖으로 나가면 안으로 당기고, 안이면 그대로 둔다', async () => {
    const { keepInside } = await import('../src/game/Villagers')
    expect(keepInside(20, 100, 390)).toBe(108)
    expect(keepInside(380, 100, 390)).toBe(282)
    expect(keepInside(200, 100, 390)).toBe(200)
    // 화면보다 넓으면 가운데
    expect(keepInside(10, 300, 390)).toBe(195)
  })
})

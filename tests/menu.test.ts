import { describe, expect, it } from 'vitest'

import { RELIC_STAGES } from '../src/gear/mythRelic'
import { HintTaps } from '../src/ui/menu/hintTaps'
import { forgedLine } from '../src/ui/menu/relicsTab'

describe('정보 화면 힌트 말풍선: 손가락으로 누른 칸 (E307)', () => {
  it('설명만 있는 칸(단추가 아니거나 눌 수 없는 단추)은 손을 떼는 순간 띄운다', () => {
    const taps = new HintTaps<string>()
    taps.press('유물표 칸', 3)
    expect(taps.lift('유물표 칸', false)).toBe(true)
    // 떼면서 띄웠으니 뒤따르는 click에는 다시 띄울 것이 없다
    expect(taps.click(3)).toBeNull()
  })

  it('일을 하는 단추는 떼는 순간에는 띄우지 않고, 그 톡이 창을 다시 그리지 않았을 때만 click 뒤에 띄운다', () => {
    const taps = new HintTaps<string>()
    // 「한 번 더 누르면 익힌다」의 첫 톡: 다시 그리지 않는다 → 설명이 뜬다
    taps.press('수련 마디', 3)
    expect(taps.lift('수련 마디', true)).toBe(false)
    expect(taps.click(3)).toBe('수련 마디')
    // 둘째 톡: 익히며 창을 다시 그린다 → 뜨지 않는다
    taps.press('수련 마디', 3)
    expect(taps.lift('수련 마디', true)).toBe(false)
    expect(taps.click(4)).toBeNull()
  })

  it('탭 단추·행동 단추처럼 누르면 창을 다시 그리는 단추는 손가락으로 눌러도 힌트가 뜨지 않는다', () => {
    const taps = new HintTaps<string>()
    for (const tab of ['장비', '수련', '신']) {
      taps.press(tab, 7)
      expect(taps.lift(tab, true)).toBe(false)
      expect(taps.click(8)).toBeNull()
    }
  })

  it('다른 곳에서 누른 채 끌려 와 뗀 손가락은 띄우지 않는다 (HUD를 누르는 순간 열린 창 위에서 뗀 손가락)', () => {
    const taps = new HintTaps<string>()
    expect(taps.lift('상태 탭', false)).toBe(false)
    taps.press('장비 칸', 1)
    expect(taps.lift('다른 칸', false)).toBe(false)
  })

  it('끌다 취소된 누름은 다음 톡이 시작될 때 잊는다: 힌트 없는 단추의 click에 옛 칸의 힌트가 뜨지 않는다', () => {
    const taps = new HintTaps<string>()
    taps.press('녹이기', 2)
    // 밀어 보기로 넘어가 떼는 사건도 click도 오지 않았다. 다음 톡은 힌트 없는 가방 장비
    taps.begin()
    expect(taps.click(2)).toBeNull()
  })

  it('click은 한 번만 답한다', () => {
    const taps = new HintTaps<string>()
    taps.press('처음 화면', 5)
    taps.lift('처음 화면', true)
    expect(taps.click(5)).toBe('처음 화면')
    expect(taps.click(5)).toBeNull()
  })
})

describe('대장간 줄: 다 벼린 유물 (E307)', () => {
  it('데모의 끝(2단계)은 「완성」이 아니다: 지금 단계와 3·4단계가 엔딩 뒤에 열린다는 것을 적는다', () => {
    const line = forgedLine('벼린 묠니르', 2)
    expect(line.name).toBe('벼린 묠니르 · 2단계')
    expect(line.name).not.toContain('완성')
    expect(line.note).toBe('3·4단계는 엔딩 뒤에 열린다')
  })

  it('끝 단계(4)에서만 「완성」이고 덧붙이는 말이 없다', () => {
    expect(forgedLine('신화의 묠니르', RELIC_STAGES)).toEqual({ name: '신화의 묠니르 · 4단계 완성', note: null })
  })

  it('3단계에 멈춰 있으면 남은 것은 4단계 하나', () => {
    expect(forgedLine('빛나는 묠니르', 3).note).toBe('4단계는 엔딩 뒤에 열린다')
  })
})

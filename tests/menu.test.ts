import { describe, expect, it } from 'vitest'

import { RELIC_STAGES } from '../src/gear/mythRelic'
import { lendText } from '../src/myth/levelGains'
import { godDef } from '../src/relics/data'
import { SEAT_MEANS, seatHint } from '../src/ui/menu/godsTab'
import godsTabSource from '../src/ui/menu/godsTab.ts?raw'
import { hintSpot, HintTaps } from '../src/ui/menu/hintTaps'
import { forgedLine, meltHint, wieldTarget } from '../src/ui/menu/relicsTab'
import { momentumLine } from '../src/ui/menu/trainingTab'

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

describe('신 탭의 자리 칸 (E307 손 QA): 휴대폰에서 눌러도 설명이 뜬다', () => {
  it('자리 칸을 눌러도 창을 통째로 다시 그리지 않는다: 손가락 힌트 규칙이 그 톡에 설명을 띄운다', () => {
    // 자리 줄을 짓는 코드 (다음 메서드 앞까지)
    const row = godsTabSource.slice(godsTabSource.indexOf('private slotRow()'), godsTabSource.indexOf('private focusOn('))
    expect(row).toContain('this.focusOn(god)')
    expect(row).not.toContain('ctx.render()')
    // 같은 톡을 규칙으로 밟아 본다: 누를 때와 click이 올라올 때의 그리기 번호가 같으니 그 칸의 설명이 뜬다
    const taps = new HintTaps<string>()
    taps.press('손 토르', 4)
    expect(taps.lift('손 토르', true)).toBe(false)
    expect(taps.click(4)).toBe('손 토르')
  })

  it('칸의 설명은 그 자리가 지금 주는 것(무기·궁극기·숨의 힘)을 먼저, 자리의 뜻을 아랫줄에 적는다', () => {
    const thor = godDef('thor')
    expect(seatHint('hand', 'thor')).toBe(`기본 공격: 망치\n${SEAT_MEANS.hand}`)
    expect(seatHint('heart', 'thor')).toBe(`궁극기 「${thor.ultimate.name}」\n${SEAT_MEANS.heart}`)
    expect(seatHint('breath', 'thor', 2)).toBe(`${lendText('thor', 2)}\n${SEAT_MEANS.breath}`)
    // 두 줄을 넘지 않는다 (말풍선의 첫 줄은 「손 토르」 같은 자리와 신의 이름)
    for (const seat of ['hand', 'heart', 'breath'] as const) expect(seatHint(seat, 'odin').split('\n')).toHaveLength(2)
  })
})

describe('힌트 말풍선의 자리 (E307 손 QA)', () => {
  // 393×852의 정보 화면 (창 377×836): 장비 탭의 「녹이기」(한 번 누른 뒤)와 그 바로 아래의 설명 카드
  const frame = { width: 377, height: 836 }
  const melt = { left: 164, top: 538, width: 171, height: 44 }
  const hint = { width: 296, height: 50 }
  const card = { left: 14, top: 590, width: 322, height: 190 }

  it('가리키는 것이 없으면 칸의 가운데 아래에 둔다, 창 밖으로 나가면 옆으로 당긴다', () => {
    expect(hintSpot(melt, hint, frame)).toEqual({ left: 73, top: 588 })
    expect(hintSpot({ ...melt, left: 0, width: 40 }, hint, frame).left).toBe(8)
    expect(hintSpot({ ...melt, left: 330, width: 40 }, hint, frame).left).toBe(377 - 296 - 8)
  })

  it('아래에 두면 창 아래로 나가면 칸 위에 둔다', () => {
    expect(hintSpot({ ...melt, top: 770 }, hint, frame).top).toBe(770 - 50 - 6)
  })

  it('세로 화면의 「녹이기」: 아래에 두면 녹일 장비의 카드(이름)를 덮으니 단추 위에 둔다', () => {
    const at = hintSpot(melt, hint, frame, card)
    expect(at.top).toBe(538 - 50 - 6)
    // 카드와 겹치지 않는다
    expect(at.top + hint.height).toBeLessThanOrEqual(card.top)
  })

  it('넓은 창(카드가 단추 위)은 그대로 아래에 둔다, 위아래 어느 쪽이든 덮으면 아래 그대로', () => {
    expect(hintSpot(melt, hint, frame, { ...card, top: 330 }).top).toBe(588)
    expect(hintSpot(melt, hint, frame, { ...card, top: 400, height: 400 }).top).toBe(588)
    // 위에 둘 자리가 없으면(창 맨 위의 단추) 아래 그대로
    expect(hintSpot({ ...melt, top: 20 }, hint, frame, { ...card, top: 70 }).top).toBe(20 + 44 + 6)
  })
})

describe('「녹이기」의 설명 (E307 손 QA)', () => {
  it('원형 수와 「세 배」를 적는다 (전: 「셋 배」)', () => {
    expect(meltHint(9)).toBe('녹이면 원형 9개가 된다 (등급이 하나 오를 때마다 세 배)')
    expect(meltHint(27)).not.toMatch(/셋 배/)
  })
})

describe('장비 탭: 가방의 장비가 들어갈 칸 (E307 손 QA)', () => {
  // 칸 일곱: 무기 0 · 머리 1 · 몸 2 · 손 3 · 발 4 · 장신구 5·6
  const worn = ['sword', null, 'armor', null, null, 'ring', null]

  it('가방의 몸 장비를 고르면 몸 칸이다: 무기 칸을 골라 둔 채여도 (고른 테두리와 비교 카드가 그 칸으로 간다)', () => {
    expect(wieldTarget([2], 0, worn)).toBe(2)
    // 빈 머리 칸에도 같다
    expect(wieldTarget([1], 0, worn)).toBe(1)
  })

  it('맞는 칸이 둘(장신구)이면 고른 칸이 맞는 부위일 때 그 칸, 아니면 빈 칸부터, 다 찼으면 첫 칸', () => {
    expect(wieldTarget([5, 6], 5, worn)).toBe(5)
    expect(wieldTarget([5, 6], 6, worn)).toBe(6)
    expect(wieldTarget([5, 6], 0, worn)).toBe(6)
    expect(wieldTarget([5, 6], 0, ['sword', null, 'armor', null, null, 'ring', 'charm'])).toBe(5)
  })

  it('한 번 옮긴 뒤에는 같은 칸이 나온다: 테두리를 옮겨도 「끼기」가 들어가는 칸은 그대로다', () => {
    for (const [fits, selected] of [[[2], 0], [[5, 6], 0], [[5, 6], 2], [[1], 6]] as const) {
      const target = wieldTarget(fits, selected, worn)!
      expect(wieldTarget(fits, target, worn)).toBe(target)
    }
  })

  it('맞는 칸이 없으면 없다', () => {
    expect(wieldTarget([], 0, worn)).toBeUndefined()
  })
})

describe('수련 탭의 머리줄 (E307 손 QA)', () => {
  it('모은 깨달음의 수를 「기세」라는 이름과 함께 적는다: 목표 한 줄·흔적 카드의 기세와 같은 수다', () => {
    expect(momentumLine(3)).toBe('기세 3 · 이번 원정에 모은 깨달음')
    expect(momentumLine(0)).toContain('기세 0')
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

import { describe, expect, it } from 'vitest'

import { DRAG_START, STICK_RADIUS, TAP_SECONDS, TouchGestures } from '../src/input/touch'

describe('휴대폰 손가락 몸짓 (E235)', () => {
  it('짧게 누르고 거의 움직이지 않고 떼면 톡 (한 번만 읽힌다)', () => {
    const g = new TouchGestures()
    g.down(1, 100, 200, 0)
    g.move(1, 104, 203)
    g.up(1, 0.1)
    expect(g.stick).toBeNull()
    expect(g.takeTap()).toEqual({ x: 104, y: 203 })
    expect(g.takeTap()).toBeNull()
  })

  it('오래 누르면 톡이 아니고, 그 프레임에 읽지 않은 톡은 버린다 (멈춘 동안 누른 것이 나중에 지시가 되지 않게)', () => {
    const g = new TouchGestures()
    g.down(1, 100, 200, 0)
    g.up(1, TAP_SECONDS + 0.1)
    expect(g.takeTap()).toBeNull()
    g.down(2, 100, 200, 1)
    g.up(2, 1.1)
    g.endFrame()
    expect(g.takeTap()).toBeNull()
  })

  it('끌면 누른 자리에 조이스틱이 생기고, 원 밖으로 나가면 원이 손가락을 따라온다', () => {
    const g = new TouchGestures()
    g.down(1, 100, 300, 0)
    g.move(1, 100 + DRAG_START - 2, 300)
    expect(g.stick).toBeNull()
    g.move(1, 130, 300)
    expect(g.stick).toEqual({ x: 100, y: 300, dx: 30, dy: 0 })
    g.move(1, 300, 300)
    const stick = g.stick!
    expect(Math.hypot(stick.dx, stick.dy)).toBeCloseTo(STICK_RADIUS)
    expect(stick.x).toBeCloseTo(300 - STICK_RADIUS)
    // 반대로 돌아서면 바로 반대 방향
    g.move(1, stick.x - 20, 300)
    expect(g.stick!.dx).toBeLessThan(0)
    // 떼면 조이스틱이 사라지고 톡도 아니다
    g.up(1, 2)
    expect(g.stick).toBeNull()
    expect(g.takeTap()).toBeNull()
  })

  it('두 손가락은 벌린 배율을 주고, 손을 다 뗄 때까지 걷기·톡이 되지 않는다', () => {
    const g = new TouchGestures()
    g.down(1, 100, 400, 0)
    g.move(1, 140, 400)
    expect(g.stick).not.toBeNull()
    g.down(2, 200, 400, 0.2)
    expect(g.stick).toBeNull()
    expect(g.pinch).toBeCloseTo(1)
    g.move(2, 260, 400)
    expect(g.pinch).toBeCloseTo(120 / 60)
    g.up(2, 0.5)
    expect(g.pinch).toBeNull()
    // 남은 손가락으로 끌어도 걷지 않는다
    g.move(1, 40, 400)
    expect(g.stick).toBeNull()
    g.up(1, 0.6)
    expect(g.takeTap()).toBeNull()
    // 다 뗀 뒤에는 다시 된다
    g.down(3, 100, 100, 1)
    g.up(3, 1.05)
    expect(g.takeTap()).toEqual({ x: 100, y: 100 })
  })

  it('뗀 것을 놓쳐도 처음 대는 손가락(primary)이나 창이 가려지면 남은 손가락을 버린다', () => {
    const g = new TouchGestures()
    // 조이스틱 손가락의 pointerup을 놓쳤다
    g.down(1, 100, 400, 0, true)
    g.move(1, 160, 400)
    expect(g.stick).not.toBeNull()
    // 새로 대는 손가락이 두 번째 손가락(확대·축소)이 되지 않고 톡이 된다
    g.down(2, 50, 50, 1, true)
    expect(g.pinch).toBeNull()
    expect(g.stick).toBeNull()
    g.up(2, 1.1)
    expect(g.takeTap()).toEqual({ x: 50, y: 50 })
    // 창이 가려지면 쥐고 있던 조이스틱도 사라진다
    g.down(3, 100, 400, 2, true)
    g.move(3, 160, 400)
    g.reset()
    expect(g.stick).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'

import { MOUNT } from '../src/data/mount'
import { DRAG_START, PINCH_JOIN_SECONDS, PINCH_MIN_SPREAD, PINCH_START_PX, PINCH_START_RATIO, STICK_RADIUS, STICK_RESUME, TAP_SECONDS, TouchGestures } from '../src/input/touch'
import { ECHO_PX, ECHO_SECONDS, FingerPresses, PRESS_SECONDS, PRESS_SLOP } from '../src/input/fingerClick'
import { COVER_CLASSES, coverOpened, inBoxes, TAP_DEAD } from '../src/input/TouchControls'
import mainSource from '../src/main.ts?raw'
import dialogSource from '../src/ui/DialogBox.ts?raw'
import menuSource from '../src/ui/GameMenu.ts?raw'
import oathSource from '../src/ui/OathCard.ts?raw'
import hudCss from '../src/ui/hud.css?raw'
import hudSource from '../src/ui/Hud.ts?raw'
import pauseSource from '../src/ui/PauseMenu.ts?raw'
import returnSource from '../src/ui/ReturnCard.ts?raw'
import swapSource from '../src/ui/SwapCard.ts?raw'

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

  it('꾹 눌렀다 떼어도 톡이다: 움직이지 않고 0.5초쯤 누른 손가락이 씹히지 않는다 (E307 손 QA)', () => {
    const g = new TouchGestures()
    // 손 QA에서 잰 값: 0.49초 누름이 아무 일도 하지 않았다
    g.down(1, 250, 250, 0, true)
    g.up(1, 0.49)
    expect(g.takeTap()).toEqual({ x: 250, y: 250 })
    g.down(1, 250, 250, 1, true)
    g.up(1, 1 + TAP_SECONDS)
    expect(g.takeTap()).toEqual({ x: 250, y: 250 })
    expect(TAP_SECONDS).toBeGreaterThanOrEqual(0.6)
    // 화면에 얹어 둔 엄지·쥔 손(1초 넘게)은 떼어도 지시가 아니다
    expect(TAP_SECONDS).toBeLessThanOrEqual(1)
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

  it('끌면 누른 자리에 조이스틱이 생기고, 원은 그 자리에 있고 손잡이만 원 안에서 움직인다', () => {
    const g = new TouchGestures()
    g.down(1, 100, 300, 0)
    g.move(1, 100 + DRAG_START - 2, 300)
    expect(g.stick).toBeNull()
    g.move(1, 130, 300)
    expect(g.stick).toEqual({ x: 100, y: 300, dx: 30, dy: 0 })
    // 원 밖으로 멀리 끌어도 원은 움직이지 않고, 손잡이는 가장자리에 머문다
    g.move(1, 300, 340)
    const stick = g.stick!
    expect(stick.x).toBe(100)
    expect(stick.y).toBe(300)
    expect(Math.hypot(stick.dx, stick.dy)).toBeCloseTo(STICK_RADIUS)
    expect(stick.dy / stick.dx).toBeCloseTo(40 / 200)
    // 원 반대쪽으로 넘어가면 반대 방향
    g.move(1, 80, 300)
    expect(g.stick).toEqual({ x: 100, y: 300, dx: -20, dy: 0 })
    // 떼면 조이스틱이 사라지고 톡도 아니다
    g.up(1, 2)
    expect(g.stick).toBeNull()
    expect(g.takeTap()).toBeNull()
  })

  it('두 손가락이 저마다 움직여 사이 거리가 문턱을 넘게 바뀌면 확대로 잠기고, 그 뒤로는 손을 다 뗄 때까지 걷기·톡이 아니다 (E307)', () => {
    const g = new TouchGestures()
    g.down(1, 150, 420, 0, true)
    g.down(2, 240, 420, 0.02)
    // 닿는 것만으로는 확대가 아니다
    expect(g.pinch).toBeNull()
    // 사이 거리 90 → 110: 문턱(24px)에 못 미친다
    g.move(1, 140, 420)
    g.move(2, 250, 420)
    expect(g.pinch).toBeNull()
    // 90 → 125로 문턱은 넘었지만 둘째 손가락이 아직 제자리(10px)다
    g.move(1, 125, 420)
    expect(g.pinch).toBeNull()
    expect(g.pinchCount).toBe(0)
    // 둘 다 움직였다: 잠긴다. 배율은 잠긴 순간(거리 140)부터 잰다 (문턱만큼 한 번에 튀지 않는다)
    g.move(2, 265, 420)
    expect(g.pinchCount).toBe(1)
    expect(g.pinch).toBeCloseTo(1)
    g.move(1, 110, 420)
    g.move(2, 280, 420)
    expect(g.pinch).toBeCloseTo(170 / 140)
    expect(g.stick).toBeNull()
    g.up(2, 0.5)
    expect(g.pinch).toBeNull()
    // 남은 손가락으로 끌어도 걷지 않고, 떼어도 톡이 아니다
    g.move(1, 40, 420)
    expect(g.stick).toBeNull()
    g.up(1, 0.6)
    expect(g.takeTap()).toBeNull()
    // 다 뗀 뒤에는 다시 된다
    g.down(3, 100, 100, 1, true)
    g.up(3, 1.05)
    expect(g.takeTap()).toEqual({ x: 100, y: 100 })
  })

  it('확대 문턱은 px와 비율을 함께 넘어야 한다: 멀리 떨어진 두 엄지는 더 많이 움직여야 잠긴다 (오므리기도 같다)', () => {
    expect(PINCH_START_PX).toBe(24)
    expect(PINCH_START_RATIO).toBeGreaterThanOrEqual(0.08)
    expect(PINCH_START_RATIO).toBeLessThanOrEqual(0.1)
    // 300px 떨어진 두 손가락을 13px씩 오므린다 (26px, 8.7%)
    const near = new TouchGestures()
    near.down(1, 50, 400, 0, true)
    near.down(2, 350, 400, 0)
    near.move(1, 63, 400)
    near.move(2, 337, 400)
    expect(near.pinch).toBeCloseTo(1)
    near.move(2, 300, 400)
    expect(near.pinch).toBeCloseTo(237 / 274)
    // 600px 떨어진 두 손가락은 15px씩(30px, 5%)으로는 모자라고, 48px(8%)을 넘어야 한다
    const far = new TouchGestures()
    far.down(1, 100, 100, 0, true)
    far.down(2, 100, 700, 0)
    far.move(1, 100, 85)
    far.move(2, 100, 715)
    expect(far.pinch).toBeNull()
    far.move(1, 100, 75)
    far.move(2, 100, 725)
    expect(far.pinch).toBeCloseTo(1)
  })

  it('조이스틱을 쥔 채 다른 손가락으로 톡하면 조이스틱은 그대로이고 톡 하나가 되며, 확대가 아니다 (E307)', () => {
    const g = new TouchGestures()
    g.down(1, 100, 700, 0, true)
    g.move(1, 100, 660)
    expect(g.stick).toEqual({ x: 100, y: 700, dx: 0, dy: -40 })
    g.down(2, 300, 400, 1)
    expect(g.stick).toEqual({ x: 100, y: 700, dx: 0, dy: -40 })
    expect(g.pinch).toBeNull()
    // 걷는 엄지를 크게 움직여 사이 거리가 문턱보다 많이 바뀌어도 확대가 아니다
    g.move(1, 100, 630)
    g.move(2, 304, 398)
    g.move(1, 140, 690)
    expect(g.pinch).toBeNull()
    expect(g.stick).toEqual({ x: 100, y: 700, dx: 40, dy: -10 })
    g.up(2, 1.1)
    expect(g.takeTap()).toEqual({ x: 304, y: 398 })
    expect(g.takeTap()).toBeNull()
    expect(g.stick).not.toBeNull()
    // 둘째 손가락을 길게 끌어도 확대가 아니고 톡도 아니다. 조이스틱은 살아 있다
    g.down(3, 300, 400, 2)
    g.move(3, 300, 300)
    g.move(1, 60, 700)
    expect(g.pinch).toBeNull()
    expect(g.pinchCount).toBe(0)
    g.up(3, 2.2)
    expect(g.takeTap()).toBeNull()
    expect(g.stick).toEqual({ x: 100, y: 700, dx: -40, dy: 0 })
    // 조이스틱 손가락을 떼면 조이스틱이 사라지고 톡도 아니다
    g.up(1, 3)
    expect(g.stick).toBeNull()
    expect(g.takeTap()).toBeNull()
  })

  it('거의 함께 닿은 두 손가락은 첫 손가락이 먼저 끌려 조이스틱이 됐어도 확대로 잠긴다 (조이스틱은 놓는다). 그사이의 짧은 톡은 톡이다', () => {
    const g = new TouchGestures()
    // 벌리려던 첫 손가락이 둘째가 닿기 전에 15px 끌렸다
    g.down(1, 150, 420, 0, true)
    g.move(1, 135, 420)
    expect(g.stick).not.toBeNull()
    g.down(2, 250, 420, PINCH_JOIN_SECONDS - 0.1)
    expect(g.stick).not.toBeNull()
    g.move(2, 268, 420)
    expect(g.pinch).toBeNull()
    g.move(1, 120, 420)
    expect(g.pinch).toBeCloseTo(1)
    expect(g.stick).toBeNull()
    g.move(2, 290, 420)
    expect(g.pinch).toBeCloseTo(170 / 148)
    g.up(1, 1)
    g.up(2, 1)
    // 막 쥔 조이스틱이어도 둘째 손가락이 제자리에서 짧게 닿았다 떼면 톡이고, 조이스틱은 그대로다
    g.down(3, 100, 700, 2, true)
    g.move(3, 100, 680)
    g.down(4, 300, 400, 2.1)
    g.move(3, 100, 640)
    g.move(4, 303, 402)
    g.up(4, 2.2)
    expect(g.pinch).toBeNull()
    expect(g.takeTap()).toEqual({ x: 303, y: 402 })
    expect(g.stick).toEqual({ x: 100, y: 700, dx: 0, dy: -STICK_RADIUS })
  })

  it('두 엄지로 겹치게 번갈아 톡해도 둘 다 톡이고 확대가 아니다. 한 손가락을 대고 쉬는 채 다른 손가락만 움직여도 확대가 아니다', () => {
    const g = new TouchGestures()
    g.down(1, 110, 640, 0, true)
    g.down(2, 280, 600, 0.05)
    g.move(1, 114, 637)
    g.move(2, 285, 604)
    expect(g.pinch).toBeNull()
    g.up(1, 0.12)
    expect(g.takeTap()).toEqual({ x: 114, y: 637 })
    g.up(2, 0.2)
    expect(g.takeTap()).toEqual({ x: 285, y: 604 })
    // 쉬는 엄지 + 끄는 엄지: 거리는 문턱보다 많이 바뀌지만 한쪽이 제자리다. 원 가장자리에 닿기 전에는 조이스틱도 아니다
    g.down(3, 300, 600, 1, true)
    g.down(4, 100, 700, 1.5)
    g.move(4, 100, 660)
    g.move(3, 303, 602)
    expect(g.pinch).toBeNull()
    expect(g.stick).toBeNull()
    // 쉬던 손가락을 떼면 끌던 손가락이 다음 움직임에 조이스틱을 잡는다 (원의 가운데는 그 손가락을 누른 자리)
    g.up(3, 2)
    expect(g.takeTap()).toBeNull()
    g.move(4, 100, 658)
    expect(g.stick).toEqual({ x: 100, y: 700, dx: 0, dy: -42 })
    expect(g.pinchCount).toBe(0)
  })

  it('먼저 닿아 쉬는 손가락 곁에서 다른 손가락을 원 가장자리 넘게 끌면 그 손가락이 조이스틱을 잡고, 확대로는 넘어가지 않는다 (E307)', () => {
    const g = new TouchGestures()
    // 손가락 하나를 대고 있는 채(휴대폰을 쥔 손, 길게 누른 엄지) 다른 손가락으로 끈다
    g.down(1, 300, 300, 0, true)
    g.down(2, 100, 450, 0.6)
    // 원 가장자리까지는 기다린다 (벌리려는 두 손가락의 첫 움직임일 수 있다)
    g.move(2, 100, 450 - STICK_RADIUS + 4)
    expect(g.stick).toBeNull()
    g.move(2, 100, 390)
    expect(g.stick).toEqual({ x: 100, y: 450, dx: 0, dy: -STICK_RADIUS })
    g.move(2, 130, 450)
    expect(g.stick).toEqual({ x: 100, y: 450, dx: 30, dy: 0 })
    // 쉬던 손가락이 나중에 미끄러져 사이 거리가 문턱보다 많이 바뀌어도 확대가 아니다 (걷는 중에 시야가 바뀌지 않는다)
    g.move(1, 300, 340)
    g.move(2, 100, 400)
    expect(g.pinch).toBeNull()
    expect(g.pinchCount).toBe(0)
    // 쉬던 손가락을 떼어도 톡이 아니고(오래 눌렀다) 조이스틱은 그대로다
    g.up(1, 2)
    expect(g.takeTap()).toBeNull()
    expect(g.stick).toEqual({ x: 100, y: 450, dx: 0, dy: -STICK_RADIUS })
    // 쉬는 손가락이 둘이어도 같다. 하나라도 움직이고 있으면 잡지 않는다
    const three = new TouchGestures()
    three.down(1, 300, 300, 0, true)
    three.down(2, 340, 760, 0.4)
    three.down(3, 100, 450, 1)
    three.move(2, 340, 740)
    three.move(3, 100, 380)
    expect(three.stick).toBeNull()
    three.up(2, 1.5)
    three.move(3, 100, 378)
    expect(three.stick).toEqual({ x: 100, y: 450, dx: 0, dy: -STICK_RADIUS })
  })

  it('쉬는 손가락 곁의 조이스틱은 확대·축소를 가로채지 않는다: 차례로 댄 두 손가락도 둘 다 움직이면 확대로 잠기고, 함께 댄 두 손가락은 한쪽만 멀리 끌어도 조이스틱이 아니다', () => {
    // 한 손가락씩 차례로 대고 벌린다: 한쪽이 먼저 움직여도 원 가장자리에 닿기 전에 다른 쪽이 움직여 확대로 잠긴다
    const apart = new TouchGestures()
    apart.down(1, 150, 420, 0, true)
    apart.down(2, 250, 420, 0.8)
    apart.move(1, 120, 420)
    expect(apart.stick).toBeNull()
    apart.move(2, 263, 420)
    expect(apart.pinchCount).toBe(1)
    expect(apart.stick).toBeNull()
    apart.move(1, 100, 420)
    expect(apart.pinch).toBeCloseTo(163 / 143)
    // 함께 댄 두 손가락: 한쪽만 멀리 끌어도 조이스틱을 잡지 않고, 다른 쪽이 움직이면 확대로 잠긴다
    const together = new TouchGestures()
    together.down(1, 150, 420, 0, true)
    together.down(2, 250, 420, PINCH_JOIN_SECONDS - 0.1)
    together.move(2, 320, 420)
    expect(together.stick).toBeNull()
    expect(together.pinch).toBeNull()
    together.move(1, 137, 420)
    expect(together.pinch).toBeCloseTo(1)
    expect(together.stick).toBeNull()
  })

  it('서로 너무 가까운 두 접점(엄지 하나가 둘로 잡힘)의 흔들림은 확대가 아니다', () => {
    const g = new TouchGestures()
    g.down(1, 100, 400, 0, true)
    g.down(2, 114, 400, 0.01)
    for (const d of [3, 6, 3, 0]) {
      g.move(1, 100 - d, 400)
      g.move(2, 114 + d, 400)
      expect(g.pinch).toBeNull()
    }
    // 크게 벌어져도 처음 거리가 PINCH_MIN_SPREAD 아래면 손가락 하나로 본다
    expect(14).toBeLessThan(PINCH_MIN_SPREAD)
    g.move(1, 80, 400)
    g.move(2, 134, 400)
    expect(g.pinch).toBeNull()
    expect(g.pinchCount).toBe(0)
  })

  it('세 손가락에서 하나를 떼도 튀지 않는다: 손가락 수가 바뀌면 확대가 풀리고, 다시 잠길 때 그때의 거리부터 잰다', () => {
    const g = new TouchGestures()
    // 리뷰의 재현: 가까운 둘 + 먼 하나에서 첫 손가락을 떼면 남은 둘의 거리로 4배가 됐다
    g.down(1, 100, 400, 0, true)
    g.down(2, 150, 400, 0.01)
    g.down(3, 350, 400, 0.02)
    g.up(1, 0.5)
    expect(g.pinch).toBeNull()
    g.up(2, 0.6)
    g.up(3, 0.7)
    // 확대로 잠긴 채 셋째 손가락이 닿으면 풀린다
    g.down(1, 150, 420, 1, true)
    g.down(2, 250, 420, 1)
    g.move(1, 130, 420)
    g.move(2, 270, 420)
    expect(g.pinch).toBeCloseTo(1)
    g.move(2, 290, 420)
    expect(g.pinch).toBeCloseTo(160 / 140)
    g.down(3, 200, 700, 1.5)
    expect(g.pinch).toBeNull()
    g.up(3, 1.6)
    expect(g.pinch).toBeNull()
    // 확대를 한 몸짓이라 셋째 손가락은 톡이 아니다
    expect(g.takeTap()).toBeNull()
    // 다시 문턱을 넘으면 그때의 거리(130·290 → 110·310)부터 1배로 잰다
    g.move(1, 110, 420)
    expect(g.pinch).toBeNull()
    g.move(2, 310, 420)
    expect(g.pinchCount).toBe(2)
    expect(g.pinch).toBeCloseTo(1)
    g.move(2, 330, 420)
    expect(g.pinch).toBeCloseTo(220 / 200)
    // 하나를 떼면 끝난다
    g.up(1, 2)
    expect(g.pinch).toBeNull()
    g.up(2, 2.1)
  })

  it('한 손가락으로 빠르게 이어 톡하면 톡마다 그대로 톡이다 (확대·조이스틱이 아니다)', () => {
    const g = new TouchGestures()
    for (let i = 0; i < 8; i++) {
      const t = i * 0.08
      g.down(10 + i, 195 + (i % 3) * 4, 600 - (i % 2) * 5, t, true)
      g.move(10 + i, 196 + (i % 3) * 4, 601 - (i % 2) * 5)
      expect(g.pinch).toBeNull()
      g.up(10 + i, t + 0.05)
      expect(g.takeTap()).toEqual({ x: 196 + (i % 3) * 4, y: 601 - (i % 2) * 5 })
      expect(g.stick).toBeNull()
    }
    expect(g.pinchCount).toBe(0)
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

  it('멀리 끈 정도(stretch)는 손잡이를 자르기 전 손가락 거리로 재고, 원 반지름의 1.6배를 넘으면 탈것에 오른다. 떼면 0 (E241)', () => {
    const g = new TouchGestures()
    expect(g.stretch).toBe(0)
    g.down(1, 100, 300, 0, true)
    g.move(1, 100 + STICK_RADIUS, 300)
    expect(g.stretch).toBeCloseTo(1)
    // 손잡이는 원 가장자리에 머물러도 손가락 거리는 그대로 잰다
    g.move(1, 100 + STICK_RADIUS * 1.5, 300)
    expect(Math.hypot(g.stick!.dx, g.stick!.dy)).toBeCloseTo(STICK_RADIUS)
    expect(g.stretch).toBeCloseTo(1.5)
    expect(g.stretch > MOUNT.stickFar).toBe(false)
    g.move(1, 100, 300 + STICK_RADIUS * 1.7)
    expect(g.stretch > MOUNT.stickFar).toBe(true)
    expect(MOUNT.stickFar).toBe(1.6)
    g.up(1, 1)
    expect(g.stretch).toBe(0)
  })

  it('쉬게 한 조이스틱은 쥔 엄지를 조금만 움직이면 다시 걷는다: 엄지가 원 가장자리 밖에 있어 손잡이가 제자리여도 (E307 손 QA)', () => {
    const g = new TouchGestures()
    // 손 QA의 그 손짓: (110,520)에서 (80,560)까지 끌어 쥔다 (50px, 원 가장자리 48px 밖)
    g.down(1, 110, 520, 0, true)
    g.move(1, 80, 560)
    expect(g.stretch).toBeGreaterThan(1)
    expect(g.parked).toBe(false)
    // 다른 손가락으로 적을 톡해 지시를 내렸다: 조이스틱은 쥔 채 쉰다
    g.down(2, 325, 270, 1)
    g.up(2, 1.1)
    expect(g.takeTap()).toEqual({ x: 325, y: 270 })
    g.park()
    expect(g.parked).toBe(true)
    expect(g.stick).not.toBeNull()
    const knob = { ...g.stick! }
    // 엄지의 떨림(문턱 안)에는 풀리지 않는다
    g.move(1, 76, 565)
    expect(Math.hypot(76 - 80, 565 - 560)).toBeLessThan(STICK_RESUME)
    expect(g.parked).toBe(true)
    // 같은 방향으로 더 민다 (45,605까지 가는 길의 첫 걸음): 손잡이는 원 가장자리에서 1px도 움직이지 않지만 엄지는 문턱을 넘었다
    g.move(1, 72, 571)
    expect(Math.hypot(g.stick!.dx - knob.dx, g.stick!.dy - knob.dy)).toBeLessThan(1)
    expect(Math.hypot(72 - 80, 571 - 560)).toBeGreaterThan(STICK_RESUME)
    expect(g.parked).toBe(false)
  })

  it('쉬는 조이스틱은 쥐고 있는 동안만 쉰다: 놓거나 손가락을 잊으면 풀리고, 쥐지 않았으면 쉬게 할 것이 없다. 읽는 쪽이 풀 수도 있다 (지시를 마침)', () => {
    const g = new TouchGestures()
    g.park()
    expect(g.parked).toBe(false)
    g.down(1, 100, 300, 0, true)
    g.move(1, 130, 300)
    g.park()
    expect(g.parked).toBe(true)
    g.unpark()
    expect(g.parked).toBe(false)
    g.park()
    g.up(1, 1)
    expect(g.parked).toBe(false)
    // 다시 쥔 조이스틱은 쉬지 않는다
    g.down(1, 100, 300, 2, true)
    g.move(1, 130, 300)
    expect(g.parked).toBe(false)
    g.park()
    g.reset()
    expect(g.parked).toBe(false)
  })
})

describe('게임 화면을 덮는 창과 조이스틱 (E307)', () => {
  /** `hidden`이 바뀐 요소 흉내: 클래스들(className 그대로)과 지금 숨었는지 */
  const el = (className: string, hidden: boolean) => ({
    hidden,
    // 쉼표로 나열한 「.클래스:not([hidden])」 가운데 하나에 맞나
    matches: (selector: string) => !hidden && selector.split(',').some((part) => className.split(' ').some((cls) => part.trim() === `.${cls}:not([hidden])`)),
  })
  /** 숨어 있다가 보이게 됐다 (바뀌기 전 hidden 속성이 있었다) */
  const shown = (className: string) => ({ target: el(className, false), oldValue: '' })
  /** 창을 만드는 코드가 뿌리 요소(root, 정보 화면은 window)에 주는 className */
  const rootClass = (source: string) => source.match(/this\.(?:root|window)(?:\.className = | = el\('div', )'([^']+)'/)?.[1] ?? ''

  it('대화 장면·정보 화면·일시 정지 창·두 갈래 카드·맹세 출발 카드가 뜨는 순간 쥐던 조이스틱을 놓는다', () => {
    for (const source of [dialogSource, menuSource, pauseSource, swapSource, oathSource]) expect(coverOpened([shown(rootClass(source))]), rootClass(source)).toBe(true)
    // 다른 요소의 hidden이 함께 바뀌어도 (조이스틱 원 자신, HUD 말풍선) 덮개 하나면 놓는다
    expect(coverOpened([shown('stick'), shown('hud__tip'), shown('menu')])).toBe(true)
  })

  it('귀환 카드는 놓지 않는다: 화로에 들어서면 저절로 뜨는 카드라, 조이스틱으로 화로를 지나가는 걸음이 서지 않는다 (걸어 나가면 닫힌다)', () => {
    expect(rootClass(returnSource)).toBe('pick-card return-card')
    expect(coverOpened([shown(rootClass(returnSource))])).toBe(false)
    // 맹세 출발 카드는 같은 틀(pick-card return-card)에 제 클래스를 더 달아 가려낸다: 걸어 나가면 「맹세 없이」로 닫히니 쥔 채로 뜨면 놓는다
    expect(rootClass(oathSource)).toBe('pick-card return-card oath-card')
    expect(COVER_CLASSES.passing).toEqual(['oath-card'])
  })

  it('덮개가 아닌 것이 뜨거나, 덮개가 닫히거나, 이미 떠 있는 덮개에 hidden = false를 또 넣은 것은 뜬 것이 아니다', () => {
    expect(coverOpened([])).toBe(false)
    // 조이스틱 원·HUD 말풍선·정보 화면 안의 힌트는 게임 화면을 덮는 창이 아니다
    for (const cls of ['stick', 'hud__tip', 'menu-hint', 'menu__tab']) expect(coverOpened([shown(cls)]), cls).toBe(false)
    // 닫혔다 (지금 숨어 있다)
    expect(coverOpened([{ target: el('menu', true), oldValue: null }])).toBe(false)
    // 떠 있는 맹세 출발 카드를 다시 그렸다 (전에도 보이고 있었다): 그 뒤에 새로 쥔 조이스틱을 놓치지 않는다
    expect(coverOpened([{ target: el('pick-card return-card oath-card', false), oldValue: null }])).toBe(false)
  })

  it('덮개의 클래스는 그 창을 만드는 코드의 뿌리 클래스이고, 창은 hidden으로 여닫는다 (이름이 바뀌면 여기서 걸린다)', () => {
    const roots: Record<string, string> = { dialog: dialogSource, menu: menuSource, pause: pauseSource, 'swap-card': swapSource, 'oath-card': oathSource }
    expect(Object.keys(roots).sort()).toEqual([...COVER_CLASSES.pausing, ...COVER_CLASSES.passing].sort())
    for (const [cls, source] of Object.entries(roots)) {
      expect(rootClass(source).split(' '), `.${cls}`).toContain(cls)
      expect(source, `.${cls}: hidden`).toMatch(/\.hidden = /)
    }
    expect(returnSource).toMatch(/\.hidden = /)
  })
})

describe('다른 손가락이 닿아 있는 동안 누른 단추 (E307 손 QA)', () => {
  // 크로미움의 진짜 두 손가락으로 본 것: 닿아 있는 동안 다른 손가락이 한 번이라도 함께 닿았으면 그 손가락의 톡에는 click이 오지 않는다
  it('혼자 눌렀다 뗀 손가락은 브라우저가 click을 낸다: 대신 내지 않는다', () => {
    const p = new FingerPresses<string>()
    p.down(1, 'menu', 355, 38, 0, true)
    expect(p.up(1, 356, 39, 0.1)).toBeNull()
  })

  it('조이스틱을 쥔 채(또는 엄지를 얹은 채) 다른 손가락으로 누른 단추는 대신 누른다', () => {
    const p = new FingerPresses<string>()
    p.down(1, 'canvas', 110, 640, 0, true)
    let t = 3
    for (const [target, x, y] of [['menu', 355, 38], ['portrait', 40, 42], ['minimap', 313, 140]] as const) {
      p.down(2, target, x, y, t)
      expect(p.up(2, x + 2, y - 1, t + 0.07)).toBe(target)
      t += 1
    }
    // 꾹 누른 손가락(0.5초쯤)도 누른 것이다
    p.down(2, 'menu', 355, 38, 10)
    expect(p.up(2, 355, 38, 10.5)).toBe('menu')
    // 엄지를 떼고 혼자 누르면 다시 브라우저의 몫이다
    p.up(1, 110, 640, 12)
    p.down(3, 'menu', 355, 38, 13, true)
    expect(p.up(3, 355, 38, 13.1)).toBeNull()
  })

  it('먼저 닿은 손가락도 같다: 단추를 누르고 있는 사이 다른 손가락이 닿았다 떨어졌으면 브라우저는 click을 내지 않는다', () => {
    const p = new FingerPresses<string>()
    p.down(1, 'close', 363, 32, 0, true)
    p.down(2, 'canvas', 200, 500, 0.1)
    expect(p.up(2, 200, 500, 0.2)).toBe('canvas')
    expect(p.up(1, 363, 32, 0.3)).toBe('close')
    // 얹어 둔 손가락을 먼저 떼어도, 함께 닿았던 손가락의 톡에는 click이 오지 않는다
    p.down(1, 'canvas', 120, 700, 5, true)
    p.down(2, 'close', 363, 32, 8)
    p.up(1, 120, 700, 8.05)
    expect(p.up(2, 363, 32, 8.1)).toBe('close')
  })

  it('오래 얹혀 있던 손가락(쥔 손, 쉬는 엄지)은 떼어도 누른 것이 아니다: 그 아래 단추가 눌리지 않는다', () => {
    const p = new FingerPresses<string>()
    // 정보 화면의 가방 칸 위에 엄지를 얹어 둔 채 다른 손가락으로 탭을 누르고, 나중에 엄지를 뗀다
    p.down(1, 'bag-item', 120, 700, 0, true)
    p.down(2, 'tab', 148, 78, 2)
    expect(p.up(2, 148, 78, 2.1)).toBe('tab')
    expect(p.up(1, 120, 700, 4)).toBeNull()
    // 문턱은 게임 화면의 톡과 같다
    expect(PRESS_SECONDS).toBe(TAP_SECONDS)
    p.down(1, 'canvas', 110, 640, 10, true)
    p.down(2, 'menu', 355, 38, 11)
    expect(p.up(2, 355, 38, 11 + PRESS_SECONDS + 0.05)).toBeNull()
  })

  it('누른 자리에서 끌려 나간 손가락, 브라우저가 가져간 손가락은 누른 것이 아니다', () => {
    const p = new FingerPresses<string>()
    p.down(1, 'canvas', 110, 640, 0, true)
    p.down(2, 'tab', 200, 80, 1)
    expect(p.up(2, 200 + PRESS_SLOP + 1, 80, 1.1)).toBeNull()
    p.down(3, 'tab', 200, 80, 2)
    p.cancel(3)
    expect(p.up(3, 200, 80, 2.1)).toBeNull()
    // 모르는 손가락(닿는 것을 못 본)도 아니다
    expect(p.up(9, 200, 80, 2.2)).toBeNull()
  })

  it('단추 하나를 두 접점이 함께 눌렀으면(두 손가락, 둘로 잡힌 엄지) 한 번만 눌린다: 열렸다 바로 닫히지 않는다', () => {
    const p = new FingerPresses<string>()
    p.down(1, 'menu', 350, 36, 0, true)
    p.down(2, 'menu', 362, 40, 0.01)
    expect(p.up(1, 350, 36, 0.1)).toBe('menu')
    expect(p.up(2, 362, 40, 0.11)).toBeNull()
    // 멀리 떨어진 다른 단추를 함께 누른 것은 저마다 눌린다
    p.down(1, 'portrait', 40, 42, 1, true)
    p.down(2, 'menu', 355, 38, 1.05)
    expect(p.up(1, 40, 42, 1.2)).toBe('portrait')
    expect(p.up(2, 355, 38, 1.25)).toBe('menu')
    // 이어 누른 두 톡(겹치지 않음)은 둘 다 눌린다: 「한 번 더 누르면」
    p.down(1, 'canvas', 110, 640, 2, true)
    p.down(2, 'home', 250, 32, 3)
    expect(p.up(2, 250, 32, 3.1)).toBe('home')
    p.down(3, 'home', 250, 32, 3.3)
    expect(p.up(3, 250, 32, 3.4)).toBe('home')
  })

  it('뗀 것을 놓친 손가락은 처음 대는 손가락(isPrimary)·창이 가려질 때 잊는다: 그 뒤의 혼자 누른 톡을 대신 누르지 않는다', () => {
    const p = new FingerPresses<string>()
    p.down(1, 'canvas', 110, 640, 0, true)
    // 1번의 뗌을 놓쳤다. 다음 손가락은 브라우저가 처음 대는 손가락이라고 알려 준다
    p.down(2, 'menu', 355, 38, 5, true)
    expect(p.up(2, 355, 38, 5.1)).toBeNull()
    p.down(3, 'canvas', 110, 640, 6, true)
    p.reset()
    p.down(4, 'menu', 355, 38, 7)
    expect(p.up(4, 355, 38, 7.1)).toBeNull()
  })

  it('대신 낸 click 바로 뒤에 같은 자리로 온 브라우저의 click은 같은 톡이다: 한 번만 버린다 (두 번 눌려 열렸다 닫히지 않게)', () => {
    const p = new FingerPresses<string>()
    expect(p.echo(355, 38, 0)).toBe(false)
    p.made(2, 355, 38, 10)
    expect(p.echo(355 + ECHO_PX + 1, 38, 10.05)).toBe(false)
    // 다른 손가락이 낸 click은 같은 톡이 아니다
    expect(p.echo(355, 38, 10.05, 7)).toBe(false)
    expect(p.echo(358, 40, 10.05, 2)).toBe(true)
    expect(p.echo(358, 40, 10.06, 2)).toBe(false)
    // 포인터를 알려 주지 않는 브라우저는 때와 자리로만 본다. 늦게 온 것은 새 톡이다
    p.made(3, 100, 100, 20)
    expect(p.echo(100, 100, 20 + ECHO_SECONDS + 0.01)).toBe(false)
    expect(p.echo(100, 100, 20.1)).toBe(true)
  })

  it('시작할 때 창에 한 번 건다 (게임 화면·정보 화면·고르는 카드·처음 화면의 단추가 모두 click을 듣는다)', () => {
    expect(mainSource).toMatch(/^listenFingerClicks\(\)$/m)
  })
})

describe('아래 묶음 위의 톡 (E307 손 QA)', () => {
  const dock = { left: 63, top: 765, right: 331, bottom: 833 }
  const ult = { left: 272, top: 779, right: 332, bottom: 839 }

  it('유물 칸·생명 막대·궁극기와 그 사이 틈의 톡은 땅으로 가는 지시가 아니다', () => {
    // 손 QA가 누른 자리 (393×852): 스킬 칸, 궁극기, 생명 막대
    for (const [x, y] of [[88, 809], [302, 809], [200, 770]] as const) expect(inBoxes(x, y, [dock, ult]), `${x},${y}`).toBe(true)
    // 칸과 칸 사이, 궁극기가 상자 밖으로 나온 아래쪽
    expect(inBoxes(113, 800, [dock, ult])).toBe(true)
    expect(inBoxes(302, 837, [dock, ult])).toBe(true)
    // 묶음 옆과 위의 땅은 그대로 톡이다
    expect(inBoxes(30, 809, [dock, ult])).toBe(false)
    expect(inBoxes(200, 740, [dock, ult])).toBe(false)
  })

  it('숨은 조각(빈 사각형)은 아무 톡도 막지 않는다', () => {
    expect(inBoxes(0, 0, [{ left: 0, top: 0, right: 0, bottom: 0 }])).toBe(false)
  })

  it('휴대폰에서 누름을 흘려보내는 HUD 조각은 모두 톡을 삼키는 목록 안에 있다 (조각을 더하면 함께 더한다)', () => {
    const rule = hudCss.match(/((?:\.is-touch [^,{]+,?\s*)+)\{\s*pointer-events: none;\s*\}/)
    const passing = rule![1]!.split(',').map((sel) => sel.trim().replace(/^\.is-touch (?:button)?/, ''))
    expect(passing).toEqual(['.hud__slot', '.hud__life', '.hud__ult', '.hud__essence'])
    // 생명 막대와 유물 칸은 아래 묶음 상자(`hud__dock`) 안에 짓는다
    expect(hudSource).toMatch(/this\.bar\('[^']*hud__life', dock\)/)
    expect(hudSource).toMatch(/const slots = this\.el\('div', 'hud__slots', dock\)/)
    expect(hudSource).toMatch(/this\.el\('button', 'hud__slot[^']*', slots\)/)
    expect([...TAP_DEAD]).toEqual(['.hud__dock', '.hud__ult', '.hud__essence'])
  })
})

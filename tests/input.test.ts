import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import indexHtml from '../index.html?raw'
import mainSource from '../src/main.ts?raw'
import type { GameContext } from '../src/game/context'
import { DialogScene, type SceneHost, SETTLE_SECONDS } from '../src/game/DialogScene'
import { HeroController } from '../src/game/HeroController'
import { HeroOrders } from '../src/game/HeroOrders'
import { type CombatTarget, PlayerCombat } from '../src/game/PlayerCombat'
import { PlayerInput } from '../src/game/systems/PlayerInput'
import { DEFAULT_BINDINGS, mouseCode, resolveAction } from '../src/input/bindings'
import { chordChange, type Input } from '../src/input/Input'
import { STICK_DEAD, TouchGestures } from '../src/input/touch'
import type { TouchControls } from '../src/input/TouchControls'
import { worldToScreen } from '../src/render/picking'
import type { PixelRenderer } from '../src/render/PixelRenderer'
import { QuarterViewCamera } from '../src/render/QuarterViewCamera'
import { computeRenderSize } from '../src/render/resolution'
import { VIEW_HEIGHT } from '../src/save/settings'
import { buildHeroModel } from '../src/world/heroModel'
import { NavGrid } from '../src/world/navGrid'

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

/** 393×852 세로 화면의 PlayerInput: 진짜 몸짓 판정·지시·카메라에, 캔버스·TouchControls의 DOM만 흉내 낸다 */
function phone(enemies: CombatTarget[] = []) {
  const hero = new HeroController(buildHeroModel(), new NavGrid(30, 0.5, [], 0.4), () => [], 30)
  const combat = new PlayerCombat(hero)
  const orders = new HeroOrders(hero, combat)
  const view = new QuarterViewCamera()
  const size = computeRenderSize(393, 852)
  view.viewHeight = VIEW_HEIGHT.initial
  view.setRenderSize(size.width, size.height)
  view.jumpTo(hero.object.position)
  const gestures = new TouchGestures()
  // TouchControls는 DOM을 만들어 여기서는 같은 읽기만 흉내 낸다 (direction·holding·far·takeTap)
  const touch = {
    gestures,
    get direction() {
      const stick = gestures.stick
      return !stick || Math.hypot(stick.dx, stick.dy) < STICK_DEAD ? null : { dx: stick.dx, dy: stick.dy }
    },
    get holding() {
      return gestures.stick !== null
    },
    far: false,
    takeTap: () => gestures.takeTap(),
  } as unknown as TouchControls
  // 마우스: pressed는 그 프레임에 막 눌렀나(프레임 끝에 지워진다), down은 지금 누르고 있나
  const mouse = { pressed: false, down: false }
  const pointer = { x: 0, y: 0, inside: false }
  const input = { pointer, wasPressed: () => mouse.pressed, isDown: () => mouse.down, frameEnd: [] as (() => void)[] }
  const ctx = { orders, hero, view, encounter: { alive: enemies } } as unknown as GameContext
  const container = { clientHeight: 852, getBoundingClientRect: () => ({ left: 0, top: 0 }) } as unknown as HTMLElement
  const player = new PlayerInput(ctx, input as unknown as Input, { size } as unknown as PixelRenderer, container)
  player.useTouch(touch)
  const zooms: [number, boolean][] = []
  player.onZoom = (viewHeight, end) => {
    zooms.push([viewHeight, end])
    // Viewport.zoom처럼 시야를 바꾼다
    if (viewHeight !== view.viewHeight) view.setViewHeight(viewHeight)
  }
  /** 프레임 끝 (Input.endFrame): 막 누른 것을 지우고, 읽지 않은 톡을 버린다. 장면 중에는 입력을 읽지 않고 이것만 돈다 */
  const endFrame = () => {
    mouse.pressed = false
    for (const end of input.frameEnd) end()
  }
  /** 게임 한 프레임: 입력 → 지시 → 걷기 → 프레임 끝 */
  const frame = (n = 1) => {
    for (let i = 0; i < n; i++) {
      player.update()
      orders.update(enemies)
      hero.update(1 / 60)
      endFrame()
    }
  }
  /** 마우스 버튼을 누른다 (그 자리에서). 떼는 것은 release */
  const press = (x: number, y: number) => {
    Object.assign(pointer, { x, y, inside: true })
    mouse.pressed = true
    mouse.down = true
  }
  const release = () => (mouse.down = false)
  /** 땅 위 한 점의 화면 자리 */
  const screen = (x: number, z: number, y = 0) => worldToScreen(new THREE.Vector3(x, y, z), 852, size, view.camera, view.subpixel)
  return { hero, orders, view, gestures, player, zooms, frame, endFrame, screen, pointer, press, release }
}

/** 서 있는 적 하나 (쓰러뜨려 볼 수 있게 alive를 바꿀 수 있다) */
function foe(x: number, z: number): { -readonly [K in keyof CombatTarget]: CombatTarget[K] } {
  return { x, z, radius: 0.75, alive: true, takeHit: (damage) => damage }
}

describe('휴대폰: 조이스틱·톡·두 손가락이 지시가 되는 규칙 (E307)', () => {
  it('조이스틱을 쥔 채 다른 손가락으로 적을 톡하면 공격 지시가 되고, 시야는 그대로다. 손잡이를 다시 움직이면 조이스틱이 이어받는다', () => {
    const enemy = foe(4, -6)
    const { hero, orders, view, gestures, zooms, frame, screen } = phone([enemy])
    gestures.down(1, 100, 700, 0, true)
    gestures.move(1, 140, 700)
    frame(3)
    expect(orders.order?.kind).toBe('move')
    expect(hero.isMoving).toBe(true)
    expect(hero.holding).toBe(true)
    // 둘째 손가락으로 적의 몸통을 톡 (걷는 엄지는 그동안 조금 흔들린다)
    const at = screen(enemy.x, enemy.z, 1.2)
    gestures.down(2, at.x, at.y, 1)
    gestures.move(1, 142, 698)
    gestures.up(2, 1.1)
    frame()
    expect(orders.attackTarget).toBe(enemy)
    expect(gestures.stick).not.toBeNull()
    // 쥐고만 있으면 공격 지시가 이어진다 (조이스틱이 곧바로 덮어쓰지 않는다)
    frame(30)
    expect(orders.attackTarget).toBe(enemy)
    expect(hero.holding).toBe(false)
    expect(view.viewHeight).toBe(VIEW_HEIGHT.initial)
    expect(zooms).toEqual([])
    // 손잡이를 다시 움직이면 걷기가 이어받는다 (손을 떼었다 다시 쥘 필요가 없다)
    gestures.move(1, 100, 660)
    frame(10)
    expect(orders.order?.kind).toBe('move')
    expect(orders.attackTarget).toBeNull()
    expect(hero.holding).toBe(true)
  })

  it('쥔 채 톡으로 내린 지시를 마치면(적이 쓰러짐) 손잡이를 움직이지 않아도 조이스틱이 이어받는다', () => {
    const enemy = foe(3, -3)
    const { hero, orders, gestures, frame, screen } = phone([enemy])
    gestures.down(1, 100, 700, 0, true)
    gestures.move(1, 60, 700)
    frame(3)
    const at = screen(enemy.x, enemy.z, 1.2)
    gestures.down(2, at.x, at.y, 1)
    gestures.up(2, 1.1)
    frame(5)
    expect(orders.attackTarget).toBe(enemy)
    enemy.alive = false
    frame(20)
    expect(orders.order?.kind).toBe('move')
    expect(hero.isMoving).toBe(true)
  })

  it('손가락 하나를 대고 쉬는 채 다른 손가락으로 끌어도 걷는다 (화면이 죽지 않는다). 시야는 그대로다', () => {
    const { hero, orders, view, gestures, zooms, frame } = phone()
    // 휴대폰을 쥔 손이나 길게 누른 엄지가 화면에 닿아 있다
    gestures.down(1, 300, 300, 0, true)
    frame(40)
    gestures.down(2, 100, 650, 0.7)
    for (let y = 640; y >= 450; y -= 10) {
      gestures.move(2, 100, y)
      frame()
    }
    expect(orders.order?.kind).toBe('move')
    expect(hero.isMoving).toBe(true)
    expect(view.viewHeight).toBe(VIEW_HEIGHT.initial)
    expect(zooms).toEqual([])
    // 쉬던 손가락을 떼도 톡이 아니라 걷기가 이어지고, 끌던 손가락을 떼면 멈춘다
    gestures.up(1, 2)
    frame(3)
    expect(hero.isMoving).toBe(true)
    gestures.up(2, 3)
    frame(2)
    expect(hero.isMoving).toBe(false)
  })

  it('두 손가락이 닿기만 한 톡은 시야를 바꾸지도 저장하지도 않는다. 확대로 잠긴 몸짓이 시야를 바꿨을 때만 떼는 순간 한 번 저장한다', () => {
    const { view, gestures, zooms, frame, orders } = phone()
    // 겹쳐 누른 두 엄지 (리뷰의 재현: 4~5px 흔들림)
    for (let i = 0; i < 7; i++) {
      gestures.down(1, 110, 640, i, true)
      gestures.down(2, 280, 600, i + 0.02)
      gestures.move(1, 106, 642)
      gestures.move(2, 285, 598)
      frame()
      gestures.up(1, i + 0.1)
      frame()
      gestures.up(2, i + 0.15)
      frame()
    }
    expect(view.viewHeight).toBe(VIEW_HEIGHT.initial)
    expect(zooms).toEqual([])
    // 톡은 지시가 됐다 (땅 톡 → 이동)
    expect(orders.order?.kind).toBe('move')
    // 일부러 벌린다: 잠긴 뒤로 벌린 만큼 가까워지고, 떼면 그 값을 한 번 저장한다
    gestures.down(1, 150, 420, 10, true)
    gestures.down(2, 250, 420, 10)
    gestures.move(1, 130, 420)
    gestures.move(2, 270, 420)
    frame()
    expect(zooms).toEqual([])
    gestures.move(1, 95, 420)
    gestures.move(2, 305, 420)
    frame()
    expect(view.viewHeight).toBeCloseTo((VIEW_HEIGHT.initial * 140) / 210)
    gestures.up(2, 11)
    frame()
    gestures.up(1, 11.1)
    frame()
    expect(zooms.filter(([, end]) => end)).toEqual([[view.viewHeight, true]])
    expect(view.viewHeight).toBeLessThan(VIEW_HEIGHT.initial - 5)
    // 오므리면 다시 멀어진다
    const before = view.viewHeight
    gestures.down(1, 95, 420, 12, true)
    gestures.down(2, 305, 420, 12)
    gestures.move(1, 130, 420)
    gestures.move(2, 270, 420)
    gestures.move(1, 150, 420)
    gestures.move(2, 250, 420)
    frame()
    expect(view.viewHeight).toBeCloseTo((before * 140) / 100)
  })

  it('확대하던 중 손가락 수가 바뀌어도 시야가 튀지 않는다: 다시 잠긴 때의 시야부터 잰다', () => {
    const { view, gestures, frame } = phone()
    gestures.down(1, 150, 420, 0, true)
    gestures.down(2, 250, 420, 0)
    gestures.move(1, 130, 420)
    gestures.move(2, 270, 420)
    gestures.move(2, 300, 420)
    frame()
    const zoomed = view.viewHeight
    expect(zoomed).toBeCloseTo((VIEW_HEIGHT.initial * 140) / 170)
    // 셋째 손가락이 닿았다 떨어지고, 프레임이 돌기 전에 남은 둘이 다시 문턱을 넘는다 (130·300 → 110·325)
    gestures.down(3, 200, 700, 1)
    gestures.up(3, 1.1)
    gestures.move(1, 110, 420)
    gestures.move(2, 325, 420)
    frame()
    expect(view.viewHeight).toBe(zoomed)
    gestures.move(2, 345, 420)
    frame()
    expect(view.viewHeight).toBeCloseTo((zoomed * 215) / 235)
  })

  it('대화가 막 끝난 동안(muted)의 톡·클릭은 지시가 되지 않고, 조이스틱은 그대로 걷는다', () => {
    const { hero, orders, gestures, player, frame, press, release } = phone()
    let muted = true
    player.muted = () => muted
    gestures.down(1, 200, 300, 0, true)
    gestures.up(1, 0.05)
    frame()
    expect(orders.order).toBeNull()
    // 그 톡은 버려진다 (가라앉은 뒤에 지시가 되지 않는다)
    muted = false
    frame()
    expect(orders.order).toBeNull()
    muted = true
    gestures.down(2, 100, 700, 1, true)
    gestures.move(2, 100, 660)
    frame(2)
    expect(orders.order?.kind).toBe('move')
    expect(hero.isMoving).toBe(true)
    gestures.up(2, 2)
    frame(2)
    expect(hero.isMoving).toBe(false)
    // 컴퓨터의 클릭도 같다: 가라앉는 동안 누르고 뗀 클릭은 버려지고(가라앉은 뒤에 지시가 되지 않는다), 그 뒤의 클릭은 지시다
    press(200, 300)
    frame()
    release()
    frame()
    expect(orders.order).toBeNull()
    muted = false
    frame(2)
    expect(orders.order).toBeNull()
    press(200, 300)
    release()
    frame()
    expect(orders.order?.kind).toBe('move')
  })
})

describe('컴퓨터: 지시로 치지 못한 누름을 누른 채 있을 때 (E307)', () => {
  it('가라앉는 동안 누른 마우스를 누른 채 있으면, 가라앉는 프레임에 누른 것으로 쳐 그 뒤로 커서를 따라 걷는다 (뗐다 다시 누르지 않아도)', () => {
    const { hero, orders, player, frame, pointer, press, release, screen } = phone()
    let muted = true
    player.muted = () => muted
    press(300, 300)
    frame(5)
    expect(orders.order).toBeNull()
    expect(hero.isMoving).toBe(false)
    muted = false
    frame()
    expect(orders.order?.kind).toBe('move')
    expect(hero.isMoving).toBe(true)
    const first = { ...orders.destination! }
    // 누른 채 커서를 옮기면 따라간다 (길을 다시 찾는 간격 뒤)
    const there = screen(-4, 3)
    Object.assign(pointer, there)
    frame(20)
    expect(orders.destination!.x).toBeCloseTo(-4, 0)
    expect(orders.destination!.z).toBeCloseTo(3, 0)
    expect(orders.destination).not.toEqual(first)
    // 떼면 그 자리까지 걷고, 누름은 한 번만 쳤다 (가만히 누르고 있다고 프레임마다 다시 누르지 않는다)
    release()
    frame()
    expect(orders.order?.kind).toBe('move')
  })

  it('장면이 닫히는 중(입력을 읽지 않는 프레임)에 누른 마우스도 같다: 장면 앞에 누르고 있던 것과 섞이지 않는다', () => {
    const enemy = foe(4, -6)
    const { hero, orders, endFrame, frame, press, release, screen } = phone([enemy])
    // 누른 채 걷다가 장면이 열렸다 (지시가 지워지고, 장면 동안은 프레임 끝만 돈다)
    press(300, 300)
    frame(3)
    expect(hero.isMoving).toBe(true)
    orders.clear()
    hero.stop()
    endFrame()
    // 대화를 넘기느라 뗐다가, 줌아웃하는 동안 적을 다시 누르고 있다 (그 누름은 프레임 끝에 지워져 게임이 보지 못했다)
    release()
    endFrame()
    const at = screen(enemy.x, enemy.z, 1.2)
    press(at.x, at.y)
    endFrame()
    endFrame()
    expect(orders.order).toBeNull()
    // 장면이 끝난 첫 프레임에 누른 것으로 친다 (적이면 공격 지시)
    frame()
    expect(orders.attackTarget).toBe(enemy)
    // 장면 내내 떼지 않고 누르고 있던 버튼은 다시 누른 것으로 치지 않는다 (지금처럼 뗐다 눌러야 한다)
    const kept = phone()
    kept.press(300, 300)
    kept.frame(3)
    kept.orders.clear()
    kept.hero.stop()
    kept.endFrame()
    kept.endFrame()
    kept.frame(3)
    expect(kept.orders.order).toBeNull()
  })
})

describe('대화 장면이 끝난 뒤 (E307)', () => {
  it('줌아웃이 끝나면 SETTLE_SECONDS 동안 가라앉는다 (그동안의 톡·클릭은 지시가 아니다)', () => {
    const box = { onAdvance: () => {}, onSkip: () => {}, open: () => {}, close: () => {}, say: () => {}, update: () => {} }
    const hero = { object: { position: new THREE.Vector3() }, stop: () => {}, face: () => {} }
    let hidden = false
    const scenes = new DialogScene({
      hero,
      villagers: { find: () => null, lookAt: () => {} },
      box,
      setHudHidden: (h: boolean) => (hidden = h),
      viewHeight: () => 19,
      setViewHeight: () => {},
      clearOrders: () => {},
      onSeen: () => {},
      seen: new Set<string>(),
    } as unknown as SceneHost)
    expect(scenes.settling).toBe(false)
    expect(scenes.play('opening')).toBe(true)
    scenes.update(1)
    expect(scenes.settling).toBe(false)
    // 건너뛰기: 상자가 닫히고 줌아웃(0.6초) 동안은 아직 대화 중이다
    box.onSkip()
    scenes.update(0.3)
    expect(scenes.active).toBe(true)
    expect(scenes.settling).toBe(false)
    scenes.update(0.4)
    expect(scenes.active).toBe(false)
    expect(hidden).toBe(false)
    expect(scenes.settling).toBe(true)
    expect(SETTLE_SECONDS).toBeGreaterThanOrEqual(0.4)
    expect(SETTLE_SECONDS).toBeLessThanOrEqual(0.6)
    scenes.update(SETTLE_SECONDS - 0.1)
    expect(scenes.settling).toBe(true)
    scenes.update(0.2)
    expect(scenes.settling).toBe(false)
  })
})

describe('페이지 확대와 글자 선택 막기 (E307)', () => {
  it('두 번 눌러 확대는 모든 요소의 touch-action: manipulation이 막는다 (캔버스는 none). 이어 누른 단추의 click을 지우던 touchend 가드는 없다', () => {
    expect(indexHtml).toMatch(/\*\s*\{\s*touch-action:\s*manipulation;\s*\}/)
    expect(indexHtml).toMatch(/#app canvas\s*\{\s*touch-action:\s*none;\s*\}/)
    // 길게 눌러도 글자 선택·돋보기·링크 메뉴가 뜨지 않게 body에서 물려준다 (사파리는 -webkit- 접두사)
    expect(indexHtml).toMatch(/body\s*\{[^}]*-webkit-user-select:\s*none;[^}]*-webkit-touch-callout:\s*none;/)
    // 창·HUD 위의 두 손가락 확대는 사파리 몸짓 사건을 막아 막는다
    expect(mainSource).toMatch(/'gesturestart'/)
    expect(mainSource).not.toMatch(/addEventListener\(\s*'touchend'/)
  })
})

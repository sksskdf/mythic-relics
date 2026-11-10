import * as THREE from 'three'

import type { Giant } from '../../enemies/Giant'
import type { Input } from '../../input/Input'
import type { TouchControls } from '../../input/TouchControls'
import { screenRay, screenToGround, worldToScreen } from '../../render/picking'
import type { PixelRenderer } from '../../render/PixelRenderer'
import { clampViewHeight, VIEW_HEIGHT } from '../../save/settings'
import type { Point2 } from '../../world/colliders'
import { MOUNT } from '../../data/mount'
import { heightAt, highestLand, rayToLand } from '../../world/terrain'
import type { GameContext } from '../context'

/** 조이스틱으로 걸을 때 주인공 앞 이만큼(m)을 목적지로 잡는다 (길을 다시 찾는 0.12초 동안 다 걷지 못할 만큼) */
const STICK_AHEAD = 2.5
/** 톡: 적 몸통에서 화면으로 이만큼(px) 안이면 그 적을 누른 것으로 본다 (손가락은 커서보다 굵다) */
const TAP_ENEMY_PX = 28
/** 두 손가락 확대·축소: 시야 높이가 이만큼(비율) 넘게 바뀔 때만 화면을 다시 맞춘다 (렌더 버퍼를 프레임마다 새로 만들지 않게) */
const ZOOM_STEP = 0.02
/** 조이스틱을 쥔 채 톡으로 지시를 내린 뒤: 손잡이를 이만큼(px) 움직이면 그 지시를 끝내기 전에도 조이스틱이 이어받는다 (E307) */
const STICK_RESUME = 10

/**
 * 클릭을 지시로 바꾼다. (DESIGN.md 8.2)
 * 땅 = 그곳까지 이동(싸우던 중이어도), 적 = 그 적을 쫓아가 자동 공격. 멈춰 서면 둘레 적을 자동 공격 (E12-08)
 * 휴대폰(E235): 톡 = 클릭, 끌기 = 떠다니는 조이스틱 쪽으로 걷기(떼면 멈춰 자동 공격), 두 손가락 = 확대·축소.
 * 조이스틱을 쥔 채 다른 손가락으로 톡하면 그 톡이 지시가 되고, 지시를 마치거나 손잡이를 다시 움직이면 조이스틱이 이어받는다 (E307).
 * 탈것(E241): 원 밖으로 멀리 끌면 올라타 달리고, 떼거나 가운데로 오면 멈춰 내린다
 */
export class PlayerInput {
  private readonly cursor = new THREE.Vector3()
  private readonly from = new THREE.Vector3()
  private readonly toward = new THREE.Vector3()
  /** 화면 광선 (프레임마다 새로 만들지 않게 하나를 다시 쓴다) */
  private readonly ray = new THREE.Ray()
  /** 조이스틱 방향을 재는 주인공 발 높이의 수평면 */
  private readonly stickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  /** 커서 아래의 몬스터 (이름표용, 프레임마다 갱신) */
  hovered: Giant | null = null
  /** 누른 땅 가까이 선 마을 사람 (E15-06). 그 사람에게 걸어가 말을 건다 */
  talkAt: (x: number, z: number) => string | null = () => null
  /** 말 걸 사람을 정했다 (null이면 그만둠) */
  onTalk: (name: string | null) => void = () => {}
  /** 화면 자리(px) 아래 땅에 떨어진 장비·유물의 자리. 누르면 그 위로 걸어가 줍는다 (떠 있는 모델을 눌러도 뒤쪽 땅으로 가지 않게) */
  pickupAt: (x: number, y: number) => Point2 | null = () => null
  /** 휴대폰 조작 (E235). 없으면 마우스만 */
  touch: TouchControls | null = null
  /** 두 손가락으로 시야 높이를 바꾼다. end면 손을 뗐다 (설정에 저장) */
  onZoom: (viewHeight: number, end: boolean) => void = () => {}
  /** 지금은 톡·클릭을 지시로 치지 않는다 (대화가 막 끝났다: 연타로 넘기던 톡이 새지 않게, E307). 조이스틱은 그대로 걷고, 누른 채 있는 마우스는 풀릴 때 받는다 (`heard`) */
  muted: () => boolean = () => false
  /**
   * 지금 누르고 있는 마우스 버튼의 누름을 지시로 쳤나 (E307). 못 쳤으면(대화가 막 끝난 동안이나 장면이 닫히는 중에 눌렀다)
   * 칠 수 있게 된 프레임에 아직 누르고 있을 때 그때 누른 것으로 친다: 누른 채 끌어 걸으려던 것이 뗐다 다시 누를 때까지 죽지 않게
   */
  private heard = false
  /** 두 손가락이 확대·축소로 잠긴 때의 시야 높이 */
  private pinchView: number | null = null
  /** 그 시야 높이를 잰 잠김 (`TouchGestures.pinchCount`). 달라졌으면 새로 잠긴 것이라 다시 잰다 */
  private pinchSeen = 0
  /** 이번 확대·축소가 시야를 바꿨나 (바꿨을 때만 손을 떼면 설정에 저장한다) */
  private zoomed = false
  /** 조이스틱으로 걷는 중 */
  private walking = false
  /** 조이스틱을 쥔 채 톡으로 지시를 내린 때의 손잡이 자리. 있는 동안 조이스틱은 쉰다 (E307) */
  private parked: { dx: number; dy: number } | null = null

  constructor(
    private readonly ctx: GameContext,
    private readonly input: Input,
    private readonly pixel: PixelRenderer,
    private readonly container: HTMLElement,
  ) {
    // 버튼을 뗐는지는 프레임마다 본다 (장면 중에는 update가 돌지 않아, 그사이 뗐다 다시 누른 것을 놓친다)
    input.frameEnd.push(() => {
      if (!input.isDown('move')) this.heard = false
    })
  }

  /** 휴대폰 조작을 붙인다 (E235). 그 프레임에 읽지 않은 톡은 프레임 끝에 버린다 */
  useTouch(touch: TouchControls): void {
    this.touch = touch
    this.input.frameEnd.push(() => touch.gestures.endFrame())
  }

  update(): void {
    const { orders } = this.ctx
    if (this.touch && this.updateTouch(this.touch)) return
    const cursor = this.cursorOnGround()
    const ground = cursor ? { x: cursor.x, z: cursor.z } : null
    this.hovered = this.enemyUnderCursor()
    const down = this.input.isDown('move')
    if ((this.input.wasPressed('move') || (down && !this.heard)) && !this.muted()) {
      const item = this.hovered ? null : this.pickupAt(this.input.pointer.x, this.input.pointer.y)
      this.onTalk(ground && !this.hovered && !item ? this.talkAt(ground.x, ground.z) : null)
      orders.press(item ?? ground, this.hovered)
      this.heard = true
    } else if (!down) orders.release()
    // 지시로 치지 못한 누름은 따라가지 않고 기다린다 (가라앉으면 위에서 누른 것으로 친다)
    else if (this.heard) orders.hold(ground)
  }

  /**
   * 손가락 조작 (E235). 손가락이 무엇을 하고 있으면 true (그 프레임은 마우스를 보지 않는다)
   * - 두 손가락: 확대·축소로 잠긴 뒤에만 (E307), 잠긴 때의 시야 높이 ÷ 그 뒤로 벌린 배율
   * - 톡: 클릭과 같다 (적이면 공격, 땅이면 그곳까지, 마을 사람이면 말 걸기). 조이스틱을 쥔 채 다른 손가락으로 눌러도 같다
   * - 조이스틱: 그쪽으로 걷는다. 손을 떼거나 가운데로 돌아오면 멈춰 서서 둘레 적을 친다
   */
  private updateTouch(touch: TouchControls): boolean {
    const { orders, hero, view } = this.ctx
    const gestures = touch.gestures
    const pinch = gestures.pinch
    if (pinch !== null) {
      // 새로 잠긴 몸짓이면 처음 시야를 다시 잰다 (손가락 수가 바뀌면 풀렸다가 다시 잠긴다: 남은 손가락의 거리로 튀지 않게)
      if (this.pinchView === null || this.pinchSeen !== gestures.pinchCount) {
        this.pinchView = view.viewHeight
        this.pinchSeen = gestures.pinchCount
      }
      // 한계 안 값으로 견준다 (한계 밖까지 벌린 채 쥐고 있어도 프레임마다 다시 맞추지 않게). 한계에는 딱 닿게 한다
      const next = clampViewHeight(this.pinchView / pinch)
      const edge = next === VIEW_HEIGHT.min || next === VIEW_HEIGHT.max
      if (next !== view.viewHeight && (edge || Math.abs(next - view.viewHeight) / view.viewHeight > ZOOM_STEP)) {
        this.onZoom(next, false)
        this.zoomed = true
      }
    } else if (this.pinchView !== null) {
      // 확대·축소로 잠긴 몸짓이 시야를 바꿨을 때만 설정에 저장한다
      if (this.zoomed) this.onZoom(view.viewHeight, true)
      this.pinchView = null
      this.zoomed = false
    }
    // 쥔 채 톡으로 지시를 내린 조이스틱은 그 지시를 마치거나(도착·처치) 손잡이를 다시 움직일 때까지 쉰다
    const stick = gestures.stick
    if (this.parked && (!stick || !orders.order || Math.hypot(stick.dx - this.parked.dx, stick.dy - this.parked.dy) > STICK_RESUME)) this.parked = null
    const direction = this.parked ? null : touch.direction
    // 조이스틱을 쥔 동안은 탄 채 길이 잠깐 비어도 내리지 않는다 (E241)
    hero.holding = direction !== null
    const tap = touch.takeTap()
    if (tap && !this.muted()) {
      const rect = this.container.getBoundingClientRect()
      const x = tap.x - rect.left
      const y = tap.y - rect.top
      this.hovered = this.enemyAt(x, y) ?? this.enemyNear(x, y, TAP_ENEMY_PX)
      const cursor = this.groundAt(x, y, this.cursor)
      const item = this.hovered ? null : this.pickupAt(x, y)
      const ground = item ?? (cursor ? { x: cursor.x, z: cursor.z } : null)
      this.onTalk(ground && !this.hovered && !item ? this.talkAt(ground.x, ground.z) : null)
      orders.press(ground, this.hovered)
      orders.release()
      this.walking = false
      // 마지막에 한 손짓이 이긴다: 조이스틱을 쥔 채 누른 톡이면 조이스틱을 쉬게 한다
      this.parked = stick ? { dx: stick.dx, dy: stick.dy } : null
      hero.holding = false
      return true
    }
    if (direction) {
      const target = this.stickTarget(direction.dx, direction.dy)
      if (target) {
        if (!this.walking) this.onTalk(null)
        // 멀리 끌면 올라탄다 (E241): 버튼 없이 같은 손짓으로
        orders.steer(target, touch.far)
      }
      this.walking = target !== null
      return true
    }
    if (this.walking) {
      this.walking = false
      orders.clear()
      hero.stop()
      return true
    }
    return touch.holding || pinch !== null
  }

  /**
   * 조이스틱 방향(화면)을 땅 위 방향으로 바꿔, 주인공 앞 STICK_AHEAD m 자리.
   * 방향은 주인공 발 높이의 수평면에서 잰다: 땅을 짚으면 계단식 땅 가장자리에서 두 점이 다른 높이에 닿아 방향이 틀어진다 (E24-07)
   */
  private stickTarget(dx: number, dy: number): Point2 | null {
    const { hero, view } = this.ctx
    const p = hero.object.position
    const at = worldToScreen(p, this.container.clientHeight, this.pixel.size, view.camera, view.subpixel)
    const len = Math.hypot(dx, dy) || 1
    this.stickPlane.constant = -p.y
    const a = this.planeAt(at.x, at.y, this.from)
    const b = this.planeAt(at.x + (dx / len) * 40, at.y + (dy / len) * 40, this.toward)
    if (!a || !b) return null
    const gx = b.x - a.x
    const gz = b.z - a.z
    const g = Math.hypot(gx, gz) || 1
    // 탄 동안은 더 멀리 잡는다 (E241): 길을 다시 찾는 사이에 다 달려 길이 비지 않게
    const ahead = STICK_AHEAD * (hero.riding ? MOUNT.speed : 1)
    return { x: p.x + (gx / g) * ahead, z: p.z + (gz / g) * ahead }
  }

  /** 화면 한 점이 주인공 발 높이의 수평면과 만나는 곳 */
  private planeAt(x: number, y: number, out: THREE.Vector3): THREE.Vector3 | null {
    const ray = screenRay(x, y, this.container.clientHeight, this.pixel.size, this.ctx.view.camera, this.ctx.view.subpixel, this.ray)
    return ray.intersectPlane(this.stickPlane, out)
  }

  /** 커서 아래의 적 */
  private enemyUnderCursor(): Giant | null {
    const { pointer } = this.input
    if (!pointer.inside) return null
    return this.enemyAt(pointer.x, pointer.y)
  }

  /** 화면 한 점 아래의 적. 거인 몸통(세로 기둥)과 광선이 가장 가까운 적을 고른다. */
  private enemyAt(x: number, y: number): Giant | null {
    const ray = screenRay(x, y, this.container.clientHeight, this.pixel.size, this.ctx.view.camera, this.ctx.view.subpixel, this.ray)
    const bottom = new THREE.Vector3()
    const top = new THREE.Vector3()
    let best: Giant | null = null
    let bestDist = Infinity
    for (const giant of this.ctx.encounter.alive) {
      const y = heightAt(giant.x, giant.z)
      bottom.set(giant.x, y, giant.z)
      top.set(giant.x, y + giant.radius * 3.6, giant.z)
      // 정확히 지나가면 부동소수 오차로 아주 작은 음수가 나올 수 있어 0으로 막는다.
      const dist = Math.sqrt(Math.max(0, ray.distanceSqToSegment(bottom, top)))
      if (dist < giant.radius * 1.15 && dist < bestDist) {
        best = giant
        bestDist = dist
      }
    }
    return best
  }

  /** 화면 한 점에서 px 안에 몸통 가운데가 보이는 가장 가까운 적 (톡이 몸을 살짝 빗나갔을 때) */
  private enemyNear(x: number, y: number, px: number): Giant | null {
    const { view } = this.ctx
    let best: Giant | null = null
    let bestDist = px
    for (const giant of this.ctx.encounter.alive) {
      this.from.set(giant.x, heightAt(giant.x, giant.z) + giant.radius * 1.8, giant.z)
      const at = worldToScreen(this.from, this.container.clientHeight, this.pixel.size, view.camera, view.subpixel)
      const dist = Math.hypot(at.x - x, at.y - y)
      if (dist < bestDist) {
        best = giant
        bestDist = dist
      }
    }
    return best
  }

  /** 마우스 커서가 가리키는 땅 위치 */
  cursorOnGround(): THREE.Vector3 | null {
    const { pointer } = this.input
    return this.groundAt(pointer.x, pointer.y, this.cursor)
  }

  /** 화면 한 점이 가리키는 땅 위치 */
  private groundAt(x: number, y: number, out: THREE.Vector3): THREE.Vector3 | null {
    const { camera, subpixel } = this.ctx.view
    // 계단식 땅이 있으면 (E24-07) 광선을 위에서부터 따라 내려가 처음 닿는 땅을 찾는다. 없으면 평면 하나로 충분하다
    if (highestLand() > 0) {
      const ray = screenRay(x, y, this.container.clientHeight, this.pixel.size, camera, subpixel, this.ray)
      return rayToLand(ray.origin, ray.direction, out)
    }
    return screenToGround(x, y, this.container.clientHeight, this.pixel.size, camera, out, subpixel)
  }
}

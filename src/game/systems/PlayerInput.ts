import * as THREE from 'three'

import type { Giant } from '../../enemies/Giant'
import type { Input } from '../../input/Input'
import type { TouchControls } from '../../input/TouchControls'
import { screenRay, screenToGround, worldToScreen } from '../../render/picking'
import type { PixelRenderer } from '../../render/PixelRenderer'
import { clampViewHeight, VIEW_HEIGHT } from '../../save/settings'
import type { Point2 } from '../../world/colliders'
import { heightAt } from '../../world/terrain'
import type { GameContext } from '../context'

/** 조이스틱으로 걸을 때 주인공 앞 이만큼(m)을 목적지로 잡는다 (길을 다시 찾는 0.12초 동안 다 걷지 못할 만큼) */
const STICK_AHEAD = 2.5
/** 톡: 적 몸통에서 화면으로 이만큼(px) 안이면 그 적을 누른 것으로 본다 (손가락은 커서보다 굵다) */
const TAP_ENEMY_PX = 28
/** 두 손가락 확대·축소: 시야 높이가 이만큼(비율) 넘게 바뀔 때만 화면을 다시 맞춘다 (렌더 버퍼를 프레임마다 새로 만들지 않게) */
const ZOOM_STEP = 0.02

/**
 * 클릭을 지시로 바꾼다. (DESIGN.md 8.2)
 * 땅 = 그곳까지 이동(싸우던 중이어도), 적 = 그 적을 쫓아가 자동 공격. 멈춰 서면 둘레 적을 자동 공격 (E12-08)
 * 휴대폰(E235): 톡 = 클릭, 끌기 = 떠다니는 조이스틱 쪽으로 걷기(떼면 멈춰 자동 공격), 두 손가락 = 확대·축소
 */
export class PlayerInput {
  private readonly cursor = new THREE.Vector3()
  private readonly from = new THREE.Vector3()
  private readonly toward = new THREE.Vector3()
  /** 커서 아래의 몬스터 (이름표용, 프레임마다 갱신) */
  hovered: Giant | null = null
  /** 누른 땅 가까이 선 마을 사람 (E15-06). 그 사람에게 걸어가 말을 건다 */
  talkAt: (x: number, z: number) => string | null = () => null
  /** 말 걸 사람을 정했다 (null이면 그만둠) */
  onTalk: (name: string | null) => void = () => {}
  /** 휴대폰 조작 (E235). 없으면 마우스만 */
  touch: TouchControls | null = null
  /** 두 손가락으로 시야 높이를 바꾼다. end면 손을 뗐다 (설정에 저장) */
  onZoom: (viewHeight: number, end: boolean) => void = () => {}
  /** 두 손가락을 댈 때의 시야 높이 */
  private pinchView: number | null = null
  /** 조이스틱으로 걷는 중 */
  private walking = false

  constructor(
    private readonly ctx: GameContext,
    private readonly input: Input,
    private readonly pixel: PixelRenderer,
    private readonly container: HTMLElement,
  ) {}

  update(): void {
    const { orders } = this.ctx
    if (this.touch && this.updateTouch(this.touch)) return
    const cursor = this.cursorOnGround()
    const ground = cursor ? { x: cursor.x, z: cursor.z } : null
    this.hovered = this.enemyUnderCursor()
    if (this.input.wasPressed('move')) {
      this.onTalk(ground && !this.hovered ? this.talkAt(ground.x, ground.z) : null)
      orders.press(ground, this.hovered)
    } else if (this.input.isDown('move')) orders.hold(ground)
    else orders.release()
  }

  /**
   * 손가락 조작 (E235). 손가락이 무엇을 하고 있으면 true (그 프레임은 마우스를 보지 않는다)
   * - 두 손가락: 처음 시야 높이 ÷ 벌린 배율
   * - 톡: 클릭과 같다 (적이면 공격, 땅이면 그곳까지, 마을 사람이면 말 걸기)
   * - 조이스틱: 그쪽으로 걷는다. 손을 떼거나 가운데로 돌아오면 멈춰 서서 둘레 적을 친다
   */
  private updateTouch(touch: TouchControls): boolean {
    const { orders, hero, view } = this.ctx
    const pinch = touch.gestures.pinch
    if (pinch !== null) {
      this.pinchView ??= view.viewHeight
      // 한계 안 값으로 견준다 (한계 밖까지 벌린 채 쥐고 있어도 프레임마다 다시 맞추지 않게). 한계에는 딱 닿게 한다
      const next = clampViewHeight(this.pinchView / pinch)
      const edge = next === VIEW_HEIGHT.min || next === VIEW_HEIGHT.max
      if (next !== view.viewHeight && (edge || Math.abs(next - view.viewHeight) / view.viewHeight > ZOOM_STEP)) this.onZoom(next, false)
    } else if (this.pinchView !== null) {
      // 바뀐 것이 있을 때만 설정에 저장한다
      if (this.pinchView !== view.viewHeight) this.onZoom(view.viewHeight, true)
      this.pinchView = null
    }
    const tap = touch.takeTap()
    if (tap) {
      const rect = this.container.getBoundingClientRect()
      const x = tap.x - rect.left
      const y = tap.y - rect.top
      this.hovered = this.enemyAt(x, y) ?? this.enemyNear(x, y, TAP_ENEMY_PX)
      const cursor = this.groundAt(x, y, this.cursor)
      const ground = cursor ? { x: cursor.x, z: cursor.z } : null
      this.onTalk(ground && !this.hovered ? this.talkAt(ground.x, ground.z) : null)
      orders.press(ground, this.hovered)
      orders.release()
      this.walking = false
      return true
    }
    const direction = touch.direction
    if (direction) {
      const target = this.stickTarget(direction.dx, direction.dy)
      if (target) {
        if (!this.walking) this.onTalk(null)
        orders.steer(target)
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

  /** 조이스틱 방향(화면)을 땅 위 방향으로 바꿔, 주인공 앞 STICK_AHEAD m 자리 */
  private stickTarget(dx: number, dy: number): Point2 | null {
    const { hero, view } = this.ctx
    const p = hero.object.position
    const at = worldToScreen(p, this.container.clientHeight, this.pixel.size, view.camera, view.subpixel)
    const len = Math.hypot(dx, dy) || 1
    const a = this.groundAt(at.x, at.y, this.from)
    const b = this.groundAt(at.x + (dx / len) * 40, at.y + (dy / len) * 40, this.toward)
    if (!a || !b) return null
    const gx = b.x - a.x
    const gz = b.z - a.z
    const g = Math.hypot(gx, gz) || 1
    return { x: p.x + (gx / g) * STICK_AHEAD, z: p.z + (gz / g) * STICK_AHEAD }
  }

  /** 커서 아래의 적 */
  private enemyUnderCursor(): Giant | null {
    const { pointer } = this.input
    if (!pointer.inside) return null
    return this.enemyAt(pointer.x, pointer.y)
  }

  /** 화면 한 점 아래의 적. 거인 몸통(세로 기둥)과 광선이 가장 가까운 적을 고른다. */
  private enemyAt(x: number, y: number): Giant | null {
    const ray = screenRay(x, y, this.container.clientHeight, this.pixel.size, this.ctx.view.camera, this.ctx.view.subpixel)
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
    return screenToGround(x, y, this.container.clientHeight, this.pixel.size, this.ctx.view.camera, out, this.ctx.view.subpixel)
  }
}

import * as THREE from 'three'

import type { Giant } from '../../enemies/Giant'
import { DoubleTapDetector } from '../../input/doubleTap'
import type { Input } from '../../input/Input'
import { screenRay, screenToGround } from '../../render/picking'
import type { PixelRenderer } from '../../render/PixelRenderer'
import { heightAt } from '../../world/terrain'
import type { GameContext } from '../context'

/**
 * 클릭을 지시로 바꾼다. (DESIGN.md 8.2)
 * 땅 한 번 = 이동(가다가 적을 만나면 싸움), 땅 두 번 = 적을 무시하고 이동, 적 = 공격 대상 지정
 */
export class PlayerInput {
  private readonly doubleTap = new DoubleTapDetector()
  private readonly cursor = new THREE.Vector3()

  constructor(
    private readonly ctx: GameContext,
    private readonly input: Input,
    private readonly pixel: PixelRenderer,
    private readonly container: HTMLElement,
  ) {}

  update(): void {
    const { orders } = this.ctx
    const cursor = this.cursorOnGround()
    const ground = cursor ? { x: cursor.x, z: cursor.z } : null
    if (this.input.wasPressed('move')) {
      const { pointer } = this.input
      const double = this.doubleTap.press(performance.now() / 1000, pointer.x, pointer.y)
      orders.press(ground, this.enemyUnderCursor(), double)
    } else if (this.input.isDown('move')) orders.hold(ground)
    else orders.release()
  }

  /** 커서 아래의 적. 거인 몸통(세로 기둥)과 광선이 가장 가까운 적을 고른다. */
  private enemyUnderCursor(): Giant | null {
    const { pointer } = this.input
    const ray = screenRay(pointer.x, pointer.y, this.container.clientHeight, this.pixel.size, this.ctx.view.camera)
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

  /** 마우스 커서가 가리키는 땅 위치 */
  private cursorOnGround(): THREE.Vector3 | null {
    const { pointer } = this.input
    return screenToGround(pointer.x, pointer.y, this.container.clientHeight, this.pixel.size, this.ctx.view.camera, this.cursor)
  }
}

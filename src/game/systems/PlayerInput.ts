import * as THREE from 'three'

import type { Giant } from '../../enemies/Giant'
import type { Input } from '../../input/Input'
import { screenRay, screenToGround } from '../../render/picking'
import type { PixelRenderer } from '../../render/PixelRenderer'
import { heightAt } from '../../world/terrain'
import type { GameContext } from '../context'

/**
 * 클릭을 지시로 바꾼다. (DESIGN.md 8.2)
 * 땅 = 그곳까지 이동(싸우던 중이어도), 적 = 그 적을 쫓아가 자동 공격. 멈춰 서면 둘레 적을 자동 공격 (E12-08)
 */
export class PlayerInput {
  private readonly cursor = new THREE.Vector3()
  /** 커서 아래의 몬스터 (이름표용, 프레임마다 갱신) */
  hovered: Giant | null = null

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
    this.hovered = this.enemyUnderCursor()
    if (this.input.wasPressed('move')) {
      orders.press(ground, this.hovered)
    } else if (this.input.isDown('move')) orders.hold(ground)
    else orders.release()
  }

  /** 커서 아래의 적. 거인 몸통(세로 기둥)과 광선이 가장 가까운 적을 고른다. */
  private enemyUnderCursor(): Giant | null {
    const { pointer } = this.input
    const ray = screenRay(pointer.x, pointer.y, this.container.clientHeight, this.pixel.size, this.ctx.view.camera, this.ctx.view.subpixel)
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
  cursorOnGround(): THREE.Vector3 | null {
    const { pointer } = this.input
    return screenToGround(pointer.x, pointer.y, this.container.clientHeight, this.pixel.size, this.ctx.view.camera, this.cursor, this.ctx.view.subpixel)
  }
}

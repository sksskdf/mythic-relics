import * as THREE from 'three'

import type { Input } from '../input/Input'
import { type CircleCollider, clampToBounds, type Point2, pushOut } from '../world/colliders'
import type { HeroRig } from '../world/heroModel'
import type { NavGrid } from '../world/navGrid'
import { heightAt } from '../world/terrain'

export const HERO_RADIUS = 0.4

export interface HeroTuning {
  /** 걷는 속도 (m/s) */
  moveSpeed: number
  /** 마우스를 누르고 있을 때 경로를 다시 찾는 간격 (초) */
  repathInterval: number
}

export const DEFAULT_TUNING: HeroTuning = {
  moveSpeed: 6,
  repathInterval: 0.12,
}

/** 이동 방향을 바라보는 회전값(y축)을 구한다. */
export function facingAngle(dx: number, dz: number): number {
  return Math.atan2(dx, dz)
}

/**
 * 주인공 이동을 담당한다. 조작 최소화 원칙에 따라 플레이어가 직접 하는 일은 이것뿐이다.
 * - 클릭: 그 지점까지 길을 찾아 걸어간다. 누르고 있으면 커서를 계속 따라간다.
 * - 맞으면 밀려난다(넉백). 쓰러져 있는 동안에는 움직이지 않는다.
 */
export class HeroController {
  path: Point2[] = []
  /** 이번 프레임에 새로 찍은 이동 목표 (클릭 표시용) */
  lastMoveTarget: Point2 | null = null
  /** 쓰러졌을 때 등, 이동을 막는다. */
  locked = false

  readonly object: THREE.Object3D
  private readonly knock = new THREE.Vector2()
  private repathTimer = 0
  private walkCycle = 0

  constructor(
    readonly rig: HeroRig,
    private readonly nav: NavGrid,
    private readonly colliders: () => readonly CircleCollider[],
    private readonly halfExtent: number,
    readonly tuning: HeroTuning = DEFAULT_TUNING,
  ) {
    this.object = rig.root
  }

  get isMoving(): boolean {
    return this.path.length > 0
  }

  get facing(): number {
    return this.object.rotation.y
  }

  /** 마우스가 가리키는 땅 위치를 받아 한 프레임을 진행한다. */
  update(dt: number, input: Input, cursor: THREE.Vector3 | null): void {
    this.lastMoveTarget = null

    if (!this.locked && cursor) {
      this.repathTimer -= dt
      if (input.wasPressed('move') || (input.isDown('move') && this.repathTimer <= 0)) {
        this.moveTo({ x: cursor.x, z: cursor.z })
        if (input.wasPressed('move')) this.lastMoveTarget = { x: cursor.x, z: cursor.z }
      }
    }

    if (this.knock.lengthSq() > 1e-4) {
      this.translate(this.knock.x * dt, this.knock.y * dt)
      this.knock.multiplyScalar(Math.exp(-10 * dt))
    }
    if (!this.locked) this.stepPath(dt)
    this.animate(dt)
  }

  /** 지정한 지점으로 길을 찾아 걷기 시작한다. */
  moveTo(target: Point2): void {
    const position = this.object.position
    this.path = this.nav.findPath({ x: position.x, z: position.z }, target)
    this.repathTimer = this.tuning.repathInterval
  }

  stop(): void {
    this.path = []
  }

  /** 지정한 각도를 바라본다. */
  face(angle: number): void {
    this.object.rotation.y = angle
  }

  /** 밀어낸다 (m/s). 시간이 지나면 줄어든다. */
  push(vx: number, vz: number): void {
    this.knock.set(this.knock.x + vx, this.knock.y + vz)
  }

  /** 지정한 위치로 순간이동한다. (부활 등) */
  teleport(x: number, z: number): void {
    this.object.position.set(x, heightAt(x, z), z)
    this.path = []
    this.knock.set(0, 0)
  }

  private stepPath(dt: number): void {
    let remaining = this.tuning.moveSpeed * dt
    const position = this.object.position
    while (remaining > 0 && this.path.length > 0) {
      const next = this.path[0]!
      const dx = next.x - position.x
      const dz = next.z - position.z
      const dist = Math.hypot(dx, dz)
      if (dist < 1e-3) {
        this.path.shift()
        continue
      }
      this.object.rotation.y = facingAngle(dx, dz)
      const step = Math.min(dist, remaining)
      this.translate((dx / dist) * step, (dz / dist) * step)
      remaining -= step
      if (step >= dist) this.path.shift()
    }
  }

  private translate(dx: number, dz: number): void {
    const position = this.object.position
    let next = { x: position.x + dx, z: position.z + dz }
    next = pushOut(next, HERO_RADIUS, this.colliders())
    next = clampToBounds(next, this.halfExtent)
    position.x = next.x
    position.z = next.z
    position.y = heightAt(next.x, next.z)
  }

  /**
   * 걸을 때 팔다리를 흔들고 몸을 살짝 앞으로 기울이며 망토를 펄럭인다.
   * 도끼를 든 오른팔은 덜 흔든다. 공격 중의 팔 동작은 전투 쪽에서 덮어쓴다.
   */
  private animate(dt: number): void {
    const { body, head, leftArm, rightArm, leftLeg, rightLeg, cape } = this.rig
    body.rotation.y = 0
    if (this.path.length > 0) {
      this.walkCycle += dt * 11
      const swing = Math.sin(this.walkCycle)
      body.rotation.x = 0.1
      leftLeg.rotation.x = swing * 0.75
      rightLeg.rotation.x = -swing * 0.75
      leftArm.rotation.x = -swing * 0.7
      rightArm.rotation.x = swing * 0.35 - 0.15
      body.position.y = Math.abs(Math.cos(this.walkCycle)) * 0.06
      head.rotation.x = -0.1 + Math.abs(Math.cos(this.walkCycle)) * 0.04
      cape.rotation.x = 0.4 + Math.abs(swing) * 0.18
    } else {
      // 숨 쉬듯 살짝 오르내린다.
      this.walkCycle += dt * 2
      const breath = Math.sin(this.walkCycle)
      body.rotation.x = 0
      leftLeg.rotation.x = rightLeg.rotation.x = 0
      leftArm.rotation.x = breath * 0.04
      rightArm.rotation.x = -0.1 + breath * 0.04
      body.position.y = breath * 0.015
      head.rotation.x = breath * 0.02
      cape.rotation.x = 0.08 + breath * 0.03
    }
  }
}

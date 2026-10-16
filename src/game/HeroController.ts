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
  /** 회피 거리 (m) */
  dodgeDistance: number
  /** 회피에 걸리는 시간 (초) */
  dodgeDuration: number
  /** 회피 재사용 대기시간 (초) */
  dodgeCooldown: number
  /** 우클릭을 누르고 있을 때 경로를 다시 찾는 간격 (초) */
  repathInterval: number
}

export const DEFAULT_TUNING: HeroTuning = {
  moveSpeed: 6,
  dodgeDistance: 4,
  dodgeDuration: 0.3,
  dodgeCooldown: 0.8,
  repathInterval: 0.12,
}

/** 이동 방향을 바라보는 회전값(y축)을 구한다. */
export function facingAngle(dx: number, dz: number): number {
  return Math.atan2(dx, dz)
}

/**
 * 주인공 이동과 회피를 담당한다.
 * - 우클릭: 그 지점까지 길을 찾아 걸어간다. 누르고 있으면 커서를 계속 따라간다.
 * - Space: 커서 방향으로 구른다. 구르는 동안은 무적 판정(M3에서 사용).
 */
export class HeroController {
  path: Point2[] = []
  dodgeTime = 0
  dodgeCooldownLeft = 0
  /** 이번 프레임에 회피를 시작했는지 (효과용) */
  justDodged = false
  /** 이번 프레임에 새로 찍은 이동 목표 (클릭 표시용) */
  lastMoveTarget: Point2 | null = null

  private readonly dodgeDir = new THREE.Vector2()
  private repathTimer = 0
  private walkCycle = 0

  readonly object: THREE.Object3D

  constructor(
    readonly rig: HeroRig,
    private readonly nav: NavGrid,
    private readonly colliders: readonly CircleCollider[],
    private readonly halfExtent: number,
    readonly tuning: HeroTuning = DEFAULT_TUNING,
  ) {
    this.object = rig.root
  }

  get isDodging(): boolean {
    return this.dodgeTime > 0
  }

  get isMoving(): boolean {
    return this.path.length > 0 || this.isDodging
  }

  /** 마우스가 가리키는 땅 위치를 받아 한 프레임을 진행한다. */
  update(dt: number, input: Input, cursor: THREE.Vector3 | null): void {
    this.lastMoveTarget = null
    this.justDodged = false
    this.dodgeCooldownLeft = Math.max(0, this.dodgeCooldownLeft - dt)

    if (input.wasPressed('dodge') && this.dodgeCooldownLeft <= 0 && !this.isDodging) {
      this.startDodge(cursor)
    }

    if (cursor && !this.isDodging) {
      this.repathTimer -= dt
      if (input.wasPressed('move') || (input.isDown('move') && this.repathTimer <= 0)) {
        this.moveTo({ x: cursor.x, z: cursor.z })
        if (input.wasPressed('move')) this.lastMoveTarget = { x: cursor.x, z: cursor.z }
      }
    }

    if (this.isDodging) this.stepDodge(dt)
    else this.stepPath(dt)

    this.animate(dt)
  }

  /** 지정한 지점으로 길을 찾아 걷기 시작한다. */
  moveTo(target: Point2): void {
    const position = this.object.position
    this.path = this.nav.findPath({ x: position.x, z: position.z }, target)
    this.repathTimer = this.tuning.repathInterval
  }

  private startDodge(cursor: THREE.Vector3 | null): void {
    const position = this.object.position
    if (cursor) this.dodgeDir.set(cursor.x - position.x, cursor.z - position.z)
    if (!cursor || this.dodgeDir.lengthSq() < 1e-4) {
      // 커서가 없거나 발밑이면 지금 바라보는 방향으로 구른다.
      this.dodgeDir.set(Math.sin(this.object.rotation.y), Math.cos(this.object.rotation.y))
    }
    this.dodgeDir.normalize()
    this.dodgeTime = this.tuning.dodgeDuration
    this.justDodged = true
    this.dodgeCooldownLeft = this.tuning.dodgeCooldown
    this.path = []
    this.object.rotation.y = facingAngle(this.dodgeDir.x, this.dodgeDir.y)
  }

  private stepDodge(dt: number): void {
    const step = Math.min(dt, this.dodgeTime)
    const speed = this.tuning.dodgeDistance / this.tuning.dodgeDuration
    this.translate(this.dodgeDir.x * speed * step, this.dodgeDir.y * speed * step)
    this.dodgeTime -= step
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
    next = pushOut(next, HERO_RADIUS, this.colliders)
    next = clampToBounds(next, this.halfExtent)
    position.x = next.x
    position.z = next.z
    position.y = heightAt(next.x, next.z)
  }

  /**
   * 걸을 때 팔다리를 흔들고 몸을 살짝 앞으로 기울이며 망토를 펄럭인다.
   * 도끼를 든 오른팔은 덜 흔든다. 구를 때는 몸을 숙여 웅크린다.
   */
  private animate(dt: number): void {
    const { body, head, leftArm, rightArm, leftLeg, rightLeg, cape } = this.rig
    if (this.isDodging) {
      const t = 1 - this.dodgeTime / this.tuning.dodgeDuration
      const curl = Math.sin(t * Math.PI)
      body.rotation.x = curl * 1.1
      body.position.y = -curl * 0.35
      leftLeg.rotation.x = rightLeg.rotation.x = -0.9 * curl
      leftArm.rotation.x = rightArm.rotation.x = -1.2 * curl
      cape.rotation.x = 0.9
      head.rotation.x = 0
      return
    }
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

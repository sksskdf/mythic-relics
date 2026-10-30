import * as THREE from 'three'

import { angleDiff } from '../combat/arc'
import { type CircleCollider, clampToArea, type Point2, pushOut, squareArea, type WalkArea } from '../world/colliders'
import type { HeroRig } from '../world/heroModel'
import type { NavGrid } from '../world/navGrid'
import { heightAt } from '../world/terrain'

export const HERO_RADIUS = 0.4
/** 돌아서는 빠르기 (클수록 빨리 돈다) */
const TURN_SPEED = 28
/** 막혀서 거의 못 나아가는 채로 이만큼(초) 지나면 길을 버린다 (벽에 붙어 제자리걸음하지 않게) */
const STUCK_SECONDS = 0.5

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
  /** 이동 속도 배율 (유물 지속 효과) */
  speedScale = 1
  /** 잠깐 붙는 이동 속도 배율 (사냥 각성) */
  boostScale = 1
  /** 쓰러졌을 때 등, 이동을 막는다. */
  locked = false
  /** 길을 막고 선 거인처럼 움직이는 장애물. 부딪혀 제자리걸음하지 않게 옆으로 비켜 간다. */
  obstacles: () => readonly CircleCollider[] = () => []

  readonly object: THREE.Object3D
  private readonly knock = new THREE.Vector2()
  private repathTimer = 0
  /** 걸으려 했는데 막혀 있던 시간 (초) */
  private stuck = 0
  private walkCycle = 0
  /** 바라보려는 방향. 몸은 이쪽으로 짧게 돌아선다. (판정은 바로 이 방향을 쓴다) */
  private targetFacing = 0

  constructor(
    readonly rig: HeroRig,
    private readonly nav: NavGrid,
    private readonly colliders: () => readonly CircleCollider[],
    /** 움직일 수 있는 곳 (지역마다 다르다. 수 하나면 가운데가 원점인 네모) */
    bounds: number | WalkArea,
    readonly tuning: HeroTuning = DEFAULT_TUNING,
  ) {
    this.object = rig.root
    this.area = typeof bounds === 'number' ? squareArea(bounds) : bounds
  }

  /** 움직일 수 있는 곳: 땅의 네모와 이웃으로 가는 통로 (E19) */
  area: WalkArea

  get isMoving(): boolean {
    return this.path.length > 0
  }

  /** 지금 걸어가는 방향 (다음 경유지 쪽). 서 있으면 null */
  get heading(): Point2 | null {
    const next = this.path[0]
    if (!next) return null
    const p = this.object.position
    return { x: next.x - p.x, z: next.z - p.z }
  }

  /** 걸어가는 곳 (길의 끝). 서 있으면 null */
  get goal(): Point2 | null {
    return this.path[this.path.length - 1] ?? null
  }

  get facing(): number {
    return this.targetFacing
  }

  /** 다시 길을 찾을 때가 되었는가 (누르고 있을 때, 대상을 쫓을 때) */
  get canRepath(): boolean {
    return this.repathTimer <= 0
  }

  /** 한 프레임을 진행한다. 어디로 갈지는 HeroOrders가 moveTo로 정한다. */
  update(dt: number): void {
    this.repathTimer -= dt

    if (this.knock.lengthSq() > 1e-4) {
      this.translate(this.knock.x * dt, this.knock.y * dt)
      this.knock.multiplyScalar(Math.exp(-10 * dt))
    }
    if (!this.locked) this.stepPath(dt)
    this.animate(dt)
  }

  /**
   * 지정한 지점으로 길을 찾아 걷기 시작한다.
   * 맵 밖을 누르면 갈 수 있는 가장자리까지만 간다.
   */
  moveTo(target: Point2): void {
    const position = this.object.position
    const goal = clampToArea(target, this.area, HERO_RADIUS)
    this.path = this.nav.findPath({ x: position.x, z: position.z }, goal)
    this.repathTimer = this.tuning.repathInterval
  }

  stop(): void {
    this.path = []
  }

  /** 지정한 각도를 바라본다. */
  face(angle: number): void {
    this.targetFacing = angle
  }

  /** 밀어낸다 (m/s). 시간이 지나면 줄어든다. */
  push(vx: number, vz: number): void {
    this.knock.set(this.knock.x + vx, this.knock.y + vz)
  }

  /** 원점이 옮겨졌다 (E19: 걸어서 이웃 땅으로 넘어감). 자리와 걷던 길을 같은 만큼 옮긴다 */
  shift(dx: number, dz: number): void {
    const p = this.object.position
    p.x += dx
    p.z += dz
    p.y = heightAt(p.x, p.z)
    this.path = this.path.map((q) => ({ x: q.x + dx, z: q.z + dz }))
  }

  /** 지정한 위치로 순간이동한다. (부활 등) */
  teleport(x: number, z: number): void {
    this.object.position.set(x, heightAt(x, z), z)
    this.path = []
    this.knock.set(0, 0)
  }

  private stepPath(dt: number): void {
    const wanted = this.tuning.moveSpeed * this.speedScale * this.boostScale * dt
    let remaining = wanted
    const position = this.object.position
    const fromX = position.x
    const fromZ = position.z
    while (remaining > 0 && this.path.length > 0) {
      const next = this.path[0]!
      const dx = next.x - position.x
      const dz = next.z - position.z
      const dist = Math.hypot(dx, dz)
      if (dist < 1e-3) {
        this.path.shift()
        continue
      }
      const step = Math.min(dist, remaining)
      const [sx, sz] = this.steer(dx / dist, dz / dist)
      this.targetFacing = facingAngle(sx, sz)
      this.translate(sx * step, sz * step)
      remaining -= step
      if (step >= dist) this.path.shift()
    }
    // 바위·거인 무리·경계에 막혀 걸음의 1/4도 못 나아가면 잠깐 뒤 멈춘다 (멈추면 둘레 적과 싸운다)
    const moved = Math.hypot(position.x - fromX, position.z - fromZ)
    if (this.path.length > 0 && moved < (wanted - remaining) * 0.25) {
      this.stuck += dt
      if (this.stuck >= STUCK_SECONDS) this.path = []
    } else this.stuck = 0
  }

  /**
   * 바로 앞을 막은 장애물이 있으면 옆으로 비껴 가는 방향을 돌려준다.
   * 길찾기는 나무·바위만 알고 움직이는 거인은 모르므로, 여기서 피해 간다.
   */
  private steer(dirX: number, dirZ: number): [number, number] {
    const p = this.object.position
    let sx = dirX
    let sz = dirZ
    for (const c of this.obstacles()) {
      const ox = c.x - p.x
      const oz = c.z - p.z
      const ahead = ox * dirX + oz * dirZ
      const reach = c.radius + HERO_RADIUS
      if (ahead <= 0 || ahead > reach + 1.2) continue
      // 진행 방향 기준으로 장애물이 왼쪽(+)인지 오른쪽(-)인지
      const side = ox * dirZ - oz * dirX
      if (Math.abs(side) >= reach + 0.1) continue
      const away = side >= 0 ? -1 : 1
      const weight = 1 - Math.abs(side) / (reach + 0.1)
      sx += dirZ * away * weight * 1.5
      sz += -dirX * away * weight * 1.5
    }
    const len = Math.hypot(sx, sz) || 1
    return [sx / len, sz / len]
  }

  private translate(dx: number, dz: number): void {
    const position = this.object.position
    let next = { x: position.x + dx, z: position.z + dz }
    next = pushOut(next, HERO_RADIUS, this.colliders())
    next = clampToArea(next, this.area)
    position.x = next.x
    position.z = next.z
    position.y = heightAt(next.x, next.z)
  }

  /**
   * 걸을 때 팔다리를 흔들고 몸을 살짝 앞으로 기울이며 망토를 펄럭인다.
   * 도끼를 든 오른팔은 덜 흔든다. 공격 중의 팔 동작은 전투 쪽에서 덮어쓴다.
   */
  private animate(dt: number): void {
    // 방향이 바뀌면 순간적으로 꺾지 않고 짧게 돌아선다. (약 0.1초)
    const turn = angleDiff(this.targetFacing, this.object.rotation.y)
    this.object.rotation.y += turn * (1 - Math.exp(-TURN_SPEED * dt))
    const { body, head, leftArm, rightArm, leftLeg, rightLeg, cape } = this.rig
    body.rotation.y = 0
    // 공격 모션이 옆으로 든 팔을 제자리로 (E6-10)
    leftArm.rotation.z = rightArm.rotation.z = 0
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

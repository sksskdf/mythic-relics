import * as THREE from 'three'

import { angleDiff, angleTo, inArc, inCircle, inRing } from '../combat/arc'
import { Health } from '../combat/Health'
import { Telegraph } from '../fx/Telegraphs'
import { type CircleCollider, clampToBounds, type Point2, pushOut } from '../world/colliders'
import type { NavGrid } from '../world/navGrid'
import { heightAt } from '../world/terrain'
import { buildGiantRig, type GiantRig } from './giantModel'

const DEG = Math.PI / 180

/** 공격이 닿는 범위 */
export type AttackArea =
  /** 거인 앞쪽 부채꼴 */
  | { kind: 'sector'; range: number; halfAngle: number }
  /** 주인공이 서 있던 자리에 떨어지는 원 */
  | { kind: 'circle'; radius: number }
  /**
   * 거인을 중심으로 퍼져 나가는 충격파. startRadius 안쪽은 안전하다.
   * 회피 버튼이 없으므로 거인 품으로 파고들거나 멀리 벗어나서 피한다.
   */
  | { kind: 'ring'; speed: number; startRadius: number; maxRadius: number; width: number }

export interface AttackSpec {
  name: 'smash' | 'sweep' | 'slam' | 'roar'
  /** 예고 시간 (초). 이 시간 안에 범위 밖으로 걸어 나가면 피할 수 있다. */
  windup: number
  /** 공격 후 빈틈 (초) */
  recover: number
  damage: number
  knockback: number
  area: AttackArea
  /** 주인공이 이 거리(중심 사이) 안에 있어야 이 공격을 쓴다. */
  reach: number
  /** 다시 쓰기까지 걸리는 시간 (초) */
  cooldown: number
}

export interface GiantSpec {
  king: boolean
  voxelSize: number
  radius: number
  hp: number
  /** 걷는 속도 (m/s) */
  speed: number
  /** 주인공을 알아채는 거리 */
  aggroRange: number
  /** 제자리에서 이만큼 멀어지면 돌아간다. */
  leashRange: number
  /** 한 번에 이 이상 맞으면 휘청이며 하던 공격이 끊긴다. 보스는 끊기지 않는다(슈퍼아머). */
  poise: number
  attacks: readonly AttackSpec[]
}

/** 서리 거인 졸개: 몽둥이 내려찍기 하나 */
export const GRUNT: GiantSpec = {
  king: false,
  voxelSize: 0.1,
  radius: 0.75,
  hp: 60,
  speed: 3.2,
  aggroRange: 11,
  leashRange: 24,
  poise: 20,
  attacks: [
    {
      name: 'smash',
      windup: 0.75,
      recover: 0.6,
      damage: 12,
      knockback: 6,
      area: { kind: 'sector', range: 2.9, halfAngle: 45 * DEG },
      reach: 2.6,
      cooldown: 1.2,
    },
  ],
}

/** 거인 왕: 휩쓸기, 내려찍기, (생명력 절반 아래에서) 포효 */
export const KING: GiantSpec = {
  king: true,
  voxelSize: 0.18,
  radius: 1.5,
  hp: 900,
  speed: 2.6,
  aggroRange: 15,
  leashRange: 30,
  poise: Infinity,
  attacks: [
    {
      name: 'sweep',
      windup: 0.85,
      recover: 0.8,
      damage: 24,
      knockback: 12,
      area: { kind: 'sector', range: 5, halfAngle: 75 * DEG },
      reach: 4.4,
      cooldown: 2.4,
    },
    {
      name: 'slam',
      windup: 1.1,
      recover: 1,
      damage: 30,
      knockback: 8,
      area: { kind: 'circle', radius: 2.4 },
      reach: 10,
      cooldown: 4.5,
    },
    {
      name: 'roar',
      windup: 1,
      recover: 1.2,
      damage: 18,
      knockback: 10,
      area: { kind: 'ring', speed: 9, startRadius: 3.6, maxRadius: 13, width: 1.2 },
      reach: 30,
      cooldown: 16,
    },
  ],
}

/** 거인이 주변을 알기 위해 쓰는 것들 */
export interface GiantWorld {
  hero: { x: number; z: number; radius: number; alive: boolean }
  /** 로키의 환영 분신. 가까이 있으면 거인은 주인공 대신 이것을 쫓고 때린다. */
  decoy?: { x: number; z: number; radius: number } | null
  nav: NavGrid
  halfExtent: number
  /** 움직이지 않는 충돌체 */
  staticColliders: readonly CircleCollider[]
  /** 다른 거인들 (자기 자신 포함 가능) */
  giants: readonly Giant[]
  /** 거인 공격이 주인공에게 맞았다. */
  hitHero(damage: number, fromX: number, fromZ: number, knockback: number): void
  /** 공격이 땅을 때렸다. 흙먼지, 화면 흔들림 등 */
  impact(x: number, z: number, strength: number, ice: boolean): void
  /** 거인 왕이 포효로 졸개를 부른다. */
  summon(x: number, z: number, count: number): void
  /** 공격 예고를 붙일 곳 */
  effects: THREE.Object3D
}

export type GiantState = 'idle' | 'chase' | 'return' | 'windup' | 'recover' | 'stagger' | 'dead'

interface Shockwave {
  radius: number
  hit: boolean
  telegraph: Telegraph
  x: number
  z: number
  attack: AttackSpec
}

const DEATH_COLLAPSE = 0.55
const REPATH = 0.45

/** 서리 거인 한 마리. 졸개와 거인 왕이 같은 흐름(대기 → 추격 → 예고 → 공격 → 빈틈)을 쓴다. */
export class Giant {
  readonly rig: GiantRig
  readonly health: Health
  readonly collider: CircleCollider
  state: GiantState = 'idle'
  /** 쓰러진 뒤 조각으로 흩어졌으면 true. 이후에는 지워도 된다. */
  gone = false
  /** 이번 프레임에 조각으로 흩어졌다. */
  justShattered = false

  private stateTime = 0
  private attack: AttackSpec | null = null
  private readonly cooldowns = new Map<AttackSpec, number>()
  private telegraph: Telegraph | null = null
  private readonly target = new THREE.Vector2()
  private readonly waves: Shockwave[] = []
  private readonly knock = new THREE.Vector2()
  private path: Point2[] = []
  private repathTimer = 0
  private walkCycle = Math.random() * 10
  private flash = 0
  private roared = false

  constructor(
    readonly spec: GiantSpec,
    readonly home: Point2,
    seed = 1,
  ) {
    this.rig = buildGiantRig({ voxelSize: spec.voxelSize, king: spec.king, seed })
    this.health = new Health(spec.hp)
    this.collider = { x: home.x, z: home.z, radius: spec.radius }
    this.rig.root.position.set(home.x, heightAt(home.x, home.z), home.z)
    this.rig.root.rotation.y = Math.random() * Math.PI * 2
    // 처음부터 일부 공격은 조금 기다렸다 쓰게 한다. (포효는 생명력 조건으로 따로 막는다)
    for (const attack of spec.attacks) this.cooldowns.set(attack, attack.cooldown * 0.3)
  }

  get object(): THREE.Object3D {
    return this.rig.root
  }

  get x(): number {
    return this.rig.root.position.x
  }

  get z(): number {
    return this.rig.root.position.z
  }

  get alive(): boolean {
    return this.state !== 'dead'
  }

  get radius(): number {
    return this.spec.radius
  }

  /** 지금 공격을 준비 중이면 그 공격 */
  get currentAttack(): AttackSpec | null {
    return this.state === 'windup' ? this.attack : null
  }

  /** 주인공을 바로 쫓게 한다. (포효로 불려 왔을 때) */
  alert(): void {
    if (this.state === 'idle' || this.state === 'return') this.setState('chase')
  }

  /**
   * 주인공의 공격에 맞았다.
   * @returns 실제로 깎인 생명력
   */
  takeHit(damage: number, dirX: number, dirZ: number, knockback: number): number {
    if (!this.alive) return 0
    const dealt = this.health.damage(damage)
    this.flash = 1
    if (this.health.dead) {
      this.die()
      return dealt
    }
    if (this.spec.poise !== Infinity) this.knock.set(this.knock.x + dirX * knockback, this.knock.y + dirZ * knockback)
    if (damage >= this.spec.poise) {
      this.clearTelegraph()
      this.setState('stagger')
    } else if (this.state === 'idle' || this.state === 'return') {
      this.setState('chase')
    }
    return dealt
  }

  update(dt: number, world: GiantWorld): void {
    this.justShattered = false
    this.stateTime += dt
    for (const [attack, left] of this.cooldowns) this.cooldowns.set(attack, Math.max(0, left - dt))
    this.updateWaves(dt, world)
    this.updateFlash(dt)

    if (this.state === 'dead') {
      this.updateDeath()
      return
    }

    if (this.knock.lengthSq() > 1e-4) {
      this.translate(this.knock.x * dt, this.knock.y * dt, world)
      this.knock.multiplyScalar(Math.exp(-9 * dt))
    }

    const hero = this.aim(world)
    const distToHero = Math.hypot(hero.x - this.x, hero.z - this.z)
    const distFromHome = Math.hypot(this.x - this.home.x, this.z - this.home.z)

    switch (this.state) {
      case 'idle':
        if (hero.alive && distToHero < this.spec.aggroRange) this.setState('chase')
        break
      case 'return':
        this.health.heal(this.spec.hp * 0.5 * dt)
        if (this.walkTo(this.home, dt, world) < 0.5) this.setState('idle')
        else if (hero.alive && distToHero < this.spec.aggroRange * 0.6) this.setState('chase')
        break
      case 'chase': {
        if (!hero.alive || distFromHome > this.spec.leashRange) {
          this.setState('return')
          break
        }
        const attack = this.chooseAttack(distToHero)
        if (attack) this.beginAttack(attack, world)
        else this.walkTo(hero, dt, world, this.spec.radius + hero.radius + 0.3)
        break
      }
      case 'windup':
        this.updateWindup(world)
        break
      case 'recover':
        if (this.stateTime >= this.attack!.recover) this.setState('chase')
        break
      case 'stagger':
        if (this.stateTime >= 0.4) this.setState('chase')
        break
    }

    this.collider.x = this.x
    this.collider.z = this.z
    this.animate(dt)
  }

  /** 지운다. 예고 표시도 함께 지운다. */
  dispose(): void {
    this.clearTelegraph()
    for (const wave of this.waves) wave.telegraph.dispose()
    this.waves.length = 0
    this.rig.root.removeFromParent()
  }

  /** 쫓을 대상: 가까운 환영 분신이 있으면 그쪽, 없으면 주인공 */
  private aim(world: GiantWorld): { x: number; z: number; radius: number; alive: boolean } {
    const decoy = world.decoy
    if (decoy && Math.hypot(decoy.x - this.x, decoy.z - this.z) < this.spec.aggroRange * 1.2) {
      return { ...decoy, alive: true }
    }
    return world.hero
  }

  private setState(state: GiantState): void {
    this.state = state
    this.stateTime = 0
    this.path = []
    this.repathTimer = 0
  }

  private chooseAttack(distToHero: number): AttackSpec | null {
    // 포효는 생명력이 절반 아래로 처음 떨어졌을 때 재사용 대기와 상관없이 바로 쓴다.
    const roar = this.spec.attacks.find((a) => a.name === 'roar')
    if (roar && !this.roared && this.health.ratio <= 0.5) return roar
    const ready = this.spec.attacks.filter((a) => {
      if ((this.cooldowns.get(a) ?? 0) > 0) return false
      if (a.name === 'roar') return this.health.ratio <= 0.5
      return distToHero <= a.reach
    })
    if (ready.length === 0) return null
    return ready[Math.floor(Math.random() * ready.length)]!
  }

  private beginAttack(attack: AttackSpec, world: GiantWorld): void {
    this.attack = attack
    this.cooldowns.set(attack, attack.cooldown + attack.windup)
    this.setState('windup')
    const aim = this.aim(world)
    this.target.set(aim.x, aim.z)
    this.face(aim.x, aim.z)
    const area = attack.area
    if (area.kind === 'ring') {
      this.roared = true
      world.summon(this.x, this.z, 3)
    }
    this.telegraph = new Telegraph(
      area.kind === 'sector'
        ? { kind: 'sector', radius: area.range, halfAngle: area.halfAngle }
        : area.kind === 'circle'
          ? { kind: 'circle', radius: area.radius }
          : { kind: 'ring', radius: area.startRadius, width: area.width },
    )
    world.effects.add(this.telegraph.object)
    this.placeTelegraph()
  }

  private updateWindup(world: GiantWorld): void {
    const attack = this.attack!
    const t = this.stateTime / attack.windup
    // 예고 앞부분 동안만 주인공을 따라 방향과 위치를 맞추고, 그 뒤로는 고정해서 피할 수 있게 한다.
    const aim = this.aim(world)
    if (t < 0.4 && aim.alive && attack.area.kind !== 'ring') {
      this.target.set(aim.x, aim.z)
      this.face(aim.x, aim.z)
    }
    this.placeTelegraph()
    this.telegraph?.setProgress(t)
    if (t >= 1) {
      this.strike(attack, world)
      this.clearTelegraph()
      this.setState('recover')
    }
  }

  private placeTelegraph(): void {
    if (!this.telegraph || !this.attack) return
    if (this.attack.area.kind === 'circle') this.telegraph.place(this.target.x, this.target.y)
    else this.telegraph.place(this.x, this.z, this.rig.root.rotation.y)
  }

  private strike(attack: AttackSpec, world: GiantWorld): void {
    const hero = world.hero
    const area = attack.area
    const facing = this.rig.root.rotation.y
    const ice = this.spec.king
    switch (area.kind) {
      case 'sector': {
        if (hero.alive && inArc(this.x, this.z, facing, area.range, area.halfAngle, hero.x, hero.z, hero.radius)) {
          world.hitHero(attack.damage, this.x, this.z, attack.knockback)
        }
        const reach = area.range * 0.7
        world.impact(this.x + Math.sin(facing) * reach, this.z + Math.cos(facing) * reach, this.spec.king ? 0.35 : 0.12, ice)
        break
      }
      case 'circle':
        if (hero.alive && inCircle(this.target.x, this.target.y, area.radius, hero.x, hero.z, hero.radius)) {
          world.hitHero(attack.damage, this.target.x, this.target.y, attack.knockback)
        }
        world.impact(this.target.x, this.target.y, 0.45, ice)
        break
      case 'ring': {
        const telegraph = new Telegraph({ kind: 'ring', radius: area.startRadius, width: area.width })
        telegraph.place(this.x, this.z)
        world.effects.add(telegraph.object)
        this.waves.push({ radius: area.startRadius, hit: false, telegraph, x: this.x, z: this.z, attack })
        world.impact(this.x, this.z, 0.5, ice)
        break
      }
    }
  }

  private updateWaves(dt: number, world: GiantWorld): void {
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const wave = this.waves[i]!
      const area = wave.attack.area
      if (area.kind !== 'ring') continue
      wave.radius += area.speed * dt
      if (wave.radius > area.maxRadius) {
        wave.telegraph.dispose()
        this.waves.splice(i, 1)
        continue
      }
      wave.telegraph.reshape({ kind: 'ring', radius: wave.radius, width: area.width })
      wave.telegraph.setProgress(1)
      const hero = world.hero
      if (!wave.hit && hero.alive && inRing(wave.x, wave.z, wave.radius, area.width, hero.x, hero.z, hero.radius)) {
        wave.hit = true
        world.hitHero(wave.attack.damage, wave.x, wave.z, wave.attack.knockback)
      }
    }
  }

  private clearTelegraph(): void {
    this.telegraph?.dispose()
    this.telegraph = null
  }

  private die(): void {
    this.clearTelegraph()
    this.setState('dead')
    this.knock.set(0, 0)
  }

  private updateDeath(): void {
    // 뒤로 넘어간 뒤 조각으로 흩어진다.
    const t = Math.min(1, this.stateTime / DEATH_COLLAPSE)
    this.rig.body.rotation.x = -t * t * (Math.PI / 2) * 0.9
    if (this.stateTime >= DEATH_COLLAPSE && !this.gone) {
      this.gone = true
      this.justShattered = true
      this.rig.root.visible = false
    }
  }

  private updateFlash(dt: number): void {
    if (this.flash <= 0) return
    this.flash = Math.max(0, this.flash - dt * 9)
    const f = this.flash > 0.5 ? 1 : this.flash * 1.4
    this.rig.material.emissive.setRGB(f, f, f)
  }

  private face(x: number, z: number): void {
    this.rig.root.rotation.y = angleTo(this.x, this.z, x, z)
  }

  /** 목표 지점으로 걷는다. 남은 거리를 돌려준다. stopAt 안으로 들어오면 멈춘다. */
  private walkTo(goal: Point2, dt: number, world: GiantWorld, stopAt = 0): number {
    const dist = Math.hypot(goal.x - this.x, goal.z - this.z)
    if (dist <= stopAt) {
      this.path = []
      this.face(goal.x, goal.z)
      return dist
    }
    const here = { x: this.x, z: this.z }
    this.repathTimer -= dt
    let waypoint: Point2 = goal
    if (!world.nav.hasLineOfSight(here, goal)) {
      if (this.repathTimer <= 0 || this.path.length === 0) {
        this.path = world.nav.findPath(here, goal)
        this.repathTimer = REPATH
      }
      while (this.path.length > 0 && Math.hypot(this.path[0]!.x - this.x, this.path[0]!.z - this.z) < 0.3) this.path.shift()
      waypoint = this.path[0] ?? goal
    }
    const dx = waypoint.x - this.x
    const dz = waypoint.z - this.z
    const len = Math.hypot(dx, dz)
    if (len > 1e-3) {
      const step = Math.min(len, this.spec.speed * dt)
      // 몸을 확 돌리지 않고 조금씩 돌린다.
      const want = Math.atan2(dx, dz)
      const turn = angleDiff(want, this.rig.root.rotation.y)
      this.rig.root.rotation.y += turn * Math.min(1, dt * 10)
      this.translate((dx / len) * step, (dz / len) * step, world)
    }
    this.walkCycle += dt * 7
    return dist
  }

  private translate(dx: number, dz: number, world: GiantWorld): void {
    const position = this.rig.root.position
    let next: Point2 = { x: position.x + dx, z: position.z + dz }
    next = pushOut(next, this.spec.radius, world.staticColliders)
    for (const other of world.giants) {
      if (other === this || !other.alive) continue
      next = pushOut(next, this.spec.radius, [other.collider])
    }
    if (world.hero.alive) next = pushOut(next, this.spec.radius, [{ x: world.hero.x, z: world.hero.z, radius: world.hero.radius }])
    next = clampToBounds(next, world.halfExtent)
    position.set(next.x, heightAt(next.x, next.z), next.z)
  }

  /** 상태에 맞춰 팔다리를 움직인다. */
  private animate(dt: number): void {
    const { body, leftArm, rightArm, leftLeg, rightLeg } = this.rig
    const moving = this.state === 'chase' || this.state === 'return'
    const swing = Math.sin(this.walkCycle)
    body.rotation.set(0, 0, 0)
    body.position.y = 0
    leftArm.rotation.set(0, 0, 0)
    rightArm.rotation.set(0, 0, 0)
    leftLeg.rotation.x = moving ? swing * 0.5 : 0
    rightLeg.rotation.x = moving ? -swing * 0.5 : 0
    if (moving) {
      leftArm.rotation.x = -swing * 0.45
      rightArm.rotation.x = swing * 0.3 - 0.2
      body.position.y = Math.abs(Math.cos(this.walkCycle)) * this.spec.voxelSize * 0.8
      body.rotation.x = 0.08
    } else {
      this.walkCycle += dt * 1.5
      leftArm.rotation.x = Math.sin(this.walkCycle) * 0.05
      rightArm.rotation.x = -0.2 + Math.sin(this.walkCycle) * 0.05
    }

    const attack = this.attack
    if (this.state === 'windup' && attack) this.poseAttack(attack.name, Math.min(1, this.stateTime / attack.windup), 0)
    if (this.state === 'recover' && attack) this.poseAttack(attack.name, 1, Math.min(1, this.stateTime / attack.recover))
    if (this.state === 'stagger') {
      body.rotation.x = -0.25 * Math.sin(Math.min(1, this.stateTime / 0.4) * Math.PI)
      leftArm.rotation.z = -0.4
      rightArm.rotation.z = 0.4
    }
  }

  /**
   * 공격 자세. windup은 예고 진행도(0~1, 끝으로 갈수록 크게 젖힌다),
   * after는 공격 뒤 빈틈의 진행도(0이면 막 때린 자세, 1이면 원래 자세로 돌아옴)
   */
  private poseAttack(name: AttackSpec['name'], windup: number, after: number): void {
    const { body, leftArm, rightArm } = this.rig
    const ease = windup * windup * (3 - 2 * windup)
    const settle = 1 - after
    const struck = after > 0 || windup >= 1
    // 부르르 떨면서 힘을 모은다.
    const tremble = !struck && windup > 0.6 ? Math.sin(this.stateTime * 60) * 0.03 : 0
    switch (name) {
      case 'smash':
      case 'slam':
        if (!struck) {
          rightArm.rotation.x = -2.7 * ease
          leftArm.rotation.x = name === 'slam' ? -2.5 * ease : -0.4 * ease
          body.rotation.x = -0.2 * ease + tremble
        } else {
          rightArm.rotation.x = -0.5 * settle
          leftArm.rotation.x = name === 'slam' ? -0.6 * settle : 0
          body.rotation.x = 0.3 * settle
        }
        break
      case 'sweep':
        if (!struck) {
          body.rotation.y = 0.9 * ease + tremble
          rightArm.rotation.x = -1.4 * ease
          rightArm.rotation.z = 0.5 * ease
        } else {
          body.rotation.y = -1.1 * settle
          rightArm.rotation.x = -1.4 * settle
          rightArm.rotation.z = 0.5 * settle
        }
        break
      case 'roar':
        body.rotation.x = (struck ? -0.35 * settle : -0.3 * ease) + tremble
        leftArm.rotation.z = -1.2 * (struck ? settle : ease)
        rightArm.rotation.z = 1.2 * (struck ? settle : ease)
        break
    }
  }
}

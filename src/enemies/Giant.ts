import * as THREE from 'three'

import { angleDiff, angleTo, inArc, inCircle, inLine, inRing } from '../combat/arc'
import { Health } from '../combat/Health'
import { DATA } from '../data'
import { Telegraph } from '../fx/Telegraphs'
import { type CircleCollider, clampToArea, type Point2, pushOut, type WalkArea } from '../world/colliders'
import type { NavGrid } from '../world/navGrid'
import { heightAt } from '../world/terrain'
import { ELITES, type EliteKind } from './elite'
import { buildEnemyRig, type EnemyRig } from './enemyModel'
import { Projectile } from './Projectile'

import type { AttackSpec, GiantSpec } from '../data/schema'

export type { AttackArea, AttackSpec, GiantSpec } from '../data/schema'

/** 적 데이터 (src/data/enemies.json) */
export const ENEMIES: Readonly<Record<string, GiantSpec>> = DATA.enemies
/** 서리 거인 졸개: 몽둥이 내려찍기 하나 */
export const GRUNT: GiantSpec = DATA.enemies.grunt!
/** 거인 왕: 휩쓸기, 내려찍기, (생명력 절반 아래에서) 포효 */
export const KING: GiantSpec = DATA.enemies.king!
/**
 * 우트가르드의 왕 (승급 전설 「우트가르드 원정」의 보스). 환술로 토르를 속인 거인 왕이라 보랏빛을 띤다.
 * 거인 왕과 같은 패턴을 쓰되 더 단단하고, 처음부터 포효를 쓸 수 있다.
 */
export const UTGARD_KING: GiantSpec = DATA.enemies.utgardKing!

/** 거인이 주변을 알기 위해 쓰는 것들 */
export interface GiantWorld {
  hero: { x: number; z: number; radius: number; alive: boolean }
  /** 로키의 환영 분신. 가까이 있으면 거인은 주인공 대신 이것을 쫓고 때린다. */
  decoy?: { x: number; z: number; radius: number } | null
  nav: NavGrid
  /** 움직일 수 있는 곳 (땅의 네모와 이웃 통로) */
  area: WalkArea
  /** 움직이지 않는 충돌체 */
  staticColliders: readonly CircleCollider[]
  /** 다른 거인들 (자기 자신 포함 가능) */
  giants: readonly Giant[]
  /** 거인 공격이 주인공에게 맞았다. */
  hitHero(damage: number, fromX: number, fromZ: number, knockback: number): void
  /** 공격이 땅을 때렸다. 흙먼지, 화면 흔들림 등 */
  impact(x: number, z: number, strength: number, ice: boolean): void
  /** 포효·부르기로 다른 적을 부른다 (enemy가 없으면 졸개) */
  summon(x: number, z: number, count: number, enemy?: string): void
  /** 공격 예고를 붙일 곳 */
  effects: THREE.Object3D
  /** 공격 예고가 시작됐다 (소리) */
  warn?(x: number, z: number): void
}

/** 예고 중인 공격 범위. ring의 radius는 안전한 안쪽 반지름 */
export type GiantDanger =
  | { kind: 'sector'; x: number; z: number; facing: number; radius: number; halfAngle: number; progress: number }
  | { kind: 'circle' | 'ring'; x: number; z: number; radius: number; progress: number }
  | { kind: 'line'; x: number; z: number; facing: number; length: number; width: number; progress: number }

export type GiantState = 'idle' | 'chase' | 'return' | 'windup' | 'recover' | 'stagger' | 'dead'

interface Shockwave {
  radius: number
  hit: boolean
  telegraph: Telegraph
  x: number
  z: number
  attack: AttackSpec
}

/** 부르기: 둘레에 부른 적이 (한 번에 부르는 수 × 이것) 이상이면 더 부르지 않는다 */
const SUMMON_CROWD = 1.5
const DEATH_COLLAPSE = 0.55
const REPATH = 0.45
/** 돌진 빠르기 (m/s) */
const DASH_SPEED = 16

/** 서리 거인 한 마리. 졸개와 거인 왕이 같은 흐름(대기 → 추격 → 예고 → 공격 → 빈틈)을 쓴다. */
export class Giant {
  readonly rig: EnemyRig
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
  /** 돌진 중: 남은 거리와 방향, 이미 쳤는지 */
  private dash: { left: number; dirX: number; dirZ: number; hit: boolean; attack: AttackSpec } | null = null
  /** 날아가는 것들 (던지기) */
  private readonly projectiles: Projectile[] = []
  /** 둘러싸기 (E8-06): 주인공의 어느 쪽으로 붙을지 (거인마다 다름) */
  private readonly flank: number
  /** 막아 낸 피해 (점검용) */
  blocked = 0
  /** 정예 배율 (E8-05): 피해 */
  damageScale = 1
  /** 위협 단계 배율 (E14-03): 생명력·피해 */
  private threat = { hp: 1, damage: 1 }
  /** 정예 종류 (없으면 보통) */
  elite: EliteKind | null = null
  private size = 1
  private speedScale = 1
  private cooldownScale = 1
  private aura: THREE.Mesh | null = null
  /** 정예의 은은한 몸 빛 (맞았을 때 번쩍임이 끝나면 이 빛으로 돌아간다) */
  private readonly glow = new THREE.Color(0, 0, 0)

  constructor(
    readonly spec: GiantSpec,
    readonly home: Point2,
    seed = 1,
  ) {
    this.rig = buildEnemyRig(spec, seed)
    this.flank = ((seed * 2.39996) % (Math.PI * 2)) - Math.PI
    if (spec.tint !== undefined) this.rig.material.color.setHex(spec.tint)
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
    return this.spec.radius * this.size
  }

  /** 위협 단계 배율을 건다 (세울 때 한 번, 정예로 만들 때도 이어진다) */
  applyThreat(scale: { hp: number; damage: number }): void {
    this.threat = { ...scale }
    this.damageScale = (this.elite ? ELITES[this.elite].damage : 1) * scale.damage
    this.health.max = this.spec.hp * (this.elite ? ELITES[this.elite].hp : 1) * scale.hp
    this.health.hp = this.health.max
  }

  /** 정예로 만든다: 크고 단단하거나 사납거나 날래다. 발밑에 그 색 고리가 생긴다 */
  makeElite(kind: EliteKind): void {
    const def = ELITES[kind]
    this.elite = kind
    this.size = def.size
    this.speedScale = def.speed
    this.cooldownScale = def.cooldown
    this.damageScale = def.damage * this.threat.damage
    this.health.max = this.spec.hp * def.hp * this.threat.hp
    this.health.hp = this.health.max
    this.collider.radius = this.radius
    this.rig.body.scale.setScalar(def.size)
    this.glow.setHex(def.color).multiplyScalar(0.07)
    this.rig.material.emissive.copy(this.glow)
    const r = this.radius
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 0.85, r * 1.15, 24),
      new THREE.MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.55, depthWrite: false }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.06
    this.aura = ring
    this.rig.root.add(ring)
  }

  /** 지금 공격을 준비 중이면 그 공격 */
  get currentAttack(): AttackSpec | null {
    return this.state === 'windup' ? this.attack : null
  }

  /**
   * 지금 예고 중인 공격 범위. 예고 앞부분(40%)이 지나 범위가 고정된 뒤의 값이 실제로 맞는 곳이다.
   * 화면의 예고 표시와 같은 정보이며, 자동 플레이 검증에서 피할 곳을 정할 때 쓴다.
   */
  get danger(): GiantDanger | null {
    const attack = this.currentAttack
    if (!attack) return null
    const progress = Math.min(1, this.stateTime / attack.windup)
    const area = attack.area
    switch (area.kind) {
      case 'sector':
        return { kind: 'sector', x: this.x, z: this.z, facing: this.rig.root.rotation.y, radius: area.range, halfAngle: area.halfAngle, progress }
      case 'circle':
        return { kind: 'circle', x: this.target.x, z: this.target.y, radius: area.radius, progress }
      case 'ring':
        return { kind: 'ring', x: this.x, z: this.z, radius: area.startRadius - area.width / 2, progress }
      case 'line':
        return { kind: 'line', x: this.x, z: this.z, facing: this.rig.root.rotation.y, length: area.length, width: area.width, progress }
      case 'summon':
        return null
    }
  }

  /** 예고 중인 범위와 날아가는 것이 떨어질 자리를 모두 (봇이 피할 곳) */
  get dangers(): GiantDanger[] {
    const out: GiantDanger[] = []
    const now = this.danger
    if (now) out.push(now)
    for (const shot of this.projectiles) {
      if (shot.attack.area.kind === 'circle') out.push({ kind: 'circle', x: shot.to.x, z: shot.to.z, radius: shot.attack.area.radius, progress: 1 })
    }
    return out
  }

  /** 지금 날아가는 것 (점검용) */
  get flying(): number {
    return this.projectiles.length
  }

  /** 주인공을 바로 쫓게 한다. (포효로 불려 왔을 때) */
  alert(): void {
    if (this.state === 'idle' || this.state === 'return') this.setState('chase')
  }

  /** 보스처럼 밀리지 않고 길을 막는 거인인가 */
  get blocksPath(): boolean {
    return this.spec.poise === Infinity
  }

  /**
   * 적을 무시하고 걷는 주인공에게 밀려났다. 졸개는 옆으로 밀리며 잠깐 휘청이고 하던 공격이 끊긴다.
   * 보스는 밀리지 않는다.
   * @returns 밀려났으면 true
   */
  shove(dirX: number, dirZ: number, speed: number): boolean {
    if (!this.alive || this.blocksPath) return false
    this.knock.set(this.knock.x + dirX * speed, this.knock.y + dirZ * speed)
    if (this.state !== 'stagger') {
      this.clearTelegraph()
      this.setState('stagger')
    }
    return true
  }

  /**
   * 주인공의 공격에 맞았다.
   * @returns 실제로 깎인 생명력
   */
  takeHit(damage: number, dirX: number, dirZ: number, knockback: number): number {
    if (!this.alive) return 0
    // 막기 (E8-02): 앞에서 맞으면 피해가 준다. 맞은 방향(dir)은 주인공 → 적이라, 주인공은 그 반대쪽에 있다
    // 공격하는 동안(예고·빈틈)은 방패가 내려가 그대로 들어간다
    let frontal = false
    const guard = this.spec.guard
    const guarding = this.state !== 'windup' && this.state !== 'recover'
    if (guard && guarding && (dirX !== 0 || dirZ !== 0)) {
      const from = Math.atan2(-dirX, -dirZ)
      if (Math.abs(angleDiff(from, this.rig.root.rotation.y)) <= guard.arc) {
        frontal = true
        this.blocked += damage * (1 - guard.front)
        damage *= guard.front
      }
    }
    const dealt = this.health.damage(damage)
    this.flash = frontal ? 0.4 : 1
    if (this.health.dead) {
      this.die()
      return dealt
    }
    if (this.spec.poise !== Infinity) this.knock.set(this.knock.x + dirX * knockback, this.knock.y + dirZ * knockback)
    if (damage >= this.spec.poise && !frontal) {
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
    this.updateProjectiles(dt, world)
    this.updateFlash(dt)

    if (this.state === 'dead') {
      this.updateDeath()
      return
    }

    if (this.dash) this.updateDash(dt, world)

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
        this.health.heal(this.spec.hp * this.spec.returnRegen * dt)
        if (this.walkTo(this.home, dt, world) < 0.5) this.setState('idle')
        else if (hero.alive && distToHero < this.spec.aggroRange * 0.6) this.setState('chase')
        break
      case 'chase': {
        if (!hero.alive || distFromHome > this.spec.leashRange) {
          this.setState('return')
          break
        }
        const attack = this.chooseAttack(distToHero, world)
        if (attack) this.beginAttack(attack, world)
        else if (this.spec.keepAway && distToHero < this.spec.keepAway) this.backOff(hero, dt, world)
        else {
          const point = this.approachPoint(hero, distToHero)
          const stopAt = this.spec.keepAway ?? (point === hero ? this.radius + hero.radius + 0.3 : 0.3)
          this.walkTo(point, dt, world, stopAt)
          if (point !== hero) this.face(hero.x, hero.z)
        }
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

  /**
   * 원점이 옮겨졌다 (E19: 걸어서 이웃 땅으로 넘어감). 자리·집·가던 길·예고·던진 것을 같은 만큼 옮겨
   * 화면에서는 그대로 있게 한다.
   */
  shift(dx: number, dz: number): void {
    const p = this.rig.root.position
    p.x += dx
    p.z += dz
    this.home.x += dx
    this.home.z += dz
    this.collider.x = p.x
    this.collider.z = p.z
    this.target.x += dx
    this.target.y += dz
    this.path = this.path.map((q) => ({ x: q.x + dx, z: q.z + dz }))
    if (this.telegraph) shiftObject(this.telegraph.object, dx, dz)
    for (const wave of this.waves) {
      wave.x += dx
      wave.z += dz
      shiftObject(wave.telegraph.object, dx, dz)
    }
    for (const shot of this.projectiles) shot.shift(dx, dz)
  }

  /**
   * 이웃 땅에 남겨 둔다 (E19): 하던 공격과 날아가던 것을 거두고 그 자리에 선다. 그 땅에 다시 오면 이어서 움직인다.
   * 그동안은 update 대신 rest로 숨쉬기만 한다.
   */
  park(): void {
    if (!this.alive) return
    this.clearTelegraph()
    for (const wave of this.waves) wave.telegraph.dispose()
    this.waves.length = 0
    for (const shot of this.projectiles) shot.dispose()
    this.projectiles.length = 0
    this.dash = null
    this.knock.set(0, 0)
    if (this.state !== 'idle') this.setState('idle')
  }

  /** 이웃 땅에 남겨 둔 동안: 서서 숨쉬기만 한다 */
  rest(dt: number): void {
    this.stateTime += dt
    this.updateFlash(dt)
    if (this.alive) this.animate(dt)
  }

  /** 지운다. 예고 표시도 함께 지운다. */
  dispose(): void {
    // 지역을 옮기거나 전설에 실패해 지운 거인도 쓰러진 것으로 둔다.
    // 그래야 공격 대상·커서 대상·이름표·보스 막대가 지운 거인을 계속 붙잡지 않는다.
    this.state = 'dead'
    this.clearTelegraph()
    for (const wave of this.waves) wave.telegraph.dispose()
    this.waves.length = 0
    for (const p of this.projectiles) p.dispose()
    this.projectiles.length = 0
    this.rig.root.removeFromParent()
    // 거인마다 모양이 조금씩 달라 모델을 따로 만든다: 사라질 때 GPU에서도 내린다
    this.rig.root.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose()
    })
    this.rig.material.dispose()
    ;(this.aura?.material as THREE.Material | undefined)?.dispose()
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

  private chooseAttack(distToHero: number, world: GiantWorld): AttackSpec | null {
    // 포효는 생명력이 절반 아래로 처음 떨어졌을 때 재사용 대기와 상관없이 바로 쓴다.
    const roar = this.spec.attacks.find((a) => a.name === 'roar')
    if (roar && !this.roared && this.health.ratio <= 0.5) return roar
    const ready = this.spec.attacks.filter((a) => {
      if ((this.cooldowns.get(a) ?? 0) > 0) return false
      if (a.name === 'roar') return this.health.ratio <= 0.5
      // 부르기: 둘레에 부른 적이 이미 넉넉하면 부르지 않는다
      if (a.area.kind === 'summon' && this.nearbyKin(a.area.enemy, world) >= a.area.count * SUMMON_CROWD) return false
      return distToHero <= a.reach
    })
    if (ready.length === 0) return null
    return ready[Math.floor(Math.random() * ready.length)]!
  }

  /** 둘레(12m)에 살아 있는 그 적의 수 */
  private nearbyKin(enemy: string, world: GiantWorld): number {
    return world.giants.filter((g) => g.alive && g.spec.id === enemy && Math.hypot(g.x - this.x, g.z - this.z) < 12).length
  }

  private beginAttack(attack: AttackSpec, world: GiantWorld): void {
    this.attack = attack
    this.cooldowns.set(attack, attack.cooldown * this.cooldownScale + attack.windup)
    this.setState('windup')
    const aim = this.aim(world)
    this.target.set(aim.x, aim.z)
    this.face(aim.x, aim.z)
    const area = attack.area
    if (area.kind === 'ring') {
      this.roared = true
      world.summon(this.x, this.z, 3, this.spec.minion)
    }
    this.telegraph = new Telegraph(
      area.kind === 'sector'
        ? { kind: 'sector', radius: area.range, halfAngle: area.halfAngle }
        : area.kind === 'circle'
          ? { kind: 'circle', radius: area.radius }
          : area.kind === 'line'
            ? { kind: 'line', length: area.length, width: area.width }
            : area.kind === 'summon'
              ? { kind: 'ring', radius: 1.6, width: 0.3 }
              : { kind: 'ring', radius: area.startRadius, width: area.width },
    )
    world.effects.add(this.telegraph.object)
    this.placeTelegraph()
    world.warn?.(this.x, this.z)
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
    else if (this.attack.area.kind === 'line' || this.attack.area.kind === 'sector') this.telegraph.place(this.x, this.z, this.rig.root.rotation.y)
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
          world.hitHero(attack.damage * this.damageScale, this.x, this.z, attack.knockback)
        }
        const reach = area.range * 0.7
        world.impact(this.x + Math.sin(facing) * reach, this.z + Math.cos(facing) * reach, this.spec.role === 'boss' || this.spec.role === 'guardian' ? 0.35 : 0.12, ice)
        break
      }
      case 'circle':
        // 던지기: 날아가서 떨어질 때 친다 (예고는 떨어질 때까지 남긴다)
        if (attack.projectile) {
          const shot = new Projectile(attack, { x: this.x, z: this.z, y: this.spec.voxelSize * 22 }, { x: this.target.x, z: this.target.y }, this.telegraph)
          this.telegraph = null
          world.effects.add(shot.object)
          this.projectiles.push(shot)
          break
        }
        if (hero.alive && inCircle(this.target.x, this.target.y, area.radius, hero.x, hero.z, hero.radius)) {
          world.hitHero(attack.damage * this.damageScale, this.target.x, this.target.y, attack.knockback)
        }
        world.impact(this.target.x, this.target.y, 0.45, ice)
        break
      case 'line':
        // 돌진: 예고한 줄을 따라 달려간다 (빈틈 동안 움직인다)
        this.dash = { left: area.length, dirX: Math.sin(facing), dirZ: Math.cos(facing), hit: false, attack }
        world.impact(this.x, this.z, 0.15, ice)
        break
      case 'summon':
        world.summon(this.x, this.z, area.count, area.enemy)
        world.impact(this.x, this.z, 0.2, ice)
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
        world.hitHero(wave.attack.damage * this.damageScale, wave.x, wave.z, wave.attack.knockback)
      }
    }
  }

  /** 돌진: 줄을 따라 빠르게 달리며, 처음 닿은 주인공을 친다 */
  private updateDash(dt: number, world: GiantWorld): void {
    const dash = this.dash!
    const step = Math.min(dash.left, DASH_SPEED * dt)
    const before = { x: this.x, z: this.z }
    this.translate(dash.dirX * step, dash.dirZ * step, world)
    const moved = Math.hypot(this.x - before.x, this.z - before.z)
    dash.left -= step
    const hero = world.hero
    const area = dash.attack.area
    const width = area.kind === 'line' ? area.width : 1
    if (!dash.hit && hero.alive && inLine(before.x, before.z, this.rig.root.rotation.y, Math.max(step, 0.01) + this.radius, width, hero.x, hero.z, hero.radius)) {
      dash.hit = true
      world.hitHero(dash.attack.damage * this.damageScale, this.x, this.z, dash.attack.knockback)
    }
    this.walkCycle += dt * 14
    // 막혀서 못 가면 멈춘다
    if (dash.left <= 0 || moved < step * 0.3) this.dash = null
  }

  /** 던진 것이 날아가 떨어지면 친다 */
  private updateProjectiles(dt: number, world: GiantWorld): void {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const shot = this.projectiles[i]!
      if (!shot.update(dt)) continue
      const area = shot.attack.area
      const hero = world.hero
      if (area.kind === 'circle' && hero.alive && inCircle(shot.to.x, shot.to.z, area.radius, hero.x, hero.z, hero.radius)) {
        world.hitHero(shot.attack.damage * this.damageScale, shot.to.x, shot.to.z, shot.attack.knockback)
      }
      world.impact(shot.to.x, shot.to.z, 0.3, shot.attack.projectile?.look === 'water')
      shot.dispose()
      this.projectiles.splice(i, 1)
    }
  }

  /** 거리 유지: 주인공에게서 멀어지는 쪽으로 물러난다 */
  private backOff(hero: { x: number; z: number }, dt: number, world: GiantWorld): void {
    const dx = this.x - hero.x
    const dz = this.z - hero.z
    const len = Math.hypot(dx, dz) || 1
    const away = { x: this.x + (dx / len) * 3, z: this.z + (dz / len) * 3 }
    this.walkTo(away, dt, world)
    this.face(hero.x, hero.z)
  }

  /** 둘러싸기: 가까워지면 주인공의 정면이 아니라 자기 몫의 옆쪽으로 붙는다 (보스·원거리는 곧장) */
  private approachPoint(hero: { x: number; z: number; radius: number }, dist: number): Point2 {
    if (this.spec.role === 'boss' || this.spec.role === 'guardian' || this.spec.keepAway || dist > 6) return hero
    const toMe = Math.atan2(this.x - hero.x, this.z - hero.z)
    const want = toMe + this.flank * 0.6
    const r = this.radius + hero.radius + 0.3
    return { x: hero.x + Math.sin(want) * r, z: hero.z + Math.cos(want) * r }
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
    this.rig.material.emissive.setRGB(f, f, f).add(this.glow)
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
      const step = Math.min(len, this.spec.speed * this.speedScale * dt)
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
    next = pushOut(next, this.radius, world.staticColliders)
    for (const other of world.giants) {
      if (other === this || !other.alive) continue
      next = pushOut(next, this.radius, [other.collider])
    }
    if (world.hero.alive) next = pushOut(next, this.radius, [{ x: world.hero.x, z: world.hero.z, radius: world.hero.radius }])
    next = clampToArea(next, world.area)
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

    // 몸 종류마다 다른 움직임: 날개는 퍼덕이며 떠 있고, 혼령은 둥실거리고, 짐승·뱀은 몸을 숙인다
    const kind = this.rig.kind
    if (kind === 'flyer') {
      const flap = Math.sin(this.walkCycle * 2.2) * 0.6
      leftArm.rotation.x = 0
      rightArm.rotation.x = 0
      leftArm.rotation.z = flap
      rightArm.rotation.z = -flap
      body.position.y = Math.sin(this.walkCycle) * this.spec.voxelSize * 2
      this.walkCycle += dt * 4
    } else if (kind === 'spirit') {
      body.position.y = Math.sin(this.walkCycle * 0.8) * this.spec.voxelSize * 3
      const pulse = 1 + Math.sin(this.walkCycle * 3) * 0.05
      body.scale.set(pulse * this.size, this.size / pulse, pulse * this.size)
      this.walkCycle += dt * 2
    } else if (kind === 'serpent') {
      body.rotation.y = Math.sin(this.walkCycle * 0.7) * 0.12
      body.rotation.x = 0
      body.position.y = 0
    } else if (kind === 'beast') {
      body.rotation.x = 0
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
      case 'summon':
      case 'cast':
        body.rotation.x = (struck ? -0.35 * settle : -0.3 * ease) + tremble
        leftArm.rotation.z = -1.2 * (struck ? settle : ease)
        rightArm.rotation.z = 1.2 * (struck ? settle : ease)
        break
      case 'charge':
        // 몸을 낮추고 앞으로 숙였다가 튀어 나간다
        body.rotation.x = (struck ? 0.35 * settle : 0.45 * ease) + tremble
        body.position.y = struck ? 0 : -this.spec.voxelSize * 2 * ease
        leftArm.rotation.x = struck ? -0.8 * settle : 0.6 * ease
        rightArm.rotation.x = struck ? -0.8 * settle : 0.6 * ease
        break
      case 'throw':
        // 팔을 뒤로 크게 젖혔다가 앞으로 던진다
        rightArm.rotation.x = struck ? -0.6 * settle : -2.9 * ease
        body.rotation.x = (struck ? 0.25 * settle : -0.25 * ease) + tremble
        body.rotation.y = struck ? 0 : 0.35 * ease
        break
      case 'bite':
        // 머리(목)를 뒤로 당겼다가 문다
        body.rotation.x = (struck ? 0.3 * settle : -0.3 * ease) + tremble
        rightArm.rotation.x = struck ? 0.5 * settle : -0.6 * ease
        break
    }
  }
}

/** 장면에 따로 놓인 것(예고 등)을 땅 위에서 옮긴다 */
function shiftObject(object: THREE.Object3D, dx: number, dz: number): void {
  object.position.x += dx
  object.position.z += dz
  object.updateMatrixWorld()
}

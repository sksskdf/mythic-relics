import * as THREE from 'three'

import { Debris } from '../fx/Debris'
import { Puffs } from '../fx/Puffs'
import { Slashes } from '../fx/Slashes'
import { Snowfall } from '../fx/Snowfall'
import { Input } from '../input/Input'
import { screenToGround } from '../render/picking'
import { EFFECT_LAYER, PixelRenderer } from '../render/PixelRenderer'
import { QuarterViewCamera } from '../render/QuarterViewCamera'
import { TARGET_RENDER_HEIGHT } from '../render/resolution'
import { addSilhouette } from '../render/silhouette'
import { DamageNumbers } from '../ui/DamageNumbers'
import { Hud } from '../ui/Hud'
import { MoveMarker } from '../world/moveMarker'
import { NavGrid } from '../world/navGrid'
import { buildHeroModel } from '../world/heroModel'
import { heightAt } from '../world/terrain'
import { buildTestMap, MAP_HALF_EXTENT, type TestMap } from '../world/testMap'
import { frameDelta } from './clock'
import { Encounter, TEST_ENCOUNTER } from './Encounter'
import { HERO_RADIUS, HeroController } from './HeroController'
import { type HitReport, PlayerCombat } from './PlayerCombat'

export interface GameOptions {
  /** 저해상도 렌더링의 기준 세로 픽셀 수 */
  renderHeight?: number
  /** 화면 세로 방향에 보이는 범위 (미터) */
  viewHeight?: number
}

/** 쓰러진 뒤 되살아나기까지 걸리는 시간 (초) */
const RESPAWN_DELAY = 3
const HERO_SPAWN = { x: 0, z: 0 }
const ICE_CHIPS = [0xa8e4f5, 0xe9f4fa, 0x6cbcd9]
const SNOW_CHIPS = [0xf4f8fc, 0xdfe8f1]

/** 게임 전체를 묶는 최상위 객체. 렌더러, 장면, 카메라, 입력, 메인 루프를 가진다. */
export class Game {
  readonly scene = new THREE.Scene()
  readonly pixel: PixelRenderer
  readonly view = new QuarterViewCamera()
  readonly input: Input
  readonly hero: HeroController
  readonly combat: PlayerCombat
  readonly encounter: Encounter
  readonly hud: Hud
  frame = 0

  private lastTime = performance.now()
  private elapsed = 0
  private footstepTimer = 0
  /** 타격 순간 잠깐 멈추는 시간 (초) */
  private hitstop = 0
  private heroFlash = 0
  private deadTime = 0
  private readonly sun: THREE.DirectionalLight
  private readonly map: TestMap
  private readonly snow = new Snowfall()
  private readonly puffs = new Puffs(96)
  private readonly slashes = new Slashes()
  private readonly debris = new Debris()
  private readonly effects = new THREE.Group()
  private readonly marker = new MoveMarker()
  private readonly numbers: DamageNumbers
  private readonly cursor = new THREE.Vector3()
  private readonly scratch = new THREE.Vector3()

  constructor(
    private readonly container: HTMLElement,
    options: GameOptions = {},
  ) {
    this.pixel = new PixelRenderer(container, options.renderHeight ?? TARGET_RENDER_HEIGHT)
    this.input = new Input(this.pixel.renderer.domElement)
    if (options.viewHeight) this.view.viewHeight = options.viewHeight
    this.hud = new Hud(container)
    this.numbers = new DamageNumbers(container)

    this.scene.background = new THREE.Color(0x9fb4c8)
    this.scene.add(new THREE.HemisphereLight(0xc4d8ff, 0x4a5566, 0.85))

    this.sun = new THREE.DirectionalLight(0xffe4bd, 2.7)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    const shadowCamera = this.sun.shadow.camera
    shadowCamera.left = -18
    shadowCamera.right = 18
    shadowCamera.top = 18
    shadowCamera.bottom = -18
    shadowCamera.near = 1
    shadowCamera.far = 60
    this.sun.shadow.bias = -0.002
    this.scene.add(this.sun, this.sun.target)

    const map = buildTestMap()
    this.map = map
    this.scene.add(map.group)
    const nav = new NavGrid(MAP_HALF_EXTENT, 0.5, map.colliders, HERO_RADIUS)

    this.encounter = new Encounter(TEST_ENCOUNTER, map.colliders, MAP_HALF_EXTENT)
    this.scene.add(this.encounter.object)

    const rig = buildHeroModel()
    addSilhouette(rig.root, 0x5b7fb8)
    this.scene.add(rig.root)
    this.hero = new HeroController(
      rig,
      nav,
      () => [...map.colliders, ...this.encounter.colliders()],
      MAP_HALF_EXTENT,
    )
    this.hero.teleport(HERO_SPAWN.x, HERO_SPAWN.z)
    this.combat = new PlayerCombat(this.hero)

    for (const effect of [this.marker.object, this.snow.object, this.puffs.object, this.slashes.object]) {
      effect.traverse((o) => o.layers.set(EFFECT_LAYER))
      this.scene.add(effect)
    }
    this.scene.add(this.effects, this.debris.object)

    this.view.jumpTo(rig.root.position)
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  /** 현재 저해상도 렌더 크기 (자동 점검용) */
  get renderSize() {
    return this.pixel.size
  }

  start(): void {
    this.pixel.renderer.setAnimationLoop((now) => this.tick(now))
  }

  private tick(now: number): void {
    const realDt = frameDelta(this.lastTime, now)
    this.lastTime = now
    // 타격 순간에는 게임 시간이 잠깐 멈춘다. 카메라 흔들림과 숫자는 계속 움직인다.
    const dt = this.hitstop > 0 ? 0 : realDt
    this.hitstop = Math.max(0, this.hitstop - realDt)
    this.elapsed += dt

    const cursor = this.cursorOnGround()
    this.hero.update(dt, this.input, cursor)
    if (this.hero.lastMoveTarget) this.marker.show(this.hero.lastMoveTarget.x, this.hero.lastMoveTarget.z)
    this.marker.update(dt)

    this.combat.update(dt, this.encounter.alive, {
      onSwing: (swing, strong) => {
        this.slashes.spawn(this.hero.object.position, this.hero.facing, swing.range, swing.halfAngle, strong)
      },
      onHits: (hits) => this.onHeroHits(hits),
    })
    this.updateEnemies(dt)
    this.updateHeroState(dt)

    const position = this.hero.object.position
    this.updateEffects(dt, position)
    this.view.follow(position, realDt)
    this.followSun(position)
    this.numbers.update(realDt, this.container.clientHeight, this.pixel.size, this.view.camera)

    const boss = this.encounter.boss
    this.hud.update(
      {
        life: this.combat.health.ratio,
        divine: this.combat.divine,
        boss: boss && this.encounter.bossEngaged ? boss.health.ratio : null,
      },
      realDt,
    )

    this.pixel.render(this.scene, this.view.camera)
    this.input.endFrame()
    this.frame += 1
  }

  private updateEnemies(dt: number): void {
    const position = this.hero.object.position
    const shattered = this.encounter.update(dt, {
      hero: { x: position.x, z: position.z, radius: HERO_RADIUS, alive: this.combat.alive },
      halfExtent: MAP_HALF_EXTENT,
      staticColliders: this.map.colliders,
      effects: this.effects,
      hitHero: (damage, fromX, fromZ, knockback) => {
        const dealt = this.combat.takeHit(damage, fromX, fromZ, knockback)
        if (dealt <= 0) return
        this.heroFlash = 1
        this.hitstop = Math.max(this.hitstop, 0.05)
        this.view.shake(0.18)
        this.numbers.show(this.scratch.copy(position).setY(position.y + 2), dealt, 'hurt')
      },
      impact: (x, z, strength, ice) => {
        this.scratch.set(x, heightAt(x, z), z)
        this.puffs.burst(this.scratch, Math.round(6 + strength * 30), 1 + strength * 4)
        if (ice) this.debris.burst(this.scratch, Math.round(strength * 30), ICE_CHIPS, 0.3, 0.16)
        else this.debris.burst(this.scratch, 4, SNOW_CHIPS, 0.1, 0.1)
        this.view.shake(strength)
      },
    })
    for (const giant of shattered) {
      const king = giant.spec.king
      this.debris.burst(giant.object.position, king ? 90 : 30, giant.rig.palette, king ? 3 : 1.6, giant.spec.voxelSize * 2.2)
      this.puffs.burst(giant.object.position, king ? 30 : 12, king ? 4 : 2.2)
      this.view.shake(king ? 0.6 : 0.15)
    }
  }

  private onHeroHits(hits: HitReport[]): void {
    for (const hit of hits) {
      const { x, z, radius } = hit.target
      // 거인 키는 몸 반지름의 약 3배
      this.scratch.set(x, heightAt(x, z) + radius * 3, z)
      this.numbers.show(this.scratch, hit.damage, hit.strong ? 'strong' : 'normal')
    }
    if (hits.length === 0) return
    const strong = hits.some((h) => h.strong)
    this.hitstop = Math.max(this.hitstop, strong ? 0.09 : 0.045)
    this.view.shake(strong ? 0.14 : 0.05)
  }

  /** 맞았을 때 번쩍임, 쓰러짐과 되살아나기 */
  private updateHeroState(dt: number): void {
    this.heroFlash = Math.max(0, this.heroFlash - dt * 8)
    const f = this.heroFlash > 0.5 ? 1 : this.heroFlash
    this.hero.rig.material.emissive.setRGB(f, f * 0.35, f * 0.3)

    if (this.combat.alive) {
      this.hero.locked = false
      this.deadTime = 0
      return
    }
    if (this.deadTime === 0) this.hero.stop()
    this.hero.locked = true
    this.deadTime += dt
    // 옆으로 쓰러진다.
    const t = Math.min(1, this.deadTime / 0.45)
    const { body } = this.hero.rig
    body.rotation.z = (t * t * Math.PI) / 2.2
    body.position.y = t * 0.25
    if (this.deadTime >= RESPAWN_DELAY) {
      body.rotation.z = 0
      this.hero.teleport(HERO_SPAWN.x, HERO_SPAWN.z)
      this.combat.revive()
      this.view.jumpTo(this.hero.object.position)
    }
  }

  private updateEffects(dt: number, position: THREE.Vector3): void {
    if (this.hero.isMoving) {
      this.footstepTimer -= dt
      if (this.footstepTimer <= 0) {
        this.puffs.burst(position, 2, 0.6)
        this.footstepTimer = 0.28
      }
    }
    this.puffs.update(dt)
    this.slashes.update(dt)
    this.debris.update(dt)
    this.snow.update(dt, position, this.elapsed)
    this.map.update(this.elapsed)
  }

  /** 마우스 커서가 가리키는 땅 위치 */
  private cursorOnGround(): THREE.Vector3 | null {
    const { pointer } = this.input
    return screenToGround(pointer.x, pointer.y, this.container.clientHeight, this.pixel.size, this.view.camera, this.cursor)
  }

  /** 그림자가 보이는 범위가 주인공을 따라다니게 한다. */
  private followSun(focus: THREE.Vector3): void {
    this.sun.position.set(focus.x + 12, 20, focus.z + 6)
    this.sun.target.position.copy(focus)
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container
    const size = this.pixel.setScreenSize(width, height)
    this.view.setRenderSize(size.width, size.height)
  }
}

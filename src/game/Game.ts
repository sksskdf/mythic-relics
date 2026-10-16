import * as THREE from 'three'

import { Debris } from '../fx/Debris'
import { Lightning } from '../fx/Lightning'
import { Puffs } from '../fx/Puffs'
import { Slashes } from '../fx/Slashes'
import { Snowfall } from '../fx/Snowfall'
import { Sparks } from '../fx/Sparks'
import { Input } from '../input/Input'
import { screenRay, screenToGround } from '../render/picking'
import { EFFECT_LAYER, PixelRenderer } from '../render/PixelRenderer'
import { QuarterViewCamera } from '../render/QuarterViewCamera'
import { METERS_PER_PIXEL, TARGET_RENDER_HEIGHT } from '../render/resolution'
import { addSilhouette } from '../render/silhouette'
import { type God, godDef, relicDef, type RelicId } from '../relics/data'
import type { Giant } from '../enemies/Giant'
import { DropTable } from '../relics/DropTable'
import { Pickups } from '../relics/Pickups'
import { type SaveData, SAVE_VERSION, saveStorage } from '../save/SaveData'
import { AFFINITY_DAMAGE, ClassProgress, PER_PROMOTION } from '../progress/ClassProgress'
import type { SkillContext } from '../skills/Skill'
import { type DamageStyle, DamageNumbers } from '../ui/DamageNumbers'
import { Hud } from '../ui/Hud'
import { MoveMarker, PathLine, TargetMarker } from '../world/moveMarker'
import { NavGrid } from '../world/navGrid'
import { buildHeroModel } from '../world/heroModel'
import { heightAt } from '../world/terrain'
import { buildTestMap, MAP_HALF_EXTENT, type TestMap } from '../world/testMap'
import { frameDelta } from './clock'
import { Encounter, TEST_ENCOUNTER } from './Encounter'
import { UtgardLegend } from './Legend'
import { HERO_RADIUS, HeroController } from './HeroController'
import { HeroOrders } from './HeroOrders'
import { DoubleTapDetector } from '../input/doubleTap'
import { plowThrough } from './plow'
import { clampViewHeight, settingsStorage } from '../save/settings'
import { type CombatTarget, type HitReport, PlayerCombat } from './PlayerCombat'
import { type LoadoutChange, RelicPowers } from './RelicPowers'

export interface GameOptions {
  /** 처음부터 끼고 시작할 유물 (점검용) */
  startRelics?: readonly RelicId[]
  /** 이어 하기: 이 저장 데이터로 시작한다. */
  load?: SaveData | null
  /** 진행 상황을 브라우저 저장소에 저장한다. (점검용 실행에서는 끈다) */
  autosave?: boolean
  /** 시작 화면부터 띄운다. begin()을 부르기 전까지는 배경만 움직인다. */
  title?: boolean
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

/** 승급 전설 「우트가르드 원정」의 성소 위치와 결계 반지름 */
const SANCTUARY = { x: -24, z: -22, radius: 11 }
/** 주인공의 기본 생명력 */
const BASE_HP = 100
/** 적을 쓰러뜨렸을 때 되찾는 생명력 */
const HEAL_PER_KILL = 4
const HEAL_PER_BOSS = 30
/** 바뀐 것이 있을 때 저장하는 간격 (초) */
const AUTOSAVE_INTERVAL = 3

/** 플레이 기록: 검증과 수치 조정에 쓴다. */
export interface PlayEvent {
  /** 게임 시간 (초) */
  t: number
  type: 'relic' | 'manifest' | 'kill' | 'bossKill' | 'death' | 'legendStart' | 'legendFail' | 'promote' | 'hurt'
  detail?: string
}
/** 신위 게이지: 스킬로 맞힐 때, 쓰러뜨릴 때 차오르는 양 */
const DIVINE_PER_SKILL_HIT = 0.01
const DIVINE_PER_KILL = 0.05
/** 클래스가 발현되는 순간 주변 적을 밀어내는 범위와 피해 */
const MANIFEST_RADIUS = 4
const MANIFEST_DAMAGE = 20

/** 게임 전체를 묶는 최상위 객체. 렌더러, 장면, 카메라, 입력, 메인 루프를 가진다. */
export class Game {
  readonly scene = new THREE.Scene()
  readonly pixel: PixelRenderer
  readonly view = new QuarterViewCamera()
  readonly input: Input
  readonly hero: HeroController
  readonly combat: PlayerCombat
  readonly orders: HeroOrders
  readonly encounter: Encounter
  readonly hud: Hud
  readonly powers: RelicPowers
  readonly pickups = new Pickups()
  readonly progress = new ClassProgress()
  readonly drops = new DropTable()
  readonly legend: UtgardLegend
  readonly log: PlayEvent[] = []
  frame = 0
  /** 게임 시간 (초). 타격 순간 멈춘 시간은 빠진다. */
  time = 0
  /** 시작 화면이 떠 있는 동안은 false. 배경만 움직이고 입력과 전투는 멈춘다. */
  playing = true
  /** 개발 패널: 게임 시간 배속 (0이면 멈춤) */
  timeScale = 1

  private lastTime = performance.now()
  private elapsed = 0
  private footstepTimer = 0
  /** 타격 순간 잠깐 멈추는 시간 (초) */
  private hitstop = 0
  private heroFlash = 0
  private readonly autosave: boolean
  private dirty = false
  private saveTimer = AUTOSAVE_INTERVAL
  private deadTime = 0
  private readonly sun: THREE.DirectionalLight
  private readonly map: TestMap
  private readonly snow = new Snowfall()
  private readonly puffs = new Puffs(96)
  private readonly slashes = new Slashes()
  private readonly debris = new Debris()
  private readonly lightning = new Lightning()
  private readonly sparks = new Sparks()
  private decoy: { x: number; z: number; radius: number } | null = null
  private readonly skillContext: SkillContext
  private readonly effects = new THREE.Group()
  private readonly marker = new MoveMarker()
  /** 공격 대상 발밑의 붉은 고리 */
  private readonly targetMarker = new TargetMarker()
  /** 적을 무시하고 걷는 동안 목적지까지 긋는 점선 */
  private readonly pathLine = new PathLine()
  private readonly numbers: DamageNumbers
  private readonly cursor = new THREE.Vector3()
  private readonly scratch = new THREE.Vector3()
  private readonly lastWalk = new THREE.Vector2()
  private readonly metersPerPixel: number
  private readonly doubleTap = new DoubleTapDetector()

  constructor(
    private readonly container: HTMLElement,
    options: GameOptions = {},
  ) {
    this.pixel = new PixelRenderer(container, options.renderHeight ?? TARGET_RENDER_HEIGHT)
    this.input = new Input(this.pixel.renderer.domElement)
    // 확대·축소: 주소의 ?view= 가 있으면 그 값, 없으면 저장한 설정
    this.view.viewHeight = options.viewHeight ?? settingsStorage.load().viewHeight
    // ?res= 로 픽셀 밀도를 바꿔 볼 수 있다. 기본은 프로토타입의 밀도
    this.metersPerPixel = options.renderHeight ? 16 / options.renderHeight : METERS_PER_PIXEL
    this.pixel.setTargetHeight(this.view.viewHeight / this.metersPerPixel)
    this.pixel.renderer.domElement.addEventListener('wheel', (e) => this.onWheel(e), { passive: false })
    this.hud = new Hud(container)
    this.numbers = new DamageNumbers(container)

    this.scene.background = new THREE.Color(0x9fb4c8)
    this.scene.add(new THREE.HemisphereLight(0xc4d8ff, 0x4a5566, 0.85))

    this.sun = new THREE.DirectionalLight(0xffe4bd, 2.7)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const shadowCamera = this.sun.shadow.camera
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
      // 적을 무시하고 걸을 때는 보스만 길을 막고, 졸개는 밀고 지나간다.
      () => [...map.colliders, ...this.encounter.colliders(this.orders?.plowing ?? false)],
      MAP_HALF_EXTENT,
    )
    this.hero.teleport(HERO_SPAWN.x, HERO_SPAWN.z)
    this.combat = new PlayerCombat(this.hero)
    this.orders = new HeroOrders(this.hero, this.combat)
    this.hero.obstacles = () => this.encounter.colliders(this.orders.plowing)
    this.scene.add(this.targetMarker.object, this.pathLine.object)
    this.powers = new RelicPowers(this.effects)
    this.skillContext = {
      hero: this.hero,
      enemies: [],
      manifested: null,
      level: 0,
      fx: this.effects,
      lightning: this.lightning,
      puffs: this.puffs,
      hit: (target, damage, dirX, dirZ, knockback, style) => this.dealDamage(target, damage, dirX, dirZ, knockback, style),
      shake: (amount) => this.view.shake(amount),
      setDecoy: (decoy) => {
        this.decoy = decoy
      },
    }
    this.autosave = options.autosave ?? false
    if (options.title) {
      this.playing = false
      this.hud.root.classList.add('is-hidden')
    }
    if (options.load) this.restore(options.load)
    for (const id of options.startRelics ?? []) this.onLoadoutChange(this.powers.equip(id), false)
    this.legend = new UtgardLegend(nav.nearestFree(SANCTUARY) ?? SANCTUARY, SANCTUARY.radius)
    this.scene.add(this.legend.object)
    this.hud.onSlotClick = (slot) => this.unequip(slot)

    for (const effect of [this.marker.object, this.snow.object, this.puffs.object, this.slashes.object]) {
      effect.traverse((o) => o.layers.set(EFFECT_LAYER))
      this.scene.add(effect)
    }
    this.sparks.object.traverse((o) => o.layers.set(EFFECT_LAYER))
    this.scene.add(this.effects, this.debris.object, this.lightning.object, this.sparks.object, this.pickups.object)

    this.view.jumpTo(rig.root.position)
    this.resize()
    window.addEventListener('resize', () => this.resize())
    // 창을 닫거나 다른 탭으로 갈 때 바로 저장한다.
    const flush = () => this.saveNow()
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flush())
  }

  /** 지금 상태를 저장 데이터로 만든다. */
  snapshot(): SaveData {
    const classes: SaveData['classes'] = {}
    for (const [god, record] of this.progress.records) classes[god] = { ...record }
    return {
      version: SAVE_VERSION,
      slots: [...this.powers.loadout.slots],
      bag: [...this.powers.loadout.bag],
      ground: this.pickups.list.map((p) => ({ id: p.id, x: p.x, z: p.z })),
      classes,
      dropMisses: this.drops.misses,
      divine: this.combat.divine,
    }
  }

  /** 바뀐 것이 있으면 저장한다. */
  saveNow(): void {
    if (!this.autosave || !this.dirty) return
    this.dirty = false
    saveStorage.save(this.snapshot())
  }

  /** 저장 데이터로 이어 한다. 연출 없이 유물을 끼우고 성장 기록을 되돌린다. */
  private restore(data: SaveData): void {
    for (const [god, record] of Object.entries(data.classes) as [God, { level: number; xp: number }][]) {
      Object.assign(this.progress.record(god), record)
    }
    this.applyStats()
    this.combat.health.reset()
    data.slots.forEach((id) => id && this.onLoadoutChange(this.powers.equip(id), false))
    this.powers.loadout.bag.push(...data.bag)
    for (const item of data.ground) this.pickups.drop(item.id, item.x, item.z)
    this.drops.misses = data.dropMisses
    this.combat.divine = data.divine
  }

  /** 진행 상황이 바뀌었다. 잠시 뒤 저장한다. */
  private markDirty(): void {
    this.dirty = true
  }

  private record(type: PlayEvent['type'], detail?: string): void {
    this.log.push({ t: Math.round(this.time * 10) / 10, type, detail })
  }

  /**
   * 화면을 그리지 않고 게임 시간만 seconds초 진행한다. (자동 플레이 검증용)
   * 입력은 읽지 않으므로 주인공은 hero.moveTo로만 움직인다.
   */
  advance(seconds: number, step = 1 / 30): void {
    for (let t = 0; t < seconds; t += step) this.update(step, false)
  }

  /** 현재 저해상도 렌더 크기 (자동 점검용) */
  get renderSize() {
    return this.pixel.size
  }

  start(): void {
    this.pixel.renderer.setAnimationLoop((now) => this.tick(now))
  }

  /** 시작 화면을 닫고 플레이를 시작한다. */
  begin(): void {
    if (this.playing) return
    this.playing = true
    this.hud.root.classList.remove('is-hidden')
    this.input.endFrame()
  }

  private tick(now: number): void {
    const realDt = frameDelta(this.lastTime, now)
    this.lastTime = now
    if (!this.playing) {
      this.updateBackdrop(realDt)
      return
    }
    this.update(realDt, true)
    this.view.follow(this.hero.object.position, realDt)
    this.numbers.update(realDt, this.container.clientHeight, this.pixel.size, this.view.camera)
    this.updateHud(realDt)
    this.pixel.render(this.scene, this.view.camera)
    this.input.endFrame()
    this.frame += 1

    this.saveTimer -= realDt
    if (this.saveTimer <= 0) {
      this.saveTimer = AUTOSAVE_INTERVAL
      this.saveNow()
    }
  }

  /** 시작 화면 뒤의 배경: 눈이 내리고 불꽃이 일렁이며, 주인공은 숨만 쉰다. */
  private updateBackdrop(dt: number): void {
    this.elapsed += dt
    this.hero.update(dt)
    const position = this.hero.object.position
    this.snow.update(dt, position, this.elapsed)
    this.map.update(this.elapsed)
    this.view.follow(position, dt)
    this.followSun(position)
    this.pixel.render(this.scene, this.view.camera)
    this.input.endFrame()
    this.frame += 1
  }

  /** 게임 한 프레임. live가 false면 입력을 읽지 않는다. */
  private update(realDt: number, live: boolean): void {
    // 타격 순간에는 게임 시간이 잠깐 멈춘다. 카메라 흔들림과 숫자는 계속 움직인다.
    realDt *= this.timeScale
    const dt = this.hitstop > 0 ? 0 : realDt
    this.hitstop = Math.max(0, this.hitstop - realDt)
    this.elapsed += dt
    this.time += dt

    if (live) this.readInput()
    this.orders.update(this.encounter.alive)
    const heading = this.hero.heading
    if (this.orders.plowing && heading) {
      plowThrough(this.hero.object.position, HERO_RADIUS, heading, this.encounter.alive)
    }
    this.hero.update(dt)
    const moveTarget = this.orders.lastMoveTarget
    if (moveTarget) this.marker.show(moveTarget.x, moveTarget.z, moveTarget.forced)
    this.orders.lastMoveTarget = null
    this.marker.update(dt)
    const target = this.orders.attackTarget
    this.targetMarker.update(dt, target?.alive ? target : null)
    this.pathLine.update(this.hero.object.position, this.orders.plowing ? this.orders.destination : null)

    this.combat.update(dt, this.encounter.alive, {
      onSwing: (swing, strong) => {
        this.slashes.spawn(this.hero.object.position, this.hero.facing, swing.range, swing.halfAngle, strong)
      },
      onHits: (hits) => this.onHeroHits(hits),
    })
    this.updatePowers(dt)
    this.updateEnemies(dt)
    this.updateLegend(dt)
    this.updateHeroState(dt)

    const position = this.hero.object.position
    this.updateEffects(dt, position)
    this.followSun(position)
  }

  private updateHud(realDt: number): void {
    const boss = this.encounter.boss
    const manifested = this.powers.manifested
    this.hud.update(
      {
        life: this.combat.health.ratio,
        divine: this.combat.divine,
        boss: this.legend.boss?.alive
          ? this.legend.boss.health.ratio
          : boss && this.encounter.bossEngaged
            ? boss.health.ratio
            : null,
        slots: this.powers.hudSlots(),
        ultimate: manifested !== null,
        xp: manifested ? this.progress.xpRatio(manifested) : null,
        xpColor: manifested ? godDef(manifested).color : '',
      },
      realDt,
    )
  }

  private updateEnemies(dt: number): void {
    const position = this.hero.object.position
    const shattered = this.encounter.update(dt, {
      hero: { x: position.x, z: position.z, radius: HERO_RADIUS, alive: this.combat.alive },
      decoy: this.decoy,
      halfExtent: MAP_HALF_EXTENT,
      staticColliders: this.map.colliders,
      effects: this.effects,
      hitHero: (damage, fromX, fromZ, knockback) => {
        if (!this.combat.canBeHit) return
        const reduced = this.powers.beforeHeroHit(damage, fromX, fromZ, this.skillContext)
        const dealt = this.combat.takeHit(reduced, fromX, fromZ, knockback)
        if (dealt <= 0) return
        this.record('hurt', String(Math.round(dealt)))
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
      this.onGiantKilled(giant)
    }
  }

  /** 경험치와 유물 드랍. 경험치는 발현한 클래스에만 쌓인다. (DESIGN.md 5.2) */
  private onGiantKilled(giant: Giant): void {
    const manifested = this.powers.manifested
    if (manifested) this.progress.addXp(manifested, giant.spec.xp)
    this.record(giant.spec.boss ? 'bossKill' : 'kill', giant.spec.boss)
    // 적을 쓰러뜨리면 생명력을 조금 되찾는다. 몰려오는 무리를 쓸어 내며 버틸 수 있게 한다.
    if (this.combat.alive) this.combat.health.heal(giant.spec.boss ? HEAL_PER_BOSS : HEAL_PER_KILL)
    this.markDirty()
    const owned = new Set<RelicId>([
      ...this.powers.loadout.slots.filter((id): id is RelicId => id !== null),
      ...this.powers.loadout.bag,
      ...this.pickups.list.map((p) => p.id),
    ])
    const relic = this.drops.roll(owned, giant.spec.boss)
    if (relic) this.pickups.drop(relic, giant.x, giant.z)
  }

  /** 승급 전설: 성소에 들어서면 시작하고, 이기면 승급한다. */
  private updateLegend(dt: number): void {
    this.legend.update(dt, this.encounter, {
      ready: () => this.powers.manifested === 'thor' && this.progress.readyToPromote('thor'),
      heroAlive: () => this.combat.alive,
      heroPosition: () => this.hero.object.position,
      setArena: (arena) => {
        this.hero.arena = arena
      },
      onStart: () => {
        this.record('legendStart')
        this.hud.showBanner('우트가르드 원정', '#d8c2ff')
        this.view.shake(0.3)
      },
      onWin: () => this.promote('thor'),
      onFail: () => this.record('legendFail'),
    })
  }

  // ── 개발 패널용 ──────────────────────────────────────────

  /** 유물을 끼운다. 발현 연출도 그대로 나온다. */
  devEquip(id: RelicId): void {
    if (this.powers.loadout.has(id) || !this.powers.hasFreeSlot) return
    this.onLoadoutChange(this.powers.equip(id), true)
    this.markDirty()
  }

  /** 유물 하나를 뺀다. (땅에 내려놓지 않고 없앤다) */
  devUnequip(id: RelicId): void {
    const slot = this.powers.loadout.slots.indexOf(id)
    if (slot < 0) return
    const result = this.powers.unequip(slot)
    if (result) this.onLoadoutChange(result.change, false)
    this.markDirty()
  }

  /** 유물을 모두 뺀다. (땅에 내려놓지 않고 없앤다) */
  devUnequipAll(): void {
    this.powers.loadout.slots.forEach((id, slot) => {
      if (!id) return
      const result = this.powers.unequip(slot)
      if (result) this.onLoadoutChange(result.change, false)
    })
    this.markDirty()
  }

  /** 발현한 클래스의 경험치를 채우고 바로 승급한다. */
  devPromote(): void {
    const god = this.powers.manifested
    if (!god) return
    this.progress.addXp(god, 1e9)
    this.promote(god)
  }

  /** 클래스 성장(레벨·경험치)을 처음으로 되돌린다. */
  devResetClasses(): void {
    this.progress.records.clear()
    this.applyStats()
    this.combat.health.reset()
    this.markDirty()
  }

  devTeleport(x: number, z: number): void {
    this.orders.clear()
    this.hero.teleport(x, z)
    this.view.jumpTo(this.hero.object.position)
  }

  devRevive(): void {
    this.combat.revive()
    this.hero.rig.body.rotation.z = 0
  }

  /** 승급: 칭호가 바뀌고, 스킬이 강해지고, 친화도와 기본 능력치가 오른다. */
  private promote(god: God): void {
    if (!this.progress.promote(god)) return
    this.record('promote', this.progress.title(god))
    this.markDirty()
    this.applyStats()
    this.combat.health.reset()
    const p = this.hero.object.position
    this.hud.showBanner(this.progress.title(god), godDef(god).color)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      this.lightning.fromSky(new THREE.Vector3(p.x + Math.sin(a) * 2, p.y, p.z + Math.cos(a) * 2), 0.18)
    }
    this.lightning.fromSky(p.clone(), 0.34)
    this.puffs.burst(p, 40, 5)
    this.view.shake(0.6)
    this.hitstop = Math.max(this.hitstop, 0.2)
  }

  /** 총 승급 횟수에서 나오는 기본 능력치 (DESIGN.md 6.2) */
  private applyStats(): void {
    this.combat.health.setMax(BASE_HP + this.progress.promotions * PER_PROMOTION.maxHp)
  }

  /** 기본 공격과 스킬에 공통으로 곱하는 피해 배율 */
  private damageScale(style: DamageStyle | 'basic'): number {
    let scale = 1 + this.progress.promotions * PER_PROMOTION.damage
    const manifested = this.powers.manifested
    // 발현 패시브 (천둥의 신: 거인 특효)
    if (manifested) scale *= godDef(manifested).passive.damageScale
    if (style === 'thunder') scale *= 1 + this.progress.affinity('thunder') * AFFINITY_DAMAGE
    return scale
  }

  /** 유물 줍기, 자동 스킬, 궁극기 */
  private updatePowers(dt: number): void {
    const position = this.hero.object.position
    const ctx = this.skillContext
    ctx.enemies = this.encounter.alive
    ctx.manifested = this.powers.manifested
    ctx.level = ctx.manifested ? this.progress.level(ctx.manifested) : 0

    // 걸은 거리 (이동 연동 효과). 순간이동처럼 한 번에 크게 옮긴 것은 빼고, 밀려난 것은 걸음으로 치지 않는다.
    const step = Math.hypot(position.x - this.lastWalk.x, position.z - this.lastWalk.y)
    if (this.hero.isMoving && step < 1) this.powers.onWalk(step, ctx)
    this.lastWalk.set(position.x, position.z)

    if (this.combat.alive) {
      const picked = this.pickups.update(
        dt,
        position.x,
        position.z,
        (id) => this.powers.hasFreeSlot && !this.powers.loadout.has(id),
      )
      for (const id of picked) {
        this.hud.showToast(relicDef(id).name)
        this.record('relic', id)
        this.markDirty()
        this.onLoadoutChange(this.powers.equip(id), true)
      }
      this.powers.update(dt, ctx)
    } else {
      this.pickups.update(dt, position.x, position.z, () => false)
    }

    // 궁극기: 발현 상태에서 신위 게이지가 가득 차고, 쓸 만한 때가 오면 저절로 나간다.
    const boss = this.encounter.boss
    const bossNear = !!boss && boss.alive && Math.hypot(boss.x - position.x, boss.z - position.z) < 10
    if (
      this.combat.alive &&
      this.powers.manifested &&
      this.combat.divine >= 1 &&
      !this.powers.ultimate.active &&
      this.powers.ultimate.worthUsing(ctx, bossNear)
    ) {
      this.combat.divine = 0
      this.powers.ultimate.start(ctx)
      this.hitstop = Math.max(this.hitstop, 0.12)
    }

    // 천둥의 신 발현: 거인 특효 패시브와 몸 주변의 푸른 전기
    const thor = this.powers.manifested === 'thor'
    this.combat.damageScale = this.damageScale('basic')
    // 유물 지속 효과
    const mods = this.powers.modifiers
    this.combat.knockbackScale = mods.knockbackDealt
    this.combat.knockbackTakenScale = mods.knockbackTaken
    this.combat.damageTakenScale = mods.damageTaken
    this.hero.speedScale = mods.moveSpeed
    this.sparks.enabled = thor && this.combat.alive
  }

  /** 스킬로 적에게 피해를 준다. 발현 패시브, 피해 숫자, 신위 게이지를 함께 처리한다. */
  private dealDamage(
    target: CombatTarget,
    damage: number,
    dirX: number,
    dirZ: number,
    knockback: number,
    style: DamageStyle,
  ): void {
    if (!target.alive) return
    const scale = this.damageScale(style)
    const dealt = target.takeHit(damage * scale, dirX, dirZ, knockback * this.powers.modifiers.knockbackDealt)
    if (dealt > 0 && !target.alive) this.powers.onKill(target, this.skillContext)
    if (dealt <= 0) return
    this.scratch.set(target.x, heightAt(target.x, target.z) + target.radius * 3, target.z)
    this.numbers.show(this.scratch, dealt, style)
    this.combat.addDivine(DIVINE_PER_SKILL_HIT + (target.alive ? 0 : DIVINE_PER_KILL))
  }

  /** 유물 칸을 눌러 유물을 빼면 발밑에 내려놓는다. */
  private unequip(slot: number): void {
    const result = this.powers.unequip(slot)
    if (!result) return
    this.markDirty()
    const p = this.hero.object.position
    this.pickups.drop(result.relic, p.x, p.z, false)
    this.onLoadoutChange(result.change, true)
  }

  /** 발현이 새로 일어나거나 풀렸을 때의 연출 */
  private onLoadoutChange(change: LoadoutChange | null, announce: boolean): void {
    if (!change) return
    const { before, after } = change
    if (before.manifested !== after.manifested && !after.manifested) this.decoy = null
    if (!after.manifested || before.manifested === after.manifested) return
    if (!announce) return
    this.record('manifest', after.manifested)
    const god = godDef(after.manifested)
    this.hud.showBanner(this.progress.title(god.id), god.color)
    // 하늘에서 번개가 주인공에게 내리꽂히고, 주변 적을 밀어낸다.
    const p = this.hero.object.position
    this.lightning.fromSky(p.clone(), 0.32)
    this.puffs.burst(p, 30, 4)
    this.view.shake(0.5)
    this.hitstop = Math.max(this.hitstop, 0.15)
    for (const enemy of this.encounter.alive) {
      const dx = enemy.x - p.x
      const dz = enemy.z - p.z
      const dist = Math.hypot(dx, dz)
      if (dist - enemy.radius > MANIFEST_RADIUS) continue
      this.dealDamage(enemy, MANIFEST_DAMAGE, dx / (dist || 1), dz / (dist || 1), 12, 'thunder')
    }
  }

  private onHeroHits(hits: HitReport[]): void {
    for (const hit of hits) {
      const { x, z, radius } = hit.target
      // 거인 키는 몸 반지름의 약 3배
      this.scratch.set(x, heightAt(x, z) + radius * 3, z)
      this.numbers.show(this.scratch, hit.damage, hit.strong ? 'strong' : 'normal')
      if (!hit.target.alive) {
        this.combat.addDivine(DIVINE_PER_KILL)
        this.powers.onKill(hit.target, this.skillContext)
      }
    }
    if (hits.length === 0) return
    this.powers.onBasicHit(
      { targets: hits.map((h) => h.target), comboIndex: Math.max(0, this.combat.combo.index), comboLength: this.combat.combo.swings.length, finisher: hits[0]!.strong },
      this.skillContext,
    )
    // 발현 패시브: 처음 맞은 적에게 번개가 함께 떨어지고(천둥의 신), 레벨이 차면 옮겨 붙는다(천둥군주).
    const first = hits[0]!.target
    const manifested = this.powers.manifested
    const passive = manifested ? godDef(manifested).passive : null
    if (manifested && passive?.basicLightning && first.alive) {
      const finisher = hits[0]!.strong
      const p = this.hero.object.position
      const from = new THREE.Vector3(p.x, p.y + 1.6, p.z)
      this.lightning.strike(from, new THREE.Vector3(first.x, p.y + 0.8, first.z), 0.08, 0.12)
      const dx = first.x - p.x
      const dz = first.z - p.z
      const len = Math.hypot(dx, dz) || 1
      const bolt = passive.basicLightning
      this.dealDamage(first, finisher ? bolt.finisherDamage : bolt.damage, dx / len, dz / len, 0, 'thunder')
      const chain = passive.chainLightning
      if (chain && this.progress.level(manifested) >= chain.minLevel) {
        this.chainLightning(first, finisher ? chain.finisherDamage : chain.damage, chain.jumps, chain.range)
      }
    }
    const strong = hits.some((h) => h.strong)
    this.hitstop = Math.max(this.hitstop, strong ? 0.09 : 0.045)
    this.view.shake(strong ? 0.14 : 0.05)
  }

  /** 연쇄 번개 (천둥군주): 번개가 가까운 적에게 차례로 옮겨 붙는다. */
  private chainLightning(from: CombatTarget, damage: number, jumps: number, range: number): void {
    const struck = new Set<CombatTarget>([from])
    let current = from
    for (let i = 0; i < jumps; i++) {
      let next: CombatTarget | null = null
      let best = range
      for (const enemy of this.encounter.alive) {
        if (struck.has(enemy)) continue
        const dist = Math.hypot(enemy.x - current.x, enemy.z - current.z)
        if (dist < best) {
          best = dist
          next = enemy
        }
      }
      if (!next) return
      const y = heightAt(current.x, current.z) + 1
      this.lightning.strike(
        new THREE.Vector3(current.x, y, current.z),
        new THREE.Vector3(next.x, heightAt(next.x, next.z) + 1, next.z),
        0.07,
        0.14,
      )
      const dx = next.x - current.x
      const dz = next.z - current.z
      this.dealDamage(next, damage, dx / (best || 1), dz / (best || 1), 1, 'thunder')
      struck.add(next)
      current = next
    }
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
    if (this.deadTime === 0) {
      this.orders.clear()
      this.hero.stop()
      this.record('death')
    }
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
      this.decoy = null
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
    this.lightning.update(dt)
    this.sparks.update(dt, position)
    this.slashes.update(dt)
    this.debris.update(dt)
    this.snow.update(dt, position, this.elapsed)
    this.map.update(this.elapsed)
  }

  /** 마우스 커서가 가리키는 땅 위치 */
  /** 클릭을 지시로 바꾼다. 커서 아래에 적이 있으면 공격, 없으면 이동 */
  private readInput(): void {
    const cursor = this.cursorOnGround()
    const ground = cursor ? { x: cursor.x, z: cursor.z } : null
    if (this.input.wasPressed('move')) {
      const { pointer } = this.input
      const double = this.doubleTap.press(performance.now() / 1000, pointer.x, pointer.y)
      this.orders.press(ground, this.enemyUnderCursor(), double)
    }
    else if (this.input.isDown('move')) this.orders.hold(ground)
    else this.orders.release()
  }

  /** 커서 아래의 적. 거인 몸통(세로 기둥)과 광선이 가장 가까운 적을 고른다. */
  private enemyUnderCursor(): Giant | null {
    const { pointer } = this.input
    const ray = screenRay(pointer.x, pointer.y, this.container.clientHeight, this.pixel.size, this.view.camera)
    const bottom = new THREE.Vector3()
    const top = new THREE.Vector3()
    let best: Giant | null = null
    let bestDist = Infinity
    for (const giant of this.encounter.alive) {
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

  private cursorOnGround(): THREE.Vector3 | null {
    const { pointer } = this.input
    return screenToGround(pointer.x, pointer.y, this.container.clientHeight, this.pixel.size, this.view.camera, this.cursor)
  }

  /** 그림자가 보이는 범위가 주인공을 따라다니게 한다. */
  private followSun(focus: THREE.Vector3): void {
    this.sun.position.set(focus.x + 12, 20, focus.z + 6)
    this.sun.target.position.copy(focus)
  }

  /** 마우스 휠로 확대·축소한다. 설정에 저장되어 다시 켜도 유지된다. */
  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    const next = clampViewHeight(this.view.viewHeight * (e.deltaY > 0 ? 1.1 : 1 / 1.1))
    if (next === this.view.viewHeight) return
    this.setViewHeight(next)
    settingsStorage.save({ viewHeight: next })
  }

  /** 확대·축소. 그림자가 그려지는 범위도 보이는 범위에 맞춘다. */
  setViewHeight(viewHeight: number): void {
    const next = clampViewHeight(viewHeight)
    // 보이는 범위가 넓어지면 렌더 해상도도 같이 늘려 픽셀 하나의 크기(밀도)를 지킨다.
    this.pixel.setTargetHeight(next / this.metersPerPixel)
    this.view.viewHeight = next
    this.resize()
    this.view.setViewHeight(next)
  }

  private fitShadow(): void {
    const half = this.view.viewHeight * 1.15
    const shadowCamera = this.sun.shadow.camera
    shadowCamera.left = -half
    shadowCamera.right = half
    shadowCamera.top = half
    shadowCamera.bottom = -half
    shadowCamera.updateProjectionMatrix()
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container
    const size = this.pixel.setScreenSize(width, height)
    this.view.setRenderSize(size.width, size.height)
    this.fitShadow()
  }
}

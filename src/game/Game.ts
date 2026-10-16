import * as THREE from 'three'

import { Input } from '../input/Input'
import { PixelRenderer } from '../render/PixelRenderer'
import { QuarterViewCamera } from '../render/QuarterViewCamera'
import { METERS_PER_PIXEL, TARGET_RENDER_HEIGHT } from '../render/resolution'
import { addSilhouette } from '../render/silhouette'
import { godDef, type RelicId } from '../relics/data'
import { DropTable } from '../relics/DropTable'
import { Pickups } from '../relics/Pickups'
import type { SaveData } from '../save/SaveData'
import { ClassProgress } from '../progress/ClassProgress'
import type { SkillContext } from '../skills/Skill'
import { DamageNumbers } from '../ui/DamageNumbers'
import { Hud } from '../ui/Hud'
import { NavGrid } from '../world/navGrid'
import { buildHeroModel } from '../world/heroModel'
import { MAP_HALF_EXTENT } from '../world/testMap'
import { clampViewHeight, settingsStorage } from '../save/settings'
import { frameDelta } from './clock'
import { Feel, type GameContext } from './context'
import { Encounter, TEST_ENCOUNTER } from './Encounter'
import { EventBus, type GameEvents } from './events'
import { UtgardLegend } from './Legend'
import { HERO_RADIUS, HeroController } from './HeroController'
import { HeroOrders } from './HeroOrders'
import { plowThrough } from './plow'
import { PlayerCombat } from './PlayerCombat'
import { RelicPowers } from './RelicPowers'
import { Stage } from './Stage'
import { DamageSystem } from './systems/Damage'
import { Effects } from './systems/Effects'
import { HERO_SPAWN, HeroLife } from './systems/HeroLife'
import { Persistence } from './systems/Persistence'
import { PlayerInput } from './systems/PlayerInput'
import { ProgressionSystem } from './systems/Progression'
import { RelicSystem } from './systems/Relics'

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

/** 승급 전설 「우트가르드 원정」의 성소 위치와 결계 반지름 */
const SANCTUARY = { x: -24, z: -22, radius: 11 }

/** 플레이 기록: 검증과 수치 조정에 쓴다. */
export interface PlayEvent {
  /** 게임 시간 (초) */
  t: number
  type: 'relic' | 'manifest' | 'kill' | 'bossKill' | 'death' | 'legendStart' | 'legendFail' | 'promote' | 'hurt'
  detail?: string
}

/**
 * 게임 전체를 묶는 최상위 객체. 렌더러, 장면, 카메라, 메인 루프를 갖고 시스템들을 차례로 돌린다.
 * 규칙은 systems/ 아래의 시스템에 있고, 시스템끼리는 이벤트 버스(bus)로만 주고받는다.
 */
export class Game {
  readonly scene = new THREE.Scene()
  readonly pixel: PixelRenderer
  readonly view = new QuarterViewCamera()
  readonly input: Input
  readonly bus = new EventBus<GameEvents>()
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

  private readonly ctx: GameContext
  private readonly stage: Stage
  private readonly fx = new Effects()
  private readonly feel = new Feel()
  private readonly numbers: DamageNumbers
  private readonly damage: DamageSystem
  private readonly relics: RelicSystem
  private readonly growth: ProgressionSystem
  private readonly life: HeroLife
  private readonly persistence: Persistence
  private readonly playerInput: PlayerInput
  private readonly metersPerPixel: number
  private lastTime = performance.now()
  private elapsed = 0

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

    this.stage = new Stage(this.scene)
    const map = this.stage.map
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
    this.powers = new RelicPowers(this.fx.skills)
    this.legend = new UtgardLegend(nav.nearestFree(SANCTUARY) ?? SANCTUARY, SANCTUARY.radius)
    this.scene.add(this.legend.object, this.pickups.object)
    this.fx.addTo(this.scene)

    const skills: SkillContext = {
      hero: this.hero,
      enemies: [],
      manifested: null,
      level: 0,
      fx: this.fx.skills,
      lightning: this.fx.lightning,
      puffs: this.fx.puffs,
      hit: (target, damage, dirX, dirZ, knockback, style) => this.damage.deal(target, damage, dirX, dirZ, knockback, style),
      shake: (amount) => this.view.shake(amount),
      setDecoy: (decoy) => {
        this.relics.decoy = decoy
      },
    }
    this.ctx = {
      bus: this.bus,
      scene: this.scene,
      view: this.view,
      hud: this.hud,
      numbers: this.numbers,
      fx: this.fx,
      feel: this.feel,
      map,
      hero: this.hero,
      combat: this.combat,
      orders: this.orders,
      encounter: this.encounter,
      legend: this.legend,
      powers: this.powers,
      pickups: this.pickups,
      progress: this.progress,
      drops: this.drops,
      skills,
    }
    this.damage = new DamageSystem(this.ctx)
    this.relics = new RelicSystem(this.ctx)
    this.growth = new ProgressionSystem(this.ctx)
    this.life = new HeroLife(this.ctx)
    this.persistence = new Persistence(this.ctx, options.autosave ?? false)
    this.playerInput = new PlayerInput(this.ctx, this.input, this.pixel, container)
    this.recordPlay()

    if (options.title) {
      this.playing = false
      this.hud.root.classList.add('is-hidden')
    }
    if (options.load) {
      this.persistence.restore(options.load, {
        equip: (id) => this.relics.equip(id, false),
        applyStats: () => this.growth.applyStats(),
      })
    }
    for (const id of options.startRelics ?? []) this.relics.equip(id, false)

    this.view.jumpTo(rig.root.position)
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  /** 사건을 플레이 기록으로 남긴다. (봇 검증과 수치 조정용) */
  private recordPlay(): void {
    const record = (type: PlayEvent['type'], detail?: string) => this.log.push({ t: Math.round(this.time * 10) / 10, type, detail })
    const { bus } = this
    bus.on('relicPicked', ({ id }) => record('relic', id))
    bus.on('manifested', ({ god }) => record('manifest', god))
    bus.on('giantKilled', ({ giant }) => record(giant.spec.boss ? 'bossKill' : 'kill', giant.spec.boss))
    bus.on('heroHurt', ({ damage }) => record('hurt', String(Math.round(damage))))
    bus.on('heroDied', () => record('death'))
    bus.on('legendStarted', () => record('legendStart'))
    bus.on('legendFailed', () => record('legendFail'))
    bus.on('promoted', ({ title }) => record('promote', title))
  }

  /** 지금 상태를 저장 데이터로 만든다. */
  snapshot(): SaveData {
    return this.persistence.snapshot()
  }

  /** 바뀐 것이 있으면 저장한다. */
  saveNow(): void {
    this.persistence.saveNow()
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
    this.persistence.update(realDt)
  }

  /** 시작 화면 뒤의 배경: 눈이 내리고 불꽃이 일렁이며, 주인공은 숨만 쉰다. */
  private updateBackdrop(dt: number): void {
    this.elapsed += dt
    this.hero.update(dt)
    const position = this.hero.object.position
    this.fx.snow.update(dt, position, this.elapsed)
    this.stage.update(this.elapsed)
    this.view.follow(position, dt)
    this.stage.follow(position)
    this.pixel.render(this.scene, this.view.camera)
    this.input.endFrame()
    this.frame += 1
  }

  /** 게임 한 프레임. live가 false면 입력을 읽지 않는다. */
  private update(realDt: number, live: boolean): void {
    // 타격 순간에는 게임 시간이 잠깐 멈춘다. 카메라 흔들림과 숫자는 계속 움직인다.
    realDt *= this.timeScale
    const dt = this.feel.hitstop > 0 ? 0 : realDt
    this.feel.hitstop = Math.max(0, this.feel.hitstop - realDt)
    this.elapsed += dt
    this.time += dt

    // 이동: 클릭 → 지시 → 걷기 (적을 무시한 이동이면 졸개를 밀고 지나간다)
    if (live) this.playerInput.update()
    this.orders.update(this.encounter.alive)
    const heading = this.hero.heading
    if (this.orders.plowing && heading) plowThrough(this.hero.object.position, HERO_RADIUS, heading, this.encounter.alive)
    this.hero.update(dt)
    this.fx.updateMarkers(dt, this.hero, this.orders)

    // 전투: 자동 공격 → 유물 → 적 → 성장 → 생사
    this.combat.update(dt, this.encounter.alive, {
      onSwing: (swing, strong) => this.fx.slashes.spawn(this.hero.object.position, this.hero.facing, swing.range, swing.halfAngle, strong),
      onHits: (hits) => this.damage.onHeroHits(hits),
    })
    this.relics.update(dt)
    this.combat.damageScale = this.damage.scale('basic')
    this.updateEnemies(dt)
    this.growth.update(dt)
    this.life.update(dt)

    const position = this.hero.object.position
    this.fx.update(dt, this.hero, this.elapsed)
    this.stage.update(this.elapsed)
    this.stage.follow(position)
  }

  private updateEnemies(dt: number): void {
    const position = this.hero.object.position
    const shattered = this.encounter.update(dt, {
      hero: { x: position.x, z: position.z, radius: HERO_RADIUS, alive: this.combat.alive },
      decoy: this.relics.decoy,
      halfExtent: MAP_HALF_EXTENT,
      staticColliders: this.stage.map.colliders,
      effects: this.fx.skills,
      hitHero: (damage, fromX, fromZ, knockback) => this.damage.hitHero(damage, fromX, fromZ, knockback),
      impact: (x, z, strength, ice) => {
        this.fx.impact(x, z, strength, ice)
        this.view.shake(strength)
      },
    })
    for (const giant of shattered) {
      this.fx.shatter(giant)
      this.view.shake(giant.spec.king ? 0.6 : 0.15)
      this.bus.emit('giantKilled', { giant })
    }
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

  // ── 개발 패널용 ──────────────────────────────────────────

  /** 유물을 끼운다. 발현 연출도 그대로 나온다. */
  devEquip(id: RelicId): void {
    if (this.powers.loadout.has(id) || !this.powers.hasFreeSlot) return
    this.relics.equip(id, true)
    this.bus.emit('progressChanged', {})
  }

  /** 유물 하나를 뺀다. (땅에 내려놓지 않고 없앤다) */
  devUnequip(id: RelicId): void {
    const slot = this.powers.loadout.slots.indexOf(id)
    if (slot >= 0) this.relics.unequip(slot, false)
  }

  /** 유물을 모두 뺀다. (땅에 내려놓지 않고 없앤다) */
  devUnequipAll(): void {
    this.powers.loadout.slots.forEach((id, slot) => id && this.relics.unequip(slot, false))
  }

  /** 발현한 클래스의 경험치를 채우고 바로 승급한다. */
  devPromote(): void {
    const god = this.powers.manifested
    if (!god) return
    this.progress.addXp(god, 1e9)
    this.growth.promote(god)
  }

  /** 클래스 성장(레벨·경험치)을 처음으로 되돌린다. */
  devResetClasses(): void {
    this.growth.reset()
  }

  devTeleport(x: number, z: number): void {
    this.orders.clear()
    this.hero.teleport(x, z)
    this.view.jumpTo(this.hero.object.position)
  }

  devRevive(): void {
    this.life.revive()
  }

  // ── 화면 ──────────────────────────────────────────

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

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container
    const size = this.pixel.setScreenSize(width, height)
    this.view.setRenderSize(size.width, size.height)
    this.stage.fitShadow(this.view.viewHeight)
  }
}

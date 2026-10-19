import * as THREE from 'three'

import { AudioEngine } from '../audio/AudioEngine'
import type { SwingSpec } from '../combat/combo'
import { Input } from '../input/Input'
import { PixelRenderer } from '../render/PixelRenderer'
import { QuarterViewCamera } from '../render/QuarterViewCamera'
import { renderHeightFor, TARGET_RENDER_HEIGHT } from '../render/resolution'
import { arrivalSpot, REGIONS, type RegionDef, START_REGION } from '../data/regions'
import { THEMES } from '../world/themes'
import { godDef, relicDef, type RelicId } from '../relics/data'
import { Wardrobe } from '../looks/outfit'
import { DropTable } from '../relics/DropTable'
import { itemUnderPointer } from '../relics/hover'
import { PICKUP_TOP } from '../relics/Pickups'
import { worldToScreen } from '../render/picking'
import { heightAt } from '../world/terrain'
import { Pickups } from '../relics/Pickups'
import type { SaveData } from '../save/SaveData'
import { ClassProgress } from '../progress/ClassProgress'
import { levelGains } from '../progress/levelGains'
import type { SkillContext } from '../skills/Skill'
import { DamageNumbers } from '../ui/DamageNumbers'
import { Hud } from '../ui/Hud'
import { GameMenu, type HeroStats } from '../ui/GameMenu'
import { PauseMenu } from '../ui/PauseMenu'
import type { RelicCardContext } from '../ui/relicCard'
import { RelicTooltip } from '../ui/RelicTooltip'
import { NavGrid } from '../world/navGrid'
import { buildHeroModel } from '../world/heroModel'
import type { BodyLook } from '../looks/body'
import { Cycle } from '../progress/Cycle'
import { TITLE_REQUEST } from '../save/SaveData'
import { clampViewHeight, RENDER_SCALE, type RenderQuality, type Settings, settingsStorage } from '../save/settings'
import { frameDelta } from './clock'
import { Feel, type GameContext } from './context'
import { Encounter } from './Encounter'
import { Villagers } from './Villagers'
import { Minimap } from '../ui/Minimap'
import { realmSigil } from '../ui/sigils'
import { realmInk } from '../art/palette'
import { EventBus, type GameEvents } from './events'
import { UtgardLegend } from './Legend'
import { HERO_RADIUS, HeroController } from './HeroController'
import { HeroOrders } from './HeroOrders'
import { plowThrough } from './plow'
import { type CombatTarget, PlayerCombat } from './PlayerCombat'
import { RelicPowers } from './RelicPowers'
import { Stage } from './Stage'
import { AppearanceSystem } from './systems/Appearance'
import { CycleSystem } from './systems/CycleSystem'
import { DamageSystem } from './systems/Damage'
import { Effects } from './systems/Effects'
import { HeroLife } from './systems/HeroLife'
import { Persistence } from './systems/Persistence'
import { PlayerInput } from './systems/PlayerInput'
import { ProgressionSystem } from './systems/Progression'
import { SoundSystem } from './systems/Sound'
import { RelicSystem } from './systems/Relics'

export interface GameOptions {
  /** 처음부터 끼고 시작할 유물 (점검용) */
  startRelics?: readonly RelicId[]
  /** 저장 데이터가 있으면 거기서 이어서 시작한다. */
  load?: SaveData | null
  /** 진행 상황을 브라우저 저장소에 저장한다. (점검용 실행에서는 끈다) */
  autosave?: boolean
  /** 시작 화면부터 띄운다. begin()을 부르기 전까지는 배경만 움직인다. */
  title?: boolean
  /** 저해상도 렌더링의 기준 세로 픽셀 수 */
  renderHeight?: number
  /** 화면 세로 방향에 보이는 범위 (미터) */
  viewHeight?: number
  /** 이 지역에서 시작한다 (점검용 ?region=, 저장한 지역) */
  region?: string
  /** 화질을 이것으로 (점검용 ?quality=, 설정에 저장하지 않는다) */
  quality?: RenderQuality
}

/** 출구를 밟았다고 보는 거리 (m), 암전 시간 (초, 어두워지는 데 한 번·밝아지는 데 한 번) */
const EXIT_RADIUS = 1.6
const TRAVEL_FADE = 0.35

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
  readonly wardrobe = new Wardrobe()
  /** 순환 성장 (E4.5) */
  readonly cycle = new Cycle()
  readonly legend: UtgardLegend
  /** 주인공 길찾기 격자 */
  readonly nav: NavGrid
  readonly log: PlayEvent[] = []
  frame = 0
  /** 게임 시간 (초). 타격 순간 멈춘 시간은 빠진다. */
  time = 0
  /** 시작 화면이 떠 있는 동안은 false. 배경만 움직이고 입력과 전투는 멈춘다. */
  playing = true
  /** 개발 패널: 게임 시간 배속 (0이면 멈춤) */
  timeScale = 1
  /** 갈 수 있는 지역들 (지도 편집기가 고친 것이면 그것으로 바뀐다) */
  regions: Readonly<Record<string, RegionDef>> = REGIONS
  /** 출구를 밟으면 넘어가는가: 들어온 직후에는 출구에서 몇 걸음 떨어져야 다시 켜진다 */
  private exitArmed = false
  /** 지역을 넘어가는 중 (암전 → 다시 짓기 → 밝아짐) */
  private travel: { to: RegionDef; at: { x: number; z: number }; t: number; switched: boolean } | null = null
  private readonly fade: HTMLElement
  /** 마을 사람 (E7-04) */
  readonly villagers: Villagers
  /** 작은 지도 (E7-08) */
  readonly minimap: Minimap
  /** 개발 패널의 지도 편집기 (E7-01). 켜 있으면 땅을 누르는 것이 이동 대신 편집이 된다 */
  mapEditor: { active: boolean; update(cursor: { x: number; z: number } | null, pressed: boolean): void } | null = null

  private readonly ctx: GameContext
  private readonly stage: Stage
  private readonly fx = new Effects()
  private readonly feel = new Feel()
  private readonly numbers: DamageNumbers
  private readonly damage: DamageSystem
  /** 외형: 장착에 따른 모습, 외형 보관함 */
  readonly appearance: AppearanceSystem
  readonly cycleSystem: CycleSystem
  /** 외형 보관함 화면 */
  /** 정보 화면 (유물·클래스·외형). 열려 있는 동안 게임이 멈춘다 */
  readonly menu: GameMenu
  /** 일시 정지 메뉴와 설정 (E5) */
  readonly pauseMenu: PauseMenu
  /** 소리 (E5) */
  readonly audio: AudioEngine
  private readonly sound: SoundSystem
  private settings: Settings
  private readonly tooltip: RelicTooltip
  /** 지금 떠 있는 카드가 땅의 유물 카드인가 */
  private groundTooltip = false
  /** 가방까지 합쳐 발현할 수 있다고 이미 알린 신 */
  private hintedGod: string | null = null
  /** 커서를 올린 HUD 유물 칸 (카드를 그 위에 띄운다) */
  private hoveredSlot: { slot: number; x: number; y: number } | null = null
  private readonly relics: RelicSystem
  private readonly growth: ProgressionSystem
  private readonly life: HeroLife
  private readonly persistence: Persistence
  private readonly playerInput: PlayerInput
  /** 가장 크게 확대했을 때(시야 12m)의 렌더 세로 픽셀 수. ?res= 로 바꿔 볼 수 있고, 설정의 해상도를 곱한다 */
  private baseRenderHeight: number
  /** ?res= 로 정한 기준 (없으면 기본값) */
  private readonly requestedRenderHeight: number
  private lastTime = performance.now()
  /** 시작 화면 뒤에서 카메라가 바라보는 곳 */
  private readonly backdropFocus = new THREE.Vector3()
  private elapsed = 0

  constructor(
    private readonly container: HTMLElement,
    options: GameOptions = {},
  ) {
    this.settings = settingsStorage.load()
    if (options.quality) this.settings = { ...this.settings, quality: options.quality }
    // ?res= 로 픽셀 밀도를 바꿔 볼 수 있다. 기본은 프로토타입의 밀도에 설정의 해상도를 곱한다
    this.requestedRenderHeight = options.renderHeight ?? TARGET_RENDER_HEIGHT
    this.baseRenderHeight = options.renderHeight ?? Math.round(TARGET_RENDER_HEIGHT * RENDER_SCALE[this.settings.quality])
    this.pixel = new PixelRenderer(container, this.baseRenderHeight)
    this.input = new Input(this.pixel.renderer.domElement)
    // 확대·축소: 주소의 ?view= 가 있으면 그 값, 없으면 저장한 설정
    this.view.viewHeight = options.viewHeight ?? this.settings.viewHeight
    this.pixel.setTargetHeight(renderHeightFor(this.view.viewHeight, this.baseRenderHeight))
    this.pixel.renderer.domElement.addEventListener('wheel', (e) => this.onWheel(e), { passive: false })
    this.hud = new Hud(container)
    this.fade = document.createElement('div')
    this.fade.className = 'region-fade'
    container.append(this.fade)
    this.villagers = new Villagers(container)
    this.scene.add(this.villagers.object)
    this.minimap = new Minimap(this.hud.root)
    this.numbers = new DamageNumbers(container)

    // 지역 (E7): 저장한 지역이 없으면 첫 지역에서 시작한다
    const region = REGIONS[options.region ?? options.load?.region?.id ?? START_REGION] ?? REGIONS[START_REGION]!
    this.stage = new Stage(this.scene, region)
    const map = this.stage.map
    const nav = new NavGrid(region.halfExtent, 0.5, map.colliders, HERO_RADIUS)
    this.nav = nav
    this.encounter = new Encounter(region, map.colliders, region.halfExtent)
    if (region.realm) this.drops.realm = region.realm
    this.scene.add(this.encounter.object)
    const particles = THEMES[region.theme].particles
    this.fx.snow.setStyle(particles.kind, particles.color)
    this.villagers.load(region.npcs)
    this.minimap.setRegion(region)

    const rig = buildHeroModel()
    rig.setSilhouette(0x5b7fb8)
    this.scene.add(rig.root)
    this.hero = new HeroController(
      rig,
      nav,
      // 적을 무시하고 걸을 때는 보스만 길을 막고, 졸개는 밀고 지나간다.
      () => [...map.colliders, ...this.encounter.colliders(this.orders?.plowing ?? false)],
      region.halfExtent,
    )
    this.hero.teleport(region.spawn.x, region.spawn.z)
    this.combat = new PlayerCombat(this.hero)
    this.orders = new HeroOrders(this.hero, this.combat)
    this.hero.obstacles = () => this.encounter.colliders(this.orders.plowing)
    this.powers = new RelicPowers(this.fx.skills)
    this.legend = new UtgardLegend({ x: 0, z: 0 }, 11)
    this.legend.moveTo(region.sanctuary && (nav.nearestFree(region.sanctuary) ?? region.sanctuary), region.sanctuary?.radius)
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
      slashes: this.fx.slashes,
      shots: this.fx.shots,
      flash: (at, color, strength) => this.fx.power.burst(at, color, strength),
      heal: (amount) => this.combat.health.heal(amount),
      heroHp: () => this.combat.health.ratio,
      hit: (target, damage, dirX, dirZ, knockback, style) => this.damage.deal(target, damage, dirX, dirZ, knockback, style),
      shake: (amount) => this.view.shake(amount),
      sound: (cue, x, z) => this.bus.emit('sound', { cue, x, z }),
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
      wardrobe: this.wardrobe,
      cycle: this.cycle,
      skills,
    }
    this.damage = new DamageSystem(this.ctx)
    this.relics = new RelicSystem(this.ctx)
    this.appearance = new AppearanceSystem(this.ctx)
    this.cycleSystem = new CycleSystem(this.ctx)
    const appearance = this.appearance
    const relics = this.relics
    const powers = this.powers
    const cycleSystem = this.cycleSystem
    this.menu = new GameMenu(this.hud.root, {
      get slots() {
        return powers.loadout.slots
      },
      get bag() {
        return powers.loadout.bag
      },
      get loadout() {
        return powers.state
      },
      preview: (slot, id) => powers.loadout.preview(slot, id),
      wield: (id, slot) => relics.wield(id, slot),
      stow: (slot) => relics.stow(slot),
      drop: (slot) => relics.unequip(slot, true),
      progress: this.progress,
      cardContext: (id, preview) => this.cardContext(id, preview),
      stats: () => this.heroStats(),
      toTitle: () => this.toTitle(),
      openSettings: () => {
        this.menu.toggle(false)
        this.pauseMenu.show(true)
      },
      cycle: {
        state: this.cycle,
        train: (source, count) => cycleSystem.train(source, count),
        rebirth: (challenge) => cycleSystem.rebirth(challenge),
        lightStar: (id) => cycleSystem.lightStar(id),
        chooseLaw: (id) => cycleSystem.chooseLaw(id),
        summonDoom: () => cycleSystem.summonDoom(),
        get doomActive() {
          return cycleSystem.doomActive
        },
      },
      wardrobe: {
        wardrobe: this.wardrobe,
        get autoOutfit() {
          return appearance.auto
        },
        choose: (slot, choice) => appearance.choose(slot, choice),
      },
    })
    const onToggle = (open: boolean) => {
      this.tooltip.hide()
      this.hoveredSlot = null
      // 창을 여닫는 클릭이 이동 지시로 새지 않게 입력을 비운다.
      this.input.endFrame()
      if (!open) this.orders.release()
      this.audio.play(open ? 'uiOpen' : 'uiClose')
      this.audio.setDucked(this.paused)
    }
    this.menu.onToggle = onToggle
    this.pauseMenu = new PauseMenu(this.hud.root, {
      settings: () => this.settings,
      change: (patch) => this.applySettings(settingsStorage.update(patch)),
      toTitle: () => this.toTitle(),
    })
    this.pauseMenu.onToggle = onToggle
    this.hud.onPortraitClick = () => this.menu.show('status')
    this.tooltip = new RelicTooltip(container)
    // 새 외형은 메뉴 단추의 점으로만 알린다. (유물 이름 알림과 겹치지 않게)
    this.bus.on('looksUnlocked', () => this.menu.markNew())
    this.bus.on('outfitChanged', () => this.menu.refresh())
    this.bus.on('loadoutChanged', () => {
      this.menu.refresh()
      // 칸이 다른 신 유물로 차 있어 가방의 유물로 발현할 수 있으면 알린다 (E6-07)
      const god = this.powers.loadout.manifestable()
      if (god && god !== this.hintedGod) {
        this.hintedGod = god
        this.menu.markTab('relics')
        this.hud.showToast(`${godDef(god).name}의 유물이 모였다`)
      }
      if (!god) this.hintedGod = null
    })
    // HUD 유물 칸: 커서를 올리면 설명 카드, 누르면 유물 화면
    this.hud.onSlotClick = (slot) => this.menu.show('relics', slot)
    this.hud.onSlotHover = (slot, anchor) => {
      const id = slot === null ? null : this.powers.loadout.slots[slot]
      if (!id || !anchor) {
        this.hoveredSlot = null
        return this.tooltip.hide()
      }
      this.hoveredSlot = { slot: slot!, x: anchor.left + anchor.width / 2, y: anchor.top }
    }
    this.growth = new ProgressionSystem(this.ctx)
    this.life = new HeroLife(this.ctx)
    this.persistence = new Persistence(this.ctx, options.autosave ?? false)
    this.playerInput = new PlayerInput(this.ctx, this.input, this.pixel, container)
    this.audio = new AudioEngine(this.settings.volume)
    this.sound = new SoundSystem(this.ctx, this.audio)
    this.applySettings(this.settings)
    this.listenWindow()
    this.recordPlay()

    if (options.title) {
      this.playing = false
      this.hud.root.classList.add('is-hidden')
      this.stage.setDusk(true)
    }
    if (options.load) {
      this.persistence.restore(options.load, {
        equip: (id) => this.relics.equip(id, false),
        applyStats: () => this.growth.applyStats(),
        applyLooks: () => this.appearance.apply(),
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
  /** 저장하고 처음 화면(슬롯 고르기)으로 돌아간다. 다시 불러와 시작 화면을 띄운다. */
  toTitle(): void {
    this.bus.emit('progressChanged', {})
    this.persistence.saveNow()
    try {
      sessionStorage.setItem(TITLE_REQUEST, '1')
    } catch {
      // 표시를 못 남기면 마지막 슬롯으로 바로 이어진다.
    }
    location.reload()
  }

  /** 처음에 고른 기본 모습을 입힌다. (캐릭터 만들기) */
  setBody(body: BodyLook): void {
    this.appearance.setBody(body)
  }

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

  /** 지금 지역 (E7) */
  get region(): RegionDef {
    return this.stage.map.region
  }

  /**
   * 지역에 들어간다 (E7): 맵·길찾기·적·성소를 그 지역 것으로 다시 짓고 시작점(또는 at)에 선다.
   * 지도 편집기가 고친 지역을 바로 보여 줄 때도 쓴다. 다른 지역으로 가면 땅에 떨어진 유물은 사라진다.
   */
  enterRegion(region: RegionDef, at: { x: number; z: number } = region.spawn): void {
    if (this.legend.active) return
    const moved = region.id !== this.region.id
    if (moved) this.pickups.clear()
    this.stage.load(region)
    this.villagers.load(region.npcs)
    this.minimap.setRegion(region)
    const particles = THEMES[region.theme].particles
    this.fx.snow.setStyle(particles.kind, particles.color)
    const colliders = this.stage.map.colliders
    this.nav.rebuild(region.halfExtent, colliders)
    this.encounter.reset(region, colliders, region.halfExtent)
    this.legend.moveTo(region.sanctuary && (this.nav.nearestFree(region.sanctuary) ?? region.sanctuary), region.sanctuary?.radius)
    this.hero.halfExtent = region.halfExtent
    if (region.realm) this.drops.realm = region.realm
    this.orders.clear()
    this.hero.teleport(at.x, at.z)
    this.view.jumpTo(this.hero.object.position)
    this.exitArmed = false
    if (moved) {
      // 그 땅의 문장과 색 띠로 이름을 알린다 (E9-05)
      const realm = region.realm ?? 'hub'
      const ink = realmInk(realm)
      this.hud.showTitleCard(region.name, `var(--c-realm-${realm})`, realmSigil(realm, ink.light, ink.dark))
    }
    this.bus.emit('regionEntered', { id: region.id })
  }

  /** 점검용: 출구를 밟아도 넘어가지 않는다 (scripts/enemy-trial.mjs) */
  exitsLocked = false

  /** 출구로 다른 지역에 간다: 잠깐 어두워졌다가 그 지역의 돌아오는 출구 앞에서 밝아진다 (E7-02) */
  travelTo(id: string): void {
    const to = this.regions[id]
    if (!to || this.travel || this.legend.active) return
    this.orders.clear()
    this.travel = { to, at: arrivalSpot(to, this.region.id), t: 0, switched: false }
  }

  /** 출구 밟기와 넘어가는 동안의 암전 (실제 시간으로 흐른다) */
  private updateTravel(realDt: number): void {
    const travel = this.travel
    if (travel) {
      travel.t += realDt
      if (!travel.switched && travel.t >= TRAVEL_FADE) {
        travel.switched = true
        this.enterRegion(travel.to, travel.at)
      }
      const t = travel.t / TRAVEL_FADE
      this.fade.style.opacity = String(t < 1 ? t : Math.max(0, 2 - t))
      if (travel.t >= TRAVEL_FADE * 2) {
        this.travel = null
        this.fade.style.opacity = '0'
      }
      return
    }
    if (!this.combat.alive || this.legend.active || this.exitsLocked) return
    const p = this.hero.object.position
    let nearest = Infinity
    for (const exit of this.region.exits) {
      const d = Math.hypot(exit.x - p.x, exit.z - p.z)
      nearest = Math.min(nearest, d)
      if (this.exitArmed && d < EXIT_RADIUS) return this.travelTo(exit.to)
    }
    if (nearest > EXIT_RADIUS * 2) this.exitArmed = true
  }

  /** 움직이지 않는 충돌체 (나무, 바위 등) */
  get staticColliders() {
    return this.stage.map.colliders
  }

  /** 주인공 몸 반지름 */
  readonly heroRadius = HERO_RADIUS

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
    this.stage.setDusk(false)
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
    // 정보 화면이 열려 있으면 게임은 멈추고 화면만 그린다. (E4-07)
    if (!this.paused) {
      this.update(realDt, true)
      this.view.follow(this.hero.object.position, realDt)
      this.updateGroundTooltip()
    }
    this.numbers.update(realDt, this.container.clientHeight, this.pixel.size, this.view.camera, this.view.subpixel)
    this.updateHud(realDt)
    this.pixel.render(this.scene, this.view.camera, this.view.subpixel)
    this.input.endFrame()
    this.frame += 1
    this.persistence.update(realDt)
    this.audio.update()
  }

  /** 정보 화면이나 일시 정지 메뉴가 열려 있어 게임이 멈췄는가 */
  get paused(): boolean {
    return this.menu.open || (this.pauseMenu?.open ?? false)
  }

  /**
   * 창과 키보드: 첫 입력에 소리를 켜고, Esc로 창을 닫거나 일시 정지하고,
   * 탭을 옮기거나 창이 가려지면 멈춘다. (E5-04·06)
   */
  private listenWindow(): void {
    const unlock = () => this.audio.unlock()
    addEventListener('pointerdown', unlock)
    addEventListener('keydown', unlock)
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.playing) return
      if (this.pauseMenu.open) this.pauseMenu.hide()
      else if (this.menu.open) this.menu.toggle(false)
      else this.pauseMenu.show()
    })
    // 단추를 누르면 짧게 딸깍
    addEventListener('click', (e) => {
      if ((e.target as Element | null)?.closest?.('button')) this.audio.play('ui')
    })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.autoPause()
        this.audio.suspend()
      } else this.audio.resume()
    })
    addEventListener('blur', () => this.autoPause())
  }

  /** 창 밖으로 나가면 멈춘다. 이미 창이 열려 있으면 그대로 둔다 */
  private autoPause(): void {
    if (this.playing && !this.paused) this.pauseMenu.show()
  }

  /** 설정을 적용한다: 음량, 흔들림, 번쩍임, 렌더 해상도 */
  private applySettings(next: Settings): void {
    const before = this.settings
    this.settings = next
    this.audio.setVolumes(next.volume)
    this.view.shakeScale = next.shake ? 1 : 0
    this.hud.flashEnabled = next.flash
    // 낮음: 그림자를 끈다 (그림자 패스가 장면을 한 번 더 그린다)
    this.stage.setShadows(next.quality !== 'low')
    if (next.quality !== before.quality && this.requestedRenderHeight === TARGET_RENDER_HEIGHT) {
      this.baseRenderHeight = Math.round(TARGET_RENDER_HEIGHT * RENDER_SCALE[next.quality])
      this.setViewHeight(this.view.viewHeight)
    }
  }

  /** 설명 카드에 넣을 지금 상태: 자리, 충전, 세트, 발현 강화 조건 */
  /** 정보 화면 상태 탭에 넣을 지금의 능력치와 걸린 힘 */
  heroStats(): HeroStats {
    const mods = this.powers.modifiers
    const { manifested, blessings } = this.powers.state
    const powers: HeroStats['powers'] = []
    if (manifested) {
      const god = godDef(manifested)
      // 지금 레벨까지 열린 힘 (승급 카드와 같은 문구에서 고른다)
      const level = this.progress.level(manifested)
      const what = levelGains(manifested, 1)
        .filter((g) => g.kind !== 'hp' && g.kind !== 'mastery')
        .map((g) => g.text)
      for (let lv = 2; lv <= level; lv++) for (const g of levelGains(manifested, lv)) if (g.kind === 'power') what.push(g.text)
      what.push(`궁극기 「${god.ultimate.name}」`)
      powers.push({ kind: 'god', name: god.name, color: god.color, label: this.progress.title(manifested), what: what.join(' · ') })
    }
    for (const g of blessings) {
      const god = godDef(g)
      powers.push({ kind: 'god', name: god.name, color: god.color, label: `${god.name}의 가호`, what: '유물의 힘만 쓴다' })
    }
    for (const id of this.powers.loadout.slots) {
      if (!id) continue
      const def = relicDef(id)
      powers.push({ kind: 'relic', name: id, color: godDef(def.god).color, label: def.name, what: def.passive.description })
    }
    return {
      hp: this.combat.health.hp,
      maxHp: this.combat.health.max,
      damage: this.damage.scale('basic'),
      damageTaken: mods.damageTaken,
      moveSpeed: mods.moveSpeed,
      knockbackDealt: mods.knockbackDealt,
      knockbackTaken: mods.knockbackTaken,
      divine: this.combat.divine,
      promotions: this.progress.promotions,
      powers,
    }
  }

  cardContext(id: RelicId, preview?: RelicCardContext['preview']): RelicCardContext {
    const { loadout } = this.powers
    const slot = loadout.slots.indexOf(id)
    const manifested = this.powers.manifested
    return {
      place: slot >= 0 ? { kind: 'slot', slot } : loadout.bag.includes(id) ? { kind: 'bag' } : { kind: 'ground' },
      ...(slot >= 0 ? { charge: this.powers.effects[slot]?.charge ?? 0 } : {}),
      equipped: loadout.slots,
      owned: new Set([...loadout.slots.filter((x): x is RelicId => x !== null), ...loadout.bag]),
      manifested,
      level: manifested ? this.progress.level(manifested) : 0,
      ...(preview ? { preview } : {}),
    }
  }

  /** 땅에 떨어진 유물에 커서를 올리면 설명 카드를 띄운다. HUD 칸에 올렸으면 그 카드를 (충전이 움직이므로) 계속 새로 그린다. */
  private updateGroundTooltip(): void {
    if (this.hoveredSlot) {
      const id = this.powers.loadout.slots[this.hoveredSlot.slot]
      if (id) this.tooltip.show(relicDef(id), this.cardContext(id), this.hoveredSlot.x, this.hoveredSlot.y, true)
      return
    }
    const { pointer } = this.input
    const near = this.pickupUnderPointer(pointer)
    if (near) {
      const place = { kind: 'ground' } as const
      const free = this.powers.loadout.slots.indexOf(null)
      const preview = free >= 0 ? { before: this.powers.state, after: this.powers.loadout.preview(free, near.id) } : undefined
      this.tooltip.show(relicDef(near.id), { ...this.cardContext(near.id, preview), place }, pointer.x, pointer.y)
      this.groundTooltip = true
    } else if (this.groundTooltip) {
      this.tooltip.hide()
      this.groundTooltip = false
    }
  }

  /** 월드 좌표가 화면 어디에 보이는가 (CSS 픽셀, 자동 점검용) */
  screenPoint(x: number, y: number, z: number): { x: number; y: number } {
    return worldToScreen(new THREE.Vector3(x, y, z), this.container.clientHeight, this.pixel.size, this.view.camera, this.view.subpixel)
  }

  /** 커서 아래의 땅 유물: 화면에 보이는 유물 모양(발밑 ~ 떠 있는 모델 위)과 커서 사이의 화면 거리로 고른다 */
  private pickupUnderPointer(pointer: { x: number; y: number }): { id: RelicId; x: number; z: number } | null {
    const height = this.container.clientHeight
    const size = this.pixel.size
    const { camera, subpixel } = this.view
    const items = this.pickups.list.map((p) => {
      const y = heightAt(p.x, p.z)
      return {
        item: p,
        base: worldToScreen(new THREE.Vector3(p.x, y, p.z), height, size, camera, subpixel),
        top: worldToScreen(new THREE.Vector3(p.x, y + PICKUP_TOP, p.z), height, size, camera, subpixel),
      }
    })
    // 저해상도 픽셀 12칸쯤, 화면에서 적어도 28px
    return itemUnderPointer(items, pointer, Math.max(28, size.scale * 12))
  }

  /** 시작 화면 뒤의 배경: 눈이 내리고 불꽃이 일렁이며, 주인공은 숨만 쉰다. */
  private updateBackdrop(dt: number): void {
    this.elapsed += dt
    this.hero.update(dt)
    const position = this.hero.object.position
    this.fx.snow.update(dt, position, this.elapsed)
    this.stage.update(this.elapsed)
    // 시작 화면 뒤 (E9-08): 카메라가 주인공 둘레를 천천히 흘러 마을이 살아 있게 보인다
    const t = this.elapsed * 0.08
    this.backdropFocus.set(position.x - 6 + Math.sin(t) * 2, position.y, position.z + 3 + Math.cos(t * 0.7) * 1.2)
    this.view.follow(this.backdropFocus, dt)
    this.stage.follow(position)
    this.pixel.render(this.scene, this.view.camera, this.view.subpixel)
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
    this.updateTravel(realDt)
    if (live && !this.travel) {
      if (this.mapEditor?.active) {
        const cursor = this.playerInput.cursorOnGround()
        this.mapEditor.update(cursor ? { x: cursor.x, z: cursor.z } : null, this.input.wasPressed('move'))
      } else this.playerInput.update()
    }
    this.orders.update(this.encounter.alive)
    const heading = this.hero.heading
    if (this.orders.plowing && heading) plowThrough(this.hero.object.position, HERO_RADIUS, heading, this.encounter.alive)
    this.hero.update(dt)
    this.fx.updateMarkers(dt, this.hero, this.orders, this.encounter.alive)

    // 전투: 자동 공격 → 유물 → 적 → 성장 → 생사
    this.combat.update(dt, this.encounter.alive, {
      onSwing: (swing, strong) => this.swingFx(swing, strong),
      onShot: (target, strong) => this.shotFx(target, strong),
      onHits: (hits) => this.damage.onHeroHits(hits),
    })
    this.relics.update(dt)
    this.cycleSystem.update(dt)
    this.combat.damageScale = this.damage.scale('basic')
    this.updateEnemies(dt)
    this.growth.update(dt)
    this.life.update(dt)
    this.appearance.update()
    this.sound.update()

    const position = this.hero.object.position
    this.fx.update(dt, this.hero, this.elapsed)
    this.villagers.update(dt, position, (x, y, z) => this.screenPoint(x, y, z))
    this.minimap.update(dt, { hero: position, relics: this.pickups.list, sanctuaryReady: this.legend.present && this.growth.sanctuaryOpen })
    this.stage.update(this.elapsed)
    this.stage.follow(position)
  }

  /** 공격 모션의 궤적: 판정 모양대로 그리고, 발현했으면 그 신의 색 (E6-10) */
  private swingFx(swing: SwingSpec, strong: boolean): void {
    const p = this.hero.object.position
    const facing = this.hero.facing
    const god = this.powers.manifested
    const tint = god && !strong ? new THREE.Color(godDef(god).color).lerp(new THREE.Color(0xffffff), 0.5).getHex() : undefined
    switch (swing.shape ?? 'arc') {
      case 'arc':
        this.fx.slashes.spawn(p, facing, swing.range, swing.halfAngle, strong, tint)
        break
      case 'ring':
        this.fx.slashes.spawn(p, facing, swing.range, Math.PI, strong, tint)
        break
      case 'line':
        this.fx.slashes.spawn(p, facing, swing.range, Math.atan2(swing.width ?? 0.6, swing.range), strong, tint)
        break
      case 'burst': {
        const at = new THREE.Vector3(p.x + Math.sin(facing) * swing.range * 0.75, p.y, p.z + Math.cos(facing) * swing.range * 0.75)
        this.fx.slashes.spawn(at, facing, swing.width ?? 1.5, Math.PI, strong, tint)
        this.fx.puffs.burst(at, 10, 2)
        break
      }
      case 'shot':
        break
    }
    this.audio.play('swing', undefined, strong ? 1 : 0.7)
  }

  /** 원거리 공격이 날아간다: 벼락은 번개 줄기, 그 밖에는 화살·빛 조각 */
  private shotFx(target: CombatTarget, strong: boolean): void {
    const p = this.hero.object.position
    const from = new THREE.Vector3(p.x, p.y + 1.3, p.z)
    const to = new THREE.Vector3(target.x, heightAt(target.x, target.z) + 0.9, target.z)
    const god = this.powers.manifested
    if (this.combat.style === 'bolt') this.fx.lightning.strike(from, to, strong ? 0.12 : 0.07, 0.12)
    else this.fx.shots.fire(from, to, god ? new THREE.Color(godDef(god).color).getHex() : 0xf2f7ff)
  }

  private updateEnemies(dt: number): void {
    const position = this.hero.object.position
    const shattered = this.encounter.update(dt, {
      hero: { x: position.x, z: position.z, radius: HERO_RADIUS, alive: this.combat.alive },
      decoy: this.relics.decoy,
      halfExtent: this.region.halfExtent,
      staticColliders: this.stage.map.colliders,
      effects: this.fx.skills,
      hitHero: (damage, fromX, fromZ, knockback) => this.damage.hitHero(damage, fromX, fromZ, knockback),
      impact: (x, z, strength, ice) => {
        this.fx.impact(x, z, strength, ice)
        this.view.shake(strength)
        this.audio.play('impact', { x, z }, Math.min(1, 0.4 + strength))
      },
      warn: (x, z) => this.audio.play('telegraph', { x, z }),
    })
    for (const giant of shattered) {
      this.fx.shatter(giant)
      this.view.shake(giant.spec.role === 'boss' ? 0.6 : 0.15)
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
        // 내기 전설은 보스 막대 자리에 채운 처치 수를 보인다
        boss:
          this.legend.betProgress !== null
            ? this.legend.betProgress
            : this.legend.boss?.alive
              ? this.legend.boss.health.ratio
              : boss && this.encounter.bossEngaged
                ? boss.health.ratio
                : null,
        slots: this.powers.hudSlots(),
        ultimate: manifested !== null,
        xp: manifested ? this.progress.xpRatio(manifested) : null,
        xpColor: manifested ? godDef(manifested).color : '',
        portrait: manifested
          ? { name: godDef(manifested).name, title: this.progress.title(manifested), color: godDef(manifested).color, level: this.progress.level(manifested) }
          : null,
        blessings: this.powers.state.blessings.map((g) => ({ name: godDef(g).name, color: godDef(g).color })),
        promote: manifested !== null && this.progress.readyToPromote(manifested),
        essence: this.cycle.essence,
        essenceOpen: this.cycle.opened.has('train'),
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

  /** 가방의 유물을 칸에 끼운다. (봇이 발현 조합으로 바꿔 낄 때) */
  devWield(id: RelicId, slot: number): void {
    this.relics.wield(id, slot)
  }

  /** 칸의 유물을 가방에 넣는다. (봇이 한 신만 쓸 때) */
  devStow(slot: number): void {
    this.relics.stow(slot)
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
    this.settings = settingsStorage.update({ viewHeight: next })
  }

  /** 확대·축소. 그림자가 그려지는 범위도 보이는 범위에 맞춘다. */
  setViewHeight(viewHeight: number): void {
    const next = clampViewHeight(viewHeight)
    // 가장 크게 확대했을 때의 픽셀 크기를 기준으로, 넓게 볼 때는 뭉개지지 않을 만큼만 해상도를 올린다.
    this.pixel.setTargetHeight(renderHeightFor(next, this.baseRenderHeight))
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

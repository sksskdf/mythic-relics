import * as THREE from 'three'

import { AudioEngine } from '../audio/AudioEngine'
import type { SwingSpec } from '../combat/combo'
import { Input } from '../input/Input'
import { PixelRenderer } from '../render/PixelRenderer'
import { QuarterViewCamera } from '../render/QuarterViewCamera'
import { renderHeightFor, TARGET_RENDER_HEIGHT } from '../render/resolution'
import { REALM_COLORS, REGIONS, type RegionDef, START_REGION, worldLayout } from '../data/regions'
import { godDef, GODS, relicDef, type RelicId } from '../relics/data'
import { Wardrobe } from '../looks/outfit'
import { DropTable } from '../gear/DropTable'
import { itemUnderPointer } from '../relics/hover'
import { PICKUP_TOP } from '../gear/Pickups'
import { worldToScreen } from '../render/picking'
import { heightAt } from '../world/terrain'
import { Pickups } from '../gear/Pickups'
import type { SaveData } from '../save/SaveData'
import { ClassProgress } from '../myth/ClassProgress'
import { levelGains } from '../myth/levelGains'
import type { SkillContext } from '../skills/Skill'
import { DamageNumbers } from '../ui/DamageNumbers'
import { Hud } from '../ui/Hud'
import { GameMenu, type HeroStats, type SourcesHost } from '../ui/GameMenu'
import { PauseMenu } from '../ui/PauseMenu'
import type { RelicCardContext } from '../ui/relicCard'
import { RelicTooltip } from '../ui/RelicTooltip'
import { NavGrid } from '../world/navGrid'
import { buildHeroModel } from '../world/heroModel'
import type { BodyLook } from '../looks/body'
import { TITLE_REQUEST } from '../save/SaveData'
import { clampViewHeight, RENDER_SCALE, type RenderQuality, type Settings, settingsStorage } from '../save/settings'
import { frameDelta } from './clock'
import { Feel, type GameContext } from './context'
import { Encounter } from './Encounter'
import { Villagers } from './Villagers'
import { Minimap } from '../ui/Minimap'
import { Nameplates, type PlateTarget } from '../ui/Nameplates'
import { gradeOf } from '../enemies/grade'
import { Giant } from '../enemies/Giant'
import { EventBus, type GameEvents } from './events'
import { UtgardLegend } from './Legend'
import { HERO_RADIUS, HeroController } from './HeroController'
import { HeroOrders } from './HeroOrders'
import { plowThrough } from './plow'
import { type CombatTarget, PlayerCombat } from './PlayerCombat'
import { RelicPowers } from './RelicPowers'
import { Stage } from './Stage'
import { AppearanceSystem } from './systems/Appearance'
import { DamageSystem } from './systems/Damage'
import { Effects } from './systems/Effects'
import { HeroLife } from './systems/HeroLife'
import { Persistence } from './systems/Persistence'
import { PlayerInput } from './systems/PlayerInput'
import { ProgressionSystem } from './systems/Progression'
import { SoundSystem } from './systems/Sound'
import { RelicSystem } from './systems/Relics'
import { World } from './World'
import { TitleBackdrop } from './TitleBackdrop'
import { SCENES } from '../data/scenes'
import { DialogScene } from './DialogScene'
import { DialogBox } from '../ui/DialogBox'
import { DevTools } from '../dev/DevTools'
import { CONVENIENCES, Conveniences } from '../progress/Conveniences'
import { ThreatProgress } from '../progress/Threat'
import { ThreatSystem } from './systems/Threat'
import { TrialSystem } from './systems/Trials'
import { TRIAL_IDS, TRIAL_MILESTONES, type TrialId, TRIALS } from '../data/trials'
import { TrialProgress } from '../progress/Trials'
import { blessingDef, STARS } from '../data/rift'
import { LIMIT_REALMS, REALM_NAMES } from '../data/threat'
import { RiftProgress } from '../progress/Rift'
import { RiftSystem } from './systems/Rift'
import { BlessingPicker } from '../ui/BlessingPicker'
import { awakeningLevel } from '../data/awakening'
import { SOURCE_IDS, type SourceId } from '../data/schema'
import { Build } from '../build/Build'
import { gearCard } from '../ui/gearCard'
import { baseCandidates, nextRecipe } from '../gear/forge'
import { materialName, mythMaterial } from '../gear/materials'
import { mythRelic, stageName } from '../gear/mythRelic'
import { GEAR } from '../gear/roll'
import { alwaysStage } from '../build/BuildState'

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

/** 성소에서 이만큼 가까우면 고른 신화를 바꿀 수 있다 */
const CHOOSE_NEAR_SANCTUARY = 6

/** 출구를 밟았다고 보는 거리 (m), 암전 시간 (초, 어두워지는 데 한 번·밝아지는 데 한 번) */

/** 플레이 기록: 검증과 수치 조정에 쓴다. */
export interface PlayEvent {
  /** 게임 시간 (초) */
  t: number
  type: 'relic' | 'manifest' | 'open' | 'forge' | 'gear' | 'kill' | 'bossKill' | 'death' | 'legendStart' | 'legendFail' | 'promote' | 'hurt' | 'threat' | 'region' | 'trial' | 'rift'
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
  readonly threat = new ThreatProgress()
  readonly trials = new TrialProgress()
  readonly rift = new RiftProgress()
  readonly riftSystem: RiftSystem
  private readonly blessingPicker: BlessingPicker
  readonly trialSystem: TrialSystem
  readonly threatSystem: ThreatSystem
  /** 처음 보는 일의 대화 장면을 띄우는가 (봇·점검 스크립트는 끈다) */
  storyScenes = true
  /** 걸어가 말을 걸 마을 사람 */
  private talkTo: string | null = null
  readonly conveniences = new Conveniences()
  /** 순환 성장 (E4.5) */
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
  /** 지역과 지역 사이: 들어가기, 출구로 넘어가기 */
  readonly world: World
  /** 개발 패널·봇·점검 스크립트의 지름길 */
  readonly dev: DevTools
  /** 마을 사람 (E7-04) */
  readonly villagers: Villagers
  /** 작은 지도 (E7-08) */
  readonly minimap: Minimap
  /** 몬스터 이름표 (E12-09) */
  readonly nameplates: Nameplates
  /** 대화 장면 (E12-10) */
  readonly scenes: DialogScene
  readonly dialog: DialogBox
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
  /** 시작 화면 뒤의 장면 */
  private readonly backdrop: TitleBackdrop
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
    this.villagers = new Villagers(container)
    this.scene.add(this.villagers.object)
    this.minimap = new Minimap(this.hud.root)
    this.numbers = new DamageNumbers(container)
    this.nameplates = new Nameplates(container)

    // 지역 (E7): 저장한 지역이 없으면 첫 지역에서 시작한다
    const region = REGIONS[options.region ?? options.load?.region?.id ?? START_REGION] ?? REGIONS[START_REGION]!
    this.stage = new Stage(this.scene, region)
    const map = this.stage.map
    const nav = new NavGrid(region.halfExtent, 0.5, map.colliders, HERO_RADIUS)
    this.nav = nav
    this.encounter = new Encounter(region, map.colliders, region.halfExtent)
    this.scene.add(this.encounter.object)

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
    this.world = new World(
      {
        bus: this.bus,
        stage: this.stage,
        nav,
        encounter: this.encounter,
        legend: this.legend,
        villagers: this.villagers,
        minimap: this.minimap,
        fx: this.fx,
        hero: this.hero,
        orders: this.orders,
        combat: this.combat,
        view: this.view,
        hud: this.hud,
        pickups: this.pickups,
        drops: this.drops,
      },
      container,
    )
    this.world.dress(region)
    this.backdrop = new TitleBackdrop({ hero: this.hero, fx: this.fx, stage: this.stage, view: this.view, hud: this.hud })
    this.dialog = new DialogBox(container)
    const scenesSeen = new Set<string>()
    this.scenes = new DialogScene({
      hero: this.hero,
      villagers: this.villagers,
      box: this.dialog,
      setHudHidden: (hidden) => {
        this.hud.root.classList.toggle('is-hidden', hidden)
        this.villagers.quiet = hidden
      },
      viewHeight: () => this.view.viewHeight,
      setViewHeight: (viewHeight) => this.applyViewHeight(viewHeight),
      clearOrders: () => this.orders.clear(),
      onSeen: () => this.bus.emit('progressChanged', {}),
      seen: scenesSeen,
      speakerAt: (who) => {
        const boss = this.encounter.alive.find((g) => g.spec.name === who)
        return boss ? { x: boss.x, z: boss.z } : null
      },
    })

    const skills: SkillContext = {
      hero: this.hero,
      enemies: [],
      manifested: null,
      level: 0,
      area: 1,
      fx: this.fx.skills,
      lightning: this.fx.lightning,
      puffs: this.fx.puffs,
      slashes: this.fx.slashes,
      shots: this.fx.shots,
      flash: (at, color, strength) => this.fx.power.burst(at, color, strength),
      heal: (amount) => this.combat.heal(amount),
      heroHp: () => this.combat.health.ratio,
      hit: (target, damage, dirX, dirZ, knockback, style, source) => this.damage.deal(target, damage, dirX, dirZ, knockback, style, source),
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
      scenesSeen,
      threat: this.threat,
      trials: this.trials,
      rift: this.rift,
      conveniences: this.conveniences,
      build: new Build({ powers: this.powers, progress: this.progress, threat: this.threat, trials: this.trials, trial: () => this.trialSystem?.active?.id ?? null, rift: this.rift, blessings: () => this.riftSystem?.blessings ?? [] }),
      skills,
    }
    this.damage = new DamageSystem(this.ctx)
    this.relics = new RelicSystem(this.ctx)
    this.appearance = new AppearanceSystem(this.ctx)
    const appearance = this.appearance
    const relics = this.relics
    const powers = this.powers
    const conveniences = this.conveniences
    this.menu = new GameMenu(this.hud.root, {
      get slots() {
        return powers.loadout.slots
      },
      get bag() {
        return powers.loadout.bag
      },
      gearOf: (id) => powers.loadout.gear.get(id),
      slotsFor: (id) => powers.loadout.slots.map((_, i) => i).filter((i) => powers.loadout.fits(id, i)),
      get materials() {
        return powers.loadout.materials
      },
      forge: {
        here: () => this.ctx.map.region.kind === 'hub',
        gods: () => {
          const { loadout } = powers
          const chosen = this.ctx.build.chosen
          return Object.keys(GODS).filter((god) => god === chosen || this.progress.isOpen(god) || loadout.has(mythRelic(god)) || (loadout.materials.get(mythMaterial(god) ?? '') ?? 0) > 0).sort((a, b) => Number(b === chosen) - Number(a === chosen))
        },
        next: (god) => {
          const { loadout } = powers
          const recipe = nextRecipe(loadout, god)
          if (!recipe) return null
          return {
            name: stageName(recipe.relic, recipe.stage),
            stage: recipe.stage,
            materials: recipe.materials.map(({ id, count }) => ({ name: materialName(id), have: loadout.materials.get(id) ?? 0, need: count })),
            ...(recipe.base ? { base: { part: GEAR.parts[recipe.base].name, ok: baseCandidates(loadout, recipe.base).length > 0 } } : {}),
          }
        },
        make: (god) => this.ctx.map.region.kind === 'hub' && relics.forge(god),
      },
      get loadout() {
        return powers.state
      },
      preview: (slot, id) => powers.loadout.preview(slot, id),
      wield: (id, slot) => relics.wield(id, slot),
      stow: (slot) => relics.stow(slot),
      drop: (slot) => relics.unequip(slot, true),
      salvage: (id) => relics.salvage(id) && this.menu.refresh(),
      progress: this.progress,
      myths: {
        canChoose: () => this.canChooseMyth,
        choose: (god) => this.chooseMyth(god),
        stage: (god) => alwaysStage(this.progress.level(god), powers.loadout.relics.some((id) => id !== null && relicDef(id).god === god)),
      },
      cardContext: (id, preview) => this.cardContext(id, preview),
      stats: () => this.heroStats(),
      toTitle: () => this.toTitle(),
      openSettings: () => {
        this.menu.toggle(false)
        this.pauseMenu.show(true)
      },
      sources: {
        rows: () => this.sourceRows(),
        threat: this.threatView(),
        here: () => this.threatSystem.here,
        choose: (level) => this.threatSystem.choose(level),
        advance: (source) => this.threatSystem.advance(source),
        conveniences: () => CONVENIENCES.map((c) => ({ id: c.id, name: c.name, text: c.text, open: this.conveniences.has(c.id), have: this.conveniences.counters[c.counter] ?? 0, need: c.need })),
        get autoSalvage() {
          return conveniences.autoSalvage
        },
        set autoSalvage(on: boolean) {
          conveniences.autoSalvage = on
        },
        warps: () => {
          if (!this.conveniences.has('warp')) return []
          return Object.values(this.regions)
            .filter((r) => r.id !== this.ctx.map.region.id && (r.kind === 'hub' || this.conveniences.visited.has(r.id)))
            .map((r) => ({ id: r.id, name: r.name }))
        },
        warp: (id) => this.warpTo(id),
      },
      trials: {
        open: () => this.trialSystem.open,
        blocked: () => this.trialSystem.blocked(),
        list: () =>
          TRIAL_IDS.map((id) => {
            const def = TRIALS[id]
            const per = def.reward.per < 1 ? `+${Math.round(def.reward.per * 100)}%` : `+${def.reward.per}`
            return { id, name: def.name, rule: def.rule, reward: def.reward.text, per, cleared: this.trials.cleared[id] ?? 0, best: [1, 2, 3, 4, 5].map((n) => this.trials.best[`${id}:${n}`] ?? null) }
          }),
        total: () => this.trials.total,
        milestones: () => [...TRIAL_MILESTONES],
        riftScale: () => this.trials.riftScale(),
        start: (id, level) => this.trialSystem.start(id as TrialId, level),
      },
      rift: {
        open: () => this.riftSystem.open,
        progress: () => LIMIT_REALMS.map((realm) => ({ name: REALM_NAMES[realm] ?? realm, cleared: this.threat.cleared[realm] ?? 0 })),
        canEnter: () => this.riftSystem.canEnter,
        enter: () => this.riftSystem.enter(),
        run: () => {
          const run = this.riftSystem.run
          return run ? { depth: run.depth, blessings: run.blessings.map((id) => blessingDef(id)?.name ?? id) } : null
        },
        best: () => this.rift.best,
        stars: () => this.rift.stars,
        scale: () => this.trials.riftScale(),
        chart: () => {
          const isOpen = (god: string) => this.progress.isOpen(god)
          return Object.values(STARS).map((star) => ({
            god: star.god,
            name: godDef(star.god).name,
            color: godDef(star.god).color,
            x: star.x,
            y: star.y,
            neighbors: star.neighbors,
            lit: this.rift.lit.has(star.god),
            can: this.rift.canLight(star.god, isOpen),
          }))
        },
        light: (god) => {
          const ok = this.rift.light(god, (g) => this.progress.isOpen(g))
          if (ok) this.bus.emit('progressChanged', {})
          return ok
        },
      },
      world: {
        nodes: () => {
          const layout = worldLayout(this.regions)
          return Object.values(this.regions).map((r) => ({
            id: r.id,
            name: r.name,
            color: `#${(r.realm ? REALM_COLORS[r.realm] : REALM_COLORS.hub).toString(16).padStart(6, '0')}`,
            zone: r.zone,
            x: layout[r.id]?.x ?? 0,
            y: layout[r.id]?.y ?? 0,
            links: r.exits.map((e) => e.to),
            here: r.id === this.ctx.map.region.id,
            found: r.kind === 'hub' || this.conveniences.visited.has(r.id),
            cleared: r.realm ? (this.threat.cleared[r.realm] ?? 0) : 0,
          }))
        },
        canWarp: () => this.conveniences.has('warp'),
        warp: (id) => this.warpTo(id),
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
    this.minimap.canvas.addEventListener('click', () => this.menu.show('map'))
    // 대화 장면 (E15-06): 마을 사람을 누르면 걸어가 말을 걸고, 처음 보는 일에는 짧은 장면
    this.bus.on('mythOpened', ({ god }) => this.story(`myth${capital(god)}`))
    this.bus.on('forged', ({ stage }) => stage === 1 && this.story('forgeFirst'))
    this.bus.on('limitBroken', () => this.story('limitBreak'))
    this.bus.on('threatChanged', () => this.threat.level === this.threat.reached && this.threat.reached >= 2 && this.story('threatUp'))
    this.tooltip = new RelicTooltip(container)
    // 새 외형은 메뉴 단추의 점으로만 알린다. (유물 이름 알림과 겹치지 않게)
    this.bus.on('looksUnlocked', () => this.menu.markNew())
    this.bus.on('outfitChanged', () => this.menu.refresh())
    this.bus.on('loadoutChanged', () => this.menu.refresh())
    // HUD 유물 칸: 커서를 올리면 설명 카드, 누르면 유물 화면
    // HUD 칸 i → 그 유물이 있는 장비 칸
    const equipSlot = (i: number | null) => (i === null ? null : (this.powers.hudSlots()[i]?.slot ?? null))
    this.hud.onSlotClick = (i) => this.menu.show('relics', equipSlot(i) ?? 0)
    this.hud.onSlotHover = (i, anchor) => {
      const slot = equipSlot(i)
      const id = slot === null ? null : this.powers.loadout.slots[slot]
      if (!id || !anchor) {
        this.hoveredSlot = null
        return this.tooltip.hide()
      }
      this.hoveredSlot = { slot: slot!, x: anchor.left + anchor.width / 2, y: anchor.top }
    }
    this.growth = new ProgressionSystem(this.ctx)
    this.life = new HeroLife(this.ctx)
    this.threatSystem = new ThreatSystem(this.ctx)
    this.trialSystem = new TrialSystem(this.ctx, this.growth, this.threatSystem)
    this.blessingPicker = new BlessingPicker(this.hud.root)
    this.riftSystem = new RiftSystem(
      this.ctx,
      this.threatSystem,
      {
        enter: (region) => this.world.enter(region),
        home: () => this.world.travelTo(START_REGION),
        offer: (choices, pick) => this.blessingPicker.show(choices, pick),
      },
      this.scene,
    )
    this.persistence = new Persistence(this.ctx, options.autosave ?? false)
    this.playerInput = new PlayerInput(this.ctx, this.input, this.pixel, container)
    this.playerInput.talkAt = (x, z) => (this.ctx.map.region.kind === 'hub' ? this.villagers.at(x, z) : null)
    this.playerInput.onTalk = (name) => (this.talkTo = name)
    this.dev = new DevTools({
      bus: this.bus,
      relics: this.relics,
      powers: this.powers,
      progress: this.progress,
      growth: this.growth,
      life: this.life,
      hero: this.hero,
      orders: this.orders,
      view: this.view,
      pickups: this.pickups,
      region: () => this.ctx.map.region.realm ?? undefined,
    })
    this.audio = new AudioEngine(this.settings.volume)
    this.sound = new SoundSystem(this.ctx, this.audio)
    this.applySettings(this.settings)
    this.listenWindow()
    this.recordPlay()

    if (options.title) {
      this.playing = false
      this.backdrop.show(true)
    }
    if (options.load) {
      this.persistence.restore(options.load, {
        equip: (id) => this.relics.equip(id, false),
        choose: (god) => this.relics.choose(god, false),
        applyStats: () => this.growth.applyStats(),
        applyLooks: () => this.appearance.apply(),
      })
      // 위협 단계 배율은 불러온 단계로 (이미 세운 적도 다시 세운다)
      this.threatSystem.apply()
      if (this.threat.level > 1) this.encounter.resetAll()
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
    bus.on('mythOpened', ({ god }) => record('open', god))
    bus.on('forged', ({ relic, stage }) => record('forge', `${relic}:${stage}`))
    bus.on('gearPicked', ({ item }) => record('gear', item.grade))
    bus.on('manifested', ({ god }) => record('manifest', god))
    bus.on('giantKilled', ({ giant }) => record(giant.spec.boss ? 'bossKill' : 'kill', giant.spec.boss))
    bus.on('heroHurt', ({ damage }) => record('hurt', String(Math.round(damage))))
    bus.on('threatChanged', ({ level }) => record('threat', String(level)))
    bus.on('regionEntered', ({ id }) => record('region', id))
    bus.on('riftFloor', ({ depth }) => record('rift', `floor:${depth}`))
    bus.on('riftEnded', ({ depth, reason }) => record('rift', `${reason}:${depth}`))
    bus.on('trialEnded', ({ id, level, win, seconds }) => record('trial', `${id}:${level}:${win ? 'win' : 'fail'}:${Math.round(seconds)}`))
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
    return this.world.region
  }

  /** 갈 수 있는 지역들 (지도 편집기가 고친 것이면 그것으로 바뀐다) */
  get regions(): Readonly<Record<string, RegionDef>> {
    return this.world.regions
  }

  set regions(regions: Readonly<Record<string, RegionDef>>) {
    this.world.regions = regions
  }

  /** 지역에 들어간다 (`World.enter`) */
  enterRegion(region: RegionDef, at?: { x: number; z: number }): void {
    this.world.enter(region, at)
  }

  /** 점검용: 출구를 밟아도 넘어가지 않는다 (scripts/enemy-trial.mjs) */
  get exitsLocked(): boolean {
    return this.world.exitsLocked
  }

  set exitsLocked(locked: boolean) {
    this.world.exitsLocked = locked
  }

  /** 정보 화면에 보일 위협 단계 (읽을 때마다 지금 값) */
  private threatView(): SourcesHost['threat'] {
    const threat = this.threat
    return {
      get level() {
        return threat.level
      },
      get unlocked() {
        return threat.unlocked
      },
      get reached() {
        return threat.reached
      },
      get battle() {
        return threat.battle
      },
      get pour() {
        return threat.pour
      },
      get resonance() {
        return threat.resonance
      },
      get max() {
        return threat.max
      },
    }
  }

  /** 축복 고르기 창을 닫는다 (봇이 대신 골랐을 때) */
  hideBlessings(): void {
    this.blessingPicker.hide()
  }

  /** 처음 보는 일의 짧은 대화 장면 (E15-06). 본 장면·꺼 둔 때(봇·점검)·다른 지역의 장면은 열지 않는다 */
  story(id: string): boolean {
    const scene = SCENES[id]
    if (!this.storyScenes || !scene || this.ctx.scenesSeen.has(id)) return false
    if (scene.region && scene.region !== this.ctx.map.region.id) return false
    return this.scenes.play(id)
  }

  /** 원천마다: 장비의 합, 원천 숙련, 합계, 각성 단계 (HUD·정보 화면) */
  sourceRows(): { id: SourceId; gear: number; mastery: number; total: number; level: number }[] {
    const state = this.ctx.build.state
    return SOURCE_IDS.map((id) => {
      const mastery = this.threat.mastery[id]
      const total = state.sources[id]
      return { id, gear: total - mastery, mastery, total, level: awakeningLevel(total) }
    })
  }

  /** 성소 워프 (E14-05): 마을이나 가 본 땅의 성소로 */
  warpTo(id: string): boolean {
    if (!this.conveniences.has('warp') || id === this.ctx.map.region.id) return false
    if (this.regions[id]?.kind !== 'hub' && !this.conveniences.visited.has(id)) return false
    return this.world.warpTo(id)
  }

  /** 출구로 다른 지역에 간다 (`World.travelTo`) */
  travelTo(id: string): void {
    this.world.travelTo(id)
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
    this.backdrop.show(false)
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
      // 대화 중에는 이동 입력을 받지 않고, 카메라는 주인공과 말하는 사람 사이를 본다 (E12-10)
      // 대화 중에는 세계가 멈춘다 (싸우다 신화가 열리거나 보스가 말해도 맞지 않게, E15-06)
      const talking = this.scenes.active
      this.update(talking ? 0 : realDt, !talking)
      this.scenes.update(realDt)
      this.view.follow(talking ? this.scenes.focus : this.hero.object.position, realDt)
      if (!talking) this.updateGroundTooltip()
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
    const build = this.ctx.build.state
    const mods = build.modifiers
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
    for (const id of this.powers.loadout.relics) {
      if (!id) continue
      const def = relicDef(id)
      powers.push({ kind: 'relic', name: id, color: godDef(def.god).color, label: def.name, what: def.passive.description })
    }
    return {
      hp: this.combat.health.hp,
      maxHp: this.combat.health.max,
      damage: build.damageScale,
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
    const manifested = this.ctx.build.chosen
    return {
      place: slot >= 0 ? { kind: 'slot', slot } : loadout.bag.includes(id) ? { kind: 'bag' } : { kind: 'ground' },
      ...(slot >= 0 ? { charge: this.powers.effects[slot]?.charge ?? 0 } : {}),
      equipped: loadout.relics,
      owned: new Set(loadout.ownedRelics),
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
    const nearGear = near ? this.pickups.gearOf(near.id) : undefined
    if (near && nearGear) {
      // 땅의 일반 장비: 같은 부위에 지금 낀 장비와 비교한 카드
      const { loadout } = this.powers
      const wornId = loadout.slots.find((id, i) => id && loadout.fits(nearGear.uid, i) && loadout.gear.has(id))
      const worn = wornId ? loadout.gear.get(wornId) : null
      this.tooltip.showCard(near.id, `${near.id}|${wornId ?? ''}`, () => gearCard(nearGear, worn), pointer.x, pointer.y)
      this.groundTooltip = true
    } else if (near) {
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
  /** 고른 신화를 바꿀 수 있는 곳인가: 마을, 또는 지역 성소 곁 (E12-04, DESIGN.md 4.2) */
  get canChooseMyth(): boolean {
    if (this.ctx.map.region.kind === 'hub' || this.conveniences.has('quickChoose')) return true
    if (!this.legend.present || this.legend.active) return false
    const p = this.hero.object.position
    return Math.hypot(p.x - this.legend.center.x, p.z - this.legend.center.z) <= CHOOSE_NEAR_SANCTUARY
  }

  /** 정보 화면에서 신화를 고른다. 마을·성소가 아니거나 닫힌 신화면 false */
  chooseMyth(god: string): boolean {
    return this.canChooseMyth && this.relics.choose(god, true)
  }

  /** 기본 공격의 대상별 배율 (정예·보스에게 피해) */
  private readonly targetScale = (target: CombatTarget): number => this.damage.targetScale(target)

  screenPoint(x: number, y: number, z: number): { x: number; y: number } {
    return worldToScreen(new THREE.Vector3(x, y, z), this.container.clientHeight, this.pixel.size, this.view.camera, this.view.subpixel)
  }

  /** 커서 아래의 땅 유물: 화면에 보이는 유물 모양(발밑 ~ 떠 있는 모델 위)과 커서 사이의 화면 거리로 고른다 */
  private pickupUnderPointer(pointer: { x: number; y: number }): { id: string; x: number; z: number } | null {
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

  /** 시작 화면 뒤의 배경만 움직이고 그린다. */
  private updateBackdrop(dt: number): void {
    this.elapsed += dt
    this.backdrop.update(dt, this.elapsed)
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
    this.world.update(realDt)
    if (live && !this.world.traveling) {
      if (this.mapEditor?.active) {
        const cursor = this.playerInput.cursorOnGround()
        this.mapEditor.update(cursor ? { x: cursor.x, z: cursor.z } : null, this.input.wasPressed('move'))
      } else this.playerInput.update()
    } else this.playerInput.hovered = null
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
    // 최대 생명: 개방 단계·상시 효과·장비 (빌드 상태 한 곳에서 계산)
    const wantHp = this.ctx.build.state.maxHp
    if (this.combat.health.max !== wantHp) this.combat.health.setMax(wantHp)
    const awakening = this.powers.awakening
    this.combat.damageScale = this.damage.scale('basic') * awakening.basicScale
    this.combat.boostAttackSpeed = awakening.attackSpeed
    this.combat.braceScale = awakening.takenScale
    this.hero.boostScale = awakening.moveSpeed
    this.combat.targetScale = this.targetScale
    this.updateEnemies(dt)
    this.growth.update(dt)
    this.trialSystem.update(dt)
    this.riftSystem.update(dt)
    this.life.update(dt)
    this.appearance.update()
    this.sound.update()

    const position = this.hero.object.position
    this.fx.update(dt, this.hero, this.elapsed)
    this.villagers.update(dt, position, (x, y, z) => this.screenPoint(x, y, z))
    // 말 걸기: 마을 사람 곁에 닿으면 대화 장면 (E15-06)
    if (this.talkTo) {
      const v = this.villagers.find(this.talkTo)
      if (!v) this.talkTo = null
      else if (Math.hypot(position.x - v.def.x, position.z - v.def.z) < 2.6) {
        const talk = Object.values(SCENES).find((sc) => sc.id.startsWith('talk') && sc.lines[0]!.who === this.talkTo)
        if (talk) this.scenes.play(talk.id)
        this.talkTo = null
      }
    }
    // 보스 등장: 처음 싸움이 붙으면 한마디 (E15-06)
    const boss = this.encounter.boss
    if (boss?.alive && this.encounter.bossEngaged && !this.legend.active) this.story(`boss${capital(boss.spec.id)}`)
    // 성소를 찾았다 (E15-04): 성소 결계 안에 들어서면 그 지역으로 워프할 수 있다
    const sanctuary = this.ctx.map.region.sanctuary
    if (sanctuary && !this.conveniences.visited.has(this.ctx.map.region.id) && Math.hypot(position.x - sanctuary.x, position.z - sanctuary.z) < sanctuary.radius) {
      this.conveniences.visited.add(this.ctx.map.region.id)
      this.hud.showToast('성소를 찾았다 · 지도')
      this.bus.emit('progressChanged', {})
    }
    this.minimap.update(dt, { hero: position, relics: this.pickups.list, sanctuaryReady: this.legend.present && this.growth.sanctuaryOpen })
    this.stage.update(this.elapsed)
    this.stage.follow(position)
  }

  /** 공격 모션의 궤적: 판정 모양대로 그리고, 발현했으면 그 신의 색 (E6-10) */
  private swingFx(swing: SwingSpec, strong: boolean): void {
    const p = this.hero.object.position
    const facing = this.hero.facing
    const god = this.ctx.build.chosen
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
    const god = this.ctx.build.chosen
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

  /** 이름표: 커서를 올린 몬스터와 지금 공격 중인 몬스터 (E12-09) */
  private updateNameplates(): void {
    const plates: PlateTarget[] = []
    // 보스 막대가 떠 있는 보스는 막대에 이름이 있으니 머리 위에는 띄우지 않는다
    const barBoss = this.legend.boss?.alive ? this.legend.boss : this.encounter.bossEngaged ? this.encounter.boss : null
    const add = (target: unknown) => {
      if (!(target instanceof Giant) || !target.alive || target === barBoss) return
      const top = heightAt(target.x, target.z) + Math.max(1.6, target.radius * 3.6) + 0.6
      plates.push({ key: target, name: target.spec.name, grade: gradeOf(target), life: target.health.ratio, screen: this.screenPoint(target.x, top, target.z) })
    }
    if (this.playing) {
      add(this.playerInput.hovered)
      add(this.orders.attackTarget ?? this.combat.target)
    }
    this.nameplates.update(plates)
  }

  private updateHud(realDt: number): void {
    this.updateNameplates()
    const boss = this.encounter.boss
    const manifested = this.ctx.build.chosen
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
        bossName:
          this.legend.betProgress !== null
            ? null
            : this.legend.boss?.alive
              ? this.legend.boss.spec.name
              : boss && this.encounter.bossEngaged
                ? boss.spec.name
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
        sources: Object.fromEntries(this.sourceRows().map((r) => [r.id, { value: r.total, level: r.level }])),
      },
      realDt,
    )
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
    this.applyViewHeight(clampViewHeight(viewHeight))
  }

  /** 보이는 범위를 그대로 바꾼다 (대화 장면의 줌은 평소 범위보다 가깝다) */
  private applyViewHeight(next: number): void {
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

/** 장면 id의 뒷말: 첫 글자를 대문자로 (mythThor, bossOrochi) */
const capital = (id: string): string => id.charAt(0).toUpperCase() + id.slice(1)

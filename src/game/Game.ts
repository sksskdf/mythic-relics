import * as THREE from 'three'

import { AudioEngine } from '../audio/AudioEngine'
import { Input } from '../input/Input'
import { TouchControls } from '../input/TouchControls'
import { PixelRenderer } from '../render/PixelRenderer'
import { QuarterViewCamera } from '../render/QuarterViewCamera'
import { renderHeightForScreen, TARGET_RENDER_HEIGHT, visibleHeight } from '../render/resolution'
import { REGIONS, type RegionDef, START_REGION } from '../data/regions'
import { godDef, type RelicId } from '../relics/data'
import { Wardrobe } from '../looks/outfit'
import { DropTable } from '../gear/DropTable'
import { worldToScreen } from '../render/picking'
import { Pickups } from '../gear/Pickups'
import { DEMO_RELIC_STAGES, isMythRelic, RELIC_STAGES } from '../gear/mythRelic'
import type { SaveData } from '../save/SaveData'
import { ClassProgress } from '../myth/ClassProgress'
import { MAX_SLOTS, SLOT_BOSSES } from '../myth/slots'
import type { SkillContext } from '../skills/Skill'
import { DamageNumbers } from '../ui/DamageNumbers'
import { Hud } from '../ui/Hud'
import { GameMenu } from '../ui/GameMenu'
import { MenuData } from './MenuData'
import { Storyline } from './Storyline'
import { type MomentCard, MomentSystem } from './systems/Moments'
import { sceneId } from '../data/scenes'
import { AttackFx } from './AttackFx'
import { HoverCards } from './HoverCards'
import { PauseMenu } from '../ui/PauseMenu'
import { NavGrid } from '../world/navGrid'
import { regionLinks, walkRects } from '../data/world'
import { walkArea } from '../world/colliders'
import { buildHeroModel } from '../world/heroModel'
import type { BodyLook } from '../looks/body'
import { TITLE_REQUEST } from '../save/SaveData'
import { clampViewHeight, RENDER_SCALE, type RenderQuality, type Settings, settingsStorage } from '../save/settings'
import { frameDelta } from './clock'
import { Feel, type GameContext } from './context'
import { Encounter } from './Encounter'
import { Villagers } from './Villagers'
import { Minimap } from '../ui/Minimap'
import { Nameplates } from '../ui/Nameplates'
import { EventBus, type GameEvents } from './events'
import { UtgardLegend } from './Legend'
import { HERO_RADIUS, HeroController } from './HeroController'
import { HeroOrders } from './HeroOrders'
import { plowThrough } from './plow'
import { type CombatTarget, PlayerCombat } from './PlayerCombat'
import { RelicPowers } from './RelicPowers'
import { Stage } from './Stage'
import { AppearanceSystem } from './systems/Appearance'
import { chapterColor, ChapterSystem } from './systems/Chapters'
import { MythChoiceSystem, realmGods } from './systems/MythChoice'
import { AwakeningSystem } from './systems/Awakening'
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
import { DialogScene } from './DialogScene'
import { DialogBox } from '../ui/DialogBox'
import { DevTools } from '../dev/DevTools'
import { ChapterProgress } from '../progress/Chapters'
import { TrainingProgress } from '../progress/Training'
import { AwakenProgress } from '../progress/Awakening'
import { awakenDef, HUNT_KILLS } from '../data/awaken'
import { TabUnlocks } from '../progress/Tabs'
import { TabSystem } from './systems/Tabs'
import { Barriers } from '../world/Barriers'
import { MythPicker } from '../ui/MythPicker'
import { josa } from '../ui/josa'
import { ENEMIES } from '../enemies/Giant'
import { ChapterHud } from '../ui/ChapterHud'
import { Conveniences } from '../progress/Conveniences'
import { Ending } from '../progress/Ending'
import { ThreatProgress } from '../progress/Threat'
import { ThreatSystem } from './systems/Threat'
import { TrialSystem } from './systems/Trials'
import { TrialProgress } from '../progress/Trials'
import { RiftProgress } from '../progress/Rift'
import { RiftSystem } from './systems/Rift'
import { BlessingPicker } from '../ui/BlessingPicker'
import { Build } from '../build/Build'

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
  /** 터치 기기(휴대폰): 떠다니는 조이스틱과 두 손가락 확대·축소 (E235) */
  touch?: boolean
  /** 게임 밖의 까닭으로 멈춘다 (휴대폰을 가로로 들어 돌려 달라는 안내가 떠 있을 때) */
  suspended?: () => boolean
  /** 정보 화면 탭을 처음부터 모두 연다 (점검용 실행, E236-05) */
  allTabs?: boolean
  /** 신화의 유물을 손에 넣으면 그 신화가 열린다 (점검용 실행. 데모에서는 신을 깨워야 열린다, E238) */
  relicsOpenMyths?: boolean
}

/** 성소에서 이만큼 가까우면 고른 신화를 바꿀 수 있다 */
const CHOOSE_NEAR_SANCTUARY = 6

/** 첫 엔딩의 큰 카드 (E22-05): 엔딩 장면 뒤에 무엇이 열렸는지 */
const ENDING_CARD: MomentCard = {
  kind: '첫 엔딩',
  title: '엔딩 뒤가 열렸다',
  color: '#ffd27a',
  lines: ['남은 신화권의 결계가 풀렸다', '위협 단계: 같은 땅을 더 세게 다시 걷는다 (마을 촌장)', '시련·균열·성좌판이 열렸다 (정보 화면)', '신화 4단계·유물 3·4단계, 땅에 떨어지는 유물'],
}

/** 플레이 기록: 검증과 수치 조정에 쓴다. */
export interface PlayEvent {
  /** 게임 시간 (초) */
  t: number
  type: 'relic' | 'manifest' | 'open' | 'fragment' | 'forge' | 'gear' | 'kill' | 'bossKill' | 'death' | 'legendStart' | 'legendFail' | 'promote' | 'hurt' | 'threat' | 'region' | 'trial' | 'rift' | 'chapter' | 'ending'
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
  /** 첫 엔딩을 보았나 (E21-06): 엔딩 뒤 장치는 여기서만 연다 */
  readonly ending = new Ending()
  readonly progress = new ClassProgress(
    () => this.ending.has('mythStage4'),
    // 데모에서는 경험치로 저절로 열리지 않고 성소에서 고른다 (E22-03)
    () => this.ending.reached,
  )
  readonly drops = new DropTable()
  readonly wardrobe = new Wardrobe()
  readonly threat = new ThreatProgress()
  readonly trials = new TrialProgress()
  readonly rift = new RiftProgress()
  readonly riftSystem: RiftSystem
  private readonly blessingPicker: BlessingPicker
  readonly trialSystem: TrialSystem
  readonly threatSystem: ThreatSystem
  /** 대화 장면을 언제 여는가: 처음 보는 일, 마을 사람에게 말 걸기, 미룬 장면 (E15-06) */
  private readonly storyline: Storyline
  readonly conveniences = new Conveniences(() => this.ending.has('conveniences'))
  /** 장 진행 (E22): 지금 장·목표·열린 땅 */
  readonly chapters = new ChapterProgress(
    {
      chose: (realm) => this.progress.opened.some((god) => godDef(god).realm === realm),
      awakened: (realm) => this.progress.opened.filter((god) => godDef(god).realm === realm).length,
      level: () => Math.max(0, ...this.progress.opened.map((god) => this.progress.level(god))),
      forged: () => Math.max(0, ...this.powers.loadout.ownedRelics.filter(isMythRelic).map((id) => this.powers.loadout.stage(id))),
    },
    () => this.ending.reached,
  )
  readonly chapterSystem: ChapterSystem
  /** 수련 (E236): 경험치로 얻은 깨달음과 익힌 마디 */
  readonly training = new TrainingProgress()
  /** 신을 깨우는 진행 (E238): 깨우는 신과 모은 조각 */
  readonly awaken = new AwakenProgress()
  /** 신을 깨우는 길 (E238): 흔적·사냥·수호자 */
  readonly awakening: AwakeningSystem
  /** 연 정보 화면 탭 (E236-05): 쓸 일이 생길 때 하나씩 열린다 */
  readonly tabs = new TabUnlocks()
  readonly tabSystem: TabSystem
  /** 막힌 땅으로 가는 통로의 결계 (E22-02) */
  private readonly barriers = new Barriers()
  /** 성소에서 신화 고르기 (E22-03) */
  readonly mythChoice: MythChoiceSystem
  private readonly mythPicker: MythPicker
  /** 목표 한 줄과 장 제목 띠 (E22-04) */
  readonly chapterHud: ChapterHud
  /** 순간의 크기 (E23-01): 사건을 등급에 맞는 크기(작은 알림·카드·큰 카드·장면)로 보인다 */
  readonly moments: MomentSystem
  /** 장면의 위아래 검은 띠 (E23-02) */
  private readonly letterbox = document.createElement('div')
  /** 성소의 전설과 시련 결계 (E6-04) */
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
  /** 조작 안내: 걸어 보면 싸우는 법으로, 싸워 보면 사라진다 (저장하지 않는다) */
  private coach: 'move' | 'fight' | null = null
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
  /** 정보 화면 (탭 여덟). 열려 있는 동안 게임이 멈춘다 */
  readonly menu: GameMenu
  /** 정보 화면에 보일 것 (탭마다 읽을 값, 능력치, 설명 카드의 지금 상태) */
  private readonly menuData: MenuData
  /** 일시 정지 메뉴와 설정 (E5) */
  readonly pauseMenu: PauseMenu
  /** 소리 (E5) */
  readonly audio: AudioEngine
  private readonly sound: SoundSystem
  /** 공격 모션의 궤적과 원거리 공격의 모습 */
  private readonly attackFx: AttackFx
  private settings: Settings
  /** 커서 아래의 설명 카드와 몬스터 이름표 */
  private readonly hover: HoverCards
  private readonly relics: RelicSystem
  readonly growth: ProgressionSystem
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
  /** 터치 기기(휴대폰)인가 (E235) */
  readonly touch: boolean
  /** 게임 밖의 까닭으로 멈췄나 (돌려 달라는 안내) */
  private readonly suspended: () => boolean

  constructor(
    private readonly container: HTMLElement,
    options: GameOptions = {},
  ) {
    this.touch = options.touch ?? false
    this.suspended = options.suspended ?? (() => false)
    this.settings = settingsStorage.load()
    if (options.quality) this.settings = { ...this.settings, quality: options.quality }
    // ?res= 로 픽셀 밀도를 바꿔 볼 수 있다. 기본은 프로토타입의 밀도에 설정의 해상도를 곱한다
    this.requestedRenderHeight = options.renderHeight ?? TARGET_RENDER_HEIGHT
    this.baseRenderHeight = options.renderHeight ?? Math.round(TARGET_RENDER_HEIGHT * RENDER_SCALE[this.settings.quality])
    this.pixel = new PixelRenderer(container, this.baseRenderHeight)
    this.input = new Input(this.pixel.renderer.domElement, undefined, this.touch)
    // 확대·축소: 주소의 ?view= 가 있으면 그 값, 없으면 저장한 설정
    this.view.viewHeight = options.viewHeight ?? this.settings.viewHeight
    this.pixel.setTargetHeight(renderHeightForScreen(this.view.viewHeight, container.clientWidth, container.clientHeight, this.baseRenderHeight))
    this.pixel.renderer.domElement.addEventListener('wheel', (e) => this.onWheel(e), { passive: false })
    // 떠오르는 숫자·주운 것 이름은 HUD(정보 화면 포함)보다 아래에 깔린다 (창을 열면 그 아래로 숨게)
    this.numbers = new DamageNumbers(container)
    this.hud = new Hud(container)
    this.villagers = new Villagers(container)
    this.scene.add(this.villagers.object)
    this.minimap = new Minimap(this.hud.root)
    this.nameplates = new Nameplates(container)

    // 지역 (E7): 저장한 지역이 없으면 첫 지역에서 시작한다
    const region = REGIONS[options.region ?? options.load?.region?.id ?? START_REGION] ?? REGIONS[START_REGION]!
    this.stage = new Stage(this.scene, region, REGIONS)
    const map = this.stage.map
    // 움직일 수 있는 곳: 땅의 네모와 이웃으로 가는 통로 (E19)
    // 막힌 땅으로 가는 통로는 빼고 (E22-02, 불러온 뒤에 World.refreshLinks로 다시 맞춘다)
    const area = walkArea(walkRects(region.halfExtent, regionLinks(REGIONS, region.id).filter((l) => this.chapters.isOpen(l.to))))
    const nav = new NavGrid(area, 0.5, map.colliders, HERO_RADIUS)
    this.nav = nav
    // 땅마다 적의 세기 (E22-02): 장 데이터의 적 지수
    this.encounter = new Encounter(region, map.colliders, area, (id) => (id ? this.chapters.power(id) : 1))
    this.scene.add(this.encounter.object)

    const rig = buildHeroModel()
    rig.setSilhouette(0x5b7fb8)
    this.scene.add(rig.root)
    this.hero = new HeroController(
      rig,
      nav,
      // 적을 무시하고 걸을 때는 보스만 길을 막고, 졸개는 밀고 지나간다.
      () => [...map.colliders, ...this.encounter.colliders(this.orders?.plowing ?? false)],
      area,
    )
    this.hero.teleport(region.spawn.x, region.spawn.z)
    this.combat = new PlayerCombat(this.hero)
    this.orders = new HeroOrders(this.hero, this.combat)
    this.hero.obstacles = () => this.encounter.colliders(this.orders.plowing)
    this.powers = new RelicPowers(this.fx.skills)
    // 유물 단계는 데모 2까지, 엔딩 뒤 4까지 (E21-04)
    this.powers.maxStage = () => (this.ending.has('relicStages') ? RELIC_STAGES : DEMO_RELIC_STAGES)
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
        barriers: this.barriers,
        isOpen: (id) => this.chapters.isOpen(id),
      },
      container,
    )
    this.scene.add(this.barriers.object)
    this.world.dress(region)
    // 이웃 땅의 무리도 미리 세워 둔다 (E19-04, 프레임마다 무리 하나씩)
    this.encounter.setNeighbors(this.world.neighborLayouts(region))
    this.backdrop = new TitleBackdrop({ hero: this.hero, fx: this.fx, stage: this.stage, view: this.view, hud: this.hud })
    this.dialog = new DialogBox(container)
    const scenesSeen = new Set<string>()
    this.scenes = new DialogScene({
      hero: this.hero,
      villagers: this.villagers,
      box: this.dialog,
      setHudHidden: (hidden) => {
        this.hud.setHidden(hidden)
        this.villagers.quiet = hidden
      },
      viewHeight: () => this.view.viewHeight,
      setViewHeight: (viewHeight) => this.applyViewHeight(viewHeight),
      clearOrders: () => this.orders.clear(),
      onSeen: (id) => {
        // 시작 장면 뒤: 조작은 대사 대신 해 볼 때까지 남는 안내 한 줄로 (사용자 의견 2026-10-28)
        if (id === 'opening') this.coach = 'move'
        this.bus.emit('progressChanged', {})
      },
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
      chips: (at, palette, count, height = 0.8, size = 0.12) => this.fx.debris.burst(at, count, palette, height, size),
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
      ending: this.ending,
      chapters: this.chapters,
      training: this.training,
      tabs: this.tabs,
      awaken: this.awaken,
      build: new Build({ powers: this.powers, progress: this.progress, threat: this.threat, trials: this.trials, trial: () => this.trialSystem?.active?.id ?? null, rift: this.rift, blessings: () => this.riftSystem?.blessings ?? [], training: this.training, awaken: this.awaken }),
      skills,
    }
    this.damage = new DamageSystem(this.ctx)
    this.relics = new RelicSystem(this.ctx)
    this.appearance = new AppearanceSystem(this.ctx)
    this.menuData = new MenuData({ game: this, ctx: this.ctx, relics: this.relics })
    this.menu = new GameMenu(this.hud.root, this.menuData.host())
    const onToggle = (open: boolean) => {
      this.hover.reset()
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
    // 작은 지도를 누르면 지도 탭이 열린다 (성소를 찾기 전이어도. 지금 보고 있으니 카드는 없이)
    this.minimap.canvas.addEventListener('click', () => {
      this.tabSystem.open('map', true)
      this.menu.show('map')
    })
    // 대화 장면 (E15-06): 마을 사람을 누르면 걸어가 말을 걸고, 처음 보는 일에는 짧은 장면
    this.storyline = new Storyline({ ctx: this.ctx, scenes: this.scenes, villagers: this.villagers, paused: () => this.paused, holding: () => this.moments.holding })
    this.letterbox.className = 'letterbox'
    container.append(this.letterbox)
    this.moments = new MomentSystem(this.ctx, {
      playScene: (id) => this.storyline.play(id, true),
      // 땅을 옮겨 가는 암전 중에도 기다린다 (장면이 어두운 화면 위에 서지 않게)
      sceneActive: () => this.scenes.active || this.world.traveling,
      slowMotion: () => this.storyline.enabled,
      cardBusy: () => this.hud.gainsBusy,
    })
    this.hover = new HoverCards({
      ctx: this.ctx,
      container,
      input: this.input,
      pixel: this.pixel,
      view: this.view,
      nameplates: this.nameplates,
      cardContext: (id, preview) => this.menuData.cardContext(id, preview),
      hovered: () => this.playerInput.hovered,
      screenPoint: (x, y, z) => this.screenPoint(x, y, z),
      traces: () => this.awakening.spots,
      traceContext: () => ({ waking: this.awaken.waking, fragments: this.awaken.fragments, hunt: this.awaken.hunt, sealedUntil: this.awakening.sealedUntil }),
      guardian: () => this.awakening.fighting,
    })
    // 새 외형은 메뉴 단추의 점으로만 알린다. (유물 이름 알림과 겹치지 않게, 외형 탭이 열린 뒤에만)
    this.bus.on('looksUnlocked', () => {
      if (this.tabs.has('looks')) this.menu.markNew()
    })
    // 가방에 더 좋은 장비가 들어왔다: 메뉴 단추를 누르면 장비 탭부터 (밟거나 눌러서 줍기, 사용자 의견 2026-10-28)
    this.bus.on('gearBetter', () => {
      if (this.tabs.has('relics')) this.menu.markTab('relics')
    })
    // 정보 화면 탭은 쓸 일이 생길 때 하나씩 열린다 (E236-05): 열리면 한 줄짜리 카드와 메뉴 단추 표시
    this.tabSystem = new TabSystem(this.ctx)
    this.tabSystem.onOpened = (tab, quiet) => {
      // 카드와 함께 연 탭은 정보 화면을 열 때까지 단추가 부른다 (사용자 의견 2026-10-28: 카드만 잠깐 떴다 마는 것은 모자라다)
      if (quiet) this.menu.markTab(tab)
      else this.menu.callTab(tab)
      this.menu.refresh()
    }
    // 수련 (E236): 깨달음을 얻으면 메뉴 단추에 표시하고 알린다. 첫 깨달음은 수련 탭이 열리는 카드가 알린다
    this.bus.on('insightGained', ({ count, unspent }) => {
      // 마디를 다 익혔으면 더 얻는 깨달음은 쓸 곳이 없다 (엔딩 뒤)
      if (this.training.complete) return
      if (!this.tabs.has('training')) {
        this.tabSystem.check()
        return
      }
      this.menu.markTab('training')
      this.bus.emit('moment', { id: 'insight', text: `깨달음 +${count} · 수련에서 익힌다 (남은 깨달음 ${unspent})` })
    })
    this.bus.on('outfitChanged', () => this.menu.refresh())
    this.bus.on('loadoutChanged', () => this.menu.refresh())
    // HUD 유물 칸: 커서를 올리면 설명 카드, 누르면 유물 화면
    // HUD 칸 i → 그 유물이 있는 장비 칸
    const equipSlot = (i: number | null) => (i === null ? null : (this.powers.hudSlots()[i]?.slot ?? null))
    this.hud.onSlotClick = (i) => this.menu.show('relics', equipSlot(i) ?? 0)
    this.hud.onSlotHover = (i, anchor) => this.hover.slot(equipSlot(i), anchor)
    this.growth = new ProgressionSystem(this.ctx)
    this.life = new HeroLife(this.ctx)
    this.threatSystem = new ThreatSystem(this.ctx)
    this.chapterSystem = new ChapterSystem(this.ctx)
    this.mythPicker = new MythPicker(this.hud.root)
    this.mythChoice = new MythChoiceSystem(this.ctx, this.mythPicker)
    this.awakening = new AwakeningSystem(
      this.ctx,
      (p) => this.nav.nearestFree(p),
      (relic, announce) => this.relics.equip(relic, announce),
      // 점검용 실행(?relics=)에서는 흔적이 응답하지 않는다: 봇·점검 스크립트의 신화에 다른 신의 힘이 섞이지 않게
      () => options.relicsOpenMyths ?? false,
    )
    // 데모에서는 신화의 유물을 손에 넣어도 신화가 열리지 않는다: 신을 깨워야 연다 (E238). 점검용 실행과 엔딩 뒤에는 예전처럼
    this.relics.relicsOpenMyths = () => (options.relicsOpenMyths ?? false) || this.ending.reached
    // 다음 장이 열리면 그 땅으로 가는 결계가 풀리고(E22-02) 장 제목 띠가 지나간다 (E22-04)
    this.chapterHud = new ChapterHud(this.hud.root)
    // 장 넘어가기는 장면 (E23-02): 그 장의 한마디 뒤에 장 제목 띠
    this.bus.on('chapterChanged', ({ chapter }) => {
      this.world.refreshLinks()
      if (chapter) {
        this.bus.emit('moment', { id: 'chapterChanged', scene: sceneId('chapter', chapter.id), after: () => this.chapterHud.showChapter(chapter.title, chapter.name, chapterColor(chapter)) })
      } else if (!this.ending.reached) this.endingMoment(true)
    })
    // 지금 장의 땅은 할 일 차례로 열린다 (E236-01): 할 일을 하나 마치면 다음 땅의 결계가 풀린다
    this.bus.on('goalChanged', () => this.world.refreshLinks())
    this.trialSystem = new TrialSystem(this.ctx, this.growth, this.threatSystem)
    this.blessingPicker = new BlessingPicker(this.hud.root)
    this.riftSystem = new RiftSystem(
      this.ctx,
      this.threatSystem,
      {
        enter: (region) => this.world.enter(region),
        home: () => this.world.travelTo(START_REGION),
        offer: (choices, pick) => this.blessingPicker.show(choices, pick),
        closeBlessings: () => this.blessingPicker.hide(),
      },
      this.scene,
    )
    this.persistence = new Persistence(this.ctx, options.autosave ?? false)
    this.playerInput = new PlayerInput(this.ctx, this.input, this.pixel, container)
    this.playerInput.talkAt = (x, z) => (this.ctx.map.region.kind === 'hub' ? this.villagers.at(x, z) : null)
    this.playerInput.onTalk = (name) => (this.storyline.talkTo = name)
    this.playerInput.pickupAt = (x, y) => this.hover.pickupAt(x, y)
    // 휴대폰 (E235): 떠다니는 조이스틱·톡·두 손가락 확대·축소
    if (this.touch) {
      const touch = new TouchControls(this.pixel.renderer.domElement, container)
      this.playerInput.touch = touch
      this.input.frameEnd.push(() => touch.gestures.endFrame())
    }
    this.playerInput.onZoom = (viewHeight, end) => {
      if (viewHeight !== this.view.viewHeight) this.setViewHeight(viewHeight)
      if (end) this.settings = settingsStorage.update({ viewHeight: this.view.viewHeight })
    }
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
      skills: this.ctx.skills,
      encounter: this.encounter,
      training: this.training,
      awakening: this.awakening,
    })
    this.audio = new AudioEngine(this.settings.volume)
    this.attackFx = new AttackFx({ fx: this.fx, hero: this.hero, combat: this.combat, build: this.ctx.build, audio: this.audio })
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
        lend: (god) => this.relics.lend(god),
        applyStats: () => this.growth.applyStats(),
        applyLooks: () => this.appearance.apply(),
      })
      // 위협 단계 배율은 불러온 단계로 (이미 세운 적도 다시 세운다)
      this.threatSystem.apply()
      if (this.threat.level > 1) this.encounter.resetAll()
      this.chapterSystem.sync()
      this.world.refreshLinks(false)
      // 마지막 보스를 이긴 뒤 엔딩이 끝나기 전에 저장된 판: 엔딩을 다시 보인다 (안 그러면 엔딩 뒤 장치가 영영 닫힌다)
      if (this.chapters.finished && !this.ending.reached) this.endingMoment(false)
      this.settleLoaded()
    }
    // 점검용 실행과 엔딩 뒤 판은 정보 화면 탭을 모두 연 채로 (E236-05)
    if (options.allTabs || this.ending.reached) this.tabs.openAll()
    for (const id of options.startRelics ?? []) this.relics.equip(id, false)
    // 탭 열기는 불러온 뒤에 켠다: 저장에서 빠진 탭이 있으면 카드 없이 연다
    this.tabSystem.ready = true
    this.tabSystem.check(true)
    if (this.tabs.has('training') && this.training.unspent > 0 && !this.training.complete) this.menu.markTab('training')
    // 처음 선 땅도 들어선 땅이다 (점검 주소로 막힌 땅에서 시작해도 거기는 열려 있게)
    if (this.chapters.enter(this.ctx.map.region.id)) {
      this.chapterSystem.sync()
      this.world.refreshLinks(false)
    }
    // 신의 흔적과 수호자 자리 (E238): 처음 선 땅은 들어서는 사건 없이 지었으니 여기서 세운다
    this.awakening.settle()
    this.awakening.refresh()

    this.view.jumpTo(rig.root.position)
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  /** 조작 안내 한 줄: 땅을 눌러 걸어 보면 → 가까이 적이 있을 때 적을 눌러 보라고 → 싸우면 사라진다 */
  private updateCoach(): void {
    if (this.coach === 'move' && this.orders.order?.kind === 'move') this.coach = 'fight'
    if (this.coach === 'fight' && (this.orders.order?.kind === 'attack' || this.combat.combo.swinging)) this.coach = null
    let text: string | null = null
    if (this.playing && !this.paused && !this.scenes.active && this.coach) {
      const p = this.hero.object.position
      if (this.coach === 'move') text = this.touch ? '화면을 누른 채 끌면 걷는다' : '땅을 누르면 걷는다'
      else if (this.encounter.alive.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 9)) text = this.touch ? '적을 톡 누르면 싸운다' : '적을 누르면 싸운다'
    }
    this.hud.setCoach(text)
  }

  /**
   * 불러온 자리가 막혔거나 시작점까지 길이 없으면 가까운 빈 곳이나 시작점에 세운다 (E24-07: 마을을 다시 지어
   * 옛 저장의 자리가 새 건물·절벽 안일 수 있다). 막힌 곳에 떨어져 있던 물건도 가까운 빈 곳으로 옮긴다
   */
  private settleLoaded(): void {
    const p = this.hero.object.position
    const spawn = this.ctx.map.region.spawn
    const free = this.nav.nearestFree({ x: p.x, z: p.z }, 4)
    if (!free || this.nav.findPath(free, spawn).length === 0) this.hero.teleport(spawn.x, spawn.z)
    else if (free.x !== p.x || free.z !== p.z) this.hero.teleport(free.x, free.z)
    for (const item of [...this.pickups.list]) {
      if (!this.nav.isBlocked(item)) continue
      const to = this.nav.nearestFree(item) ?? spawn
      const gear = item.gear
      this.pickups.remove(item.id)
      this.pickups.drop(item.id, to.x, to.z, true, gear)
    }
  }

  /** 사건을 플레이 기록으로 남긴다. (봇 검증과 수치 조정용) */
  private recordPlay(): void {
    const record = (type: PlayEvent['type'], detail?: string) => this.log.push({ t: Math.round(this.time * 10) / 10, type, detail })
    const { bus } = this
    bus.on('relicPicked', ({ id }) => record('relic', id))
    bus.on('mythOpened', ({ god }) => record('open', god))
    bus.on('fragment', ({ god, piece }) => record('fragment', `${god}:${piece}`))
    bus.on('forged', ({ relic, stage }) => record('forge', `${relic}:${stage}`))
    bus.on('gearPicked', ({ item }) => record('gear', item.grade))
    bus.on('manifested', ({ god }) => record('manifest', god))
    bus.on('giantKilled', ({ giant }) => record(giant.spec.boss ? 'bossKill' : 'kill', giant.spec.boss))
    bus.on('heroHurt', ({ damage }) => record('hurt', String(Math.round(damage))))
    bus.on('threatChanged', ({ level }) => record('threat', String(level)))
    bus.on('regionEntered', ({ id }) => record('region', id))
    bus.on('chapterChanged', ({ chapter }) => record('chapter', chapter?.id ?? 'end'))
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

  /** 마지막 장을 끝냈다 (E22-05): 느린 동작 → 엔딩 장면(엔딩 곡) → 엔딩 뒤 장치가 열리고 큰 카드. slow면 쓰러진 순간의 느린 동작 */
  private endingMoment(slow: boolean): void {
    this.bus.emit('moment', { id: 'ending', scene: 'ending', slow, music: 'ending', card: ENDING_CARD, after: () => this.showEnding() })
  }

  /** 첫 엔딩 (E22-05): 엔딩 장면 뒤에 엔딩 뒤 장치를 열고 「첫 엔딩」 띠 (무엇이 열렸는지는 ENDING_CARD) */
  private showEnding(): void {
    this.reachEnding()
    const gold = ENDING_CARD.color
    this.hud.flash(gold)
    this.fx.power.column(this.hero.object.position, gold)
    this.view.shake(0.4)
    this.chapterHud.showChapter('첫 엔딩', '갈라진 하늘이 닫혔다', gold)
    this.bus.emit('sound', { cue: 'promote' })
    this.log.push({ t: Math.round(this.time * 10) / 10, type: 'ending' })
  }

  /** 첫 엔딩을 보았다 (E21-06): 엔딩 뒤 장치를 연다. 마지막 보스를 이기면 엔딩 장면 뒤에 부르고(E22-05), 개발 패널과 점검 스크립트도 부른다 */
  reachEnding(): void {
    if (this.ending.reached) return
    this.ending.reached = true
    this.conveniences.catchUp()
    this.chapterSystem.check()
    // 모든 땅과 정보 화면 탭이 열린다
    this.world.refreshLinks()
    this.tabs.openAll()
    this.menu.refresh()
  }

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

  /** 바뀐 것이 있으면 저장한다. */
  saveNow(): void {
    this.persistence.saveNow()
  }

  /**
   * 화면을 그리지 않고 게임 시간만 seconds초 진행한다. (자동 플레이 검증용)
   * 입력은 읽지 않으므로 주인공은 hero.moveTo로만 움직인다.
   */
  advance(seconds: number, step = 1 / 30): void {
    for (let t = 0; t < seconds; t += step) {
      this.update(step, false)
      // 기다리는 순간(장면 뒤 카드·엔딩 등)도 함께 흘린다 (E23-01). 실제 시간이 흐르지 않으니 HUD 카드의 시계는 보지 않는다
      this.moments.update(step, false)
    }
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

  /** 축복 고르기 창을 닫는다 (봇이 대신 골랐을 때) */
  hideBlessings(): void {
    this.blessingPicker.hide()
  }

  /** 처음 보는 일의 짧은 대화 장면을 연다 (창이 열려 있으면 미룬다, `Storyline.play`) */
  story(id: string): boolean {
    return this.storyline.play(id)
  }

  /** 처음 보는 일의 대화 장면을 띄우는가 (봇·점검 스크립트는 끈다) */
  get storyScenes(): boolean {
    return this.storyline.enabled
  }

  set storyScenes(on: boolean) {
    this.storyline.enabled = on
  }

  /** 원천마다: 장비의 합, 원천 숙련, 합계, 각성 단계 (HUD·정보 화면·봇) */
  sourceRows(): ReturnType<MenuData['sourceRows']> {
    return this.menuData.sourceRows()
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
    // 휴대폰을 가로로 들어 안내가 화면을 덮은 동안은 그리지 않는다 (배터리, E235)
    if (this.suspended()) {
      this.input.endFrame()
      return
    }
    if (!this.playing) {
      this.updateBackdrop(realDt)
      return
    }
    // 창이 열린 동안은 곡을 줄인다 (고르기 창을 닫을 때도 맞도록 프레임마다)
    this.audio.setDucked(this.paused)
    // 정보 화면이 열려 있으면 게임은 멈추고 화면만 그린다. (E4-07)
    if (!this.paused) {
      this.storyline.next()
      this.moments.update(realDt)
      // 대화 중에는 이동 입력을 받지 않고, 카메라는 주인공과 말하는 사람 사이를 본다 (E12-10)
      // 대화 중에는 세계가 멈춘다 (싸우다 신화가 열리거나 보스가 말해도 맞지 않게, E15-06)
      const talking = this.scenes.active
      this.update(talking ? 0 : realDt, !talking)
      this.scenes.update(realDt)
      this.view.follow(talking ? this.scenes.focus : this.hero.object.position, realDt)
      if (!talking) this.hover.update()
    }
    this.numbers.update(realDt, this.container.clientHeight, this.pixel.size, this.view.camera, this.view.subpixel)
    this.updateHud(realDt)
    this.pixel.render(this.scene, this.view.camera, this.view.subpixel)
    this.input.endFrame()
    this.frame += 1
    this.persistence.update(realDt)
    this.audio.update()
  }

  /**
   * 다음 목표의 자리 (지금 땅 좌표, E22-04): 지금 땅이면 성소(고르기·전설)·보스·대장장이, 다른 땅이면 그쪽 통로 입구.
   * 작은 지도의 금빛 표시와 봇이 쓴다
   */
  goalSpot(): { x: number; z: number } | null {
    const goal = this.chapters.goal
    const region = this.ctx.map.region
    if (!goal || region.kind === 'rift') return null
    // 신 깨우기 (E238): 깨우는 신의 다음 조각(사냥하는 땅·수호자 자리), 없으면 응답하는 흔적
    if (goal.kind === 'awaken') {
      const target = this.awakening.target(goal.region)
      if (!target) return null
      if (target.region !== region.id) return this.world.wayTo(target.region)
      return this.awakening.placed(target)
    }
    if (goal.region !== region.id) return this.world.wayTo(goal.region)
    if (goal.kind === 'boss') return region.boss
    if (goal.kind === 'forge') return region.npcs.find((n) => n.name === '대장장이') ?? null
    return region.sanctuary
  }

  /**
   * 개발 지름길 (E22): 지금 목표를 한 것으로 한다. 들어설 땅이면 그리로 가고, 고르기는 그 신화권 첫 신화,
   * 신화 단계는 고른 신화를 그 단계까지, 보스는 이긴 것으로(여는 신화권도), 벼리기는 재료를 채워 벼린다
   */
  skipGoal(): void {
    const goal = this.chapters.goal
    if (!goal) return
    switch (goal.kind) {
      case 'enter':
        // 걸어 넘어가는 동안 기다리지 않게 들어선 것으로 먼저 적는다
        this.chapters.enter(goal.region)
        this.world.travelTo(goal.region)
        break
      case 'choose': {
        const god = realmGods(goal.realm!).find((g) => !this.progress.isOpen(g))
        if (god && this.progress.open(god)) this.bus.emit('mythOpened', { god })
        break
      }
      case 'awaken':
        // 조각을 하나씩 (흔적 → 사냥 → 수호자) 그 할 일을 마칠 때까지
        for (let i = 0; i < 12 && this.chapters.goal === goal; i++) if (!this.awakening.skip(this.awakening.target(goal.region)?.god)) break
        break
      case 'level':
        if (!this.ctx.build.chosen) break
        while (this.progress.level(this.ctx.build.chosen) < goal.n!) this.dev.promote()
        break
      case 'boss': {
        this.chapters.bossDefeated(goal.region)
        if (goal.opens) this.mythChoice.openRealm(goal.opens)
        break
      }
      case 'forge': {
        const god = this.ctx.build.chosen
        if (!god) break
        for (let i = 0; i < goal.n! && this.chapters.goal === goal; i++) {
          this.dev.fillForge(god)
          this.dev.forge(god)
        }
        break
      }
    }
    this.chapterSystem.check()
  }

  /** 지금 게임 시간의 빠르기 (점검용: 장면 앞 느린 동작이면 1보다 작다) */
  get gameSpeed(): number {
    return this.feel.timeScale
  }

  /** 본 장면 기록에서 지운다 (개발 패널·점검: 장면을 다시 띄워 본다) */
  forgetScene(id: string): void {
    this.ctx.scenesSeen.delete(id)
  }

  /** 지금 땅에 서 있는 결계 (점검용) */
  get barrierSpots(): { to: string; x: number; z: number }[] {
    return this.barriers.spots
  }

  /** 신화 고르기 카드가 떠 있나 (봇·점검용) */
  get mythPickerOpen(): boolean {
    return this.mythPicker.open
  }

  /** 정보 화면·일시 정지 메뉴·신화 고르기가 열려 있어 게임이 멈췄는가 */
  get paused(): boolean {
    return this.menu.open || (this.pauseMenu?.open ?? false) || (this.mythPicker?.open ?? false) || this.suspended()
  }

  /**
   * 창과 키보드: 첫 입력에 소리를 켜고, Esc로 창을 닫거나 일시 정지하고,
   * 탭을 옮기거나 창이 가려지면 멈춘다. (E5-04·06)
   */
  private listenWindow(): void {
    const unlock = () => this.audio.unlock()
    addEventListener('pointerdown', unlock)
    addEventListener('keydown', unlock)
    // 휴대폰(iOS Safari)은 손가락을 뗄 때만 소리를 켜 준다: 누를 때 만든 소리가 잠들어 있으면 뗄 때 깨운다 (E235)
    addEventListener('pointerup', unlock)
    addEventListener('touchend', unlock)
    addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !this.playing) return
      if (this.pauseMenu.open) this.pauseMenu.hide()
      else if (this.menu.open) this.menu.toggle(false)
      // 대화 중에는 세계가 이미 멈춰 있고, 일시 정지 창은 숨은 HUD 안이라 보이지 않는다
      else if (!this.scenes.active) this.pauseMenu.show()
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

  /** 창 밖으로 나가면 멈춘다. 이미 창이 열려 있거나 대화 중(세계가 멈춤)이면 그대로 둔다 */
  private autoPause(): void {
    if (this.playing && !this.paused && !this.scenes.active) this.pauseMenu.show()
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

  /** 고른 신화를 바꿀 수 있는 곳인가: 마을, 또는 지역 성소 곁 (E12-04, DESIGN.md 4.2). 전설·시련 중에는 못 바꾼다 (도전한 신화가 승급하도록) */
  get canChooseMyth(): boolean {
    if (this.legend.active) return false
    if (this.ctx.map.region.kind === 'hub' || this.conveniences.has('quickChoose')) return true
    if (!this.legend.present) return false
    const p = this.hero.object.position
    return Math.hypot(p.x - this.legend.center.x, p.z - this.legend.center.z) <= CHOOSE_NEAR_SANCTUARY
  }

  /** 정보 화면에서 신화를 고른다. 마을·성소가 아니거나 닫힌 신화면 false */
  chooseMyth(god: string): boolean {
    return this.canChooseMyth && this.relics.choose(god, true)
  }

  /** 신위 칸 (E237): 칸 수, 칸의 신, 잠긴 칸마다 열리는 때 (정보 화면) */
  mythSlots(): { count: number; gods: readonly string[]; locked: readonly string[] } {
    const count = this.relics.slots
    const locked: string[] = []
    if (this.progress.opened.length < 2) locked.push('두 번째 신이 깨어나면')
    for (const region of SLOT_BOSSES) {
      if (this.chapters.bosses.has(region)) continue
      const boss = REGIONS[region]?.boss
      locked.push(`${josa(ENEMIES[boss?.enemy ?? 'king']?.name ?? '장 보스', '을')} 이기면`)
    }
    return { count, gods: this.progress.chosen.slice(0, Math.max(1, count)), locked: locked.slice(0, Math.max(0, MAX_SLOTS - Math.max(1, count))) }
  }

  /** 깨우는 중인 신 (E238): 모은 조각과 다음 할 일 (정보 화면 신화 탭) */
  wakingMyth(): { god: string; fragments: number; next: string } | null {
    const { waking, fragments, hunt } = this.awaken
    const path = waking ? awakenDef(waking) : undefined
    if (!waking || !path || this.progress.isOpen(waking)) return null
    const next = fragments >= 2 ? `${josa(path.guardian.name, '을')} 쓰러뜨린다` : `${REGIONS[path.land]?.name ?? path.land}에서 사냥한다 (${hunt}/${HUNT_KILLS})`
    return { god: waking, fragments, next }
  }

  /** 정보 화면에서 신위 칸의 빌린 칸에 넣거나 뺀다 (E237). 마을·성소에서만 */
  lendMyth(god: string, on: boolean): boolean {
    return this.canChooseMyth && (on ? this.relics.lend(god) : this.relics.unlend(god))
  }

  /** 기본 공격의 대상별 배율 (정예·보스에게 피해) */
  private readonly targetScale = (target: CombatTarget): number => this.damage.targetScale(target)

  /** 월드 좌표가 화면 어디에 보이는가 (CSS 픽셀, 자동 점검용) */
  screenPoint(x: number, y: number, z: number): { x: number; y: number } {
    return worldToScreen(new THREE.Vector3(x, y, z), this.container.clientHeight, this.pixel.size, this.view.camera, this.view.subpixel)
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
    // 장면 앞 느린 동작 (E23-02): 게임만 느려지고 카메라·HUD는 제 빠르기로
    const dt = this.feel.hitstop > 0 ? 0 : realDt * this.feel.timeScale
    this.feel.hitstop = Math.max(0, this.feel.hitstop - realDt)
    this.feel.slowLeft = Math.max(0, this.feel.slowLeft - realDt)
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
      onSwing: (swing, strong) => this.attackFx.swing(swing, strong),
      onShot: (target, strong) => this.attackFx.shot(target, strong),
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
    this.mythChoice.update()
    this.awakening.update(dt)
    this.trialSystem.update(dt)
    this.riftSystem.update(dt)
    this.life.update(dt)
    this.appearance.update()
    this.sound.update()

    const position = this.hero.object.position
    this.fx.update(dt, this.hero, this.elapsed)
    this.barriers.update(dt)
    this.villagers.update(dt, position, (x, y, z) => this.screenPoint(x, y, z))
    // 말 걸기와 보스 등장 장면 (E15-06)
    this.storyline.update(position)
    // 성소를 찾았다 (E15-04): 성소 결계 안에 들어서면 그 지역으로 워프할 수 있다
    const sanctuary = this.ctx.map.region.sanctuary
    if (sanctuary && !this.conveniences.visited.has(this.ctx.map.region.id) && Math.hypot(position.x - sanctuary.x, position.z - sanctuary.z) < sanctuary.radius) {
      this.conveniences.visited.add(this.ctx.map.region.id)
      this.bus.emit('moment', { id: 'shrineFound', text: '성소를 찾았다 · 지도' })
      this.bus.emit('progressChanged', {})
    }
    this.minimap.update(dt, {
      hero: position,
      relics: this.pickups.list,
      sanctuaryReady: this.legend.present && (this.growth.sanctuaryOpen || this.mythChoice.here !== null),
      goal: this.goalSpot(),
      // 신의 흔적 (E238): 응답하는 흔적만 그 신의 색으로
      traces: this.awakening.spots.filter((t) => t.state === 'open').map((t) => ({ x: t.x, z: t.z, color: godDef(t.god).color })),
    })
    // 이웃 땅 조각과 이웃 무리는 한 프레임에 하나씩만 짓는다 (조각이 먼저)
    if (!this.stage.update(this.elapsed)) this.encounter.buildStep()
    this.stage.follow(position)
  }

  private updateEnemies(dt: number): void {
    const position = this.hero.object.position
    const shattered = this.encounter.update(dt, {
      hero: { x: position.x, z: position.z, radius: HERO_RADIUS, alive: this.combat.alive },
      decoy: this.relics.decoy,
      area: this.nav.area,
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
    // 창이 열렸거나 대화 중이면 이름표를 띄우지 않는다 (창 위에 그려지지 않게, E12-09)
    this.hover.plates(this.playing && !this.paused && !this.scenes.active)
    this.updateCoach()
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
                : this.awakening.fighting
                  ? this.awakening.fighting.health.ratio
                  : null,
        bossName:
          this.legend.betProgress !== null
            ? null
            : this.legend.boss?.alive
              ? this.legend.boss.spec.name
              : boss && this.encounter.bossEngaged
                ? boss.spec.name
                : (this.awakening.fighting?.spec.name ?? null),
        slots: this.powers.hudSlots(),
        ultimate: manifested !== null,
        xp: manifested ? this.progress.xpRatio(manifested) : null,
        xpColor: manifested ? godDef(manifested).color : '',
        portrait: manifested
          ? { name: godDef(manifested).name, title: this.progress.title(manifested), color: godDef(manifested).color, level: this.progress.level(manifested) }
          : null,
        // 빌린 신(E237)은 밝은 칩, 그 밖에 낀 유물의 신은 잠든 가호
        lent: this.ctx.build.borrowed.map((g) => ({ name: godDef(g).name, color: godDef(g).color })),
        blessings: this.powers.state.blessings.filter((g) => !this.ctx.build.borrowed.includes(g)).map((g) => ({ name: godDef(g).name, color: godDef(g).color })),
        promote: manifested !== null && this.progress.readyToPromote(manifested),
        sources: Object.fromEntries(this.sourceRows().map((r) => [r.id, { value: r.total, level: r.level }])),
      },
      realDt,
    )
    // 장면과 신화 고르기에는 위아래 검은 띠 (E23-02)
    this.letterbox.classList.toggle('is-on', this.scenes.active || this.mythPicker.open)
    // 목표 한 줄 (E22-04): 보스 막대가 서거나 전설·대화 중이면 잠깐 감춘다
    const fighting = this.legend.active || (boss !== null && this.encounter.bossEngaged) || this.awakening.fighting !== null
    this.chapterHud.setGoal(this.chapterSystem.goalView(), fighting || this.scenes.active || this.world.traveling)
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
    this.view.viewHeight = next
    this.resize()
    this.view.setViewHeight(next)
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container
    // 가장 크게 확대했을 때의 픽셀 크기를 기준으로, 넓게 볼 때는 뭉개지지 않을 만큼만 해상도를 올린다 (세로 화면은 늘어난 세로만큼 더)
    this.pixel.setTargetHeight(renderHeightForScreen(this.view.viewHeight, width, height, this.baseRenderHeight))
    const size = this.pixel.setScreenSize(width, height)
    this.view.setRenderSize(size.width, size.height)
    this.stage.fitShadow(visibleHeight(this.view.viewHeight, width, height))
  }
}

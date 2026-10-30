import * as THREE from 'three'
import { UniqueState } from '../skills/uniques'
import { UniqueSystem } from './systems/Uniques'

import { AudioEngine } from '../audio/AudioEngine'
import { Input } from '../input/Input'
import { TouchControls } from '../input/TouchControls'
import type { PixelRenderer } from '../render/PixelRenderer'
import { QuarterViewCamera } from '../render/QuarterViewCamera'
import { REGIONS, type RegionDef, START_REGION } from '../data/regions'
import { godDef } from '../relics/data'
import { Wardrobe } from '../looks/outfit'
import { DropTable } from '../gear/DropTable'
import { worldToScreen } from '../render/picking'
import { Pickups } from '../gear/Pickups'
import { DEMO_RELIC_STAGES, isMythRelic, RELIC_STAGES, relicMyth } from '../gear/mythRelic'
import type { SaveData } from '../save/SaveData'
import { ClassProgress } from '../myth/ClassProgress'
import type { PartKind } from '../myth/pantheon'
import { DamageNumbers } from '../ui/DamageNumbers'
import { Hud } from '../ui/Hud'
import type { GameMenu } from '../ui/GameMenu'
import type { MenuData } from './MenuData'
import { MenuWiring } from './MenuWiring'
import { Storyline } from './Storyline'
import { MomentSystem } from './systems/Moments'
import { AttackFx } from './AttackFx'
import { HoverCards } from './HoverCards'
import type { PauseMenu } from '../ui/PauseMenu'
import { NavGrid } from '../world/navGrid'
import { regionLinks, walkRects } from '../data/world'
import { walkArea } from '../world/colliders'
import { buildHeroModel } from '../world/heroModel'
import type { BodyLook } from '../looks/body'
import { TITLE_REQUEST } from '../save/SaveData'
import { frameDelta } from './clock'
import { Feel, type GameContext } from './context'
import { Encounter } from './Encounter'
import { Villagers } from './Villagers'
import { Minimap } from '../ui/Minimap'
import { Nameplates } from '../ui/Nameplates'
import { EventBus, type GameEvents } from './events'
import { Sanctuary } from './Sanctuary'
import { HERO_RADIUS, HeroController } from './HeroController'
import { HeroOrders } from './HeroOrders'
import { plowThrough } from './plow'
import { type CombatTarget, PlayerCombat } from './PlayerCombat'
import { RelicPowers } from './RelicPowers'
import { Stage } from './Stage'
import { AppearanceSystem } from './systems/Appearance'
import { ChapterSystem } from './systems/Chapters'
import { WakeSystem } from './systems/Wake'
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
import { ExpeditionProgress } from '../progress/Expedition'
import { WakeProgress } from '../progress/Wake'
import { TabUnlocks } from '../progress/Tabs'
import { TabSystem } from './systems/Tabs'
import { Barriers } from '../world/Barriers'
import { SwapCard } from '../ui/SwapCard'
import { ChapterHud } from '../ui/ChapterHud'
import { AutomationProgress } from '../progress/Automation'
import { Waypoints } from '../progress/Waypoints'
import { Ending } from '../progress/Ending'
import { DepthProgress } from '../progress/Depth'
import { DepthSystem } from './systems/Depth'
import { AutomationSystem } from './systems/Automation'
import { OathSystem } from './systems/Oaths'
import type { OathId } from '../data/oaths'
import { OathProgress } from '../progress/Oaths'
import { OathCard } from '../ui/OathCard'
import { EndlessProgress } from '../progress/Endless'
import { EndlessSystem } from './systems/Endless'
import { ReturnCard } from '../ui/ReturnCard'
import { ExpeditionSystem } from './systems/Expedition'
import { Build } from '../build/Build'
import { type PlayEvent, PlayLog } from './PlayLog'
import { listenWindow } from './WindowEvents'
import { Viewport } from './Viewport'
import { HudFeed } from './HudFeed'
import { heroSkills } from './skillContext'
import { ChapterFlow } from './ChapterFlow'
import type { GameOptions } from './options'

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
  readonly progress: ClassProgress = new ClassProgress(
    () => this.ending.has('mythStage4'),
    // 장 정복 (E305-02): 신 단계 상한
    (): number => this.chapters.conquered,
  )
  readonly drops = new DropTable()
  readonly wardrobe = new Wardrobe()
  readonly depth = new DepthProgress()
  readonly oaths = new OathProgress()
  /** 끝없는 원정 기록 (E17 균열 → E305-03): 가장 깊이 내려간 층 */
  readonly endless = new EndlessProgress()
  readonly endlessSystem: EndlessSystem
  readonly oathSystem: OathSystem
  private readonly oathCard: OathCard
  readonly depthSystem: DepthSystem
  /** 대화 장면을 언제 여는가: 처음 보는 일, 마을 사람에게 말 걸기, 미룬 장면 (E15-06) */
  private readonly storyline: Storyline
  /** 자동화 (E305-03, `CYCLE.md` 3.5): 귀환 횟수가 열고, 엔딩을 봤으면 귀환 3 이상으로 친다. 자동 줍기는 엔딩 뒤 */
  readonly automation = new AutomationProgress(
    () => this.expedition.returns,
    () => this.ending.has('autoPickup'),
  )
  /** 웨이포인트 (E239-05): 밟아 켠 성소로 지도에서 바로 간다 */
  readonly waypoints = new Waypoints()
  /** 장 진행 (E22): 지금 장·목표·열린 땅 */
  readonly chapters: ChapterProgress = new ChapterProgress(
    {
      awakened: (realm) => this.progress.opened.filter((god) => godDef(god).realm === realm).length,
      forged: () => Math.max(0, ...this.powers.loadout.ownedRelics.filter(isMythRelic).map((id) => this.powers.loadout.stage(id))),
      returns: () => this.expedition.returns,
    },
    // 엔딩 뒤에는 남은 신화권 셋의 결계가 풀린다
    () => this.ending.has('realms'),
  )
  readonly chapterSystem: ChapterSystem
  /** 수련 (E236): 경험치로 얻은 깨달음과 익힌 마디 */
  readonly training = new TrainingProgress()
  /** 원정 (E304): 원정 번호·명성·원천 불씨·기록 */
  readonly expedition = Object.assign(new ExpeditionProgress(), { conquests: (): number => this.chapters.conquered, automation: () => this.automation.now })
  /** 신을 깨우는 진행 (E238): 깨우는 신과 모은 조각 */
  readonly awaken = new WakeProgress()
  /** 신을 깨우는 길 (E238): 흔적·사냥·수호자 */
  readonly awakening: WakeSystem
  /** 연 정보 화면 탭 (E236-05): 쓸 일이 생길 때 하나씩 열린다 */
  readonly tabs = new TabUnlocks()
  readonly tabSystem: TabSystem
  /** 막힌 땅으로 가는 통로의 결계 (E22-02) */
  private readonly barriers = new Barriers()
  /** 두 갈래 카드 (E302-03): 새 신의 손·심장 부품이 왔는데 자리가 차 있을 때 */
  private readonly swapCard: SwapCard
  private readonly uniqueSystem: UniqueSystem
  /** 원정과 귀환 (E304) */
  readonly expeditionSystem: ExpeditionSystem
  private readonly returnCard: ReturnCard
  /** 목표 한 줄과 장 제목 띠 (E22-04) */
  readonly chapterHud: ChapterHud
  /** 장 넘어가기와 첫 엔딩 (E22-05) */
  private readonly chapterFlow: ChapterFlow
  /** 순간의 크기 (E23-01): 사건을 등급에 맞는 크기(작은 알림·카드·큰 카드·장면)로 보인다 */
  readonly moments: MomentSystem
  /** 지금 땅의 성소: 돌 고리와 빛기둥, 한가운데가 귀환 화로 (E304) */
  readonly sanctuary: Sanctuary
  /** 주인공 길찾기 격자 */
  readonly nav: NavGrid
  /** 플레이 기록 (봇·점검 스크립트가 `game.log`로 읽는다) */
  private readonly playLog: PlayLog
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
  /** HUD에 넣을 것: 조작 안내·위아래 띠·목표 한 줄·작은 지도 */
  private readonly hudFeed: HudFeed
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
  /** 정보 화면 배선: 정보 화면에 보일 것, 탭을 여는 단추와 표시 */
  private readonly menuWiring: MenuWiring
  /** 일시 정지 메뉴와 설정 (E5) */
  readonly pauseMenu: PauseMenu
  /** 소리 (E5) */
  readonly audio: AudioEngine
  private readonly sound: SoundSystem
  /** 공격 모션의 궤적과 원거리 공격의 모습 */
  private readonly attackFx: AttackFx
  /** 화면과 설정: 픽셀 렌더러·확대·축소·창 크기 */
  private readonly viewport: Viewport
  /** 커서 아래의 설명 카드와 몬스터 이름표 */
  private readonly hover: HoverCards
  private readonly relics: RelicSystem
  readonly growth: ProgressionSystem
  private readonly life: HeroLife
  private readonly persistence: Persistence
  private readonly playerInput: PlayerInput
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
    this.viewport = new Viewport({ container, view: this.view, stage: () => this.stage, hud: () => this.hud, audio: () => this.audio, sceneActive: () => this.scenes.active }, options)
    this.pixel = this.viewport.pixel
    this.input = new Input(this.pixel.renderer.domElement, undefined, this.touch)
    this.viewport.attach(options.viewHeight)
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
    this.sanctuary = new Sanctuary({ x: 0, z: 0 }, 11)
    this.sanctuary.moveTo(region.sanctuary && (nav.nearestFree(region.sanctuary) ?? region.sanctuary), region.sanctuary?.radius)
    this.scene.add(this.sanctuary.object, this.pickups.object)
    this.fx.addTo(this.scene)
    this.world = new World(
      {
        bus: this.bus,
        stage: this.stage,
        nav,
        encounter: this.encounter,
        sanctuary: this.sanctuary,
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
        waypoints: this.waypoints,
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
      setViewHeight: (viewHeight) => this.viewport.applyViewHeight(viewHeight),
      clearOrders: () => this.orders.clear(),
      onSeen: (id) => {
        // 시작 장면 뒤: 조작은 대사 대신 해 볼 때까지 남는 안내 한 줄로 (사용자 의견 2026-10-28)
        if (id === 'opening') this.hudFeed.coach = 'move'
        this.bus.emit('progressChanged', {})
      },
      seen: scenesSeen,
      speakerAt: (who) => {
        const boss = this.encounter.alive.find((g) => g.spec.name === who)
        return boss ? { x: boss.x, z: boss.z } : null
      },
    })

    // 유물 스킬이 세계와 주고받는 것: 피해와 미끼는 시스템이 만들어진 뒤에 부른다
    const skills = heroSkills({ hero: this.hero, combat: this.combat, fx: this.fx, view: this.view, bus: this.bus, hit: (...hit) => this.damage.deal(...hit), setDecoy: (decoy) => (this.relics.decoy = decoy) })
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
      sanctuary: this.sanctuary,
      powers: this.powers,
      pickups: this.pickups,
      progress: this.progress,
      drops: this.drops,
      wardrobe: this.wardrobe,
      scenesSeen,
      depth: this.depth,
      oaths: this.oaths,
      endless: this.endless,
      automation: this.automation,
      waypoints: this.waypoints,
      ending: this.ending,
      chapters: this.chapters,
      training: this.training,
      expedition: this.expedition,
      tabs: this.tabs,
      awaken: this.awaken,
      uniques: new UniqueState(),
      build: new Build({ powers: this.powers, progress: this.progress, oaths: this.oaths, oath: () => this.expedition.oath, training: this.training, awaken: this.awaken, expedition: this.expedition }),
      skills,
    }
    this.damage = new DamageSystem(this.ctx)
    this.relics = new RelicSystem(this.ctx)
    this.uniqueSystem = new UniqueSystem(this.ctx)
    this.appearance = new AppearanceSystem(this.ctx)
    this.menuWiring = new MenuWiring({ game: this, ctx: this.ctx, relics: this.relics, viewport: this.viewport, hover: () => this.hover })
    this.menu = this.menuWiring.menu
    this.pauseMenu = this.menuWiring.pauseMenu
    // 대화 장면 (E15-06): 마을 사람을 누르면 걸어가 말을 걸고, 처음 보는 일에는 짧은 장면
    this.storyline = new Storyline({ ctx: this.ctx, scenes: this.scenes, villagers: this.villagers, paused: () => this.paused, holding: () => this.moments.holding })
    this.hudFeed = new HudFeed({ game: this, build: this.ctx.build, container, plates: (show) => this.hover.plates(show) })
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
      cardContext: (id) => this.menuWiring.data.cardContext(id),
      hovered: () => this.playerInput.hovered,
      screenPoint: (x, y, z) => this.screenPoint(x, y, z),
      traces: () => this.awakening.spots,
      traceContext: () => ({ waking: this.awaken.waking, fragments: this.awaken.fragments, hunt: this.awaken.hunt, sealedText: this.awakening.sealedText }),
      guardian: () => this.awakening.fighting,
    })
    // 정보 화면 탭은 쓸 일이 생길 때 하나씩 열린다 (E236-05): 열리면 한 줄짜리 카드와 메뉴 단추 표시
    this.tabSystem = new TabSystem(this.ctx)
    this.menuWiring.listen()
    this.growth = new ProgressionSystem(this.ctx)
    this.life = new HeroLife(this.ctx)
    this.depthSystem = new DepthSystem(this.ctx)
    // 자동화 (E305-03): 귀환 횟수가 연 것과 자동 줍기를 카드로 알린다
    new AutomationSystem(this.ctx)
    this.chapterSystem = new ChapterSystem(this.ctx)
    this.swapCard = new SwapCard(this.hud.root)
    // 새 신의 손·심장 부품이 왔는데 자리가 차 있으면 두 갈래 카드 (E302-03)
    this.relics.offerSwap = (part, incoming, current, choose) => this.swapCard.show(part, incoming, current, choose)
    this.awakening = new WakeSystem(
      this.ctx,
      (p) => this.nav.nearestFree(p),
      (relic, announce) => this.relics.equip(relic, announce),
      // 점검용 실행(?relics=)에서는 흔적이 응답하지 않는다: 봇·점검 스크립트의 신화에 다른 신의 힘이 섞이지 않게
      () => options.testRun ?? false,
    )
    // 목표 한 줄과 장 제목 띠 (E22-04), 장 넘어가기와 첫 엔딩 (E22-05)
    this.chapterHud = new ChapterHud(this.hud.root)
    this.chapterFlow = new ChapterFlow({ game: this, fx: this.fx, record: (type) => this.playLog.record(type) })
    this.returnCard = new ReturnCard(this.hud.root)
    this.oathCard = new OathCard(this.hud.root)
    this.expeditionSystem = new ExpeditionSystem(this.ctx, {
      offer: (view, pick, later) => this.returnCard.show(view, pick, later),
      offering: () => this.returnCard.open,
      ascend: (god) => this.growth.promote(god),
      merge: (uids) => void this.relics.merge(uids),
      deepen: (level) => void this.depthSystem.choose(level),
    })
    // 맹세 (E305-01): 귀환 2부터 다시 떠날 때 출발 카드
    this.oathSystem = new OathSystem(this.ctx, {
      offer: (view, pick) => this.oathCard.show(view, (id) => pick(id as OathId | null)),
      reapply: () => this.relics.reapply(),
      fillBreath: () => this.relics.fillBreath(),
    })
    this.endlessSystem = new EndlessSystem(
      this.ctx,
      this.depthSystem,
      {
        enter: (region) => this.world.enter(region),
        home: () => this.world.travelTo(START_REGION),
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
    this.playerInput.onZoom = (viewHeight, end) => this.viewport.zoom(viewHeight, end)
    // 개발 지름길은 공용 상태(ctx)에 시스템 몇을 더해 손댄다
    this.dev = new DevTools({
      ...this.ctx,
      relics: this.relics,
      growth: this.growth,
      life: this.life,
      awakening: this.awakening,
      applyDepth: () => this.depthSystem.apply(),
      chapterSystem: this.chapterSystem,
      world: this.world,
      expeditionSystem: this.expeditionSystem,
    })
    this.audio = new AudioEngine(this.viewport.settings.volume, { mobile: this.touch })
    this.attackFx = new AttackFx({ fx: this.fx, hero: this.hero, combat: this.combat, build: this.ctx.build, audio: this.audio })
    this.sound = new SoundSystem(this.ctx, this.audio)
    this.viewport.apply()
    listenWindow({ audio: this.audio, menu: this.menu, pauseMenu: this.pauseMenu, playing: () => this.playing, paused: () => this.paused, talking: () => this.scenes.active })
    this.playLog = new PlayLog(this.bus, () => this.time)

    if (options.title) {
      this.playing = false
      this.backdrop.show(true)
    }
    if (options.load) {
      this.persistence.restore(options.load, {
        equip: (id) => this.relics.equip(id, false),
        pantheon: (p) => this.relics.restore(p),
        applyStats: () => this.growth.applyStats(),
        applyLooks: () => this.appearance.apply(),
      })
      // 깊이 배율은 불러온 깊이로 (이미 세운 적도 다시 세운다)
      this.depthSystem.apply()
      if (this.depth.level > 1) this.encounter.resetAll()
      // 건 맹세 (E305-01): 빈 손·홀로의 도는 자리와 무리 크기
      this.oathSystem.sync()
      this.chapterSystem.sync()
      this.world.refreshLinks(false)
      // 마지막 보스를 이긴 뒤 엔딩이 끝나기 전에 저장된 판: 엔딩을 다시 보인다 (안 그러면 엔딩 뒤 장치가 영영 닫힌다)
      if (this.chapters.finished && !this.ending.reached) this.chapterFlow.endingMoment(false)
      this.world.settleLoaded()
    }
    // 점검용 실행과 엔딩 뒤 판은 정보 화면 탭을 모두 연 채로 (E236-05)
    if (options.allTabs || this.ending.reached) this.tabs.openAll()
    // 점검용 실행(?relics=): 데모에서는 유물로 신이 열리지 않으니(엔딩 뒤에만) 끼고 시작한 신화 유물의 신을 여기서 연다. 첫 신을 손·심장·숨에
    for (const id of options.startRelics ?? []) {
      this.relics.equip(id, false)
      const god = relicMyth(id)
      if (god && this.progress.open(god) && !this.progress.pantheon.hand) this.relics.choose(god, false)
    }
    // 탭 열기는 불러온 뒤에 켠다: 저장에서 빠진 탭이 있으면 카드 없이 연다
    this.tabSystem.ready = true
    this.tabSystem.check(true)
    this.menuWiring.afterLoad()
    // 처음 선 땅도 들어선 땅이다 (점검 주소로 막힌 땅에서 시작해도 거기는 열려 있게)
    if (this.chapters.enter(this.ctx.map.region.id)) {
      this.chapterSystem.sync()
      this.world.refreshLinks(false)
    }
    // 신의 흔적과 수호자 자리 (E238): 처음 선 땅은 들어서는 사건 없이 지었으니 여기서 세운다
    this.awakening.settle()
    this.awakening.refresh()

    this.view.jumpTo(rig.root.position)
    this.viewport.fit()
  }

  /** 플레이 기록: 게임 시간과 사건 (봇 검증과 수치 조정용) */
  get log(): PlayEvent[] {
    return this.playLog.events
  }

  /** 지금 상태를 저장 데이터로 만든다. */
  snapshot(): SaveData {
    return this.persistence.snapshot()
  }

  /** 첫 엔딩을 보았다 (E21-06, `ChapterFlow.reachEnding`): 엔딩 뒤 장치를 연다. 개발 패널과 점검 스크립트도 부른다 */
  reachEnding(): void {
    this.chapterFlow.reachEnding()
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

  /** 귀환 카드가 떠 있다 (E304, 봇) */
  get returnCardOpen(): boolean {
    return this.returnCard.open
  }

  /** 맹세 출발 카드가 떠 있다 (E305-01, 봇·점검) */
  get oathCardOpen(): boolean {
    return this.oathCard.open
  }

  /** 고르는 카드(귀환·맹세 출발)를 닫는다 (봇이 대신 골랐을 때) */
  hideCards(): void {
    this.returnCard.hide()
    this.oathCard.hide()
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
    return this.menuWiring.data.sourceRows()
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
    this.hudFeed.update(realDt)
    this.pixel.render(this.scene, this.view.camera, this.view.subpixel)
    this.input.endFrame()
    this.frame += 1
    this.persistence.update(realDt)
    this.audio.update()
  }

  /** 다음 목표의 자리 (지금 땅 좌표, E22-04, `HudFeed.goalSpot`): 작은 지도의 금빛 표시와 점검 스크립트가 쓴다 */
  goalSpot(): { x: number; z: number } | null {
    return this.hudFeed.goalSpot()
  }

  /** 개발 지름길 (E22): 지금 목표를 한 것으로 한다 (`DevTools.skipGoal`, 개발 패널·점검 스크립트) */
  skipGoal(): void {
    this.dev.skipGoal()
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

  /** 두 갈래 카드에 답한다 (봇·점검용): 그 카드의 「새 것으로」나 「지금 그대로」를 누른다 */
  answerSwap(take: boolean): boolean {
    const card = document.querySelectorAll<HTMLButtonElement>('.swap-card__card')[take ? 0 : 1]
    if (!this.swapCard.open || !card) return false
    card.click()
    return true
  }

  /** 두 갈래 카드가 떠 있나 (봇·점검용) */
  get swapOpen(): boolean {
    return this.swapCard.open
  }

  /** 정보 화면·일시 정지 메뉴·두 갈래 카드가 열려 있어 게임이 멈췄는가 */
  get paused(): boolean {
    return this.menu.open || (this.pauseMenu?.open ?? false) || (this.swapCard?.open ?? false) || this.suspended()
  }

  /** 그 자리에 낀다 (손·심장은 바꿔 끼고, 숨은 빈 칸에, 점검용. 정보 화면은 `RelicSystem.place`) */
  placeMyth(part: PartKind, god: string): boolean {
    return this.relics.place(part, god)
  }

  /** 숨 칸에서 뺀다 (점검용) */
  unplaceMyth(god: string): boolean {
    return this.relics.unplace(god)
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
    this.uniqueSystem.update(dt, this.relics.walked)
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
    this.expeditionSystem.update(dt)
    this.sanctuary.update(dt)
    this.awakening.update(dt)
    this.oathSystem.update()
    this.endlessSystem.update(dt)
    this.life.update(dt)
    this.appearance.update(dt)
    this.sound.update()

    const position = this.hero.object.position
    this.fx.update(dt, this.hero, this.elapsed)
    this.barriers.update(dt)
    this.villagers.update(dt, position, (x, y, z) => this.screenPoint(x, y, z))
    // 말 걸기와 보스 등장 장면 (E15-06)
    this.storyline.update(position)
    // 성소 결계 안에 들어서면 그 성소가 켜진다 (웨이포인트, E239-05)
    this.world.lightWaypoint()
    this.hudFeed.updateMinimap(dt)
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
      this.view.shake(giant.spec.role === 'boss' || giant.spec.role === 'guardian' ? 0.6 : 0.15)
      this.bus.emit('giantKilled', { giant })
    }
  }
}

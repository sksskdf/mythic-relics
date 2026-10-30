import { GameMenu } from '../ui/GameMenu'
import { PauseMenu } from '../ui/PauseMenu'
import type { GameContext } from './context'
import type { Game } from './Game'
import type { HoverCards } from './HoverCards'
import { MenuData } from './MenuData'
import type { RelicSystem } from './systems/Relics'
import type { Viewport } from './Viewport'

/** 정보 화면 배선이 손대는 게임의 부품 */
export interface MenuWiringParts {
  /** 게임 (시스템들은 만들어진 뒤에 읽는다) */
  readonly game: Game
  readonly ctx: GameContext
  readonly relics: RelicSystem
  /** 일시 정지 메뉴의 설정 */
  readonly viewport: Viewport
  /** 커서 아래 카드 (정보 화면보다 늦게 만든다) */
  hover(): HoverCards
}

/**
 * 정보 화면 배선 (E305-04에서 Game.ts에서 뗌): 정보 화면·일시 정지 메뉴를 만들고, 초상·HUD 유물 칸·작은 지도를 누르면 그 탭을,
 * 탭이 열리거나 새 외형·더 좋은 장비·깨달음이 생기면 메뉴 단추에 표시한다.
 */
export class MenuWiring {
  /** 정보 화면에 보일 것 (탭마다 읽을 값, 능력치, 설명 카드의 지금 상태) */
  readonly data: MenuData
  /** 정보 화면 (탭 여덟). 열려 있는 동안 게임이 멈춘다 */
  readonly menu: GameMenu
  /** 일시 정지 메뉴와 설정 (E5) */
  readonly pauseMenu: PauseMenu

  constructor(private readonly parts: MenuWiringParts) {
    const { game, ctx, relics, viewport } = parts
    this.data = new MenuData({ game, ctx, relics })
    this.menu = new GameMenu(game.hud.root, this.data.host())
    const onToggle = (open: boolean) => {
      parts.hover().reset()
      // 창을 여닫는 클릭이 이동 지시로 새지 않게 입력을 비운다.
      game.input.endFrame()
      if (!open) game.orders.release()
      game.audio.play(open ? 'uiOpen' : 'uiClose')
      game.audio.setDucked(game.paused)
    }
    this.menu.onToggle = onToggle
    this.pauseMenu = new PauseMenu(game.hud.root, {
      settings: () => viewport.settings,
      change: (patch) => viewport.change(patch),
      toTitle: () => game.toTitle(),
    })
    this.pauseMenu.onToggle = onToggle
    game.hud.onPortraitClick = () => this.menu.show('status')
    // 작은 지도를 누르면 지도 탭이 열린다 (성소를 찾기 전이어도. 지금 보고 있으니 카드는 없이)
    game.minimap.canvas.addEventListener('click', () => {
      game.tabSystem.open('map', true)
      this.menu.show('map')
    })
  }

  /** 버스와 탭 열기에 귀를 연다 (탭 열기 시스템을 만든 뒤에 부른다) */
  listen(): void {
    const { game } = this.parts
    const { bus, tabs } = game
    const menu = this.menu
    // 새 외형은 메뉴 단추의 점과 신 탭의 「외형」 알약으로만 알린다. (유물 이름 알림과 겹치지 않게, 신 탭이 열린 뒤에만)
    bus.on('looksUnlocked', () => {
      if (tabs.has('gods')) menu.markNew()
    })
    // 가방에 더 좋은 장비가 들어왔다: 메뉴 단추를 누르면 장비 탭부터 (밟거나 눌러서 줍기, 사용자 의견 2026-10-28)
    bus.on('gearBetter', () => {
      if (tabs.has('relics')) menu.markTab('relics')
    })
    // 정보 화면 탭은 쓸 일이 생길 때 하나씩 열린다 (E236-05): 열리면 한 줄짜리 카드와 메뉴 단추 표시
    game.tabSystem.onOpened = (tab, quiet) => {
      // 카드와 함께 연 탭은 정보 화면을 열 때까지 단추가 부른다 (사용자 의견 2026-10-28: 카드만 잠깐 떴다 마는 것은 모자라다)
      if (quiet) menu.markTab(tab)
      else menu.callTab(tab)
      menu.refresh()
    }
    // 수련 (E236): 깨달음을 얻으면 메뉴 단추에 표시하고 알린다. 첫 깨달음은 수련 탭이 열리는 카드가 알린다
    bus.on('insightGained', ({ count, unspent }) => {
      // 마디를 다 익혔으면 더 얻는 깨달음은 쓸 곳이 없다 (엔딩 뒤)
      if (game.training.complete) return
      if (!tabs.has('training')) {
        game.tabSystem.check()
        return
      }
      menu.markTab('training')
      bus.emit('moment', { id: 'insight', text: `깨달음 +${count} · 수련에서 익힌다 (남은 깨달음 ${unspent})` })
    })
    bus.on('outfitChanged', () => menu.refresh())
    bus.on('loadoutChanged', () => menu.refresh())
    // HUD 유물 칸: 커서를 올리면 설명 카드, 누르면 신 탭(유물표)
    const hudRelic = (i: number | null) => (i === null ? null : (game.powers.hudSlots()[i]?.relic ?? null))
    game.hud.onSlotClick = () => menu.show('gods')
    game.hud.onSlotHover = (i, anchor) => this.parts.hover().slot(hudRelic(i), anchor)
  }

  /** 불러온 뒤: 익히지 않은 깨달음이 남았으면 메뉴 단추에 수련 탭 표시 */
  afterLoad(): void {
    const { training, tabs } = this.parts.game
    if (tabs.has('training') && training.unspent > 0 && !training.complete) this.menu.markTab('training')
  }
}

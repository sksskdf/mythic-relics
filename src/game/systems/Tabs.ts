import { VFX } from '../../art/palette'
import { isMythRelic } from '../../gear/mythRelic'
import { STEP_TAB_DEFS, STEP_TABS, type StepTab, type TabFacts, tabsDue } from '../../progress/Tabs'
import { glyph } from '../../ui/sigils'
import type { GameContext } from '../context'

/** 탭이 열렸다는 카드의 색 (안내색) */
const CARD_COLOR = `#${VFX.guide.toString(16).padStart(6, '0')}`

/**
 * 정보 화면 탭을 차례로 연다 (E236-05): 장비를 줍고, 깨달음을 얻고, 성소를 찾고… 쓸 일이 생길 때 그 탭을 열고
 * 무엇을 하는 곳인지 한 줄짜리 카드를 띄운다. 연 탭은 저장한다 (`progress/Tabs`).
 */
export class TabSystem {
  /** 탭이 새로 열렸을 때 (메뉴 단추에 표시하고 다시 그린다) */
  onOpened: (tab: StepTab) => void = () => {}
  /** 게임을 다 세우고 저장을 불러온 뒤에 켠다 (불러오는 동안 끼우는 장비로 카드가 뜨지 않게) */
  ready = false
  private checking = false

  constructor(private readonly ctx: GameContext) {
    const check = () => this.check()
    for (const name of ['gearPicked', 'loadoutChanged', 'mythOpened', 'forged', 'progressChanged'] as const) ctx.bus.on(name, check)
  }

  /** 탭을 여는 때를 가리는 지금 상태 */
  facts(): TabFacts {
    const { powers, training, conveniences, progress, build, tabs } = this.ctx
    const loadout = powers.loadout
    return {
      gear: loadout.owned.length > 0,
      insights: training.insights,
      shrine: conveniences.visited.size > 0,
      // 빌드 상태는 통째로 새로 계산하니, 원천 탭이 열린 뒤에는 보지 않는다 (적을 잡을 때마다 불린다)
      awakened: !tabs.has('sources') && Object.values(build.state.awakening).some((level) => level >= 1),
      myth: progress.opened.length > 0,
      relic: loadout.ownedRelics.some(isMythRelic),
    }
  }

  /** 열 때가 된 탭을 연다. quiet면 카드 없이 (불러온 뒤) */
  check(quiet = false): void {
    const { tabs, bus } = this.ctx
    if (!this.ready || this.checking || STEP_TABS.every((tab) => tabs.has(tab))) return
    this.checking = true
    const due = tabsDue(this.facts(), tabs.opened)
    for (const tab of due) this.open(tab, quiet)
    this.checking = false
    if (due.length > 0) bus.emit('progressChanged', {})
  }

  /** 탭 하나를 연다 (작은 지도를 누르면 지도 탭). 처음 열었으면 카드 */
  open(tab: StepTab, quiet = false): void {
    if (!this.ctx.tabs.open(tab)) return
    const def = STEP_TAB_DEFS[tab]
    if (!quiet) this.ctx.bus.emit('moment', { id: 'tabOpened', card: { kind: '새 탭', title: def.name, color: CARD_COLOR, icon: glyph(def.icon as Parameters<typeof glyph>[0]), lines: [def.text] } })
    this.onOpened(tab)
    // 하나만 열었으면 (작은 지도) 여기서 저장할 것이 생겼다고 알린다. 여럿은 check가 한 번에
    if (!this.checking) this.ctx.bus.emit('progressChanged', {})
  }
}

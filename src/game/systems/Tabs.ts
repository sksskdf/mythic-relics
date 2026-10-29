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
  /** 탭이 새로 열렸을 때 (메뉴 단추에 표시하고 다시 그린다). 한 번에 여럿이 열리면 정한 차례의 첫 탭으로 한 번. quiet면 카드 없이 연 것 */
  onOpened: (tab: StepTab, quiet: boolean) => void = () => {}
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
      // 신화 탭은 첫 신의 흔적(조각 1)부터 (E238)
      myth: progress.opened.length > 0 || this.ctx.awaken.fragments >= 1,
      relic: loadout.ownedRelics.some(isMythRelic),
    }
  }

  /** 열 때가 된 탭을 연다. quiet면 카드 없이 (불러온 뒤) */
  check(quiet = false): void {
    const { tabs, bus } = this.ctx
    if (!this.ready || this.checking || STEP_TABS.every((tab) => tabs.has(tab))) return
    this.checking = true
    let due: StepTab[] = []
    try {
      due = tabsDue(this.facts(), tabs.opened)
      for (const tab of due) this.unlock(tab, quiet)
      if (due[0]) this.onOpened(due[0], quiet)
    } finally {
      this.checking = false
    }
    if (due.length > 0) bus.emit('progressChanged', {})
  }

  /** 탭 하나를 바로 연다 (작은 지도를 누르면 지도 탭: 지금 보고 있으니 카드 없이 quiet) */
  open(tab: StepTab, quiet = false): void {
    if (!this.unlock(tab, quiet)) return
    this.onOpened(tab, quiet)
    this.ctx.bus.emit('progressChanged', {})
  }

  /** 열고, quiet가 아니면 카드. 처음 열었으면 true */
  private unlock(tab: StepTab, quiet: boolean): boolean {
    if (!this.ctx.tabs.open(tab)) return false
    if (quiet) return true
    const def = STEP_TAB_DEFS[tab]
    const card = { kind: '새 탭', title: def.name, color: CARD_COLOR, icon: glyph(def.icon as Parameters<typeof glyph>[0]), lines: [def.text] }
    // 같은 사건에서 나오는 더 큰 순간(첫 신화 장면·벼린 큰 카드·장 넘어가기) 뒤에 줄 서게 한 박자 늦게 보낸다.
    // 탭을 연 원인이 먼저 보이고, 장면이 탭 카드를 기다리지 않는다
    queueMicrotask(() => this.ctx.bus.emit('moment', { id: 'tabOpened', card }))
    return true
  }
}

import { describe, expect, it } from 'vitest'
import { parseTabs, STEP_TAB_DEFS, STEP_TABS, type TabFacts, TabUnlocks, tabsDue } from '../src/progress/Tabs'

const none: TabFacts = { gear: false, insights: 0, shrine: false, awakened: false, myth: false, relic: false, returns: 0 }

describe('정보 화면 탭 차례로 열기 (E236-05)', () => {
  it('처음에는 열 탭이 없다 (상태 탭만)', () => {
    expect(tabsDue(none, new Set())).toEqual([])
  })

  it('쓸 일이 생기면 그 탭: 장비를 주우면 장비, 깨달음을 얻으면 수련, 성소를 찾으면 지도', () => {
    expect(tabsDue({ ...none, gear: true }, new Set())).toEqual(['relics'])
    expect(tabsDue({ ...none, insights: 1 }, new Set())).toEqual(['training'])
    expect(tabsDue({ ...none, shrine: true }, new Set())).toEqual(['map'])
    expect(tabsDue({ ...none, awakened: true }, new Set())).toEqual(['sources'])
    expect(tabsDue({ ...none, myth: true }, new Set())).toEqual(['classes'])
    expect(tabsDue({ ...none, relic: true }, new Set())).toEqual(['looks'])
    // 맹세 (E305-01): 귀환 2에
    expect(tabsDue({ ...none, returns: 1 }, new Set())).toEqual([])
    expect(tabsDue({ ...none, returns: 2 }, new Set())).toEqual(['oaths'])
  })

  it('이미 연 탭은 다시 열지 않고, 여럿이면 정한 차례대로', () => {
    const all: TabFacts = { gear: true, insights: 3, shrine: true, awakened: true, myth: true, relic: true, returns: 2 }
    expect(tabsDue(all, new Set())).toEqual([...STEP_TABS])
    expect(tabsDue(all, new Set(['relics', 'map']))).toEqual(['training', 'sources', 'classes', 'looks', 'oaths'])
  })

  it('한 번 연 탭은 닫히지 않고, 처음 열 때만 true', () => {
    const tabs = new TabUnlocks()
    expect(tabs.open('relics')).toBe(true)
    expect(tabs.open('relics')).toBe(false)
    expect(tabs.has('relics')).toBe(true)
    tabs.openAll()
    expect(tabs.toData()).toEqual([...STEP_TABS])
    tabs.load(['map'])
    expect(tabs.toData()).toEqual(['map'])
  })

  it('저장 검사: 모르는 탭은 버리고, 옛 저장은 모두 연 것으로', () => {
    expect(parseTabs(['looks', 'relics', 'trials', 3], false)).toEqual(['relics', 'looks'])
    expect(parseTabs(undefined, false)).toEqual([])
    expect(parseTabs(undefined, true)).toEqual([...STEP_TABS])
  })

  it('탭마다 카드에 이름·그림·한 줄이 있다', () => {
    for (const tab of STEP_TABS) {
      const def = STEP_TAB_DEFS[tab]
      expect(def.name.length).toBeGreaterThan(0)
      expect(def.icon.length).toBeGreaterThan(0)
      expect(def.text.length).toBeLessThanOrEqual(40)
    }
  })
})

import { describe, expect, it } from 'vitest'
import { parseTabs, STEP_TAB_DEFS, STEP_TABS, type TabFacts, TabUnlocks, tabsDue } from '../src/progress/Tabs'

const none: TabFacts = { gear: false, insights: 0, shrine: false, myth: false, returns: 0 }

describe('정보 화면 탭 차례로 열기 (E236-05, E305-04 탭 일곱)', () => {
  it('처음에는 열 탭이 없다 (상태 탭만)', () => {
    expect(tabsDue(none, new Set())).toEqual([])
  })

  it('쓸 일이 생기면 그 탭: 장비를 주우면 장비, 깨달음을 얻으면 수련, 신의 흔적을 찾으면 신, 성소를 찾으면 지도', () => {
    expect(tabsDue({ ...none, gear: true }, new Set())).toEqual(['relics'])
    expect(tabsDue({ ...none, insights: 1 }, new Set())).toEqual(['training'])
    expect(tabsDue({ ...none, myth: true }, new Set())).toEqual(['gods'])
    expect(tabsDue({ ...none, shrine: true }, new Set())).toEqual(['map'])
    // 원천은 첫 귀환, 맹세는 귀환 2에 (E305-01·04)
    expect(tabsDue({ ...none, returns: 1 }, new Set())).toEqual(['sources'])
    expect(tabsDue({ ...none, returns: 2 }, new Set())).toEqual(['sources', 'oaths'])
  })

  it('차례는 상태 다음 장비 → 수련 → 신 → 지도 → 원천 → 맹세 (CYCLE.md 6장 「새」)', () => {
    expect([...STEP_TABS]).toEqual(['relics', 'training', 'gods', 'map', 'sources', 'oaths'])
  })

  it('이미 연 탭은 다시 열지 않고, 여럿이면 정한 차례대로', () => {
    const all: TabFacts = { gear: true, insights: 3, shrine: true, myth: true, returns: 2 }
    expect(tabsDue(all, new Set())).toEqual([...STEP_TABS])
    expect(tabsDue(all, new Set(['relics', 'map']))).toEqual(['training', 'gods', 'sources', 'oaths'])
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

  it('저장 검사: 모르는 탭은 버리고, 옛 저장(탭 기록이 없던 때)은 맹세 말고 모두 연 것으로', () => {
    expect(parseTabs(['relics', 'nothing', 3], false)).toEqual(['relics'])
    expect(parseTabs(undefined, false)).toEqual([])
    expect(parseTabs(undefined, true)).toEqual(['relics', 'training', 'gods', 'map', 'sources'])
  })

  it('저장 검사 (E305-04, CYCLE.md 9장 v17): 신화·외형 → 신, 시련 → 맹세, 균열은 버리고 원천은 그대로. 여러 번 해도 같다', () => {
    const once = parseTabs(['classes', 'looks', 'relics', 'trials', 'rift', 'sources'], false)
    expect(once).toEqual(['relics', 'gods', 'sources', 'oaths'])
    expect(parseTabs(once, false)).toEqual(once)
    expect(parseTabs(['looks'], false)).toEqual(['gods'])
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

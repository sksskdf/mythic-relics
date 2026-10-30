import { describe, expect, it } from 'vitest'

import { AUTOMATION } from '../src/data/cycle'
import { AUTOMATION_STEPS, AutomationProgress, automationAt, parseAutomation } from '../src/progress/Automation'
import { ExpeditionProgress } from '../src/progress/Expedition'
import { parseWaypoints, Waypoints } from '../src/progress/Waypoints'
import { oldAutomation, oldVisited } from '../src/save/migrate/v17'

describe('자동화: 귀환 횟수가 여는 것 (E305-03, CYCLE.md 3.5)', () => {
  it('귀환 0·1·2·3마다 다시 찍기·가보·자동 합치기·출발점이 차례로 켜진다', () => {
    expect(automationAt(0, false, 0)).toEqual({ retake: false, heirloomSlots: 0, headShare: 0, autoMerge: { good: false, rare: false }, autoPickup: false, sameBranch: false })
    expect(automationAt(1, false, 0)).toMatchObject({ retake: true, heirloomSlots: 1, headShare: 0, autoMerge: { good: false, rare: false } })
    expect(automationAt(2, false, 0)).toMatchObject({ retake: true, heirloomSlots: 1, headShare: 1 / 3, autoMerge: { good: true, rare: false } })
    expect(automationAt(3, false, 0)).toMatchObject({ retake: true, heirloomSlots: 2, headShare: 1 / 2, autoMerge: { good: true, rare: true } })
    // 표 끝을 넘으면 마지막 값
    expect(automationAt(9, false, 0).heirloomSlots).toBe(2)
  })

  it('엔딩을 봤으면 귀환 3 이상으로 친다 (원정 번호는 그대로), 자동 줍기·지난번 갈래는 엔딩 뒤', () => {
    const after = automationAt(0, true, 0)
    expect(after).toMatchObject({ retake: true, heirloomSlots: 2, headShare: 1 / 2, autoMerge: { good: true, rare: true }, sameBranch: true, autoPickup: false })
    expect(automationAt(0, true, AUTOMATION.pickup.need).autoPickup).toBe(true)
    // 엔딩 전에는 아무리 주워도 자동 줍기가 없다
    expect(automationAt(5, false, 999).autoPickup).toBe(false)
  })

  it('주운 수를 세어 자동 줍기가 켜지는 한 번만 알린다', () => {
    let ending = false
    const a = new AutomationProgress(() => 0, () => ending)
    for (let i = 0; i < AUTOMATION.pickup.need; i++) expect(a.picked()).toBe(false)
    ending = true
    expect(a.now.autoPickup).toBe(true)
    expect(a.picked()).toBe(false)
    const b = new AutomationProgress(() => 0, () => true)
    const opened = Array.from({ length: AUTOMATION.pickup.need }, () => b.picked())
    expect(opened.filter(Boolean)).toHaveLength(1)
    expect(opened.at(-1)).toBe(true)
  })

  it('원정 기록의 가보·출발점·다시 찍기·자동 합치기는 자동화를 따른다', () => {
    const e = new ExpeditionProgress()
    e.count = 3
    e.bestXp = 900
    expect(e.retakes).toBe(true)
    expect(e.headStart).toBe(300)
    expect(e.autoMerges('good')).toBe(true)
    expect(e.autoMerges('rare')).toBe(false)
    // 엔딩을 봤으면 귀환 3 이상
    e.automation = () => automationAt(e.returns, true, 0)
    expect(e.autoMerges('rare')).toBe(true)
    expect(e.heirloomSlots).toBe(2)
    expect(e.headStart).toBe(450)
  })

  it('정보 화면의 「귀환이 여는 것」은 귀환 1·2·3·엔딩 넷', () => {
    expect(AUTOMATION_STEPS.map((s) => s.at)).toEqual([1, 2, 3, null])
    for (const s of AUTOMATION_STEPS) expect(s.lines.length).toBeGreaterThan(0)
  })

  it('저장: 주운 수만 남고 옛 편의(열린 것·자동 녹이기·다른 세기)는 버린다', () => {
    const a = new AutomationProgress()
    a.load(parseAutomation({ counters: { pickups: 7, salvaged: 12, threat: 3 }, open: ['autoSalvage', 'quickChoose'], autoSalvage: false, visited: ['midgard'] }))
    expect(a.toData()).toEqual({ counters: { pickups: 7 } })
    expect(parseAutomation('broken')).toEqual({ counters: {} })
  })

  it('옛 편의(v16 이하): 주운 수만 남기고, 이미 열어 둔 자동 줍기는 문턱까지 채워 그대로 켜 둔다', () => {
    expect(oldAutomation({ counters: { pickups: 4 }, open: ['autoPickup'], visited: [] })).toEqual({ counters: { pickups: AUTOMATION.pickup.need } })
    expect(oldAutomation({ counters: { pickups: 31 }, open: ['autoPickup'] })).toEqual({ counters: { pickups: 31 } })
    expect(oldAutomation({ counters: { pickups: 4 }, open: [] })).toEqual({ counters: { pickups: 4 } })
    expect(oldAutomation(undefined)).toEqual({ counters: {} })
  })
})

describe('웨이포인트 (E239-05, E305-03에서 편의에서 뗌)', () => {
  it('밟아 켠 성소는 한 번만 켜지고 저장 왕복된다', () => {
    const w = new Waypoints()
    expect(w.light('midgard')).toBe(true)
    expect(w.light('midgard')).toBe(false)
    const back = new Waypoints()
    back.load(parseWaypoints(JSON.parse(JSON.stringify(w.toData()))))
    expect(back.has('midgard')).toBe(true)
    expect(back.size).toBe(1)
  })

  it('웨이포인트 키가 없는 옛 저장은 편의의 visited에서 읽는다 (빠뜨리면 켠 성소가 사라진다)', () => {
    expect(oldVisited({ counters: {}, open: [], visited: ['jotunheim', 'jotunheim', 3] })).toEqual(['jotunheim'])
    expect(oldVisited(undefined)).toEqual([])
  })
})

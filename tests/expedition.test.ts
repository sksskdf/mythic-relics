import { describe, expect, it } from 'vitest'

import { LEVEL_CAP_BASE, renownFor, renownMultiplier } from '../src/data/cycle'
import { computeBuild } from '../src/build/BuildState'
import { layerProduct } from '../src/build/layers'
import { DEMO_MAX_LEVEL, MAX_LEVEL } from '../src/myth/ClassProgress'
import { ClassProgress } from '../src/myth/ClassProgress'
import { ExpeditionProgress, parseExpedition } from '../src/progress/Expedition'

describe('원정과 귀환 (E304)', () => {
  it('명성 배율은 1 + 0.1·√명성, 한 원정 몫은 장 깊이와 이긴 보스로', () => {
    expect(renownMultiplier(0)).toBe(1)
    expect(renownMultiplier(25)).toBeCloseTo(1.5)
    expect(renownFor(1, 1)).toBe(15)
    expect(renownFor(2, 2)).toBe(40)
  })

  it('첫 귀환은 ×1.45 언저리 (장 1에서 수호자 하나·둘)', () => {
    const e = new ExpeditionProgress()
    e.beatBoss()
    e.beatBoss()
    const { gain, next } = e.preview()
    expect(gain).toBe(20)
    expect(next).toBeGreaterThan(1.4)
    expect(next).toBeLessThan(1.5)
  })

  it('귀환하면 명성·불씨·기록을 남기고 원정 번호가 오르며, 이번 원정의 셈은 처음으로', () => {
    const e = new ExpeditionProgress()
    e.tick(1000)
    e.reach(2)
    e.beatBoss()
    const gain = e.return({ flame: 'stone' }, 1200, ['awaken', 'edge'])
    expect(gain).toBe(30)
    expect(e.count).toBe(2)
    expect(e.renown).toBe(30)
    expect(e.flamePoints().stone).toBe(2)
    expect(e.best).toEqual([1000])
    expect([e.elapsed, e.bosses, e.deepest]).toEqual([0, 0, 1])
    expect(e.lastTaken).toEqual(['awaken', 'edge'])
    expect(e.retakes).toBe(true)
    expect(e.heirloomSlots).toBe(1)
    expect(e.headStart).toBe(0)
    e.return({}, 900, [])
    expect(e.headStart).toBe(400)
    expect(e.autoMerges('good')).toBe(true)
    expect(e.autoMerges('rare')).toBe(false)
  })

  it('사냥 불씨는 명성 몫을 키운다', () => {
    const e = new ExpeditionProgress()
    const before = e.gain
    e.flames.hunt = 1
    expect(e.gain).toBe(Math.round(before * 1.25))
  })

  it('저장했다 읽어도 같고, 깨진 값은 바로잡는다', () => {
    const e = new ExpeditionProgress()
    e.return({ flame: 'wind' }, 500, ['awaken'])
    const back = new ExpeditionProgress()
    back.load(parseExpedition(JSON.parse(JSON.stringify(e.toData()))))
    expect(back.toData()).toEqual(e.toData())
    expect(parseExpedition({ count: -3, renown: 'x', flames: { wind: 2, nope: 4 } })).toMatchObject({ count: 1, renown: 0, flames: { wind: 2 } })
  })

  it('승천: 열린 신 하나가 경험치 없이 한 단계, 상한에서 멈춘다', () => {
    const p = new ClassProgress()
    expect(p.ascend('thor')).toBe(false)
    p.open('thor')
    expect(p.ascend('thor')).toBe(true)
    expect(p.level('thor')).toBe(2)
    expect(p.ascend('thor')).toBe(true)
    expect(p.ascend('thor')).toBe(false)
    expect(p.level('thor')).toBe(3)
  })

  it('장 정복 (E305-02): 신 단계 상한은 2에서 정복마다 +1, 데모 끝 3, 엔딩 뒤 4', () => {
    let conquered = 0
    let afterEnding = false
    const p = new ClassProgress(() => afterEnding, () => conquered)
    expect(p.levelCap).toBe(LEVEL_CAP_BASE)
    p.open('thor')
    expect(p.ascend('thor')).toBe(true)
    expect(p.ascend('thor')).toBe(false)
    conquered = 1
    expect(p.levelCap).toBe(DEMO_MAX_LEVEL)
    expect(p.ascend('thor')).toBe(true)
    conquered = 2
    expect(p.levelCap).toBe(DEMO_MAX_LEVEL)
    afterEnding = true
    expect(p.levelCap).toBe(MAX_LEVEL)
  })

  it('장 정복 (E305-02): 명성 배율에 지수 1 + 0.1·정복, 원정 기록·빌드 층이 같은 값을 쓴다', () => {
    expect(renownMultiplier(25, 1)).toBeCloseTo(1.5 ** 1.1)
    expect(renownMultiplier(25, 2)).toBeCloseTo(1.5 ** 1.2)
    expect(renownMultiplier(0, 2)).toBe(1)
    const e = new ExpeditionProgress()
    e.renown = 25
    e.conquests = () => 1
    expect(e.multiplier).toBeCloseTo(1.5 ** 1.1)
    expect(e.preview().now).toBeCloseTo(1.5 ** 1.1)
    const build = computeBuild({ open: new Map(), gear: [], promotions: 0, hand: null, renown: 25, conquered: 1 })
    const conquest = build.layers.find((l) => l.id === 'conquest')!
    expect(conquest.value).toBeCloseTo(1.5 ** 0.1)
    expect(layerProduct(build.layers)).toBeCloseTo(computeBuild({ open: new Map(), gear: [], promotions: 0, hand: null }).damageScale * 1.5 ** 1.1)
  })
})

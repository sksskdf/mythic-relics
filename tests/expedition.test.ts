import { describe, expect, it } from 'vitest'

import { renownFor, renownMultiplier } from '../src/data/cycle'
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
})

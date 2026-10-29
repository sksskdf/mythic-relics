import { describe, expect, it } from 'vitest'

import { GEAR } from '../src/gear/roll'
import { UNIQUE, UNIQUE_STATS, UniqueState } from '../src/skills/uniques'

describe('고유 효과 (E303-03)', () => {
  it('gear.json의 고유 효과 열둘이 모두 규칙이나 수치로 돈다', () => {
    const handled = new Set([...Object.keys(UNIQUE), ...Object.keys(UNIQUE_STATS)])
    for (const id of Object.keys(GEAR.uniques)) expect(handled.has(id), id).toBe(true)
  })

  it('천둥 부름은 다섯 번째 기본 공격마다, 피의 사냥은 처치 셋마다, 회오리 걸음은 4m마다', () => {
    const s = new UniqueState()
    s.setActive(new Set(['thunderCall', 'bloodHunt', 'whirlStep']))
    const thunders = Array.from({ length: 10 }, () => s.onBasicHit().thunder)
    expect(thunders.filter(Boolean)).toHaveLength(2)
    expect(thunders[4]).toBe(true)
    expect([s.onKill().heal, s.onKill().heal, s.onKill().heal]).toEqual([0, 0, UNIQUE.bloodHunt.heal])
    expect(s.onWalk(3)).toBe(false)
    expect(s.onWalk(1.5)).toBe(true)
  })

  it('바위 껍질은 맞으면 2초 동안 받는 피해 ×0.7, 10초에 한 번', () => {
    const s = new UniqueState()
    s.setActive(new Set(['stoneSkin']))
    expect(s.takenScale).toBe(1)
    expect(s.onHurt(0.9, 100).stone).toBe(true)
    expect(s.takenScale).toBe(UNIQUE.stoneSkin.taken)
    s.update(2.1)
    expect(s.takenScale).toBe(1)
    expect(s.onHurt(0.9, 100).stone).toBe(false)
    s.update(8)
    expect(s.onHurt(0.9, 100).stone).toBe(true)
  })

  it('달빛 방패는 생명이 반 아래일 때 최대 생명 25%를 막고 30초에 한 번', () => {
    const s = new UniqueState()
    s.setActive(new Set(['moonShield']))
    expect(s.onHurt(0.6, 200).shield).toBe(0)
    expect(s.onHurt(0.4, 200).shield).toBe(50)
    expect(s.absorb(30)).toBe(0)
    expect(s.absorb(30)).toBe(10)
    expect(s.onHurt(0.3, 200).shield).toBe(0)
    // 빼면 남은 방패도 사라진다
    s.onHurt(0.3, 200)
    s.setActive(new Set())
    expect(s.absorb(5)).toBe(5)
  })

  it('순례자는 지역을 옮긴 뒤 10초 이동 ×1.2, 없는 효과는 아무것도 하지 않는다', () => {
    const s = new UniqueState()
    expect(s.onRegion()).toBe(false)
    expect(s.onBasicHit().thunder).toBe(false)
    s.setActive(new Set(['pilgrim']))
    expect(s.onRegion()).toBe(true)
    expect(s.moveScale).toBe(UNIQUE.pilgrim.speed)
    s.update(10.1)
    expect(s.moveScale).toBe(1)
  })
})

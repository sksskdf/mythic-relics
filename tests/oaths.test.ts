import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Build } from '../src/build/Build'
import { computeBuild } from '../src/build/BuildState'
import { DEMO_OATHS, NO_RULES, OATH, OATH_IDS, type OathId, oathRules, OATHS } from '../src/data/oaths'
import { RelicPowers } from '../src/game/RelicPowers'
import { rollGear } from '../src/gear/roll'
import { ClassProgress } from '../src/myth/ClassProgress'
import { oathPantheon } from '../src/myth/pantheon'
import { ThreatProgress } from '../src/progress/Threat'
import { OathProgress, oathsFromTrials, parseOaths } from '../src/progress/Oaths'

/** 토르를 손·심장·숨에 몰고 일반 장비 여섯 칸을 낀 상태 (맹세는 sworn이 정한다, 도는 자리는 시스템처럼 맞춘다) */
function geared(sworn: () => OathId | null) {
  const powers = new RelicPowers(new THREE.Group())
  powers.equip('mjolnir')
  const pantheon = { hand: 'thor', heart: 'thor', breath: ['thor', 'odin'] }
  let seed = 1
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (const part of ['head', 'body', 'hands', 'feet', 'trinket', 'trinket'] as const) {
    const item = rollGear(rng, { part, grade: 'rare' })
    powers.loadout.addGear(item)
    powers.loadout.equip(item.uid)
  }
  const progress = new ClassProgress()
  progress.open('thor')
  progress.open('odin')
  const build = new Build({ powers, progress, threat: new ThreatProgress(), oaths: new OathProgress(), oath: sworn })
  const sync = () => powers.setPantheon(oathPantheon(pantheon, build.rules))
  sync()
  return { build, sync }
}

describe('맹세 제약 (E305-01)', () => {
  it('제약은 건 동안만 걸리고 풀면 처음과 같다 (모든 맹세)', () => {
    let sworn: OathId | null = null
    const { build, sync } = geared(() => sworn)
    const free = build.state
    for (const id of OATH_IDS) {
      sworn = id
      sync()
      const on = build.state
      const rules = oathRules(id)
      // 빈 손: 손만 비고(낡은 검) 심장·숨은 그대로
      if (rules.emptyHand) {
        expect(on.chosen, id).toBeNull()
        expect(build.heart, id).toBe('thor')
        expect(build.passives().length, id).toBe(2)
      }
      // 홀로: 숨 하나만 돈다
      if (rules.breath !== null) expect(build.passives().length, id).toBe(1)
      if (rules.maxHpScale !== 1) expect(Math.abs(on.maxHp - free.maxHp * rules.maxHpScale), id).toBeLessThanOrEqual(1)
      if (rules.moveScale !== 1) expect(on.moveSpeed, id).toBeCloseTo(free.moveSpeed * rules.moveScale)
      expect(on.noHeal, id).toBe(rules.noHeal)
      expect(on.noUltimate, id).toBe(rules.noUltimate)
      sworn = null
      sync()
      expect(build.state, `${id} 풂`).toEqual(free)
    }
  })

  it('규칙 없음은 아무것도 바꾸지 않는다', () => {
    const base = { open: new Map([['thor', 2]]), hand: 'thor', gear: [], promotions: 1 }
    expect(computeBuild({ ...base, rules: NO_RULES })).toEqual(computeBuild(base))
  })

  it('데모 맹세는 셋(침묵·빈 손·홀로), 나머지 다섯은 엔딩 뒤', () => {
    expect(DEMO_OATHS).toEqual(['silence', 'emptyHand', 'alone'])
    expect(OATH_IDS.filter((id) => OATHS[id].after)).toHaveLength(5)
    expect(DEMO_OATHS.every((id) => !OATHS[id].after)).toBe(true)
  })
})

describe('맹세 기록과 보상 (E305-01)', () => {
  it('지킨 맹세마다 짝인 수치 한 번, 홀로는 숨 칸 +1', () => {
    const o = new OathProgress()
    expect(o.rewards()).toEqual({})
    expect(o.keep('silence', 300).first).toBe(true)
    expect(o.keep('silence', 200).first).toBe(false)
    expect(o.rewards().ultCharge).toBeCloseTo(0.3)
    o.keep('emptyHand', 400)
    expect(o.rewards().attackSpeed).toBeCloseTo(0.1)
    expect(o.breath).toBe(0)
    o.keep('alone', 500)
    expect(o.breath).toBe(1)
  })

  it('기록은 가장 빠른 것만, 기준 안에 지키면 명성이 더 붙는다 (여덟을 모두 빨리 지키면 +5%)', () => {
    const o = new OathProgress()
    expect(o.renownScale()).toBe(1)
    o.keep('silence', 900)
    expect(o.keep('silence', 600).record).toBe(true)
    expect(o.keep('silence', 700).record).toBe(false)
    expect(o.best.silence).toBe(600)
    for (const id of OATH_IDS) o.keep(id, OATH.par / 2)
    expect(o.renownScale()).toBeCloseTo(1 + OATH.renown)
  })

  it('저장 형식을 검사하고, 옛 시련 기록은 짝인 맹세로 옮긴다', () => {
    expect(parseOaths({ kept: ['silence', 'nope', 'silence'], best: { silence: 300, nope: 1, alone: -2 } })).toEqual({ kept: ['silence'], best: { silence: 300 } })
    expect(parseOaths(null)).toEqual({ kept: [], best: {} })
    const moved = oathsFromTrials({ cleared: { noUltimate: 2, fewSlots: 1, noMyth: 0, glass: 5, nope: 3 }, best: {} })
    expect(moved.kept.sort()).toEqual(['alone', 'glass', 'silence'])
    expect(moved.best.silence).toBe(OATH.par)
  })
})

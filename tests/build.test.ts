import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Build } from '../src/build/Build'
import { alwaysStage, computeBuild, gearModifiers, statAt, TOP_STAGE } from '../src/build/BuildState'
import { RelicPowers } from '../src/game/RelicPowers'
import { relicAwake } from '../src/gear/mythRelic'
import { ClassProgress, PER_OPENED, PER_PROMOTION } from '../src/myth/ClassProgress'
import { ThreatProgress } from '../src/progress/Threat'
import { GODS, godDef, RELIC_IDS, relicDef } from '../src/relics/data'

/** 신화 단계(큰 걸음)와 고른 신화의 패시브 배율 (E21-01) */
function legacyDamage(progress: ClassProgress, manifested: string | null): number {
  let scale = PER_PROMOTION.damage ** progress.promotions
  if (manifested) scale *= godDef(manifested).passive.damageScale
  return scale
}

/** 그 신의 유물을 발현 수만큼 끼운 RelicPowers */
function manifest(god: string): RelicPowers {
  const powers = new RelicPowers(new THREE.Group())
  for (const id of RELIC_IDS.filter((r) => relicDef(r).god === god).slice(0, godDef(god).manifestCount)) powers.equip(id)
  powers.choose(god)
  return powers
}

function promoteTimes(progress: ClassProgress, god: string, times: number): void {
  for (let i = 0; i < times; i++) {
    progress.addXp(god, 1e9)
    progress.promote(god)
  }
}

describe('빌드 상태 (E11-04)', () => {
  it('아무것도 없으면 맨손의 모험가: 배율 1, 칼 모션', () => {
    const state = new Build({ powers: new RelicPowers(new THREE.Group()), progress: new ClassProgress(), threat: new ThreatProgress() }).state
    expect(state.chosen).toBeNull()
    expect(state.level).toBe(0)
    expect(state.damageScale).toBe(1)
    expect(state.attack).toBe('blade')
    expect(state.attackSpeed).toBe(1)
  })

  it('모든 신화를 같은 장착·성장으로 두면 단계 배율 × 패시브 배율에 수집 보너스와 수치만 더 곱해진다', () => {
    let checked = 0
    for (const god of Object.keys(GODS)) {
      const powers = manifest(god)
      if (powers.manifested !== god) continue
      checked += 1
      const progress = new ClassProgress()
      progress.record(god)
      promoteTimes(progress, god, 2)
      promoteTimes(progress, 'thor', 1)
      const state = new Build({ powers, progress, threat: new ThreatProgress() }).state
      expect(state.chosen, god).toBe(god)
      expect(state.level, god).toBe(progress.level(god))
      const st = state.stats
      expect(state.damageScale, god).toBeCloseTo(legacyDamage(progress, god) * (1 + st.damage + state.collected * PER_OPENED.damage), 10)
      // 유물의 지속 효과는 고른 신화의 것만 깨어 있다 (E21-04)
      const mods = gearModifiers(powers.loadout.relics.map((id) => (id && relicAwake(id, god) ? id : null)))
      expect(state.modifiers, god).toEqual(mods)
      expect(state.damageTaken, god).toBeCloseTo(mods.damageTaken * (1 + st.damageTaken), 10)
      expect(state.moveSpeed, god).toBeCloseTo(mods.moveSpeed * (1 + st.moveSpeed), 10)
      expect(state.attackSpeed, god).toBeCloseTo(godDef(god).passive.attackSpeed * (1 + st.attackSpeed), 10)
      expect(state.attack, god).toBe(godDef(god).attack)
    }
    expect(checked).toBe(Object.keys(GODS).length)
  })

  it('지속 효과 수치는 장비한 유물의 것을 곱한다 (빈 칸은 건너뜀)', () => {
    const mods = gearModifiers(['jarngreipr', null, 'megingjord', null])
    const expected = { ...gearModifiers([]) }
    for (const id of ['jarngreipr', 'megingjord']) {
      for (const [k, v] of Object.entries(relicDef(id).passive.modifiers)) expected[k as keyof typeof expected] *= v
    }
    expect(mods).toEqual(expected)
  })

  it('계산은 재료만 보고, 고른 신화의 패시브 배율을 곱한다', () => {
    const base = { open: new Map(), gear: [], promotions: 2 }
    expect(computeBuild({ ...base, chosen: [] }).damageScale).toBeCloseTo(PER_PROMOTION.damage ** 2)
    const thor = computeBuild({ ...base, chosen: ['thor'], open: new Map([['thor', 3]]) })
    expect(thor.level).toBe(3)
    expect(thor.damageScale).toBeCloseTo(PER_PROMOTION.damage ** 2 * (1 + PER_OPENED.damage) * godDef('thor').passive.damageScale)
  })

  it('원천 수치는 장비의 합, 각성은 5/10/20 (E14, 원천 숙련·공명은 E21-05에서 없앰)', () => {
    const gearItems = [
      { stats: [], source: { id: 'stone' as const, value: 3 } },
      { stats: [], source: { id: 'stone' as const, value: 3 } },
    ]
    const state = computeBuild({ open: new Map(), chosen: [], gear: ['mjolnir'], gearItems, stage: () => 4, promotions: 0 })
    // 묠니르 4단계: 불꽃 +5
    expect(state.sources).toEqual({ flame: 5, hunt: 0, wind: 0, stone: 6 })
    expect(state.awakening).toEqual({ flame: 1, hunt: 0, wind: 0, stone: 1 })
    expect('resonance' in state).toBe(false)
  })
})

describe('신화 단계와 수집 보너스 (E21-01·02)', () => {
  const base = { gear: [] as (string | null)[], promotions: 0 }

  it('단계 하나(승급 한 번)가 큰 걸음: 모든 피해 ×1.35, 최대 생명 +25%', () => {
    const one = computeBuild({ ...base, chosen: [], open: new Map(), promotions: 1 })
    const two = computeBuild({ ...base, chosen: [], open: new Map(), promotions: 2 })
    expect(one.damageScale).toBeCloseTo(1.35)
    expect(two.damageScale).toBeCloseTo(1.35 * 1.35)
    expect(one.maxHp).toBe(125)
    expect(two.maxHp).toBe(150)
  })

  it('열린 신화 하나마다 모든 피해 +4%, 최대 생명 +5. 메아리도 신화마다 다른 수치도 없다', () => {
    const state = computeBuild({ ...base, chosen: [], open: new Map([['thor', 3], ['zeus', 1], ['loki', 2]]) })
    expect(state.collected).toBe(3)
    expect(state.damageScale).toBeCloseTo(1 + 3 * PER_OPENED.damage)
    expect(state.maxHp).toBe(100 + 3 * PER_OPENED.maxHp)
    expect(Object.values(state.stats).every((v) => v === 0)).toBe(true)
    expect('echoes' in state).toBe(false)
  })

  it('성좌판에서 별을 밝힌 신화만 그 신화의 수치를 낸다 (엔딩 뒤, 별 + 유물로 단계가 오른다)', () => {
    expect(alwaysStage(0, true, true)).toBe(0)
    expect(alwaysStage(2, false, true)).toBe(3)
    expect(alwaysStage(2, true, true)).toBe(4)
    expect(alwaysStage(4, true, true)).toBe(TOP_STAGE)
    const stat = godDef('thor').always.stat
    const plain = computeBuild({ ...base, chosen: [], open: new Map([['thor', 2]]), gear: ['mjolnir'] })
    const star = computeBuild({ ...base, chosen: [], open: new Map([['thor', 2]]), starred: new Set(['thor']) })
    const starRelic = computeBuild({ ...base, chosen: [], open: new Map([['thor', 2]]), gear: ['mjolnir'], starred: new Set(['thor']) })
    expect(plain.stats.bossDamage).toBe(0)
    expect(star.stats.bossDamage).toBe(stat.value[0])
    expect(starRelic.stats.bossDamage).toBe(stat.value[1])
  })

  it('별 수치는 3단계부터: 3단계 value[0], 4단계 value[1], 5단계 ×1.5', () => {
    const stat = godDef('loki').always.stat
    expect(statAt(stat, 2)).toBe(0)
    expect(statAt(stat, 3)).toBe(stat.value[0])
    expect(statAt(stat, 4)).toBe(stat.value[1])
    expect(statAt(stat, 5)).toBeCloseTo(stat.value[1] * 1.5)
  })

  it('같은 종류 수치는 더하고, 다른 종류끼리는 곱한다', () => {
    const starred = new Set(['freyr', 'mago', 'loki', 'susanoo'])
    // 최대 생명 +20(프레이)과 +10%(마고할미), 수집 보너스 둘 +10
    const state = computeBuild({ ...base, chosen: [], open: new Map([['freyr', 3], ['mago', 3]]), starred })
    expect(state.maxHp).toBe(Math.round((100 + 20 + 2 * PER_OPENED.maxHp) * 1.1))
    // 고른 신화의 공격 리듬(제우스)과 공격 빠르기(로키 4단계)는 곱한다
    const fast = computeBuild({ ...base, chosen: ['zeus'], open: new Map([['loki', 3], ['zeus', 1]]), starred })
    expect(fast.attackSpeed).toBeCloseTo(godDef('zeus').passive.attackSpeed * (1 + godDef('loki').always.stat.value[1]))
    // 받는 피해: 스사노오 −6%와 유물의 배율을 곱한다
    const tough = computeBuild({ ...base, chosen: [], open: new Map([['susanoo', 3]]), gear: ['megingjord'], starred })
    expect(tough.damageTaken).toBeCloseTo(gearModifiers(['megingjord']).damageTaken * (1 + godDef('susanoo').always.stat.value[1]))
  })
})

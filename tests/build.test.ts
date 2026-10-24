import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Build } from '../src/build/Build'
import { alwaysStage, computeBuild, echoEvery, gearModifiers, statAt, TOP_STAGE } from '../src/build/BuildState'
import { RelicPowers } from '../src/game/RelicPowers'
import { ClassProgress, MASTERY_DAMAGE, PER_PROMOTION } from '../src/myth/ClassProgress'
import { Cycle } from '../src/progress/Cycle'
import { GODS, godDef, RELIC_IDS, relicDef } from '../src/relics/data'

/** 1차 스프린트의 피해 배율 공식 (E11-04 전 Damage.scale을 그대로 옮긴 것) */
function legacyDamage(progress: ClassProgress, cycle: Cycle, manifested: string | null): number {
  let scale = 1 + progress.promotions * PER_PROMOTION.damage
  if (manifested) {
    scale *= godDef(manifested).passive.damageScale
    scale *= 1 + progress.mastery(godDef(manifested).source) * MASTERY_DAMAGE
  }
  return scale * cycle.damageScale
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
    const state = new Build({ powers: new RelicPowers(new THREE.Group()), progress: new ClassProgress(), cycle: new Cycle() }).state
    expect(state.chosen).toBeNull()
    expect(state.level).toBe(0)
    expect(state.damageScale).toBe(1)
    expect(state.attack).toBe('blade')
    expect(state.attackSpeed).toBe(1)
  })

  it('모든 신화를 같은 장착·성장으로 두면 1차 스프린트 값에 상시 효과 수치만 더 곱해진다', () => {
    let checked = 0
    for (const god of Object.keys(GODS)) {
      const powers = manifest(god)
      if (powers.manifested !== god) continue
      checked += 1
      const progress = new ClassProgress()
      progress.record(god)
      promoteTimes(progress, god, 2)
      promoteTimes(progress, 'thor', 1)
      const cycle = new Cycle()
      cycle.training.flame = 3
      cycle.training.stone = 2
      cycle.training.wind = 1
      const state = new Build({ powers, progress, cycle }).state
      expect(state.chosen, god).toBe(god)
      expect(state.level, god).toBe(progress.level(god))
      const st = state.stats
      expect(state.damageScale, god).toBeCloseTo(legacyDamage(progress, cycle, god) * (1 + st.damage), 10)
      const mods = gearModifiers(powers.loadout.slots)
      expect(state.modifiers, god).toEqual(mods)
      expect(state.damageTaken, god).toBeCloseTo(mods.damageTaken * cycle.damageTakenScale * (1 + st.damageTaken), 10)
      expect(state.moveSpeed, god).toBeCloseTo(mods.moveSpeed * cycle.moveSpeedScale * (1 + st.moveSpeed), 10)
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

  it('계산은 재료만 보고, 고른 신화가 없으면 원천 숙련을 곱하지 않는다', () => {
    const base = { open: new Map(), gear: [], mastery: () => 5, promotions: 2, cycle: { damage: 1, damageTaken: 1, moveSpeed: 1, bonusHp: 0 } }
    expect(computeBuild({ ...base, chosen: [] }).damageScale).toBeCloseTo(1 + 2 * PER_PROMOTION.damage)
    const thor = computeBuild({ ...base, chosen: ['thor'], open: new Map([['thor', 3]]) })
    expect(thor.level).toBe(3)
    expect(thor.damageScale).toBeCloseTo((1 + 2 * PER_PROMOTION.damage) * godDef('thor').passive.damageScale * (1 + 5 * MASTERY_DAMAGE))
  })
})

describe('상시 효과 적용 (E12-03)', () => {
  const base = { gear: [] as (string | null)[], mastery: () => 0, promotions: 0, cycle: { damage: 1, damageTaken: 1, moveSpeed: 1, bonusHp: 0 } }

  it('상시 효과 단계는 개방 단계, 그 신화 유물을 끼면 한 단계 위 (5까지)', () => {
    expect(alwaysStage(0, true)).toBe(0)
    expect(alwaysStage(1, false)).toBe(1)
    expect(alwaysStage(2, true)).toBe(3)
    expect(alwaysStage(4, true)).toBe(TOP_STAGE)
  })

  it('메아리는 1단계에서 every[0], 2단계부터 every[1], 5단계는 더 자주', () => {
    expect(echoEvery([5, 3], 'hits', 1)).toBe(5)
    expect(echoEvery([5, 3], 'hits', 4)).toBe(3)
    expect(echoEvery([5, 3], 'hits', 5)).toBe(2)
    expect(echoEvery([10, 7], 'seconds', 5)).toBeCloseTo(5.6)
    expect(echoEvery([0.2, 0.35], 'chance', 5)).toBeCloseTo(0.42)
  })

  it('수치는 3단계부터: 3단계 value[0], 4단계 value[1], 5단계 ×1.5', () => {
    const stat = godDef('loki').always.stat
    expect(statAt(stat, 2)).toBe(0)
    expect(statAt(stat, 3)).toBe(stat.value[0])
    expect(statAt(stat, 4)).toBe(stat.value[1])
    expect(statAt(stat, 5)).toBeCloseTo(stat.value[1] * 1.5)
  })

  it('고르지 않은 열린 신화만 메아리를 내고, 수치는 고른 신화도 함께 낸다', () => {
    const state = computeBuild({ ...base, chosen: ['thor'], open: new Map([['thor', 4], ['zeus', 1], ['loki', 3]]) })
    expect(state.echoes.map((e) => e.god).sort()).toEqual(['loki', 'zeus'])
    expect(state.stats.bossDamage).toBe(godDef('thor').always.stat.value[1])
    expect(state.stats.attackSpeed).toBe(godDef('loki').always.stat.value[0])
    expect(state.stats.skyDamage).toBe(0)
  })

  it('같은 종류 수치는 더하고, 다른 종류끼리는 곱한다', () => {
    // 최대 생명 +20(프레이 4단계)과 +10%(마고할미 4단계)
    const state = computeBuild({ ...base, chosen: [], open: new Map([['freyr', 4], ['mago', 4]]) })
    expect(state.maxHp).toBe(Math.round((100 + 20) * 1.1))
    // 고른 신화의 공격 리듬(제우스)과 상시 공격 빠르기(로키 4단계)는 곱한다
    const fast = computeBuild({ ...base, chosen: ['zeus'], open: new Map([['loki', 4], ['zeus', 1]]) })
    expect(fast.attackSpeed).toBeCloseTo(godDef('zeus').passive.attackSpeed * (1 + godDef('loki').always.stat.value[1]))
    // 받는 피해: 스사노오 −6%와 유물의 배율을 곱한다
    const tough = computeBuild({ ...base, chosen: [], open: new Map([['susanoo', 4]]), gear: ['megingjord'] })
    expect(tough.damageTaken).toBeCloseTo(gearModifiers(['megingjord']).damageTaken * (1 + godDef('susanoo').always.stat.value[1]))
  })

  it('그 신화 유물을 끼면 상시 효과가 한 단계 위로 작동한다', () => {
    const without = computeBuild({ ...base, chosen: [], open: new Map([['thor', 2]]) })
    const withRelic = computeBuild({ ...base, chosen: [], open: new Map([['thor', 2]]), gear: ['mjolnir'] })
    expect(without.stats.bossDamage).toBe(0)
    expect(withRelic.stats.bossDamage).toBe(godDef('thor').always.stat.value[0])
    expect(withRelic.echoes[0]!.stage).toBe(3)
  })
})

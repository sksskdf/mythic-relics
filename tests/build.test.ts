import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Build } from '../src/build/Build'
import { computeBuild, gearModifiers } from '../src/build/BuildState'
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

  it('모든 신화를 같은 장착·성장으로 두면 지금과 같은 피해 배율·지속 효과·공격 리듬이 나온다', () => {
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
      expect(state.damageScale, god).toBeCloseTo(legacyDamage(progress, cycle, god), 10)
      const mods = gearModifiers(powers.loadout.slots)
      expect(state.modifiers, god).toEqual(mods)
      expect(state.damageTaken, god).toBeCloseTo(mods.damageTaken * cycle.damageTakenScale, 10)
      expect(state.moveSpeed, god).toBeCloseTo(mods.moveSpeed * cycle.moveSpeedScale, 10)
      expect(state.attackSpeed, god).toBe(godDef(god).passive.attackSpeed)
      expect(state.attack, god).toBe(godDef(god).attack)
    }
    // 기본 신화 20개 (히든 아수라왕은 열기 조건이 따로 있어 유물만으로는 열리지 않는다)
    expect(checked).toBeGreaterThanOrEqual(20)
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
    const base = { open: new Map(), gear: [], mastery: () => 5, promotions: 2, cycle: { damage: 1, damageTaken: 1, moveSpeed: 1 } }
    expect(computeBuild({ ...base, chosen: [] }).damageScale).toBeCloseTo(1 + 2 * PER_PROMOTION.damage)
    const thor = computeBuild({ ...base, chosen: ['thor'], open: new Map([['thor', 3]]) })
    expect(thor.level).toBe(3)
    expect(thor.damageScale).toBeCloseTo((1 + 2 * PER_PROMOTION.damage) * godDef('thor').passive.damageScale * (1 + 5 * MASTERY_DAMAGE))
  })
})

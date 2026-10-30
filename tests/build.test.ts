import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Build } from '../src/build/Build'
import { activeLayers, layerProduct } from '../src/build/layers'
import { computeBuild, gearModifiers, statAt } from '../src/build/BuildState'
import { RelicPowers } from '../src/game/RelicPowers'
import { relicAwake } from '../src/gear/mythRelic'
import { ClassProgress, PER_LIT, PER_OPENED, PER_PROMOTION } from '../src/myth/ClassProgress'
import { TrainingProgress } from '../src/progress/Training'
import { OathProgress } from '../src/progress/Oaths'
import { TRAINING_NODES } from '../src/data/training'
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
  powers.setPantheon({ hand: god, heart: god, breath: [god] })
  return powers
}

function promoteTimes(progress: ClassProgress, god: string, times: number): void {
  for (let i = 0; i < times; i++) progress.ascend(god)
}

describe('빌드 상태 (E11-04)', () => {
  it('아무것도 없으면 맨손의 모험가: 배율 1, 칼 모션', () => {
    const state = new Build({ powers: new RelicPowers(new THREE.Group()), progress: new ClassProgress() }).state
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
      const state = new Build({ powers, progress }).state
      expect(state.chosen, god).toBe(god)
      expect(state.level, god).toBe(progress.level(god))
      const st = state.stats
      expect(state.damageScale, god).toBeCloseTo(legacyDamage(progress, god) * (1 + st.damage + state.lit * PER_LIT), 10)
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
    expect(computeBuild({ ...base, hand: null }).damageScale).toBeCloseTo(PER_PROMOTION.damage ** 2)
    const thor = computeBuild({ ...base, hand: 'thor', open: new Map([['thor', 3]]) })
    expect(thor.level).toBe(3)
    expect(thor.damageScale).toBeCloseTo(PER_PROMOTION.damage ** 2 * godDef('thor').passive.damageScale)
    // 유물표에 켠 칸마다 +1% (E303-04)
    expect(computeBuild({ ...base, hand: null, lit: 5 }).damageScale).toBeCloseTo(PER_PROMOTION.damage ** 2 * (1 + 5 * PER_LIT))
  })

  it('원천 수치는 장비의 합, 각성은 5/10/20 (E14, 원천 숙련·공명은 E21-05에서 없앰)', () => {
    const gearItems = [
      { stats: [], source: { id: 'stone' as const, value: 3 } },
      { stats: [], source: { id: 'stone' as const, value: 3 } },
    ]
    const state = computeBuild({ open: new Map(), hand: null, gear: ['mjolnir'], gearItems, stage: () => 4, promotions: 0 })
    // 유물은 원천을 주지 않는다 (E303-04: 묠니르 4단계여도 불꽃 0)
    expect(state.sources).toEqual({ flame: 0, hunt: 0, wind: 0, stone: 6 })
    expect(state.awakening).toEqual({ flame: 0, hunt: 0, wind: 0, stone: 1 })
    expect('resonance' in state).toBe(false)
  })
})

describe('신화 단계와 수집 보너스 (E21-01·02)', () => {
  const base = { gear: [] as (string | null)[], promotions: 0 }

  it('단계 하나(승급 한 번)가 큰 걸음: 모든 피해 ×1.35, 최대 생명 +25%', () => {
    const one = computeBuild({ ...base, hand: null, open: new Map(), promotions: 1 })
    const two = computeBuild({ ...base, hand: null, open: new Map(), promotions: 2 })
    expect(one.damageScale).toBeCloseTo(1.35)
    expect(two.damageScale).toBeCloseTo(1.35 * 1.35)
    expect(one.maxHp).toBe(125)
    expect(two.maxHp).toBe(150)
  })

  it('열린 신화 하나마다 최대 생명 +5 (피해는 유물표로 옮겼다, E303-04). 메아리도 신화마다 다른 수치도 없다', () => {
    const state = computeBuild({ ...base, hand: null, open: new Map([['thor', 3], ['zeus', 1], ['loki', 2]]) })
    expect(state.collected).toBe(3)
    expect(state.damageScale).toBeCloseTo(1)
    expect(state.maxHp).toBe(100 + 3 * PER_OPENED.maxHp)
    expect(Object.values(state.stats).every((v) => v === 0)).toBe(true)
    expect('echoes' in state).toBe(false)
  })

  it('열린 신화는 단계가 높아도 그 신화의 수치를 내지 않는다 (성좌판은 E305-03에서 걷었다)', () => {
    const state = computeBuild({ ...base, hand: null, open: new Map([['thor', 4], ['odin', 4]]), gear: ['mjolnir'] })
    expect(state.stats[godDef('thor').always.stat.kind]).toBe(0)
    expect(state.stats[godDef('odin').always.stat.kind]).toBe(0)
  })

  it('신화 수치 단계는 3단계부터: 3단계 value[0], 4단계 value[1], 5단계 ×1.5', () => {
    const stat = godDef('loki').always.stat
    expect(statAt(stat, 2)).toBe(0)
    expect(statAt(stat, 3)).toBe(stat.value[0])
    expect(statAt(stat, 4)).toBe(stat.value[1])
    expect(statAt(stat, 5)).toBeCloseTo(stat.value[1] * 1.5)
  })

  it('같은 종류 수치는 더하고, 다른 종류끼리는 곱한다', () => {
    const item = (kind: 'maxHp' | 'damageTaken', value: number) => ({ stats: [{ kind, value }], source: { id: 'stone' as const, value: 1 } })
    // 최대 생명 +20(장비)과 +10%(수련), 열린 신화 둘 +10
    const state = computeBuild({ ...base, hand: null, open: new Map([['freyr', 3], ['mago', 3]]), gearItems: [item('maxHp', 20)], bonus: { training: { maxHpPct: 0.1 } } })
    expect(state.maxHp).toBe(Math.round((100 + 20 + 2 * PER_OPENED.maxHp) * 1.1))
    // 손의 신의 공격 리듬(제우스)과 공격 빠르기(수련 +10%)는 곱한다
    const fast = computeBuild({ ...base, hand: 'zeus', open: new Map([['zeus', 1]]), bonus: { training: { attackSpeed: 0.1 } } })
    expect(fast.attackSpeed).toBeCloseTo(godDef('zeus').passive.attackSpeed * 1.1)
    // 받는 피해: 장비 −6%와 유물의 배율을 곱한다
    const tough = computeBuild({ ...base, hand: null, open: new Map([['susanoo', 3]]), gear: ['megingjord'], gearItems: [item('damageTaken', -0.06)] })
    expect(tough.damageTaken).toBeCloseTo(gearModifiers(['megingjord']).damageTaken * (1 - 0.06))
  })
})

describe('빌드 상태 다시 쓰기', () => {
  it('재료가 그대로면 지난 계산을 돌려주고, 장착·단계·수련·맹세가 바뀌면 새로 계산한다', () => {
    const powers = new RelicPowers(new THREE.Group())
    const progress = new ClassProgress()
    const training = new TrainingProgress()
    const oaths = new OathProgress()
    const build = new Build({ powers, progress, training, oaths })
    const first = build.state
    expect(build.state).toBe(first)
    const changes: (() => void)[] = [
      () => powers.equip('mjolnir'),
      () => powers.loadout.stages.set('mjolnir', 3),
      () => progress.open('thor'),
      () => powers.setPantheon({ hand: 'thor', heart: 'thor', breath: ['thor'] }),
      () => promoteTimes(progress, 'thor', 1),
      () => {
        training.gain(1e7)
        training.take(TRAINING_NODES.find((n) => n.after.length === 0)!.id)
      },
      () => oaths.keep('silence', 60),
    ]
    let last = first
    for (const change of changes) {
      change()
      const next = build.state
      expect(next).not.toBe(last)
      expect(next).toEqual(computeBuild(build.inputs()))
      expect(build.state).toBe(next)
      last = next
    }
  })
})

describe('빌드 층 목록 (E301-01)', () => {
  /** 층 목록으로 바꾸기 전의 식: 단계 곱 × (1 + 피해 수치 합 + 수집) × 고른 신화 */
  const legacy = (s: ReturnType<typeof computeBuild>, promotions: number) => PER_PROMOTION.damage ** promotions * (1 + s.stats.damage + s.lit * PER_LIT) * (s.chosen ? godDef(s.chosen).passive.damageScale : 1)

  it('피해 배율은 바꾸기 전 식과 소수 넷째 자리까지 같고, 층을 곱한 값과 같다', () => {
    const gearItems = [{ stats: [{ kind: 'damage' as const, value: 0.08 }], source: { id: 'flame' as const, value: 3 } }]
    const samples: Parameters<typeof computeBuild>[0][] = [
      { open: new Map(), hand: null, gear: [], promotions: 0 },
      { open: new Map([['thor', 1]]), hand: 'thor', gear: ['mjolnir'], promotions: 0 },
      { open: new Map([['thor', 3], ['loki', 2]]), hand: 'thor', present: ['thor', 'loki'], gear: ['mjolnir'], lit: 4, gearItems, promotions: 3 },
      { open: new Map([['zeus', 2]]), hand: 'zeus', gear: [], gearItems, promotions: 1, bonus: { oaths: { damage: 0.1 }, training: { damage: 0.12, maxHp: 10 } } },
      { open: new Map([['odin', 4], ['thor', 2]]), hand: null, gear: ['mjolnir'], promotions: 4 },
      { open: new Map([['artemis', 2]]), hand: 'artemis', waking: 'loki', gear: [], lit: 1, promotions: 1 },
    ]
    for (const input of samples) {
      const state = computeBuild(input)
      expect(state.damageScale).toBeCloseTo(legacy(state, input.promotions), 4)
      expect(layerProduct(state.layers)).toBe(state.damageScale)
    }
  })

  it('덧셈 층은 출처마다 피해 몫을 따로 센다', () => {
    const state = computeBuild({ open: new Map([['thor', 2]]), hand: 'thor', gear: [], lit: 1, promotions: 2, bonus: { oaths: { damage: 0.1 }, training: { damage: 0.2 } } })
    const by = Object.fromEntries(state.layers.map((l) => [l.id, l.value]))
    expect(by.oaths).toBeCloseTo(0.1)
    expect(by.training).toBeCloseTo(0.2)
    expect(by.collection).toBeCloseTo(PER_LIT)
    expect(by.promotion).toBeCloseTo(PER_PROMOTION.damage ** 2)
    expect(activeLayers(state.layers).map((l) => l.id)).not.toContain('gear')
  })
})

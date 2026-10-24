import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Build } from '../src/build/Build'
import { computeBuild } from '../src/build/BuildState'
import { NO_RULES, TRIAL_IDS, TRIAL_MILESTONES, TRIAL_PAR, type TrialId, trialRules, TRIALS } from '../src/data/trials'
import { RelicPowers } from '../src/game/RelicPowers'
import { rollGear } from '../src/gear/roll'
import { ClassProgress } from '../src/myth/ClassProgress'
import { ThreatProgress } from '../src/progress/Threat'
import { parseTrials, TrialProgress } from '../src/progress/Trials'

/** 토르를 고르고 일반 장비 일곱 칸을 다 낀 상태 */
function geared(trial: () => TrialId | null) {
  const powers = new RelicPowers(new THREE.Group())
  powers.equip('mjolnir')
  powers.choose('thor')
  let seed = 1
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (const part of ['head', 'body', 'hands', 'feet', 'trinket', 'trinket'] as const) {
    const item = rollGear(rng, { part, grade: 'rare' })
    powers.loadout.addGear(item)
    powers.loadout.equip(item.uid)
  }
  const progress = new ClassProgress()
  progress.addXp('thor', 1e9)
  return new Build({ powers, progress, threat: new ThreatProgress(), trials: new TrialProgress(), trial })
}

describe('시련 제약 (E16-02)', () => {
  it('제약은 시련 중에만 걸리고 끝나면 풀린다 (모든 시련)', () => {
    let running: TrialId | null = null
    const build = geared(() => running)
    const free = build.state
    for (const id of TRIAL_IDS) {
      running = id
      const on = build.state
      const rules = trialRules(id)
      if (rules.noMyth) {
        expect(on.chosen, id).toBeNull()
        expect(build.chosen, id).toBeNull()
      }
      if (rules.slots) expect(on.sources.flame + on.sources.hunt + on.sources.wind + on.sources.stone, id).toBeLessThan(free.sources.flame + free.sources.hunt + free.sources.wind + free.sources.stone)
      if (rules.maxHpScale !== 1) expect(on.maxHp, id).toBe(Math.round(free.maxHp * rules.maxHpScale))
      if (rules.moveScale !== 1) expect(on.moveSpeed, id).toBeCloseTo(free.moveSpeed * rules.moveScale)
      expect(on.noHeal, id).toBe(rules.noHeal)
      expect(on.noUltimate, id).toBe(rules.noUltimate)
      running = null
      expect(build.state, `${id} 해제`).toEqual(free)
    }
  })

  it('규칙 없음은 아무것도 바꾸지 않는다', () => {
    const base = { open: new Map([['thor', 2]]), chosen: ['thor'], gear: [], promotions: 1 }
    expect(computeBuild({ ...base, rules: NO_RULES })).toEqual(computeBuild(base))
  })
})

describe('시련 보상과 기록 (E16-03)', () => {
  it('보상은 시련마다 깬 가장 높은 난이도 × 그 보상, 마일스톤 「시련의 맛」이면 ×1.25', () => {
    const t = new TrialProgress()
    expect(t.rewards()).toEqual({})
    t.win('glass', 1, 80)
    t.win('glass', 2, 95)
    expect(t.rewards().maxHp).toBe(20)
    t.win('slow', 2, 70)
    expect(t.total).toBe(4)
    expect(t.has(TRIAL_MILESTONES[0].at)).toBe(true)
    expect(t.rewards().maxHp).toBeCloseTo(2 * TRIALS.glass.reward.per * 1.25)
  })

  it('기록은 가장 빠른 것만, 낮은 단계를 다시 깨도 깬 단계는 내려가지 않는다', () => {
    const t = new TrialProgress()
    expect(t.win('timed', 3, 100)).toEqual({ record: true, raised: true })
    expect(t.win('timed', 3, 120)).toEqual({ record: false, raised: false })
    expect(t.win('timed', 3, 80).record).toBe(true)
    t.win('timed', 1, 50)
    expect(t.cleared.timed).toBe(3)
    expect(t.best['timed:3']).toBe(80)
  })

  it('균열 보상 배율: 깬 단계가 높고 기록이 빠를수록 크다', () => {
    const slow = new TrialProgress()
    const fast = new TrialProgress()
    slow.win('crowd', 2, TRIAL_PAR * 2)
    fast.win('crowd', 2, TRIAL_PAR / 2)
    expect(slow.riftScale()).toBeGreaterThan(1)
    expect(fast.riftScale()).toBeGreaterThan(slow.riftScale())
  })

  it('저장된 기록을 검사한다: 모르는 시련·범위 밖 단계는 버린다', () => {
    const data = parseTrials({ cleared: { glass: 9, nope: 2, slow: 0 }, best: { 'glass:5': 60, 'glass:6': 1, 'x:1': 3, 'slow:1': -4 } })
    expect(data).toEqual({ cleared: { glass: 5 }, best: { 'glass:5': 60 } })
  })
})

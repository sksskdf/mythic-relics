import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { computeBuild } from '../src/build/BuildState'
import { AWAKEN_AT, AWAKENING, awakeningLevel, zeroSources } from '../src/data/awakening'
import { GRADES } from '../src/data/gearData'
import { SOURCE_IDS } from '../src/data/schema'
import { Lightning } from '../src/fx/Lightning'
import { Puffs } from '../src/fx/Puffs'
import { MYTH_RELICS } from '../src/gear/mythRelic'
import { GEAR } from '../src/gear/roll'
import { HeroController } from '../src/game/HeroController'
import type { CombatTarget } from '../src/game/PlayerCombat'
import { godDef, relicDef } from '../src/relics/data'
import type { SkillContext } from '../src/skills/Skill'
import { SourceAwakening } from '../src/skills/SourceAwakening'
import { buildHeroModel } from '../src/world/heroModel'
import { NavGrid } from '../src/world/navGrid'

function dummy(x: number, z: number): CombatTarget {
  return { x, z, radius: 0.75, alive: true, takeHit: (damage) => damage }
}

function setup(enemies: CombatTarget[]) {
  const hero = new HeroController(buildHeroModel(), new NavGrid(20, 0.5, [], 0.4), () => [], 20)
  const hits: number[] = []
  const ctx: SkillContext = {
    area: 1,
    hero,
    enemies,
    manifested: null,
    level: 0,
    fx: new THREE.Group(),
    lightning: new Lightning(),
    puffs: new Puffs(8),
    hit: (_t, damage) => hits.push(damage),
    shake: () => {},
    sound: () => {},
    slashes: { spawn: () => {} } as never,
    shots: { fire: () => {} } as never,
    flash: () => {},
    heal: () => {},
    heroHp: () => 1,
    chips: () => {},
    setDecoy: () => {},
  }
  return { ctx, hits }
}

/** 원천 하나에 몬 장비: 그 등급 일반 장비 여섯 + 그 원천 신화의 유물 (유물은 원천을 주지 않는다, E303-04) */
function stacked(source: (typeof SOURCE_IDS)[number], grade: (typeof GRADES)[number], stage: number) {
  const value = GEAR.grades[grade].source[1]
  const relic = MYTH_RELICS.find((id) => godDef(relicDef(id).god).source === source)!
  return computeBuild({
    open: new Map(),
    hand: null,
    gear: [relic],
    gearItems: Array.from({ length: 6 }, () => ({ stats: [], source: { id: source, value } })),
    stage: () => stage,
    promotions: 0,
  })
}

describe('원천 각성 규칙 (E14-01)', () => {
  it('문턱 5/10/20을 넘을 때마다 한 단계', () => {
    expect([0, 4, 5, 9, 10, 19, 20, 99].map(awakeningLevel)).toEqual([0, 0, 1, 1, 2, 2, 3, 3])
    expect(AWAKEN_AT).toEqual([5, 10, 20])
  })

  it('원천마다: 한 원천에 몰면 전설 장비로 3단계, 영웅 장비로 2단계, 흔함 장비만이면 1단계', () => {
    for (const source of SOURCE_IDS) {
      const top = stacked(source, 'legend', 4)
      expect(top.sources[source], source).toBe(6 * GEAR.grades.legend.source[1])
      expect(top.awakening[source], source).toBe(3)
      expect(stacked(source, 'hero', 4).awakening[source], source).toBe(2)
      expect(stacked(source, 'common', 1).awakening[source], source).toBe(1)
    }
  })

  it('둘로 나누면 두 원천 모두 2단계에 머문다 (몰지 나눌지가 선택)', () => {
    const split = computeBuild({
      open: new Map(),
      hand: null,
      gear: [],
      gearItems: [...Array.from({ length: 3 }, () => ({ stats: [], source: { id: 'flame' as const, value: 4 } })), ...Array.from({ length: 3 }, () => ({ stats: [], source: { id: 'stone' as const, value: 4 } }))],
      promotions: 0,
    })
    expect(split.awakening.flame).toBe(2)
    expect(split.awakening.stone).toBe(2)
  })
})

describe('원천 각성 적용 (E14-02)', () => {
  it('불꽃: 1단계는 기본 공격 6번째에 폭발, 3단계는 4번마다 한 번 더 번진다', () => {
    const enemies = [dummy(1, 0), dummy(2.5, 0)]
    const { ctx, hits } = setup(enemies)
    const a = new SourceAwakening(ctx.fx)
    a.levels = { ...zeroSources(), flame: 1 }
    for (let i = 0; i < 5; i++) a.onBasicHit(enemies, ctx)
    expect(hits).toEqual([])
    a.onBasicHit(enemies, ctx)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]).toBe(AWAKENING.flame.damage[0])
    hits.length = 0
    a.levels = { ...zeroSources(), flame: 3 }
    for (let i = 0; i < 4; i++) a.onBasicHit(enemies, ctx)
    // 첫 폭발(둘) + 번진 폭발
    expect(hits.length).toBeGreaterThanOrEqual(3)
  })

  it('사냥: 처치하면 잠깐 빨라지고, 3단계는 이어 잡을수록 피해가 오르다 끊기면 사라진다', () => {
    const { ctx } = setup([])
    const a = new SourceAwakening(ctx.fx)
    a.levels = { ...zeroSources(), hunt: 3 }
    expect(a.attackSpeed).toBe(1)
    for (let i = 0; i < 12; i++) a.onKill(dummy(0, 0), ctx)
    expect(a.attackSpeed).toBeCloseTo(1 + AWAKENING.hunt.haste.attackSpeed)
    expect(a.damageScale).toBeCloseTo(1 + AWAKENING.hunt.streak.max * AWAKENING.hunt.streak.per)
    for (let t = 0; t < 3.1; t += 0.1) a.update(0.1, ctx)
    expect(a.attackSpeed).toBe(1)
    expect(a.damageScale).toBe(1)
  })

  it('바람: 걸은 만큼 다음 기본 공격이 세지고(+60%까지), 치면 사라진다', () => {
    const { ctx } = setup([dummy(1, 0)])
    const a = new SourceAwakening(ctx.fx)
    a.levels = { ...zeroSources(), wind: 1 }
    a.onWalk(5, ctx)
    expect(a.basicScale).toBeCloseTo(1.3)
    a.onWalk(50, ctx)
    expect(a.basicScale).toBeCloseTo(1 + AWAKENING.wind.charge.max)
    a.onBasicHit([dummy(1, 0)], ctx)
    expect(a.basicScale).toBe(1)
  })

  it('바위: 맞으면 보호막이 생기고 다음 피해를 막는다. 2단계는 깨질 때 반격', () => {
    const { ctx, hits } = setup([dummy(1, 0)])
    const a = new SourceAwakening(ctx.fx)
    a.levels = { ...zeroSources(), stone: 2 }
    a.maxHp = 100
    expect(a.beforeHeroHit(10, ctx)).toBe(10)
    expect(a.shield).toBeCloseTo(8)
    expect(a.beforeHeroHit(5, ctx)).toBe(0)
    expect(a.beforeHeroHit(5, ctx)).toBe(2)
    expect(hits).toEqual([AWAKENING.stone.burst.damage])
  })
})

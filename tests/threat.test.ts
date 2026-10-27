import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { computeBuild } from '../src/build/BuildState'
import { AWAKEN_AT, AWAKENING, awakeningLevel, zeroSources } from '../src/data/awakening'
import { GRADES } from '../src/data/gearData'
import { SOURCE_IDS } from '../src/data/schema'
import { THREAT_MAX, threatElite, threatGrades, threatScale } from '../src/data/threat'
import { Lightning } from '../src/fx/Lightning'
import { Puffs } from '../src/fx/Puffs'
import { MYTH_RELICS, STAGE_SOURCE } from '../src/gear/mythRelic'
import { GEAR } from '../src/gear/roll'
import { HeroController } from '../src/game/HeroController'
import type { CombatTarget } from '../src/game/PlayerCombat'
import { Conveniences, CONVENIENCES } from '../src/progress/Conveniences'
import { BATTLE_PER_MASTERY, POUR_MAX, ThreatProgress } from '../src/progress/Threat'
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

/** 원천 하나에 몬 장비: 그 등급 일반 장비 여섯 + 그 원천 신화의 유물 */
function stacked(source: (typeof SOURCE_IDS)[number], grade: (typeof GRADES)[number], stage: number) {
  const value = GEAR.grades[grade].source[1]
  const relic = MYTH_RELICS.find((id) => godDef(relicDef(id).god).source === source)!
  return computeBuild({
    open: new Map(),
    chosen: [],
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

  it('원천마다: 한 원천에 몰면 영웅 장비 + 4단계 유물로 3단계, 흔함 장비만이면 1단계', () => {
    for (const source of SOURCE_IDS) {
      const top = stacked(source, 'hero', 4)
      expect(top.sources[source], source).toBe(6 * 3 + STAGE_SOURCE[3]!)
      expect(top.awakening[source], source).toBe(3)
      expect(stacked(source, 'common', 1).awakening[source], source).toBe(1)
    }
  })

  it('둘로 나누면 두 원천 모두 2단계에 머문다 (몰지 나눌지가 선택)', () => {
    const split = computeBuild({
      open: new Map(),
      chosen: [],
      gear: [],
      gearItems: [...Array.from({ length: 3 }, () => ({ stats: [], source: { id: 'flame' as const, value: 3 } })), ...Array.from({ length: 3 }, () => ({ stats: [], source: { id: 'stone' as const, value: 3 } }))],
      promotions: 0,
      sourceMastery: () => 2,
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

  it('공명은 모든 각성 효과를 1마다 5% 세게 한다', () => {
    const enemies = [dummy(1, 0)]
    const { ctx, hits } = setup(enemies)
    const a = new SourceAwakening(ctx.fx)
    a.levels = { ...zeroSources(), flame: 1 }
    a.resonance = 2
    for (let i = 0; i < 6; i++) a.onBasicHit(enemies, ctx)
    expect(hits[0]).toBeCloseTo(AWAKENING.flame.damage[0] * 1.1)
  })
})

describe('위협 단계 (E14-03)', () => {
  it('단계가 오를수록 적이 세지고 정예가 늘며, 좋은 등급이 잘 나온다 (확률 합은 1)', () => {
    let last = threatScale(1)
    expect(last).toEqual({ hp: 1, damage: 1 })
    let rare = 0
    for (let n = 2; n <= THREAT_MAX; n++) {
      const s = threatScale(n)
      expect(s.hp).toBeGreaterThan(last.hp)
      expect(s.damage).toBeGreaterThan(last.damage)
      last = s
      const chances = threatGrades(Object.fromEntries(GRADES.map((g) => [g, GEAR.grades[g].chance])) as never, n)
      expect(Object.values(chances).reduce((a, b) => a + b, 0)).toBeCloseTo(1)
      expect(chances.rare).toBeGreaterThanOrEqual(rare)
      expect(chances.common).toBeGreaterThanOrEqual(0)
      rare = chances.rare
      expect(threatElite(0.2, n)).toBeGreaterThan(threatElite(0.2, n - 1))
    }
    // 10단계에서도 폭은 작게: 생명력 ×6 안, 피해 ×2.5 안
    expect(threatScale(THREAT_MAX).hp).toBeLessThan(6)
    expect(threatScale(THREAT_MAX).damage).toBeLessThan(2.5)
  })

  it('열린 가장 높은 단계에서 보스를 이겨야 다음 단계가 열리고, 처음 오를 때 경험을 원천 하나에 붓는다', () => {
    const t = new ThreatProgress()
    expect(t.bossDefeated('norse')).toBe(true)
    expect(t.unlocked).toBe(2)
    // 아직 오르지 않았으니 같은 단계 보스를 또 이겨도 3단계는 열리지 않는다
    expect(t.bossDefeated('greek')).toBe(false)
    expect(t.cleared).toEqual({ norse: 1, greek: 1 })
    expect(t.choose(2)).toBe(false)
    t.gainBattle(BATTLE_PER_MASTERY * 2 + 10)
    expect(t.advance('stone')).toBe(2)
    expect(t).toMatchObject({ level: 2, reached: 2, battle: 0 })
    expect(t.mastery.stone).toBe(2)
    // 더 열린 단계가 없으면 오르지 못한다
    expect(t.advance('flame')).toBe(0)
    // 내려갔다가 지난 단계 보스를 이겨도 열리지 않는다
    expect(t.choose(1)).toBe(true)
    expect(t.bossDefeated('norse')).toBe(false)
    // 경험이 아무리 많아도 붓는 숙련은 POUR_MAX까지, 적어도 1
    t.gainBattle(1e5)
    expect(t.pour).toBe(POUR_MAX)
    t.battle = 0
    expect(t.pour).toBe(1)
  })

  it('공명은 네 원천 숙련의 최솟값', () => {
    const t = new ThreatProgress()
    Object.assign(t.mastery, { flame: 3, hunt: 1, wind: 2, stone: 5 })
    expect(t.resonance).toBe(1)
  })
})

describe('편의 자동화 (E14-05)', () => {
  it('세기가 차면 차례대로 하나씩 열린다', () => {
    const c = new Conveniences()
    for (const def of CONVENIENCES) {
      expect(c.has(def.id)).toBe(false)
      const opened = c.count(def.counter, def.need, 'set')
      expect(opened.map((o) => o.id)).toContain(def.id)
      expect(c.has(def.id)).toBe(true)
    }
    // 한 번 열린 것은 다시 알리지 않는다
    expect(c.count('pickups', 100)).toEqual([])
    c.autoSalvage = false
    expect(c.salvaging).toBe(false)
  })
})

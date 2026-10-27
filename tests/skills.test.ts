import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Giant, GRUNT, type GiantWorld } from '../src/enemies/Giant'
import { Lightning } from '../src/fx/Lightning'
import { Puffs } from '../src/fx/Puffs'
import { HeroController } from '../src/game/HeroController'
import type { CombatTarget } from '../src/game/PlayerCombat'
import { relicDef } from '../src/relics/data'
import { DataRelicEffect } from '../src/skills'
import type { RelicEffect, SkillContext } from '../src/skills/Skill'
import { DATA } from '../src/data'
import { createUltimate } from '../src/skills/Ultimate'
import { buildHeroModel } from '../src/world/heroModel'
import { NavGrid } from '../src/world/navGrid'
import { squareArea } from '../src/world/colliders'

function dummy(x: number, z: number, hits: number[]): CombatTarget {
  return {
    x,
    z,
    radius: 0.75,
    alive: true,
    takeHit: (damage) => {
      hits.push(damage)
      return damage
    },
  }
}

function setup(enemies: CombatTarget[]) {
  const hero = new HeroController(buildHeroModel(), new NavGrid(20, 0.5, [], 0.4), () => [], 20)
  const fx = new THREE.Group()
  const decoys: ({ x: number; z: number } | null)[] = []
  const ctx: SkillContext = {
    area: 1,
    hero,
    enemies,
    manifested: null,
    level: 0,
    fx,
    lightning: new Lightning(),
    puffs: new Puffs(8),
    hit: (target, damage, dirX, dirZ, knockback) => {
      target.takeHit(damage, dirX, dirZ, knockback)
    },
    shake: () => {},
    sound: () => {},
    slashes: { spawn: () => {} } as never,
    shots: { fire: () => {} } as never,
    flash: () => {},
    heal: () => {},
    heroHp: () => 1,
    chips: () => {},
    setDecoy: (d) => decoys.push(d),
  }
  return { hero, fx, ctx, decoys }
}

/** 유물 데이터(src/data/relics.json)로 효과를 만든다. */
function effect(id: string, fx: THREE.Object3D): DataRelicEffect {
  return new DataRelicEffect(relicDef(id), fx)
}

function run(skill: RelicEffect, ctx: SkillContext, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) skill.update(1 / 60, ctx)
}

describe('묠니르 망치 투척', () => {
  it('3연타의 마지막 타가 맞으면 망치를 던져 가는 길과 돌아오는 길에 한 번씩 때린다', () => {
    const hits: number[] = []
    const target = dummy(5, 0, hits)
    const { ctx, fx } = setup([target])
    const skill = effect('mjolnir', fx)
    skill.onBasicHit({ targets: [target], comboIndex: 0, comboLength: 3, finisher: false }, ctx)
    run(skill, ctx, 1.5)
    // 첫 타에서는 던지지 않고, 5m 밖이라 주변 번개도 닿지 않는다.
    expect(hits).toEqual([])
    expect(skill.charge).toBeCloseTo(1 / 3)
    skill.onBasicHit({ targets: [target], comboIndex: 2, comboLength: 3, finisher: true }, ctx)
    run(skill, ctx, 1.5)
    expect(hits.length).toBe(2)
    expect(skill.charge).toBe(0)
  })

  it('천둥의 신 발현 중에는 망치에 번개가 더해지고, 천둥군주(Lv2)부터 망치 피해가 1.5배다', () => {
    const hits: number[] = []
    const target = dummy(5, 0, hits)
    const { ctx, fx } = setup([target])
    ctx.manifested = 'thor'
    ctx.level = 2
    const skill = effect('mjolnir', fx)
    skill.onBasicHit({ targets: [target], comboIndex: 2, comboLength: 3, finisher: true }, ctx)
    run(skill, ctx, 1.5)
    // 가는 길·오는 길마다 망치 24 + 번개 8
    expect(hits.filter((h) => h === 24).length).toBe(2)
    expect(hits.filter((h) => h === 8).length).toBe(2)
  })

  it('지속 효과: 4m 안의 적에게 2초마다 작은 번개가 떨어진다', () => {
    const hits: number[] = []
    const { ctx, fx } = setup([dummy(2, 0, hits), dummy(9, 0, hits)])
    run(effect('mjolnir', fx), ctx, 4.1)
    expect(hits).toEqual([6, 6])
  })
})

describe('메긴교르드 힘의 해방', () => {
  it('처치 5번이 쌓이면 다음 기본 공격이 땅을 내리찍어 주변을 모두 때린다', () => {
    const hits: number[] = []
    const near = [dummy(1.5, 0, hits), dummy(-2.5, 0.5, hits), dummy(8, 0, hits)]
    const { ctx, fx } = setup(near)
    const skill = effect('megingjord', fx)
    const hit = { targets: [near[0]!], comboIndex: 0, comboLength: 3, finisher: false }
    for (let i = 0; i < 4; i++) skill.onKill(near[2]!)
    skill.onBasicHit(hit, ctx)
    expect(hits).toEqual([])
    skill.onKill(near[2]!)
    expect(skill.charge).toBe(1)
    skill.onBasicHit(hit, ctx)
    expect(hits.length).toBe(2)
    expect(skill.charge).toBe(0)
  })

  it('지속 효과: 내 넉백은 1.5배, 받는 넉백은 절반', () => {
    const { fx } = setup([])
    expect(effect('megingjord', fx).modifiers).toEqual({ knockbackDealt: 1.5, knockbackTaken: 0.5 })
  })
})

describe('야른그레이프르 쇳덩이 되던지기', () => {
  it('맞는 순간 피해를 절반으로 줄이고, 때린 적에게 쇳덩이를 되던진다', () => {
    const hits: number[] = []
    const { ctx, fx } = setup([dummy(3, 0, hits)])
    const skill = effect('jarngreipr', fx)
    expect(skill.beforeHeroHit(20, 3, 0, ctx)).toBe(10)
    // 재사용 대기 중에는 줄이지 않는다.
    expect(skill.beforeHeroHit(20, 3, 0, ctx)).toBe(20)
    run(skill, ctx, 1)
    expect(hits.length).toBe(1)
    // 4초가 지나면 다시 찬다.
    run(skill, ctx, 3.1)
    expect(skill.charge).toBe(1)
    expect(skill.beforeHeroHit(20, 3, 0, ctx)).toBe(10)
  })
})

describe('변신의 가면 환영 분신', () => {
  it('12m를 걸어야 충전되고, 가까이 적이 있으면 분신을 남겼다가 사라질 때 치운다', () => {
    const hits: number[] = []
    const { ctx, fx, decoys } = setup([dummy(4, 0, hits)])
    const skill = effect('lokiMask', fx)
    run(skill, ctx, 1)
    expect(decoys).toEqual([])
    skill.onWalk(6)
    expect(skill.charge).toBeCloseTo(0.5)
    skill.onWalk(6)
    run(skill, ctx, 6)
    expect(decoys[0]).not.toBeNull()
    expect(decoys.at(-1)).toBeNull()
    expect(skill.modifiers).toEqual({ moveSpeed: 1.1 })
  })

  it('분신이 떠 있는 채로 유물을 빼면 분신을 치운다 (적이 보이지 않는 분신을 쫓지 않게)', () => {
    const { ctx, fx, decoys } = setup([dummy(4, 0, [])])
    const skill = effect('lokiMask', fx)
    skill.onWalk(12)
    run(skill, ctx, 0.2)
    expect(decoys.at(-1)).not.toBeNull()
    skill.dispose()
    expect(decoys.at(-1)).toBeNull()
  })

  it('거인은 가까운 환영을 주인공 대신 쫓는다', () => {
    const giant = new Giant(GRUNT, { x: 0, z: 0 })
    const world: GiantWorld = {
      hero: { x: 8, z: 0, radius: 0.4, alive: true },
      decoy: { x: -6, z: 0, radius: 0.4 },
      nav: new NavGrid(20, 0.5, [], 0.75),
      area: squareArea(20),
      staticColliders: [],
      giants: [giant],
      hitHero: () => {},
      impact: () => {},
      summon: () => {},
      effects: new THREE.Group(),
    }
    for (let i = 0; i < 60; i++) giant.update(1 / 60, world)
    expect(giant.x).toBeLessThan(-0.5)
  })
})

describe('궁극기 묠니르의 심판', () => {
  it('주변 적에게 번개를 여러 번 내리꽂는다', () => {
    const hits: number[] = []
    const enemies = [dummy(2, 0, hits), dummy(-3, 1, hits), dummy(0, 4, hits)]
    const { ctx } = setup(enemies)
    const ultimate = createUltimate(DATA.gods.thor!.ultimate)
    expect(ultimate.worthUsing(ctx, false)).toBe(true)
    ultimate.start(ctx)
    for (let i = 0; i < 180; i++) ultimate.update(1 / 60, ctx)
    expect(ultimate.active).toBe(false)
    expect(hits.length).toBeGreaterThanOrEqual(8)
  })
})

describe('로키 유물과 변신술사 (E6)', () => {
  it('레바테인: 3연타 마지막 타에 앞쪽 부채꼴의 적만 불꽃으로 벤다', () => {
    const front: number[] = []
    const back: number[] = []
    const ahead = dummy(0, 3, front)
    const behind = dummy(0, -3, back)
    const { ctx, fx } = setup([ahead, behind])
    const skill = effect('laevateinn', fx)
    skill.onBasicHit({ targets: [ahead], comboIndex: 2, comboLength: 3, finisher: true }, ctx)
    expect(front.length).toBe(1)
    expect(back).toEqual([])
  })

  it('겨우살이 가지: 처치 3번이면 가장 먼 적 쪽으로 던져 길 위의 적을 모두 꿰뚫는다', () => {
    const hits: number[] = []
    const near = dummy(0, 3, hits)
    const far = dummy(0, 8, hits)
    const { ctx, fx } = setup([near, far])
    const skill = effect('mistletoe', fx)
    for (let i = 0; i < 3; i++) skill.onKill(near)
    run(skill, ctx, 1)
    expect(hits.length).toBe(2)
  })

  it('변신술사 발현: 레벨만큼 그림자 분신이 서고, 가까운 적에게 달려들어 벤다', async () => {
    const { ClassPassives } = await import('../src/skills/ClassPassives')
    const hits: number[] = []
    const { ctx, fx } = setup([dummy(2, 2, hits)])
    const passives = new ClassPassives(fx)
    ctx.manifested = 'loki'
    for (const [level, count] of [[1, 1], [2, 1], [3, 2], [4, 3]] as const) {
      ctx.level = level
      passives.update(1 / 60, ctx)
      expect(passives.companionCount).toBe(count)
    }
    for (let t = 0; t < 3; t += 1 / 60) passives.update(1 / 60, ctx)
    expect(hits.length).toBeGreaterThan(2)
    ctx.manifested = null
    ctx.level = 0
    passives.update(1 / 60, ctx)
    expect(passives.companionCount).toBe(0)
  })

})

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Giant, GRUNT, type GiantWorld } from '../src/enemies/Giant'
import { Lightning } from '../src/fx/Lightning'
import { Puffs } from '../src/fx/Puffs'
import { HeroController } from '../src/game/HeroController'
import type { CombatTarget } from '../src/game/PlayerCombat'
import { IronCatch } from '../src/skills/Jarngreipr'
import { IllusionClone } from '../src/skills/LokiMask'
import { MightUnleashed } from '../src/skills/Megingjord'
import { MjolnirThrow } from '../src/skills/Mjolnir'
import type { Skill, SkillContext } from '../src/skills/Skill'
import { ThunderJudgement } from '../src/skills/Ultimate'
import { buildHeroModel } from '../src/world/heroModel'
import { NavGrid } from '../src/world/navGrid'

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
    setDecoy: (d) => decoys.push(d),
  }
  return { hero, fx, ctx, decoys }
}

function run(skill: Skill, ctx: SkillContext, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) skill.update(1 / 60, ctx)
}

describe('묠니르 망치 투척', () => {
  it('가까운 적에게 던져 가는 길과 돌아오는 길에 한 번씩 때리고 손으로 돌아온다', () => {
    const hits: number[] = []
    const { ctx, fx } = setup([dummy(5, 0, hits)])
    const skill = new MjolnirThrow(fx)
    run(skill, ctx, 3)
    expect(hits.length).toBe(2)
    expect(skill.left).toBeGreaterThan(0)
  })

  it('사거리 밖의 적에게는 던지지 않는다', () => {
    const hits: number[] = []
    const { ctx, fx } = setup([dummy(15, 0, hits)])
    run(new MjolnirThrow(fx), ctx, 3)
    expect(hits).toEqual([])
  })
})

describe('메긴교르드 힘의 해방', () => {
  it('적이 바짝 붙으면 주변을 모두 때리고 재사용 대기에 들어간다', () => {
    const hits: number[] = []
    const { ctx, fx } = setup([dummy(1.5, 0, hits), dummy(-2.5, 0.5, hits), dummy(8, 0, hits)])
    const skill = new MightUnleashed(fx)
    run(skill, ctx, 1)
    expect(hits.length).toBe(2)
    expect(skill.left).toBeGreaterThan(4)
  })
})

describe('야른그레이프르 쇳덩이 되던지기', () => {
  it('맞는 순간 피해를 절반으로 줄이고, 때린 적에게 쇳덩이를 되던진다', () => {
    const hits: number[] = []
    const { ctx, fx } = setup([dummy(3, 0, hits)])
    const skill = new IronCatch(fx)
    expect(skill.beforeHeroHit(20, 3, 0, ctx)).toBe(10)
    // 재사용 대기 중에는 줄이지 않는다.
    expect(skill.beforeHeroHit(20, 3, 0, ctx)).toBe(20)
    run(skill, ctx, 1)
    expect(hits.length).toBe(1)
  })
})

describe('변신의 가면 환영 분신', () => {
  it('적 여럿이 다가오면 환영을 세우고, 사라질 때 치운다', () => {
    const hits: number[] = []
    const { ctx, fx, decoys } = setup([dummy(4, 0, hits), dummy(-4, 0, hits)])
    run(new IllusionClone(fx), ctx, 6)
    expect(decoys[0]).not.toBeNull()
    expect(decoys.at(-1)).toBeNull()
  })

  it('거인은 가까운 환영을 주인공 대신 쫓는다', () => {
    const giant = new Giant(GRUNT, { x: 0, z: 0 })
    const world: GiantWorld = {
      hero: { x: 8, z: 0, radius: 0.4, alive: true },
      decoy: { x: -6, z: 0, radius: 0.4 },
      nav: new NavGrid(20, 0.5, [], 0.75),
      halfExtent: 20,
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
    const ultimate = new ThunderJudgement()
    expect(ultimate.worthUsing(ctx, false)).toBe(true)
    ultimate.start(ctx)
    for (let i = 0; i < 180; i++) ultimate.update(1 / 60, ctx)
    expect(ultimate.active).toBe(false)
    expect(hits.length).toBeGreaterThanOrEqual(8)
  })
})

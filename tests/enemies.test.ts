import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Giant, GRUNT, type GiantWorld, KING } from '../src/enemies/Giant'
import { HeroController } from '../src/game/HeroController'
import { type CombatTarget, PlayerCombat } from '../src/game/PlayerCombat'
import { buildHeroModel } from '../src/world/heroModel'
import { NavGrid } from '../src/world/navGrid'

const nav = new NavGrid(20, 0.5, [], 0.75)

function makeWorld(hero: { x: number; z: number }) {
  const hits: number[] = []
  const summons: number[] = []
  const world: GiantWorld = {
    hero: { ...hero, radius: 0.4, alive: true },
    nav,
    halfExtent: 20,
    staticColliders: [],
    giants: [],
    hitHero: (damage) => hits.push(damage),
    impact: () => {},
    summon: (_x, _z, count) => summons.push(count),
    effects: new THREE.Group(),
  }
  return { world, hits, summons }
}

/** 고정된 시간 간격으로 여러 번 진행한다. */
function run(giant: Giant, world: GiantWorld, seconds: number, step = 1 / 60) {
  for (let t = 0; t < seconds; t += step) giant.update(step, world)
}

describe('서리 거인 졸개', () => {
  it('주인공을 알아채면 다가와 공격하고, 가만히 있으면 맞는다', () => {
    const giant = new Giant(GRUNT, { x: 0, z: 0 })
    const { world, hits } = makeWorld({ x: 6, z: 0 })
    world.giants = [giant]
    run(giant, world, 4)
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0]).toBe(GRUNT.attacks[0]!.damage)
  })

  it('예고 중에 범위 밖으로 걸어 나가면 맞지 않는다', () => {
    const giant = new Giant(GRUNT, { x: 0, z: 0 })
    const { world, hits } = makeWorld({ x: 1.8, z: 0 })
    world.giants = [giant]
    for (let i = 0; i < 600 && giant.state !== 'windup'; i++) giant.update(1 / 60, world)
    expect(giant.state).toBe('windup')
    // 예고가 고정된 뒤(앞부분 40% 이후) 옆으로 크게 비켜선다.
    run(giant, world, GRUNT.attacks[0]!.windup * 0.5)
    world.hero.x = -4
    world.hero.z = -4
    run(giant, world, GRUNT.attacks[0]!.windup * 0.6)
    expect(hits).toEqual([])
  })

  it('강한 타격(마지막 타)에 맞으면 휘청이며 예고가 끊긴다', () => {
    const giant = new Giant(GRUNT, { x: 0, z: 0 })
    const { world } = makeWorld({ x: 1.8, z: 0 })
    world.giants = [giant]
    for (let i = 0; i < 600 && giant.state !== 'windup'; i++) giant.update(1 / 60, world)
    giant.takeHit(22, 1, 0, 9)
    expect(giant.state).toBe('stagger')
  })

  it('쓰러지면 잠시 뒤 조각으로 흩어진다', () => {
    const giant = new Giant(GRUNT, { x: 0, z: 0 })
    const { world } = makeWorld({ x: 10, z: 10 })
    giant.takeHit(999, 1, 0, 0)
    expect(giant.alive).toBe(false)
    let shattered = false
    for (let i = 0; i < 120; i++) {
      giant.update(1 / 60, world)
      shattered ||= giant.justShattered
    }
    expect(shattered).toBe(true)
    expect(giant.gone).toBe(true)
  })
})

describe('거인 왕', () => {
  it('맞아도 밀리거나 끊기지 않는다 (슈퍼아머)', () => {
    const king = new Giant(KING, { x: 0, z: 0 })
    const { world } = makeWorld({ x: 3, z: 0 })
    world.giants = [king]
    for (let i = 0; i < 600 && king.state !== 'windup'; i++) king.update(1 / 60, world)
    const before = { x: king.x, z: king.z }
    king.takeHit(50, 1, 0, 20)
    king.update(1 / 60, world)
    expect(king.state).toBe('windup')
    expect(Math.hypot(king.x - before.x, king.z - before.z)).toBeLessThan(0.01)
  })

  it('생명력이 절반 아래로 떨어지면 포효하며 졸개를 부른다', () => {
    const king = new Giant(KING, { x: 0, z: 0 })
    const { world, summons } = makeWorld({ x: 3, z: 0 })
    world.giants = [king]
    king.takeHit(KING.hp * 0.55, 1, 0, 0)
    run(king, world, 3)
    expect(summons).toEqual([3])
  })
})

describe('주인공 자동 공격', () => {
  function setup() {
    const rig = buildHeroModel()
    const hero = new HeroController(rig, new NavGrid(20, 0.5, [], 0.4), () => [], 20)
    const combat = new PlayerCombat(hero)
    const taken: number[] = []
    const dummy: CombatTarget = {
      x: 1.5,
      z: 0,
      radius: 0.75,
      alive: true,
      takeHit: (damage) => {
        taken.push(damage)
        return damage
      },
    }
    const hooks = { onSwing: () => {}, onHits: () => {} }
    return { hero, combat, dummy, taken, hooks }
  }

  it('멈춰 있으면 사거리 안의 적을 버튼 없이 때린다', () => {
    const { combat, dummy, taken, hooks } = setup()
    for (let i = 0; i < 90; i++) combat.update(1 / 60, [dummy], hooks)
    expect(taken.length).toBeGreaterThanOrEqual(2)
    expect(combat.divine).toBeGreaterThan(0)
  })

  it('사거리 밖의 적은 때리지 않는다', () => {
    const { combat, dummy, taken, hooks } = setup()
    const far = { ...dummy, x: 8 }
    for (let i = 0; i < 90; i++) combat.update(1 / 60, [far], hooks)
    expect(taken).toEqual([])
  })

  it('움직이기 시작하면 휘두르던 공격이 끊긴다', () => {
    const { hero, combat, dummy, taken, hooks } = setup()
    combat.update(1 / 60, [dummy], hooks)
    expect(combat.combo.swinging).toBe(true)
    hero.moveTo({ x: -5, z: 0 })
    for (let i = 0; i < 30; i++) combat.update(1 / 60, [dummy], hooks)
    expect(combat.combo.swinging).toBe(false)
    expect(taken).toEqual([])
  })

  it('맞은 직후 잠깐은 다시 맞지 않는다', () => {
    const { combat } = setup()
    expect(combat.takeHit(10, 1, 0, 0)).toBe(10)
    expect(combat.takeHit(10, 1, 0, 0)).toBe(0)
    expect(combat.health.hp).toBe(90)
  })
})


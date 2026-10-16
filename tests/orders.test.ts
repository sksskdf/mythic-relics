import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Giant, GRUNT, type GiantWorld, KING } from '../src/enemies/Giant'
import { plowThrough } from '../src/game/plow'
import { DoubleTapDetector } from '../src/input/doubleTap'

import { HeroController } from '../src/game/HeroController'
import { HeroOrders } from '../src/game/HeroOrders'
import { type CombatTarget, PlayerCombat } from '../src/game/PlayerCombat'
import { buildHeroModel } from '../src/world/heroModel'
import { NavGrid } from '../src/world/navGrid'

function dummy(x: number, z: number) {
  const hits: number[] = []
  const target: CombatTarget = {
    x,
    z,
    radius: 0.75,
    alive: true,
    takeHit: (damage) => {
      hits.push(damage)
      return damage
    },
  }
  return { target, hits }
}

function setup(enemies: CombatTarget[]) {
  const colliders = () => enemies.filter((e) => e.alive).map((e) => ({ x: e.x, z: e.z, radius: e.radius }))
  const hero = new HeroController(buildHeroModel(), new NavGrid(20, 0.5, [], 0.4), colliders, 20)
  hero.obstacles = colliders
  const combat = new PlayerCombat(hero)
  const orders = new HeroOrders(hero, combat)
  const hooks = { onSwing: () => {}, onHits: () => {} }
  const step = (seconds: number) => {
    for (let t = 0; t < seconds; t += 1 / 60) {
      orders.update(enemies)
      hero.update(1 / 60)
      combat.update(1 / 60, enemies, hooks)
    }
  }
  return { hero, combat, orders, step }
}

describe('클릭 지시', () => {
  it('땅을 눌러 걷다가 적이 사거리에 들어오면 멈춰서 친다', () => {
    const { target, hits } = dummy(0, 6)
    const { hero, orders, step } = setup([target])
    orders.press({ x: 0, z: 12 }, null)
    step(3)
    expect(orders.attackTarget).toBe(target)
    expect(hero.object.position.z).toBeLessThan(6)
    expect(hits.length).toBeGreaterThan(0)
  })

  it('적을 누르면 그 적에게 다가가 친다', () => {
    const { target, hits } = dummy(5, 5)
    const { orders, step } = setup([target])
    orders.press(null, target)
    step(3)
    expect(hits.length).toBeGreaterThan(0)
  })

  it('가까운 다른 적이 있어도 누른 적만 친다', () => {
    const near = dummy(1.8, 0)
    const far = dummy(-5, 0)
    const { orders, step } = setup([near.target, far.target])
    orders.press(null, far.target)
    step(4)
    expect(far.hits.length).toBeGreaterThan(0)
    expect(near.hits).toEqual([])
  })

  it('싸우는 중에 땅을 한 번 누르면 다시 싸우고, 두 번 누르면 적을 무시하고 끝까지 걷는다', () => {
    const { target } = dummy(0, 6)
    const { hero, orders, step } = setup([target])
    orders.press({ x: 0, z: 12 }, null)
    step(2)
    expect(orders.attackTarget).toBe(target)
    orders.press({ x: 0, z: 12 }, null)
    step(0.5)
    expect(orders.attackTarget).toBe(target)
    orders.press({ x: 0, z: 12 }, null, true)
    expect(orders.order).toEqual({ kind: 'move', forced: true })
    step(5)
    expect(hero.object.position.z).toBeGreaterThan(11)
  })

  it('길을 막은 적에게 부딪혀 제자리걸음하지 않고 옆으로 비켜 간다', () => {
    const { target } = dummy(0, 4)
    const { hero, orders, combat, step } = setup([target])
    // 적 너머를 두 번 눌러 적을 무시하고 이동
    combat.target = target
    orders.press({ x: 0, z: 9 }, null, true)
    step(4)
    expect(hero.object.position.z).toBeGreaterThan(8.5)
  })
})

describe('무리 밀고 지나가기', () => {
  function surrounded(spec = GRUNT, count = 6) {
    const giants = Array.from({ length: count }, (_, i) => {
      const a = (i / count) * Math.PI * 2
      return new Giant(spec, { x: Math.sin(a) * 1.3, z: Math.cos(a) * 1.3 }, i + 1)
    })
    const hero = new HeroController(buildHeroModel(), new NavGrid(20, 0.5, [], 0.4), () => [], 20)
    const combat = new PlayerCombat(hero)
    const orders = new HeroOrders(hero, combat)
    const blocking = () => giants.filter((g) => g.alive && (!orders.plowing || g.blocksPath)).map((g) => g.collider)
    // HeroController는 생성 때 받은 함수를 쓰므로, 같은 규칙을 장애물에도 건다.
    ;(hero as unknown as { colliders: () => unknown }).colliders = blocking
    hero.obstacles = blocking
    const world: GiantWorld = {
      hero: { x: 0, z: 0, radius: 0.4, alive: true },
      nav: new NavGrid(20, 0.5, [], 0.75),
      halfExtent: 20,
      staticColliders: [],
      giants,
      hitHero: () => {},
      impact: () => {},
      summon: () => {},
      effects: new THREE.Group(),
    }
    const step = (seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        orders.update(giants)
        const heading = hero.heading
        if (orders.plowing && heading) plowThrough(hero.object.position, 0.4, heading, giants)
        hero.update(1 / 60)
        world.hero.x = hero.object.position.x
        world.hero.z = hero.object.position.z
        for (const g of giants) g.update(1 / 60, world)
      }
    }
    return { giants, hero, combat, orders, step }
  }

  it('졸개 6마리에 둘러싸여도 8m 밖을 두 번 누르면 3초 안에 도착한다', () => {
    const { giants, hero, combat, orders, step } = surrounded()
    combat.target = giants[0]!
    orders.press({ x: 8, z: 0 }, null, true)
    expect(orders.order).toEqual({ kind: 'move', forced: true })
    step(3)
    expect(Math.hypot(hero.object.position.x - 8, hero.object.position.z)).toBeLessThan(0.6)
  })

  it('보스는 밀리지 않는다', () => {
    const king = new Giant(KING, { x: 0, z: 0 })
    expect(king.shove(1, 0, 9)).toBe(false)
    const grunt = new Giant(GRUNT, { x: 0, z: 0 })
    expect(grunt.shove(1, 0, 9)).toBe(true)
    expect(grunt.state).toBe('stagger')
  })
})

describe('두 번 누름', () => {
  it('같은 자리를 0.35초 안에 다시 누르면 두 번 누름, 세 번째는 다시 첫 누름', () => {
    const tap = new DoubleTapDetector()
    expect(tap.press(0, 100, 100)).toBe(false)
    expect(tap.press(0.2, 110, 104)).toBe(true)
    expect(tap.press(0.3, 110, 104)).toBe(false)
  })

  it('너무 늦거나 멀리 누르면 두 번 누름이 아니다', () => {
    const tap = new DoubleTapDetector()
    tap.press(0, 100, 100)
    expect(tap.press(0.5, 100, 100)).toBe(false)
    expect(tap.press(0.6, 200, 100)).toBe(false)
  })
})

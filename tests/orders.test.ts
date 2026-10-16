import { describe, expect, it } from 'vitest'

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

  it('싸우는 중에 땅을 누르면 적을 무시하고 끝까지 걷는다', () => {
    const { target } = dummy(0, 6)
    const { hero, orders, step } = setup([target])
    orders.press({ x: 0, z: 12 }, null)
    step(2)
    expect(orders.attackTarget).toBe(target)
    orders.press({ x: 0, z: 12 }, null)
    expect(orders.order).toEqual({ kind: 'move', forced: true })
    step(5)
    expect(hero.object.position.z).toBeGreaterThan(11)
  })

  it('길을 막은 적에게 부딪혀 제자리걸음하지 않고 옆으로 비켜 간다', () => {
    const { target } = dummy(0, 4)
    const { hero, orders, combat, step } = setup([target])
    // 싸우는 중으로 만든 뒤 적 너머로 이동 (적을 무시하는 이동)
    combat.target = target
    orders.press({ x: 0, z: 9 }, null)
    step(4)
    expect(hero.object.position.z).toBeGreaterThan(8.5)
  })
})

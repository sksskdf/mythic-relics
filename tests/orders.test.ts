import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { Giant, GRUNT, type GiantWorld, KING } from '../src/enemies/Giant'
import { plowThrough } from '../src/game/plow'

import { HeroController } from '../src/game/HeroController'
import { HeroOrders } from '../src/game/HeroOrders'
import { type CombatTarget, PlayerCombat } from '../src/game/PlayerCombat'
import { buildHeroModel } from '../src/world/heroModel'
import { NavGrid } from '../src/world/navGrid'
import { squareArea } from '../src/world/colliders'

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
  it('땅을 눌러 걸으면 적이 사거리에 들어와도 싸우지 않고 끝까지 간다', () => {
    const { target, hits } = dummy(2.2, 6)
    const { hero, orders, step } = setup([target])
    orders.press({ x: 0, z: 12 }, null)
    step(1.5)
    expect(orders.attackTarget).toBeNull()
    expect(hits).toEqual([])
    step(3)
    expect(hero.object.position.z).toBeGreaterThan(11)
  })

  it('조이스틱: 이동 지시가 끊겨도(막힘·쓰러짐·장면) 쥔 채로 다시 걷는다 (E235)', () => {
    const { hero, orders, step } = setup([])
    orders.steer({ x: 0, z: 3 })
    expect(orders.order).toEqual({ kind: 'move' })
    step(0.2)
    // 지시가 지워진 뒤에도 손을 떼지 않고 계속 민다
    orders.clear()
    hero.stop()
    step(0.2)
    orders.steer({ x: 3, z: 0 })
    expect(orders.order).toEqual({ kind: 'move' })
    expect(hero.isMoving).toBe(true)
    // 이어지는 동안은 목적지만 바꾼다
    step(0.2)
    orders.steer({ x: 5, z: 0 })
    expect(orders.destination).toEqual({ x: 5, z: 0 })
  })

  it('누른 채 따라가다 한 번 도착해도, 계속 누른 채 커서를 옮기면 다시 따라간다', () => {
    const { hero, orders, step } = setup([])
    orders.press({ x: 3, z: 0 }, null)
    const hold = (ground: { x: number; z: number }, seconds: number) => {
      for (let t = 0; t < seconds; t += 1 / 60) {
        orders.hold(ground)
        step(1 / 60)
      }
    }
    hold({ x: 3, z: 0 }, 2)
    expect(orders.order).toBeNull()
    hold({ x: -5, z: 0 }, 3)
    expect(hero.object.position.x).toBeLessThan(-4)
    // 떼면 더는 따라가지 않는다
    orders.release()
    hold({ x: 5, z: 0 }, 1)
    expect(hero.object.position.x).toBeLessThan(-4)
  })

  it('도착해 멈추면 사거리 안의 적을 자동으로 친다', () => {
    const { target, hits } = dummy(0, 7.5)
    const { orders, step } = setup([target])
    orders.press({ x: 0, z: 6 }, null)
    step(4)
    expect(orders.order).toBeNull()
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

  it('적을 치는 중에 땅을 한 번 누르면 공격을 멈추고 그곳까지 빠져나간다', () => {
    const { target } = dummy(0, 3)
    const { hero, orders, combat, step } = setup([target])
    orders.press(null, target)
    step(2)
    expect(orders.attackTarget).toBe(target)
    orders.press({ x: 0, z: -8 }, null)
    expect(orders.order).toEqual({ kind: 'move' })
    expect(combat.focus).toBeNull()
    step(4)
    expect(hero.object.position.z).toBeLessThan(-7.5)
  })

  it('길을 막은 적에게 부딪혀 제자리걸음하지 않고 옆으로 비켜 간다', () => {
    const { target } = dummy(0, 4)
    const { hero, orders, combat, step } = setup([target])
    // 적 너머를 눌러 이동
    combat.target = target
    orders.press({ x: 0, z: 9 }, null)
    step(4)
    expect(hero.object.position.z).toBeGreaterThan(8.5)
  })

  it('맵 밖을 누르면 가장자리까지 가서 멈추고, 그 뒤에는 둘레 적과 싸운다', () => {
    const { target, hits } = dummy(18.2, 0)
    const { hero, orders, step } = setup([target])
    orders.press({ x: 0, z: 40 }, null)
    step(5)
    expect(hero.object.position.z).toBeGreaterThan(19)
    expect(orders.order).toBeNull()
    hero.teleport(16.5, 0)
    step(2)
    expect(hits.length).toBeGreaterThan(0)
  })

  it('결계 밖을 누르면 결계 가장자리에서 멈춘다 (승급 전설)', () => {
    const { hero, orders, step } = setup([])
    hero.arena = { x: 0, z: 0, radius: 6 }
    orders.press({ x: 0, z: 15 }, null)
    step(3)
    expect(Math.hypot(hero.object.position.x, hero.object.position.z)).toBeLessThanOrEqual(6)
    expect(hero.isMoving).toBe(false)
    expect(orders.order).toBeNull()
  })

  it('쓰러진 동안에는 회복 효과가 들어와도 되살아나지 않는다', () => {
    const { combat } = setup([])
    combat.takeHit(1e6, 0, 1, 0)
    expect(combat.alive).toBe(false)
    combat.heal(50)
    expect(combat.alive).toBe(false)
  })

  it('길이 막혀 나아가지 못하면 잠깐 뒤 걷기를 그만둔다', () => {
    const { hero, step } = setup([])
    // 길찾기가 모르는 벽(움직이는 장애물 등)에 막힌 경우
    ;(hero as unknown as { colliders: () => unknown }).colliders = () => [{ x: 0, z: 1.5, radius: 1 }]
    hero.moveTo({ x: 0, z: 8 })
    step(1)
    expect(hero.isMoving).toBe(false)
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
      area: squareArea(20),
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

  it('졸개 6마리에 둘러싸여도 8m 밖을 한 번 누르면 3초 안에 도착한다', () => {
    const { giants, hero, combat, orders, step } = surrounded()
    combat.target = giants[0]!
    orders.press({ x: 8, z: 0 }, null)
    expect(orders.order).toEqual({ kind: 'move' })
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

describe('뒷걸음치는 적 쫓기', () => {
  /** 주인공이 가까이 오면 speed(m/s)로 물러나는 적 (거리 유지·원거리 몬스터) */
  function kiter(x: number, z: number, keep: number, speed: number) {
    const hits: number[] = []
    const t = {
      x,
      z,
      radius: 0.75,
      alive: true,
      takeHit: (damage: number) => {
        hits.push(damage)
        return damage
      },
    }
    const move = (hero: { x: number; z: number }, dt: number) => {
      const dx = t.x - hero.x
      const dz = t.z - hero.z
      const d = Math.hypot(dx, dz) || 1
      if (d < keep) {
        t.x += (dx / d) * speed * dt
        t.z += (dz / d) * speed * dt
      }
    }
    return { target: t as CombatTarget, hits, move }
  }

  it('물러나는 적을 쫓아도 휘두르기를 끊었다 다시 시작하지 않는다 (휘두른 만큼 맞힌다)', () => {
    const { target, hits, move } = kiter(0, 6, 4.5, 3)
    const hero = new HeroController(buildHeroModel(), new NavGrid(30, 0.5, [], 0.4), () => [], 30)
    const combat = new PlayerCombat(hero)
    const orders = new HeroOrders(hero, combat)
    let swings = 0
    const hooks = { onSwing: () => swings++, onHits: () => {} }
    orders.press(null, target)
    for (let t = 0; t < 6; t += 1 / 60) {
      orders.update([target])
      hero.update(1 / 60)
      combat.update(1 / 60, [target], hooks)
      move({ x: hero.object.position.x, z: hero.object.position.z }, 1 / 60)
    }
    // 고치기 전: 6초에 휘두르기 시작 42번, 거의 못 맞힘 (시작하자마자 끊김)
    // 쉬지 않고 물러나기만 하는 적이라도 휘두르기는 제 빠르기로 나가고, 절반은 맞는다
    expect(swings).toBeLessThan(20)
    expect(hits.length).toBeGreaterThanOrEqual(Math.floor(swings / 2))
  })
})

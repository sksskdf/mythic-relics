import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { REGIONS } from '../src/data/regions'
import { ELITES } from '../src/enemies/elite'
import { buildEnemyRig } from '../src/enemies/enemyModel'
import { ENEMIES, Giant, GRUNT, type GiantWorld, KING } from '../src/enemies/Giant'
import { Encounter } from '../src/game/Encounter'
import { HeroController } from '../src/game/HeroController'
import { type CombatTarget, PlayerCombat } from '../src/game/PlayerCombat'
import { buildHeroModel } from '../src/world/heroModel'
import { NavGrid } from '../src/world/navGrid'

const nav = new NavGrid(20, 0.5, [], 0.75)

function makeWorld(hero: { x: number; z: number }) {
  const hits: number[] = []
  const summons: number[] = []
  const called: (string | undefined)[] = []
  const world: GiantWorld = {
    hero: { ...hero, radius: 0.4, alive: true },
    nav,
    halfExtent: 20,
    staticColliders: [],
    giants: [],
    hitHero: (damage) => hits.push(damage),
    impact: () => {},
    summon: (_x, _z, count, enemy) => (summons.push(count), called.push(enemy)),
    effects: new THREE.Group(),
  }
  return { world, hits, summons, called }
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

const spec = (id: string) => ENEMIES[id]!
const ALL = Object.values(ENEMIES)
const FIELD_REALMS = ['norse', 'greek', 'china', 'japan', 'korea']

describe('적 데이터 규칙 (E8-01)', () => {
  it('모든 공격은 피할 시간을 준다: 예고 0.6초 이상, 센 공격(15 이상)은 0.8초, 부르기는 1초 이상', () => {
    for (const enemy of ALL) {
      for (const a of enemy.attacks) {
        const name = `${enemy.id}.${a.name}`
        expect(a.windup, name).toBeGreaterThanOrEqual(0.6)
        if (a.damage >= 15) expect(a.windup, name).toBeGreaterThanOrEqual(0.8)
        if (a.area.kind === 'summon') expect(a.windup, name).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('역할마다 그 역할다운 행동이 있다', () => {
    for (const e of ALL) {
      const kinds = e.attacks.map((a) => a.area.kind)
      switch (e.role) {
        case 'brute':
          expect(kinds, e.id).toContain('sector')
          break
        case 'charger':
          expect(kinds, e.id).toContain('line')
          break
        case 'ranged': {
          const shot = e.attacks.find((a) => a.projectile)
          expect(shot, e.id).toBeDefined()
          // 물러난 자리에서도 던질 수 있어야 한다
          expect(e.keepAway, e.id).toBeLessThan(shot!.reach)
          break
        }
        case 'guard':
          expect(e.guard, e.id).toBeDefined()
          break
        case 'summoner':
          expect(kinds, e.id).toContain('summon')
          expect(e.keepAway, e.id).toBeDefined()
          break
        case 'boss':
          expect(e.poise, e.id).toBe(Infinity)
          expect(e.boss, e.id).toBeDefined()
          expect(e.attacks.some((a) => a.name === 'roar'), e.id).toBe(true)
          break
      }
    }
  })

  it('신화권마다 역할이 셋 이상 다른 졸개와 지역 보스가 있다', () => {
    for (const realm of FIELD_REALMS) {
      const mobs = ALL.filter((e) => e.realm === realm && e.role !== 'boss')
      expect(new Set(mobs.map((e) => e.role)).size, realm).toBeGreaterThanOrEqual(3)
      expect(ALL.some((e) => e.realm === realm && e.role === 'boss'), realm).toBe(true)
    }
  })

  it('지역의 무리와 보스는 그 땅의 적이다', () => {
    for (const region of Object.values(REGIONS)) {
      if (region.kind !== 'field') continue
      for (const camp of region.camps) {
        for (const id of camp.members ?? []) {
          expect(ENEMIES[id], `${region.id}: ${id}`).toBeDefined()
          expect(ENEMIES[id]!.realm, `${region.id}: ${id}`).toBe(region.realm)
        }
      }
      if (!region.boss) continue
      const boss = ENEMIES[region.boss.enemy ?? 'king']!
      expect(boss.role, region.id).toBe('boss')
      expect(boss.realm, region.id).toBe(region.realm)
    }
  })

  it('모든 적의 모델을 만들 수 있고 몸 종류가 모양에 드러난다', () => {
    for (const e of ALL) {
      const rig = buildEnemyRig(e, 3)
      expect(rig.kind, e.id).toBe(e.body.kind)
      let meshes = 0
      rig.root.traverse((o) => (meshes += o instanceof THREE.Mesh ? 1 : 0))
      expect(meshes, e.id).toBeGreaterThan(0)
    }
  })
})

/** 주인공 쪽을 보게 돌려 세운다 */
function facing(giant: Giant, angle: number) {
  giant.object.rotation.y = angle
}

describe('적 행동 부품 (E8-02·06)', () => {
  it('돌진: 예고 뒤 줄을 따라 달려간다. 그 줄에 서 있으면 맞고, 비켜서면 지나쳐 간다', () => {
    const charge = spec('wolf').attacks.find((a) => a.area.kind === 'line')!
    // 돌진만 쓰는 늑대
    const chargeOnly = { ...spec('wolf'), attacks: [charge] }
    const windupLine = (wolf: Giant, world: GiantWorld) => {
      for (let i = 0; i < 600 && wolf.state !== 'windup'; i++) wolf.update(1 / 60, world)
      expect(wolf.currentAttack).toBe(charge)
    }
    const stay = new Giant(chargeOnly, { x: 0, z: 0 })
    const a = makeWorld({ x: 0, z: 5 })
    a.world.giants = [stay]
    windupLine(stay, a.world)
    run(stay, a.world, charge.windup + 0.6)
    expect(a.hits).toContain(charge.damage)

    const dodge = new Giant(chargeOnly, { x: 0, z: 0 })
    const b = makeWorld({ x: 0, z: 5 })
    b.world.giants = [dodge]
    windupLine(dodge, b.world)
    run(dodge, b.world, charge.windup * 0.5)
    const start = { x: dodge.x, z: dodge.z }
    b.world.hero.x = 4
    run(dodge, b.world, charge.windup * 0.5 + 0.6)
    expect(b.hits).toEqual([])
    expect(Math.hypot(dodge.x - start.x, dodge.z - start.z)).toBeGreaterThan(charge.area.kind === 'line' ? charge.area.length * 0.8 : 0)
  })

  it('막기: 앞에서 친 공격은 줄고 끊기지 않는다, 등 뒤는 그대로 들어간다', () => {
    const draugr = new Giant(spec('draugr'), { x: 0, z: 0 })
    facing(draugr, 0) // +z를 본다
    const front = spec('draugr').guard!.front
    // 주인공이 +z(앞)에 있으면 맞은 방향은 -z
    expect(draugr.takeHit(10, 0, -1, 0)).toBeCloseTo(10 * front)
    expect(draugr.takeHit(10, 0, 1, 0)).toBeCloseTo(10)
    expect(draugr.takeHit(60, 0, -1, 0)).toBeCloseTo(60 * front)
    expect(draugr.state).not.toBe('stagger')
  })

  it('막기: 공격하는 동안은 방패가 내려가 앞에서 쳐도 그대로 들어간다', () => {
    const draugr = new Giant(spec('draugr'), { x: 0, z: 0 })
    const { world } = makeWorld({ x: 0, z: 1.8 })
    world.giants = [draugr]
    for (let i = 0; i < 600 && draugr.state !== 'windup'; i++) draugr.update(1 / 60, world)
    expect(draugr.state).toBe('windup')
    // 주인공 쪽(+z)을 보고 있다
    expect(draugr.takeHit(10, 0, -1, 0)).toBeCloseTo(10)
  })

  it('거리 유지: 가까이 붙으면 물러난다', () => {
    const thrower = new Giant(spec('stoneThrower'), { x: 0, z: 0 })
    const { world } = makeWorld({ x: 2, z: 0 })
    world.giants = [thrower]
    thrower.alert()
    run(thrower, world, 1)
    expect(Math.hypot(thrower.x - 2, thrower.z)).toBeGreaterThan(2.5)
  })

  it('던지기: 날아가는 동안 떨어질 자리가 위험으로 보이고, 가만히 있으면 맞는다', () => {
    const thrower = new Giant(spec('stoneThrower'), { x: 0, z: 0 })
    const { world, hits } = makeWorld({ x: 10, z: 0 })
    world.giants = [thrower]
    thrower.alert()
    for (let i = 0; i < 900 && thrower.flying === 0; i++) thrower.update(1 / 60, world)
    expect(thrower.flying).toBe(1)
    const landing = thrower.dangers.find((d) => d.kind === 'circle')!
    expect(Math.hypot(landing.x - 10, landing.z)).toBeLessThan(0.5)
    run(thrower, world, 2)
    expect(hits).toContain(spec('stoneThrower').attacks[0]!.damage)
  })

  it('부르기: 정해진 적을 부른다', () => {
    const witch = new Giant(spec('frostWitch'), { x: 0, z: 0 })
    const { world, called } = makeWorld({ x: 9, z: 0 })
    world.giants = [witch]
    witch.alert()
    run(witch, world, 6)
    expect(called).toContain('wolf')
  })

  it('둘러싸기: 무리는 주인공의 서로 다른 쪽으로 붙는다', () => {
    const giants = [1, 2, 3].map((seed) => new Giant(GRUNT, { x: 0, z: -6 }, seed))
    const { world } = makeWorld({ x: 0, z: 0 })
    world.giants = giants
    for (const g of giants) g.alert()
    for (let t = 0; t < 1.2; t += 1 / 60) for (const g of giants) g.update(1 / 60, world)
    const angles = giants.map((g) => Math.atan2(g.x, g.z))
    const spread = Math.max(...angles) - Math.min(...angles)
    expect(spread).toBeGreaterThan(0.3)
  })
})

describe('정예 (E8-05)', () => {
  it('정예는 크고 단단하며, 사나운 정예는 더 세게 친다', () => {
    const tough = new Giant(GRUNT, { x: 0, z: 0 })
    tough.makeElite('tough')
    expect(tough.health.max).toBe(GRUNT.hp * ELITES.tough.hp)
    expect(tough.radius).toBeCloseTo(GRUNT.radius * ELITES.tough.size)

    const fierce = new Giant(GRUNT, { x: 0, z: 0 })
    fierce.makeElite('fierce')
    const { world, hits } = makeWorld({ x: 3, z: 0 })
    world.giants = [fierce]
    run(fierce, world, 4)
    expect(hits[0]).toBeCloseTo(GRUNT.attacks[0]!.damage * ELITES.fierce.damage)
  })

  it('무리마다 정해진 확률로 한 마리가 정예다 (부르는 적은 정예가 되지 않는다)', () => {
    const layout = { camps: [{ x: 0, z: 0, count: 3, members: ['frostWitch', 'grunt', 'draugr'] }], boss: null }
    const always = new Encounter({ camps: [], boss: null }, [], 20)
    always.eliteChance = 1
    always.reset(layout, [], 20)
    const elites = always.alive.filter((g) => g.elite)
    expect(elites).toHaveLength(1)
    expect(elites[0]!.spec.role).not.toBe('summoner')

    const never = new Encounter({ camps: [], boss: null }, [], 20)
    never.eliteChance = 0
    never.reset(layout, [], 20)
    expect(never.alive.some((g) => g.elite)).toBe(false)
  })
})

describe('지역 보스 (E8-05)', () => {
  it('지역 보스는 끊기지 않고, 생명력이 절반 아래면 그 땅의 졸개를 부른다', () => {
    for (const id of ['chimera', 'bullDemonKing', 'orochi', 'bulgasari']) {
      const boss = new Giant(spec(id), { x: 0, z: 0 })
      const { world, called } = makeWorld({ x: 3, z: 0 })
      world.giants = [boss]
      // 막기가 있는 보스도 있어 방향 없이 친다
      boss.takeHit(spec(id).hp * 0.55, 0, 0, 0)
      run(boss, world, 3)
      expect(called, id).toContain(spec(id).minion)
      expect(ENEMIES[spec(id).minion!]!.realm, id).toBe(spec(id).realm)
    }
  })
})

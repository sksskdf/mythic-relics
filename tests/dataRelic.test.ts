import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'

import { Lightning } from '../src/fx/Lightning'
import { Puffs } from '../src/fx/Puffs'
import { HeroController } from '../src/game/HeroController'
import type { CombatTarget } from '../src/game/PlayerCombat'
import { RelicPowers } from '../src/game/RelicPowers'
import { gearModifiers } from '../src/build/BuildState'
import { RELIC_IDS } from '../src/relics/data'
import { DropTable } from '../src/relics/DropTable'
import { Pickups } from '../src/relics/Pickups'
import { parseSave, SAVE_VERSION } from '../src/save/SaveData'
import type { SkillContext } from '../src/skills/Skill'
import { buildHeroModel } from '../src/world/heroModel'
import { NavGrid } from '../src/world/navGrid'

/**
 * E2 추가 시험: 시험용 유물을 데이터 파일(relics.json)에만 더했을 때
 * 코드를 고치지 않고 드랍·장착·효과 발동·저장이 모두 되는가.
 * 실제 파일 대신, 불러올 때 시험용 유물 하나를 덧붙인 데이터를 준다.
 */
vi.mock('../src/data/relics.json', async (importOriginal) => {
  const original = (await importOriginal<{ default: Record<string, unknown> }>()).default
  return {
    default: {
      ...original,
      testRelic: {
        name: '시험용 뿔잔',
        god: 'thor',
        look: 'lokiMaskFace',
        model: 'megingjord',
        description: '시험용 유물. 확인 뒤 지운다.',
        icon: Array.from({ length: 12 }, () => 'aaaaaaaaaaaa'),
        colors: { a: '#ff00ff' },
        passive: { description: '받는 피해 20% 감소', modifiers: { damageTaken: 0.8 } },
        trigger: {
          name: '시험 내리찍기',
          description: '두 마리를 쓰러뜨리면 다음 공격이 땅을 내리찍는다.',
          charge: { by: 'kill', count: 2 },
          release: { on: 'basicHit' },
          action: { kind: 'quake', radius: 3, damage: 50, knockback: 4 },
        },
      },
    },
  }
})

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

describe('데이터에만 넣은 시험용 유물', () => {
  it('유물 목록에 들어오고 무작위 드랍으로 나온다', () => {
    expect(RELIC_IDS).toContain('testRelic')
    // 다른 유물을 모두 가졌으면 남은 것은 시험용 유물뿐이다.
    const owned = new Set(RELIC_IDS.filter((id) => id !== 'testRelic'))
    expect(new DropTable(() => 0).roll(owned)).toBe('testRelic')
  })

  it('땅에 떨어지고 주울 수 있다', () => {
    const pickups = new Pickups()
    pickups.drop('testRelic', 0, 0)
    expect(pickups.update(0.1, 0, 0, () => true)).toEqual(['testRelic'])
  })

  it('장착하면 신의 유물 수에 들어가 발현되고, 지속 효과와 행동 연동 효과가 붙는다', () => {
    const fx = new THREE.Group()
    const powers = new RelicPowers(fx)
    powers.equip('testRelic')
    powers.equip('mjolnir')
    const change = powers.equip('megingjord')
    expect(change?.after.manifested).toBe('thor')
    expect(gearModifiers(powers.loadout.slots).damageTaken).toBeCloseTo(0.8)

    const hits: number[] = []
    const near = dummy(1.5, 0, hits)
    const hero = new HeroController(buildHeroModel(), new NavGrid(20, 0.5, [], 0.4), () => [], 20)
    const ctx: SkillContext = {
      hero,
      enemies: [near],
      manifested: null,
      level: 0,
      fx,
      lightning: new Lightning(),
      puffs: new Puffs(8),
      hit: (target, damage, dirX, dirZ, knockback) => void target.takeHit(damage, dirX, dirZ, knockback),
      shake: () => {},
      sound: () => {},
      slashes: { spawn: () => {} } as never,
      shots: { fire: () => {} } as never,
      flash: () => {},
      heal: () => {},
      heroHp: () => 1,
      setDecoy: () => {},
    }
    const hit = { targets: [near], comboIndex: 0, comboLength: 3, finisher: false }
    powers.onKill(near, ctx)
    powers.onKill(near, ctx)
    expect(powers.effects[0]!.charge).toBe(1)
    powers.onBasicHit(hit, ctx)
    // 메긴교르드는 처치 5번이 필요해 아직 터지지 않고, 시험용 유물만 50 피해로 터진다.
    expect(hits).toEqual([50])
    expect(powers.effects[0]!.charge).toBe(0)
  })

  it('저장했다가 다시 읽어도 남는다', () => {
    const save = (slots: (string | null)[], ground: { id: string; x: number; z: number }[]) =>
      parseSave(JSON.stringify({ version: SAVE_VERSION, slots, bag: [], ground, classes: {}, dropMisses: 0, divine: 0 }))
    expect(save(['testRelic', null, null, null], [])?.slots[0]).toBe('testRelic')
    expect(save([null, null, null, null], [{ id: 'testRelic', x: 1, z: 2 }])?.ground).toEqual([{ id: 'testRelic', x: 1, z: 2 }])
  })
})

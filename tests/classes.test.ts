import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { ATTACK_STYLES } from '../src/combat/styles'
import { DATA } from '../src/data'
import { HeroController } from '../src/game/HeroController'
import type { CombatTarget } from '../src/game/PlayerCombat'
import { LOOKS } from '../src/looks/catalog'
import { levelGains } from '../src/myth/levelGains'
import { type God, GODS, RELIC_IDS, relicDef, type RelicId } from '../src/relics/data'
import { resolveLoadout } from '../src/myth/manifest'
import { relicGods, relicIconRows } from '../src/relics/model'
import { DataRelicEffect } from '../src/skills'
import { ClassPassives } from '../src/skills/ClassPassives'
import type { SkillContext } from '../src/skills/Skill'
import { createUltimate } from '../src/skills/Ultimate'
import { LOOK_MODELS } from '../src/voxel/models/looks'
import { buildHeroModel } from '../src/world/heroModel'
import { NavGrid } from '../src/world/navGrid'

/**
 * 모든 클래스를 도는 범용 검사 (E6-19). gods.json·relics.json에 클래스를 더하면 같은 검사가 저절로 붙는다.
 * 클래스 매력 기준(DESIGN.md 5.1.1)을 숫자로 확인한다: 자기 유물로 발현, 유물·패시브·궁극기가 실제로 적을 친다,
 * 레벨마다 눈에 띄는 변화, 표식이 레벨마다 다른 모양.
 */

interface Dummy extends CombatTarget {
  hits: number[]
  x: number
  z: number
}

function dummy(x: number, z: number): Dummy {
  const hits: number[] = []
  const d: Dummy = {
    x,
    z,
    radius: 0.6,
    alive: true,
    hits,
    takeHit: (damage) => {
      hits.push(damage)
      return damage
    },
  }
  return d
}

/** 주인공 둘레의 적 무리: 가까이 넷, 조금 떨어져 넷, 멀리 둘 (원거리·꿰뚫기·연사 확인용) */
function crowd(): Dummy[] {
  const out: Dummy[] = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2
    const r = i % 2 ? 2 : 3.5
    out.push(dummy(Math.sin(a) * r, Math.cos(a) * r))
  }
  out.push(dummy(0, 8), dummy(6, 0))
  return out
}

function setup(enemies: Dummy[], god: God | null = null, level = 0) {
  const hero = new HeroController(buildHeroModel(), new NavGrid(30, 0.5, [], 0.4), () => [], 30)
  hero.face(0)
  const fx = new THREE.Group()
  let hp = 0.25
  const healed: number[] = []
  const ctx: SkillContext = {
    area: 1,
    hero,
    enemies,
    manifested: god,
    level,
    fx,
    lightning: { fromSky: () => {}, strike: () => {} } as never,
    puffs: { burst: () => {} } as never,
    slashes: { spawn: () => {} } as never,
    shots: { fire: () => {} } as never,
    hit: (target, damage, dirX, dirZ, knockback) => {
      target.takeHit(damage, dirX, dirZ, knockback)
    },
    shake: () => {},
    sound: () => {},
    flash: () => {},
    heal: (amount) => {
      healed.push(amount)
      hp = Math.min(1, hp + amount / 100)
    },
    heroHp: () => hp,
    setDecoy: () => {},
  }
  return { hero, fx, ctx, healed }
}

const total = (enemies: Dummy[]) => enemies.reduce((s, e) => s + e.hits.reduce((a, b) => a + b, 0), 0)
const relicsOf = (god: God): RelicId[] => RELIC_IDS.filter((id) => relicGods(relicDef(id)).includes(god))

/** 유물 하나의 행동을 조건대로 일으킨다 (충전을 채우고 터지는 때를 만든다) */
function trigger(effect: DataRelicEffect, id: RelicId, ctx: SkillContext, target: CombatTarget): void {
  const { charge, release } = relicDef(id).trigger
  if (charge.by === 'kill') for (let i = 0; i < charge.count; i++) effect.onKill(target)
  if (charge.by === 'walk') effect.onWalk(charge.meters + 1)
  if (charge.by === 'time') for (let t = 0; t < charge.seconds + 0.5; t += 0.1) effect.update(0.1, ctx)
  const hit = (finisher: boolean, comboIndex: number) => effect.onBasicHit({ targets: [target], comboIndex, comboLength: 3, finisher }, ctx)
  if (charge.by === 'combo') {
    hit(false, 0)
    hit(false, 1)
  }
  if (release.on === 'basicHit') hit(true, 2)
  if (release.on === 'heroHit') effect.beforeHeroHit(10, target.x, target.z, ctx)
  for (let t = 0; t < 6; t += 1 / 30) effect.update(1 / 30, ctx)
}

const gods = Object.keys(GODS) as God[]

describe.each(gods)('클래스 %s', (god) => {
  const def = DATA.gods[god]!

  it('자기 유물이 발현 수만큼 있고, 그것을 끼면 발현한다', () => {
    const relics = relicsOf(god)
    expect(relics.length).toBeGreaterThanOrEqual(def.manifestCount)
    expect(resolveLoadout(relics.slice(0, Math.min(4, def.manifestCount))).manifested).toBe(god)
  })

  it('유물마다 행동이 터지면 적을 친다', () => {
    for (const id of relicsOf(god)) {
      const enemies = crowd()
      const { ctx, fx } = setup(enemies, god, 1)
      const effect = new DataRelicEffect(relicDef(id), fx)
      trigger(effect, id, ctx, enemies[1]!)
      expect(total(enemies), `${id}`).toBeGreaterThan(0)
    }
  })

  it('유물마다 그림(12×12)과 땅에 놓일 모델이 있다', () => {
    for (const id of relicsOf(god)) {
      const { rows, colors } = relicIconRows(relicDef(id))
      expect(rows.length).toBe(12)
      for (const row of rows) expect(row.length).toBe(12)
      const used = new Set(rows.join('').replace(/\./g, ''))
      expect(used.size, `${id} 그림이 비었다`).toBeGreaterThan(0)
      for (const c of used) expect(colors[c], `${id} 그림 색 ${c}`).toBeDefined()
    }
  })

  it('패시브 부품이 Lv1~4에서 동작하고, Lv4가 Lv1보다 세거나 같다', () => {
    const measure = (level: number) => {
      const enemies = crowd()
      const { ctx, fx, healed } = setup(enemies, god, level)
      const passives = new ClassPassives(fx)
      for (let t = 0; t < 8; t += 1 / 30) {
        passives.update(1 / 30, ctx)
        if (Math.round(t * 30) % 15 === 0) passives.onBasicHit([enemies[1]!], ctx)
      }
      return total(enemies) + healed.reduce((a, b) => a + b, 0)
    }
    const timed = ['skyStrike', 'companions', 'orbit', 'pulse', 'volley', 'curse', 'bloom', 'guard'] as const
    const usesParts = timed.some((k) => def.passive[k] && def.passive[k]!.minLevel <= 1)
    const lv1 = measure(1)
    const lv4 = measure(4)
    if (usesParts) expect(lv1, '부품이 Lv1에서 아무 일도 하지 않는다').toBeGreaterThan(0)
    expect(lv4).toBeGreaterThanOrEqual(lv1)
  })

  it('궁극기가 둘레의 적에게 피해를 주고 끝난다', () => {
    const enemies = crowd()
    const { ctx } = setup(enemies, god, 1)
    const ultimate = createUltimate(def.ultimate)
    expect(ultimate.worthUsing(ctx, false)).toBe(true)
    ultimate.start(ctx)
    expect(ultimate.active).toBe(true)
    for (let t = 0; t < 8; t += 1 / 30) ultimate.update(1 / 30, ctx)
    expect(ultimate.active).toBe(false)
    expect(total(enemies)).toBeGreaterThan(0)
  })

  it('승급(Lv2~4)마다 눈에 띄는 변화가 승급 카드에 한 줄 이상 있다 (클래스 매력 기준)', () => {
    for (const level of [2, 3, 4]) {
      const power = levelGains(god, level).filter((g) => g.kind === 'power')
      expect(power.length, `Lv${level}`).toBeGreaterThan(0)
    }
    expect(levelGains(god, 1).some((g) => g.text.startsWith('공격:'))).toBe(true)
  })

  it('표식이 레벨마다 다른 모양이고, 발현 외형이 모두 있다', () => {
    const build = LOOK_MODELS[def.mark]!
    const cells = (level: number) => Array.from(build(level).cells).join(',')
    expect(cells(1)).not.toBe(cells(4))
    expect(cells(1)).not.toBe(cells(2))
    for (const look of Object.values(def.looks)) {
      expect(LOOKS[look!], look).toBeDefined()
      expect(LOOK_MODELS[look!], look).toBeDefined()
    }
  })

  it('공격 모션·궁극기·전설 데이터가 올바르다', () => {
    expect(ATTACK_STYLES).toContain(def.attack)
    expect(def.ultimate.name.length).toBeGreaterThan(0)
    if (!def.hidden) expect(def.legend, '숨김이 아닌 클래스는 Lv2 승급 전설이 있다').toBeDefined()
  })
})

describe('클래스끼리', () => {
  it('궁극기 이름·공격 모션·표식 조합이 클래스마다 다르다', () => {
    const all = gods.map((g) => DATA.gods[g]!)
    expect(new Set(all.map((g) => g.ultimate.name)).size).toBe(all.length)
    expect(new Set(all.map((g) => g.mark)).size).toBe(all.length)
    expect(new Set(all.map((g) => `${g.attack}|${g.ultimate.kind}|${Object.keys(g.passive).sort().join(',')}`)).size).toBe(all.length)
  })

  it('같은 신화권 안에서는 공격 모션이 겹치지 않는다', () => {
    const byRealm = new Map<string, string[]>()
    for (const g of gods) {
      const d = DATA.gods[g]!
      if (d.realm === 'hidden') continue
      byRealm.set(d.realm, [...(byRealm.get(d.realm) ?? []), d.attack])
    }
    for (const [realm, attacks] of byRealm) expect(new Set(attacks).size, realm).toBe(attacks.length)
  })
})

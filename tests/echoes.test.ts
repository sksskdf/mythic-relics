import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { echoEvery } from '../src/build/BuildState'
import { Lightning } from '../src/fx/Lightning'
import { Puffs } from '../src/fx/Puffs'
import { HeroController } from '../src/game/HeroController'
import type { CombatTarget } from '../src/game/PlayerCombat'
import { GODS, godDef } from '../src/relics/data'
import { MythEchoes } from '../src/skills/MythEchoes'
import type { DamageSource, SkillContext } from '../src/skills/Skill'
import { buildHeroModel } from '../src/world/heroModel'
import { NavGrid } from '../src/world/navGrid'

function dummy(x: number, z: number): CombatTarget {
  return { x, z, radius: 0.75, alive: true, takeHit: (damage) => damage }
}

function setup(enemies: CombatTarget[]) {
  const hero = new HeroController(buildHeroModel(), new NavGrid(20, 0.5, [], 0.4), () => [], 20)
  const hits: { damage: number; source: DamageSource | undefined }[] = []
  const ctx: SkillContext = {
    area: 1,
    hero,
    enemies,
    manifested: null,
    level: 0,
    fx: new THREE.Group(),
    lightning: new Lightning(),
    puffs: new Puffs(8),
    hit: (_target, damage, _dx, _dz, _kb, _style, source) => hits.push({ damage, source }),
    shake: () => {},
    sound: () => {},
    slashes: { spawn: () => {} } as never,
    shots: { fire: () => {} } as never,
    flash: () => {},
    heal: () => {},
    heroHp: () => 1,
    setDecoy: () => {},
  }
  return { ctx, hits }
}

function run(echoes: MythEchoes, ctx: SkillContext, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 30) echoes.update(1 / 30, ctx)
}

describe('메아리 (E12-03)', () => {
  it('초 단위 메아리: 제우스 1단계는 8초 안에 벼락 한 줄기, 하늘 공격으로 센다', () => {
    const { ctx, hits } = setup([dummy(2, 0)])
    const echoes = new MythEchoes(ctx.fx)
    echoes.list = [{ god: 'zeus', stage: 1 }]
    run(echoes, ctx, 8.1)
    expect(echoes.fired).toBeGreaterThanOrEqual(1)
    expect(hits.every((h) => h.source === 'sky')).toBe(true)
    expect(hits[0]!.damage).toBe(godDef('zeus').always.echo.damage)
  })

  it('칠 적이 없으면 터지지 않고 기다렸다가, 적이 오면 바로 터진다', () => {
    const enemies: CombatTarget[] = []
    const { ctx } = setup(enemies)
    const echoes = new MythEchoes(ctx.fx)
    echoes.list = [{ god: 'zeus', stage: 1 }]
    run(echoes, ctx, 10)
    expect(echoes.fired).toBe(0)
    enemies.push(dummy(2, 0))
    run(echoes, ctx, 0.1)
    expect(echoes.fired).toBe(1)
  })

  it('공격 수 메아리: 토르 1단계는 기본 공격 5번에 1번, 2단계는 3번에 1번', () => {
    const target = dummy(1, 0)
    for (const [stage, every] of [
      [1, 5],
      [2, 3],
    ] as const) {
      const { ctx, hits } = setup([target])
      const echoes = new MythEchoes(ctx.fx)
      echoes.list = [{ god: 'thor', stage }]
      for (let i = 0; i < every * 2; i++) echoes.onBasicHit([target], ctx)
      expect(hits.length, `${stage}단계`).toBe(2)
    }
  })

  it('동료 메아리는 잠깐 나타나 한 번 치고 사라진다 (곁에 남지 않는다)', () => {
    const { ctx, hits } = setup([dummy(3, 0)])
    const echoes = new MythEchoes(ctx.fx)
    echoes.list = [{ god: 'loki', stage: 2 }]
    run(echoes, ctx, echoEvery(godDef('loki').always.echo.every, 'seconds', 2) + 1)
    expect(hits.filter((h) => h.source === 'companion').length).toBeGreaterThanOrEqual(1)
    // 마지막에 막 나타난 것도 달려들어 치고 사라질 만큼 더 돌린다
    run(echoes, ctx, 0.6)
    expect(ctx.fx.children.length).toBe(0)
  })

  it('모든 신화의 메아리가 적 하나 곁에서 오류 없이 터진다', () => {
    const target = dummy(1.2, 0)
    const { ctx } = setup([target])
    const echoes = new MythEchoes(ctx.fx)
    echoes.list = Object.keys(GODS).map((god) => ({ god, stage: 2 }))
    ctx.hero.moveTo({ x: 5, z: 0 })
    for (let i = 0; i < 20; i++) {
      echoes.onBasicHit([target], ctx)
      run(echoes, ctx, 1)
    }
    const fired = echoes.fired
    expect(fired).toBeGreaterThanOrEqual(Object.keys(GODS).length)
    echoes.dispose()
    expect(ctx.fx.children.length).toBe(0)
  })
})

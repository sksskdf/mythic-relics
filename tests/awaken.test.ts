import { describe, expect, it } from 'vitest'

import { computeBuild } from '../src/build/BuildState'
import { AWAKEN, AWAKEN_GODS, canWakeMore, GUARDIAN_LEASH, HUNT_KILLS, TRACE_MODELS } from '../src/data/awaken'
import { REGIONS } from '../src/data/regions'
import { SCENES, sceneId } from '../src/data/scenes'
import { ENEMIES } from '../src/enemies/Giant'
import { guardianSpec } from '../src/game/systems/Awakening'
import { mythRelic } from '../src/gear/mythRelic'
import { AwakenProgress, parseAwaken } from '../src/progress/Awakening'
import { godDef } from '../src/relics/data'
import { traceGrid } from '../src/voxel/models/traces'

describe('신을 깨우는 길 데이터 (E238)', () => {
  it('북유럽 넷: 흔적·사냥·수호자가 모두 있는 땅과 적을 가리키고, 땅 안에 있다', () => {
    expect(AWAKEN_GODS.sort()).toEqual(['freyr', 'loki', 'odin', 'thor'])
    for (const god of AWAKEN_GODS) {
      const path = AWAKEN[god]!
      for (const [region, x, z] of [
        [path.trace.region, path.trace.x, path.trace.z],
        [path.guardian.region, path.guardian.x, path.guardian.z],
      ] as const) {
        const r = REGIONS[region]
        expect(r?.kind, `${god} ${region}`).toBe('field')
        expect(Math.abs(x), god).toBeLessThan(r!.halfExtent - 3)
        expect(Math.abs(z), god).toBeLessThan(r!.halfExtent - 3)
      }
      expect(REGIONS[path.land]?.realm, god).toBe(godDef(god).realm)
      for (const m of path.pack) expect(ENEMIES[m.enemy], `${god} ${m.enemy}`).toBeDefined()
      expect(ENEMIES[path.guardian.enemy]?.name, god).toBe(path.guardian.name)
      expect(TRACE_MODELS).toContain(path.trace.model)
      expect(traceGrid(path.trace.model).count(), god).toBeGreaterThan(100)
      // 흔적에서 그 신이 말을 걸고, 수호자는 나타날 때 한마디
      expect(SCENES[sceneId('trace', god)]?.lines[0]?.who, god).toBe(godDef(god).name)
      expect(SCENES[sceneId('guardian', god)]?.lines[0]?.who, god).toBe(path.guardian.name)
    }
  })

  it('미드가르드에 흔적 둘(토르·오딘), 로키는 요툰헤임·프레이는 무스펠 경계에. 수호자는 그 신의 땅에서 기다린다 (E239)', () => {
    expect(AWAKEN_GODS.filter((g) => AWAKEN[g]!.trace.region === 'midgard').sort()).toEqual(['odin', 'thor'])
    expect(AWAKEN.loki!.trace.region).toBe('jotunheim')
    expect(AWAKEN.freyr!.trace.region).toBe('muspel')
    const lands = Object.fromEntries(AWAKEN_GODS.map((g) => [g, AWAKEN[g]!.land]))
    expect(lands).toEqual({ thor: 'serpentshore', odin: 'ironwood', loki: 'jotunheim', freyr: 'muspel' })
    for (const g of AWAKEN_GODS) expect(AWAKEN[g]!.guardian.region, g).toBe(AWAKEN[g]!.land)
    // 첫 신 둘의 땅은 미드가르드 바로 옆
    for (const g of ['thor', 'odin'] as const) expect(REGIONS.midgard!.exits.map((e) => e.to)).toContain(AWAKEN[g]!.land)
  })

  it('수호자는 제 모습과 싸우는 방식이 있다 (E239-03): 보스 재료를 떨어뜨리지 않고, 맞아도 끊기지 않으며, 넷이 서로 다르게 싸운다', () => {
    const specs = AWAKEN_GODS.map((g) => guardianSpec(g)!)
    for (const [i, spec] of specs.entries()) {
      const god = AWAKEN_GODS[i]!
      expect(spec.name, god).toBe(AWAKEN[god]!.guardian.name)
      expect(spec.role, god).toBe('guardian')
      expect(spec.boss, god).toBeUndefined()
      expect(spec.poise, god).toBe(Infinity)
      expect(spec.realm, god).toBe(godDef(god).realm)
      expect(spec.leashRange, god).toBe(GUARDIAN_LEASH)
      expect(spec.attacks.some((a) => a.name === 'roar'), god).toBe(true)
    }
    // 몸이 넷 다 다르다 (뱀·짐승·사람·거인)
    expect(new Set(specs.map((s) => s.body.kind)).size).toBe(4)
    // 싸우는 방식: 요르문간드는 멀리 독(던지기)과 넓은 꼬리, 펜리르는 돌진과 부르기, 스카디는 물러서며 쏜다, 수르트는 큰 칼과 불덩이
    const kinds = (g: 'thor' | 'odin' | 'loki' | 'freyr') => guardianSpec(g)!.attacks.map((a) => a.area.kind)
    expect(guardianSpec('thor')!.attacks.some((a) => a.projectile?.look === 'venom')).toBe(true)
    expect(kinds('odin')).toContain('line')
    expect(kinds('odin')).toContain('summon')
    expect(guardianSpec('loki')!.keepAway).toBeGreaterThan(6)
    expect(guardianSpec('freyr')!.body.gear).toBe('sword')
    expect(guardianSpec('zeus')).toBeNull()
  })

  it('조각 2로 받는 유물은 그 신의 유물이고, 그때부터 칸에 들지 않아도 깨어난다', () => {
    for (const god of AWAKEN_GODS) expect(mythRelic(god)).toBe(godDef(god).relic)
    const base = { open: new Map<string, number>(), gear: ['lokiMask' as const], promotions: 0, chosen: [] }
    const asleep = computeBuild(base)
    const waking = computeBuild({ ...base, waking: 'loki' })
    expect(waking.modifiers).not.toEqual(asleep.modifiers)
    expect(waking.chosen).toBeNull()
    expect(waking.borrowed).toEqual([])
  })
})

describe('깨우는 진행 (E238)', () => {
  it('신을 하나 더 깨우려면 주신이 그만큼 자라야 한다: 첫 신은 언제나, 두 번째 신은 주신 2단계부터 (미드가르드에서 둘을 깨워 전설을 건너뛰지 않게)', () => {
    expect(canWakeMore(0, 0)).toBe(true)
    expect(canWakeMore(1, 1)).toBe(false)
    expect(canWakeMore(1, 2)).toBe(true)
    expect(canWakeMore(2, 2)).toBe(false)
    expect(canWakeMore(2, 3)).toBe(true)
    expect(canWakeMore(3, 1, true)).toBe(true)
  })

  it('흔적 → 사냥 → 수호자: 조각마다 하나씩, 깨어나면 처음으로', () => {
    const a = new AwakenProgress()
    expect(a.addKill()).toBe(false)
    expect(a.trace('thor')).toBe(true)
    expect(a.fragments).toBe(1)
    // 조각 2를 모으기 전에는 깨어나지 않는다
    expect(a.awaken()).toBeNull()
    for (let i = 1; i < HUNT_KILLS; i++) expect(a.addKill()).toBe(false)
    expect(a.huntRatio).toBeCloseTo((HUNT_KILLS - 1) / HUNT_KILLS)
    expect(a.addKill()).toBe(true)
    expect(a.fragments).toBe(2)
    expect(a.huntRatio).toBe(1)
    expect(a.addKill()).toBe(false)
    expect(a.awaken()).toBe('thor')
    expect(a.toData()).toEqual({ waking: null, fragments: 0, hunt: 0 })
  })

  it('깨우는 신은 한 번에 하나: 다른 흔적은 응답하지 않고, 같은 흔적을 다시 만져도 처음으로 돌아가지 않는다', () => {
    const a = new AwakenProgress()
    a.trace('odin')
    a.addKill()
    expect(a.trace('thor')).toBe(false)
    expect(a.trace('odin')).toBe(false)
    expect(a.toData()).toEqual({ waking: 'odin', fragments: 1, hunt: 1 })
  })

  it('저장에서 읽기: 깨우는 길이 없는 신·깨진 값은 처음으로, 사냥한 수는 범위 안으로', () => {
    expect(parseAwaken({ waking: 'loki', fragments: 1, hunt: 99 })).toEqual({ waking: 'loki', fragments: 1, hunt: HUNT_KILLS })
    expect(parseAwaken({ waking: 'loki', fragments: 7, hunt: 2 })).toEqual({ waking: 'loki', fragments: 1, hunt: 2 })
    expect(parseAwaken({ waking: 'hades', fragments: 1, hunt: 2 })).toEqual({ waking: null, fragments: 0, hunt: 0 })
    expect(parseAwaken('broken')).toEqual({ waking: null, fragments: 0, hunt: 0 })
    const a = new AwakenProgress()
    a.load(parseAwaken({ waking: 'freyr', fragments: 2, hunt: 0 }))
    expect(a.fragments).toBe(2)
    expect(a.huntRatio).toBe(1)
  })
})

import { describe, expect, it } from 'vitest'

import { computeBuild } from '../src/build/BuildState'
import { AWAKEN, AWAKEN_GODS, canWakeMore, HUNT_KILLS, TRACE_MODELS } from '../src/data/awaken'
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
      expect(ENEMIES[path.guardian.base], god).toBeDefined()
      expect(TRACE_MODELS).toContain(path.trace.model)
      expect(traceGrid(path.trace.model).count(), god).toBeGreaterThan(100)
      // 흔적에서 그 신이 말을 걸고, 수호자는 나타날 때 한마디
      expect(SCENES[sceneId('trace', god)]?.lines[0]?.who, god).toBe(godDef(god).name)
      expect(SCENES[sceneId('guardian', god)]?.lines[0]?.who, god).toBe(path.guardian.name)
    }
  })

  it('미드가르드에 흔적 둘(토르·오딘), 로키·프레이는 더 깊은 요툰헤임에', () => {
    expect(AWAKEN_GODS.filter((g) => AWAKEN[g]!.trace.region === 'midgard').sort()).toEqual(['odin', 'thor'])
    expect(AWAKEN_GODS.filter((g) => AWAKEN[g]!.trace.region === 'jotunheim').sort()).toEqual(['freyr', 'loki'])
  })

  it('수호자는 빌린 몸을 키운 정예: 보스 재료를 떨어뜨리지 않고, 맞아도 끊기지 않으며, 범위는 몸보다 덜 커진다', () => {
    const spec = guardianSpec('thor')!
    const base = ENEMIES[AWAKEN.thor!.guardian.base]!
    expect(spec.name).toBe('요르문간드')
    expect(spec.boss).toBeUndefined()
    expect(spec.role).not.toBe('boss')
    expect(spec.poise).toBe(Infinity)
    expect(spec.hp).toBe(AWAKEN.thor!.guardian.hp)
    expect(spec.radius).toBeCloseTo(base.radius * AWAKEN.thor!.guardian.size)
    const charge = spec.attacks[0]!.area as { length: number }
    const baseCharge = base.attacks[0]!.area as { length: number }
    expect(charge.length).toBeGreaterThan(baseCharge.length)
    expect(charge.length).toBeLessThan(baseCharge.length * AWAKEN.thor!.guardian.size)
    expect(spec.attacks[0]!.damage).toBeCloseTo(base.attacks[0]!.damage * AWAKEN.thor!.guardian.damage)
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

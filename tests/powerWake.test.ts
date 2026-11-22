import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { computeBuild } from '../src/build/BuildState'
import { STYLES } from '../src/combat/styles'
import { DEMO_GODS, godPowers, traceSource } from '../src/data/powers'
import { WAKE } from '../src/data/wake'
import type { GameContext } from '../src/game/context'
import { EventBus, type GameEvents } from '../src/game/events'
import { PowerSystem } from '../src/game/systems/Powers'
import { WakeSystem } from '../src/game/systems/Wake'
import { PowerProgress } from '../src/progress/Powers'
import { WakeProgress } from '../src/progress/Wake'
import { GODS } from '../src/relics/data'
import type { PowerCardView } from '../src/ui/powerCardView'

/**
 * 흔적과 힘 카드를 함께 (P5 고침): 실제 `WakeSystem`과 `PowerSystem`을 한 버스에 두고,
 * 게임에서 둘이 읽는 것만 흉내 낸다. 흔적이 카드를 기다리는 동안(asking) 땅을 옮기거나 쓰러지면 기다림이 풀려야 한다
 */
function rig() {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) })
  const bus = new EventBus<GameEvents>()
  const mythPowers = new PowerProgress(() => 0, 7)
  const awaken = new WakeProgress()
  const hero = { object: { position: new THREE.Vector3() }, isMoving: false, riding: false }
  const combat = { alive: true, engaged: false }
  const region = { id: 'midgard', kind: 'field', boss: null }
  const spawned: { god?: string; health: { dead: boolean; ratio: number }; alive: boolean; x: number; z: number; spec: { keepAway?: boolean }; object: { position: THREE.Vector3 } }[] = []
  let noUltimate = false
  const fired: string[] = []
  const ctx = {
    bus,
    mythPowers,
    awaken,
    scene: new THREE.Scene(),
    map: { region },
    hero,
    combat,
    orders: { attackTarget: null },
    progress: { isOpen: () => false, level: () => 0, opened: [] },
    ending: { has: () => false, reached: false },
    chapters: { isOpen: () => true },
    encounter: {
      power: 1,
      alive: spawned,
      fellRegion: () => undefined,
      spawn: (_spec: unknown, at: { x: number; z: number }) => {
        const g = { health: { dead: false, ratio: 1 }, alive: true, x: at.x, z: at.z, spec: {}, object: { position: new THREE.Vector3(at.x, 0, at.z) } }
        spawned.push(g)
        return g
      },
      remove: (g: { alive: boolean }) => (g.alive = false),
    },
    fx: { power: { burst: () => {} }, puffs: { burst: () => {} } },
    view: { shake: () => {} },
    hud: { flash: () => {} },
    build: {
      get state() {
        return { noUltimate }
      },
    },
    powers: {
      loadout: { has: () => true },
      ultimate: { start: () => fired.push('ultimate') },
      ultimateActive: false,
      effectOf: () => null,
    },
    skills: { hit: () => fired.push('hit') },
  } as unknown as GameContext
  const shown: PowerCardView[] = []
  const card = {
    open: false,
    show(view: PowerCardView) {
      shown.push(view)
      card.open = true
    },
    hide() {
      card.open = false
    },
  }
  let blocked = false
  const powers = new PowerSystem(ctx, { syncPowers: () => {} }, { card, blocked: () => blocked, swing: (style) => fired.push(`swing:${style}`), save: () => {} })
  const wake = new WakeSystem(ctx, () => null, () => {})
  wake.refresh()
  const roused: string[] = []
  bus.on('moment', (m) => m.id === 'traceRoused' && roused.push(m.id))
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += 0.1) {
      wake.update(0.1)
      powers.update(0.1)
    }
  }
  /** 오딘의 흔적 고리 안에 선다 */
  const standAtOdin = () => hero.object.position.set(WAKE.odin!.trace.x, 0, WAKE.odin!.trace.z)
  return { bus, mythPowers, hero, combat, region, card, shown, powers, wake, spawned, roused, fired, run, standAtOdin, block: (on: boolean) => (blocked = on), silence: (on: boolean) => (noUltimate = on) }
}

afterEach(() => vi.unstubAllGlobals())

describe('흔적이 카드를 기다리는 동안 (P5 고침, 실제 WakeSystem과 함께)', () => {
  it('고리에 1초 서면 카드가 뜨고, 고르면 지키는 무리가 깨어난다', () => {
    const r = rig()
    r.standAtOdin()
    r.run(1.3)
    expect(r.shown.map((v) => v.title)).toEqual(['오딘'])
    r.powers.choose(r.powers.current!.rows[0]!.id)
    expect(r.roused).toHaveLength(1)
    expect(r.spawned.length).toBeGreaterThan(0)
  })

  it('카드가 차례를 기다리는 동안 땅을 옮기면 카드는 거두고, 돌아와 다시 서면 다시 응답한다', () => {
    const r = rig()
    r.block(true)
    r.standAtOdin()
    r.run(1.3)
    expect(r.shown).toHaveLength(0)
    r.bus.emit('regionEntered', { id: 'midgard' } as never)
    r.block(false)
    r.run(0.3)
    expect(r.shown).toHaveLength(0)
    r.run(1.3)
    expect(r.shown.map((v) => v.title)).toEqual(['오딘'])
  })

  it('카드가 차례를 기다리는 동안 쓰러지면 일어난 자리에서 뜨지 않는다. 흔적에 다시 서면 다시 응답한다', () => {
    const r = rig()
    r.block(true)
    r.standAtOdin()
    r.run(1.3)
    r.bus.emit('heroDied', {} as never)
    r.hero.object.position.set(60, 0, 60)
    r.block(false)
    r.run(2)
    expect(r.shown).toHaveLength(0)
    r.standAtOdin()
    r.run(1.3)
    expect(r.shown.map((v) => v.title)).toEqual(['오딘'])
  })

  it('카드가 기다리는 동안 흔적에서 멀리 걸어가면 거두고 흔적의 기다림도 푼다', () => {
    const r = rig()
    r.block(true)
    r.standAtOdin()
    r.run(1.3)
    r.hero.object.position.set(WAKE.odin!.trace.x + 40, 0, WAKE.odin!.trace.z)
    r.block(false)
    r.run(0.3)
    expect(r.shown).toHaveLength(0)
    expect(r.mythPowers.canClaim(traceSource('odin'))).toBe(true)
    r.standAtOdin()
    r.run(1.3)
    expect(r.shown).toHaveLength(1)
  })

  it('받지 못한 고름은 카드를 비우고 그 출처를 다시 차례에 세운다 (그 판 내내 카드가 안 뜨지 않게)', () => {
    const r = rig()
    r.standAtOdin()
    r.run(1.3)
    expect(r.powers.pick(traceSource('odin'), 'weapon:thor')).toBe(false)
    expect(r.powers.current).toBeNull()
    expect(r.card.open).toBe(false)
    r.run(0.2)
    expect(r.shown).toHaveLength(2)
    expect(r.powers.current?.source).toBe(traceSource('odin'))
  })
})

describe('고른 힘의 터뜨림 (P5 고침)', () => {
  it('침묵의 맹세 중에 고른 궁극기는 나가지 않고 둘레를 한 번 친다', () => {
    const r = rig()
    r.silence(true)
    r.mythPowers.meet('odin')
    // 오딘의 궁극기만 남겨 수호자 카드가 그것을 꼭 내밀게
    for (const p of godPowers('odin')) if (p.kind !== 'ultimate') r.mythPowers.gain(p.id)
    r.spawned.push({ health: { dead: false, ratio: 1 }, alive: true, x: 1, z: 0, spec: {}, object: { position: new THREE.Vector3(1, 0, 0) }, radius: 0.5 } as never)
    r.powers.request('guardian:odin')
    r.run(0.2)
    const ult = r.powers.current!.rows.find((row) => row.id === 'ultimate:odin')!
    expect(ult).toBeDefined()
    r.powers.choose(ult.id)
    expect(r.fired).not.toContain('ultimate')
    expect(r.fired).toContain('hit')
  })
})

describe('무기는 모양을 고른다 (P5 손 QA M1)', () => {
  it('같은 빌드에서 무기만 바꾼 초당 피해는 첫 판의 넷이 평균 ±15% 안이다 (망치를 창으로 바꿔도 약해지지 않는다)', () => {
    const dps = (god: string) => {
      const combo = STYLES[GODS[god]!.attack].combo
      const perSecond = combo.reduce((s, c) => s + c.damage * (c.shots ?? 1), 0) / combo.reduce((s, c) => s + c.duration, 0)
      // 열린 신·승천·장비는 그대로 두고 손(무기의 신)만 바꾼다
      const build = computeBuild({ open: new Map(DEMO_GODS.map((g) => [g, 2])), hand: god, gear: [], promotions: 1 })
      return perSecond * build.damageScale * build.attackSpeed
    }
    const values = DEMO_GODS.map(dps)
    const mean = values.reduce((a, b) => a + b, 0) / values.length
    DEMO_GODS.forEach((god, i) => {
      expect(values[i]! / mean, god).toBeGreaterThan(0.85)
      expect(values[i]! / mean, god).toBeLessThan(1.15)
    })
  })
})

describe('힘 카드가 큰 카드 위에 겹치지 않는다 (P5 고침)', () => {
  it('게임의 힘 카드는 순간이 카드를 보이는 동안(holding)에도 기다린다: 줄에 선 것(busy)만 보지 않는다', () => {
    const game = Object.values(import.meta.glob('../src/game/Game.ts', { query: '?raw', import: 'default', eager: true }))[0] as string
    const wiring = game.slice(game.indexOf('new PowerSystem('), game.indexOf('new PowerSystem(') + 600)
    expect(wiring).toMatch(/blocked: \(\) =>[^\n]*this\.moments\.holding/)
  })
})

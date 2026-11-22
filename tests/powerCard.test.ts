import * as THREE from 'three'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { POWERS, power, relicPowerId, weaponId } from '../src/data/powers'
import type { GameContext } from '../src/game/context'
import { EventBus, type GameEvents } from '../src/game/events'
import { PowerSystem } from '../src/game/systems/Powers'
import { PowerProgress, parsePowers } from '../src/progress/Powers'
import { WakeProgress, parseWake } from '../src/progress/Wake'
import type { PowerCardView } from '../src/ui/powerCardView'
import { powerCardMarkup } from '../src/ui/powerCardView'

/**
 * 힘 카드와 빛 (재미 재설계 P5): 게임 없이 `PowerSystem`이 읽는 것만 흉내 낸다.
 * 흔적·수호자와 이어지는 실제 흐름(무리가 카드 뒤에 깨어남, 싸움 중의 빛)은 스모크가 본다 (`scripts/smoke.mjs` 「힘 카드 확인」)
 */
function rig(o: { returns?: () => number; seed?: number } = {}) {
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) })
  const bus = new EventBus<GameEvents>()
  const mythPowers = new PowerProgress(o.returns ?? (() => 0), o.seed ?? 7)
  const hero = { object: { position: new THREE.Vector3() } }
  const combat = { alive: true, engaged: false }
  const enemies: { x: number; z: number; radius: number; state: string }[] = []
  const region = { id: 'midgard', kind: 'field', boss: null as null | { x: number; z: number } }
  const shown: PowerCardView[] = []
  let picker: ((id: string) => void) | null = null
  const card = {
    open: false,
    show(view: PowerCardView, pick: (id: string) => void) {
      shown.push(view)
      picker = pick
      card.open = true
    },
    hide() {
      card.open = false
    },
  }
  let blocked = false
  const synced: string[][] = []
  const saves: number[] = []
  const fired: string[] = []
  const ctx = {
    bus,
    mythPowers,
    scene: new THREE.Scene(),
    map: { region },
    encounter: { fellRegion: () => undefined, alive: enemies },
    hero,
    combat,
    fx: { power: { burst: () => {} }, puffs: { burst: () => {} } },
    view: { shake: () => {} },
    powers: { ultimate: { start: () => fired.push('ultimate') }, ultimateActive: false, effectOf: () => ({ forceFire: () => fired.push('relic') }) },
    skills: { hit: () => fired.push('hit') },
  } as unknown as GameContext
  const system = new PowerSystem(ctx, { syncPowers: () => synced.push(mythPowers.slotted) }, {
    card,
    blocked: () => blocked,
    swing: (style) => fired.push(`swing:${style}`),
    save: () => saves.push(1),
  })
  const picked: GameEvents['powerPicked'][] = []
  bus.on('powerPicked', (e) => picked.push(e))
  return {
    bus,
    mythPowers,
    hero,
    combat,
    enemies,
    region,
    card,
    shown,
    system,
    synced,
    saves,
    fired,
    picked,
    block: (on: boolean) => (blocked = on),
    /** 사람이 그 줄을 누른다 */
    press: (row: number) => picker!(card.open ? system.current!.rows[row]!.id : ''),
    run: (seconds: number) => {
      for (let t = 0; t < seconds; t += 0.1) system.update(0.1)
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('흔적의 카드 (P5)', () => {
  it('흔적이 응답하면 그 신의 힘 셋(무기를 낀다)이 뜨고, 띄울 때 한 번 저장한다. 고르면 그 힘을 갖고 칸에 들며 그 신을 만나고 전투에 바로 맞춘다', () => {
    const r = rig()
    r.bus.emit('traceAnswered', { god: 'odin' })
    r.run(0.1)
    expect(r.shown).toHaveLength(1)
    const view = r.shown[0]!
    expect(view.title).toBe('오딘')
    expect(view.rows).toHaveLength(3)
    expect(view.rows[0]!.id).toBe(weaponId('odin'))
    expect(view.rows.map((row) => row.kind)).toContain('무기')
    expect(r.saves).toHaveLength(1)
    expect(r.mythPowers.met).toEqual([])
    r.press(0)
    expect(r.card.open).toBe(false)
    expect(r.mythPowers.met).toEqual(['odin'])
    expect(r.mythPowers.slots.weapon).toBe(weaponId('odin'))
    expect(r.synced.at(-1)).toEqual([weaponId('odin')])
    expect(r.picked).toEqual([{ source: 'trace:odin', id: weaponId('odin') }])
    // 고른 무기는 그 자리에서 한 번 휘두른다
    expect(r.fired).toContain('swing:spear')
    // 다시 서면 카드 없이 (흔적이 무리를 바로 깨운다: `WakeSystem`은 canClaim을 본다)
    expect(r.mythPowers.canClaim('trace:odin')).toBe(false)
    r.bus.emit('traceAnswered', { god: 'odin' })
    r.run(0.5)
    expect(r.shown).toHaveLength(1)
  })

  it('새 무기는 차 있던 무기 칸을 바로 바꿔 낀다 (옛 것은 가진 힘으로). 도는 힘 칸이 차면 「가진 힘으로 남는다」 표시', () => {
    const r = rig()
    r.mythPowers.owned.push(weaponId('thor'))
    r.mythPowers.slot(weaponId('thor'))
    r.bus.emit('traceAnswered', { god: 'odin' })
    r.run(0.1)
    r.press(0)
    expect(r.mythPowers.slots.weapon).toBe(weaponId('odin'))
    expect(r.mythPowers.has(weaponId('thor'))).toBe(true)
    // 도는 힘 셋을 채우고 흔적의 카드를 보면 도는 힘 줄에 표시가 붙는다
    for (const id of POWERS.filter((p) => p.god === 'freyr' && p.kind === 'aura').map((p) => p.id).slice(0, 3)) {
      r.mythPowers.owned.push(id)
      r.mythPowers.slot(id)
    }
    r.system.request('trace:thor')
    r.run(0.1)
    for (const row of r.system.current!.rows) expect(row.spare ?? false, row.id).toBe(power(row.id)!.kind === 'aura')
  })

  it('끼우면 켜지는 조합이 있으면 그 줄에 조합 이름 (발키리: 칸에 번개가 있을 때 까마귀)', () => {
    const r = rig()
    const lightning = 'aura:thor.basicLightning'
    r.mythPowers.owned.push(lightning)
    r.mythPowers.slot(lightning)
    // 오딘의 흔적이 까마귀를 내밀 때까지 씨앗을 돌린다 (뽑기는 씨앗으로 정해진다)
    for (let seed = 1; seed < 200; seed++) {
      r.mythPowers.seed = seed
      if (r.mythPowers.offer('trace:odin').includes('aura:odin.companions')) break
    }
    r.system.request('trace:odin')
    r.run(0.1)
    const raven = r.system.current!.rows.find((row) => row.id === 'aura:odin.companions')!
    expect(raven.combo).toBe('발키리')
    expect(r.system.current!.rows.filter((row) => row.combo)).toHaveLength(1)
  })

  it('장면·느린 동작·다른 고르는 카드 중에는 뜨지 않고 차례를 기다린다. 떠 있는 동안 다른 카드는 뒤에 선다', () => {
    const r = rig()
    r.block(true)
    r.bus.emit('traceAnswered', { god: 'thor' })
    r.run(2)
    expect(r.shown).toHaveLength(0)
    r.block(false)
    r.system.request('trace:odin')
    r.run(0.1)
    expect(r.shown.map((v) => v.title)).toEqual(['토르'])
    r.run(1)
    expect(r.shown).toHaveLength(1)
    r.press(0)
    r.run(0.1)
    expect(r.shown.map((v) => v.title)).toEqual(['토르', '오딘'])
  })

  it('같은 씨앗·같은 가진 힘이면 다시 불러와도 같은 셋을 내민다 (띄울 때 저장한 그대로)', () => {
    const r = rig({ seed: 12345 })
    r.system.request('trace:loki')
    r.run(0.1)
    const first = r.system.current!.rows.map((row) => row.id)
    const again = new PowerProgress(() => 0)
    again.load(parsePowers(JSON.parse(JSON.stringify(r.mythPowers.toData()))))
    expect(again.offer('trace:loki')).toEqual(first)
  })

  it('시험용·첫 판 밖의 힘은 내밀지 않는다: 흔적마다 내미는 힘은 그 신의 첫 판 힘이다', () => {
    for (const god of ['thor', 'odin', 'loki', 'freyr']) {
      for (let seed = 0; seed < 30; seed++) {
        const p = new PowerProgress(() => 0, seed)
        for (const id of p.offer(`trace:${god}`)) {
          expect(power(id)?.demo, id).toBe(true)
          expect(power(id)?.god, id).toBe(god)
          expect(id, id).not.toMatch(/test/i)
        }
      }
    }
  })
})

describe('수호자·장 보스의 빛 (P5)', () => {
  it('수호자를 이기면 쓰러진 자리에 빛이 서고 저장에 남는다. 싸움이 풀려야(맞은 지 2초, 둘레에 깨어 있는 적 없음) 밟으면 카드', () => {
    const r = rig()
    r.mythPowers.meet('thor')
    r.bus.emit('guardianBeaten', { god: 'thor', x: 3, z: 4 })
    expect(r.mythPowers.lights).toEqual([{ source: 'guardian:thor', region: 'midgard', x: 3, z: 4 }])
    expect(r.system.spots).toHaveLength(1)
    expect(parsePowers(r.mythPowers.toData()).lights).toEqual(r.mythPowers.lights)
    // 멀리 있으면 뜨지 않는다
    r.run(3)
    expect(r.shown).toHaveLength(0)
    // 빛 위에 섰지만 깨어 있는 적이 곁에 있다
    r.hero.object.position.set(3, 0, 4)
    r.enemies.push({ x: 8, z: 4, radius: 1, state: 'chase' })
    r.run(3)
    expect(r.shown).toHaveLength(0)
    // 적이 쉬고 있으면 싸움이 풀린 것이다. 그래도 방금 맞았으면 2초를 기다린다
    r.enemies[0]!.state = 'idle'
    r.bus.emit('heroHurt', { damage: 3 })
    r.run(1.5)
    expect(r.shown).toHaveLength(0)
    r.combat.engaged = true
    r.run(1)
    expect(r.shown).toHaveLength(0)
    r.combat.engaged = false
    r.run(0.2)
    expect(r.shown.map((v) => v.title)).toEqual(['토르'])
    r.press(1)
    expect(r.mythPowers.lights).toEqual([])
    expect(r.system.spots).toHaveLength(0)
    expect(r.mythPowers.claimed.has('guardian:thor')).toBe(true)
  })

  it('흔적을 지키는 무리를 처음 이기면(조각 2) 그 자리에 빛: 출처 `pack:<땅>:<신>`, 만난 신들의 힘을 내민다', () => {
    const r = rig()
    r.mythPowers.meet('thor')
    r.hero.object.position.set(5, 0, -2)
    r.bus.emit('fragment', { god: 'thor', piece: 2 })
    r.bus.emit('fragment', { god: 'thor', piece: 3 })
    expect(r.mythPowers.lights).toEqual([{ source: 'pack:midgard:thor', region: 'midgard', x: 5, z: -2 }])
    r.run(2.2)
    expect(r.shown.map((v) => v.title)).toEqual(['신들의 빛'])
    expect(r.system.current!.rows).toHaveLength(3)
  })

  it('불러온 저장에서도 빛은 그 땅에서 기다린다: 다른 땅에서는 보이지 않고 그 땅에 들어서면 선다', () => {
    const r = rig()
    r.mythPowers.meet('odin')
    r.mythPowers.load({ ...r.mythPowers.toData(), lights: [{ source: 'guardian:odin', region: 'ironwood', x: 0, z: 0 }] })
    expect(r.system.spots).toHaveLength(0)
    r.region.id = 'ironwood'
    expect(r.system.spots.map((s) => s.source)).toEqual(['guardian:odin'])
    r.run(2.2)
    expect(r.shown.map((v) => v.title)).toEqual(['오딘'])
  })

  it('내밀 힘이 없는 출처에는 빛을 세우지 않는다 (만난 신이 없는 장 보스, 다 가진 신의 수호자)', () => {
    const r = rig()
    r.region.boss = { x: 0, z: 0 }
    r.bus.emit('giantKilled', { giant: { spec: { role: 'boss' }, x: 1, z: 1 } as never })
    r.bus.emit('guardianBeaten', { god: 'zeus', x: 0, z: 0 })
    expect(r.mythPowers.lights).toEqual([])
    // 만난 신이 있으면 장 보스도 빛을 세운다 (출처 `boss:<땅>`), 같은 출처는 한 번
    r.mythPowers.meet('thor')
    r.bus.emit('giantKilled', { giant: { spec: { role: 'boss' }, x: 1, z: 1 } as never })
    r.bus.emit('giantKilled', { giant: { spec: { role: 'boss' }, x: 2, z: 2 } as never })
    expect(r.mythPowers.lights).toEqual([{ source: 'boss:midgard', region: 'midgard', x: 1, z: 1 }])
  })
})

describe('귀환으로 늘어난 칸 (P5, P2·P3 리뷰 1번)', () => {
  it('귀환으로 도는 힘 칸이 늘면 가진 도는 힘(얻은 차례)으로 빈 칸을 채우고 전투에 맞춘다', () => {
    let returns = 0
    const r = rig({ returns: () => returns })
    const auras = [relicPowerId('mjolnir'), 'aura:thor.basicLightning', 'aura:thor.skyStrike', relicPowerId('megingjord'), relicPowerId('gungnir')]
    for (const id of auras) r.mythPowers.gain(id)
    expect(r.mythPowers.slots.auras).toEqual(auras.slice(0, 3))
    returns = 1
    r.bus.emit('expeditionReturned', { count: 1, renown: 0, mult: 1, branch: 'x', deepWin: false })
    expect(r.mythPowers.slots.auras).toEqual(auras.slice(0, 4))
    expect(r.synced.at(-1)).toEqual(auras.slice(0, 4))
    // 더 채울 것이 없으면 맞추지 않는다
    const before = r.synced.length
    r.bus.emit('expeditionReturned', { count: 2, renown: 0, mult: 1, branch: 'x', deepWin: false })
    expect(r.synced).toHaveLength(before)
  })
})

describe('수호자의 세기 (P5 리뷰 3번)', () => {
  it('무리를 이긴 때의 세기를 그 신의 수호자 세기로 정해 두고 저장에 남긴다: 흔적부터 다 돌아도 첫 수호자가 세지지 않는다', () => {
    const w = new WakeProgress()
    w.trace('thor', 1)
    w.trace('odin', 4)
    expect(w.guardianPower('thor')).toBe(1)
    const data = parseWake(JSON.parse(JSON.stringify(w.toData())))
    const again = new WakeProgress()
    again.load(data)
    expect([again.guardianPower('thor'), again.guardianPower('odin')]).toEqual([1, 4])
    // 깨어나면 지운다, 옛 저장(세기 없음)은 부를 때 센다
    again.awaken('thor')
    expect(again.guardianPower('thor')).toBeUndefined()
    expect(again.toData()).toEqual({ gods: { odin: 2 }, power: { odin: 4 } })
    expect(parseWake({ gods: { thor: 2 } }).power).toBeUndefined()
    expect(parseWake({ gods: { thor: 2 }, power: { thor: 'x', loki: 3 } }).power).toBeUndefined()
  })
})

describe('힘 카드의 마크업', () => {
  it('머리줄에 신의 이름과 한마디, 줄마다 종류·이름·풀이·조합·남는 표시. 닫기 단추는 없고 글은 이스케이프한다', () => {
    const html = powerCardMarkup({
      title: '토르',
      say: '하나를 가져가라',
      color: '#fff',
      rows: [
        { id: 'a', kind: '무기', name: '<망치>', line: '친다', color: '#f00', combo: '발키리' },
        { id: 'b', kind: '힘', name: '번개', line: '번쩍', color: '#0f0', spare: true },
        { id: 'c', kind: '궁극기', name: '심판', line: '쾅', color: '#00f' },
      ],
    })
    expect(html.match(/<button/g)).toHaveLength(3)
    expect(html).toContain('&#60;망치&#62;')
    expect(html).toContain('조합 · 발키리')
    expect(html).toContain('가진 힘으로 남는다')
    expect(html).not.toMatch(/닫기|×/)
  })
})

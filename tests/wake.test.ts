import { describe, expect, it } from 'vitest'

import { computeBuild } from '../src/build/BuildState'
import { hsv } from '../src/art/palette'
import { WAKE, WAKE_GODS, GUARDIAN_LEASH, HUNT_KILLS, huntKills, levelSealed, mayWake, TRACE_MODELS, traceStateOf, type TraceNow } from '../src/data/wake'
import { REGIONS } from '../src/data/regions'
import { SCENES, sceneId } from '../src/data/scenes'
import { ENEMIES } from '../src/enemies/Giant'
import { guardianSpec } from '../src/game/systems/Wake'
import { mythRelic } from '../src/gear/mythRelic'
import { WakeProgress, parseWake } from '../src/progress/Wake'
import { godDef } from '../src/relics/data'
import { TRACE_GLOW, traceGrid } from '../src/voxel/models/traces'

describe('신을 깨우는 길 데이터 (E238)', () => {
  it('북유럽 넷과 그리스 넷(E241): 흔적·사냥·수호자가 모두 있는 땅과 적을 가리키고, 땅 안에 있다', () => {
    expect([...WAKE_GODS].sort()).toEqual(['artemis', 'freyr', 'hades', 'loki', 'odin', 'poseidon', 'thor', 'zeus'])
    for (const god of WAKE_GODS) {
      const path = WAKE[god]!
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

  it('미드가르드에 흔적 둘(토르·오딘), 로키는 요툰헤임·프레이는 무스펠 경계에, 그리스는 올림포스·델포이·리키아에. 수호자는 그 신의 땅에서 기다린다 (E239·E241)', () => {
    expect(WAKE_GODS.filter((g) => WAKE[g]!.trace.region === 'midgard').sort()).toEqual(['odin', 'thor'])
    expect(WAKE.loki!.trace.region).toBe('jotunheim')
    expect(WAKE.freyr!.trace.region).toBe('muspel')
    const lands = Object.fromEntries(WAKE_GODS.map((g) => [g, WAKE[g]!.land]))
    expect(lands).toEqual({ thor: 'serpentshore', odin: 'ironwood', loki: 'jotunheim', freyr: 'muspel', zeus: 'olympus', poseidon: 'delphi', artemis: 'delphi', hades: 'lycia' })
    // 제우스는 흔적·사냥·수호자가 모두 올림포스 안 (델포이는 그리스 장의 앞 할 일을 마쳐야 열린다)
    expect(WAKE.zeus!.trace.region).toBe('olympus')
    const traces = Object.fromEntries(WAKE_GODS.map((g) => [g, WAKE[g]!.trace.region]))
    expect([traces.poseidon, traces.artemis, traces.hades]).toEqual(['olympus', 'delphi', 'lycia'])
    // 데모에서 깨우는 신은 토르·오딘·제우스 셋 (E306 D7): 그리스 셋(E241)과 로키·프레이는 엔딩 뒤에 응답한다
    expect(WAKE_GODS.filter((g) => WAKE[g]!.afterEnding).sort()).toEqual(['artemis', 'freyr', 'hades', 'loki', 'poseidon'])
    expect(WAKE_GODS.filter((g) => !WAKE[g]!.afterEnding).sort()).toEqual(['odin', 'thor', 'zeus'])
    for (const g of WAKE_GODS) expect(WAKE[g]!.guardian.region, g).toBe(WAKE[g]!.land)
    // 첫 신 둘의 땅은 미드가르드 바로 옆
    for (const g of ['thor', 'odin'] as const) expect(REGIONS.midgard!.exits.map((e) => e.to)).toContain(WAKE[g]!.land)
  })

  it('그리스 흔적·수호자 자리는 무리·출구·성소·보스·다른 흔적과 수호자에서 10m 넘게 떨어진다 (E241: 다가가면 깨어나는 것이 섞이지 않게)', () => {
    const spots = WAKE_GODS.flatMap((g) => [
      { god: g, id: `${g} 흔적`, region: WAKE[g]!.trace.region, x: WAKE[g]!.trace.x, z: WAKE[g]!.trace.z },
      { god: g, id: `${g} 수호자`, region: WAKE[g]!.guardian.region, x: WAKE[g]!.guardian.x, z: WAKE[g]!.guardian.z },
    ])
    // 그리스 넷의 자리 (E241). 북유럽 자리는 E239 그대로 둔다 (토르의 흔적은 미드가르드 무리에서 9.5m: 첫 흔적을 찾자마자 싸움이 붙는다)
    for (const spot of spots.filter((s) => godDef(s.god).realm === 'greek')) {
      const r = REGIONS[spot.region]!
      const others = [
        ...r.camps.map((c) => ({ id: '무리', ...c })),
        ...r.exits.map((e) => ({ id: `출구 ${e.to}`, ...e })),
        ...(r.sanctuary ? [{ id: '성소', ...r.sanctuary }] : []),
        ...(r.boss ? [{ id: '보스', ...r.boss }] : []),
        ...spots.filter((o) => o !== spot && o.region === spot.region),
      ]
      for (const o of others) expect(Math.hypot(o.x - spot.x, o.z - spot.z), `${spot.id} ↔ ${o.id}`).toBeGreaterThan(10)
    }
  })

  it('흔적은 그 땅의 흙·돌·나무 색이고 신의 빛깔은 한 군데 (E241): 빛 칸은 있되 4분의 1 아래, 그 빛은 신의 색과 같은 갈래', () => {
    for (const god of WAKE_GODS) {
      const model = WAKE[god]!.trace.model
      const grid = traceGrid(model)
      let glow = 0
      grid.forEach((_x, _y, _z, hex) => (glow += TRACE_GLOW[model].includes(hex) ? 1 : 0))
      expect(glow, model).toBeGreaterThan(0)
      expect(glow / grid.count(), model).toBeLessThan(0.25)
      // 빛 색은 그 신의 색과 색상이 가깝거나, 둘 다 채도가 낮은 밝은 빛이다 (은빛 달·하늘빛 번개)
      const godColor = hsv(parseInt(godDef(god).color.slice(1), 16))
      const near = TRACE_GLOW[model].some((c) => {
        const a = hsv(c)
        const gap = Math.min(Math.abs(a.h - godColor.h), 360 - Math.abs(a.h - godColor.h))
        return gap < 30 || (a.s < 0.25 && godColor.s < 0.25)
      })
      expect(near, `${god} ${model}`).toBe(true)
    }
  })

  it('수호자는 제 모습과 싸우는 방식이 있다 (E239-03): 보스 재료를 떨어뜨리지 않고, 맞아도 끊기지 않으며, 서로 다르게 생기고 다르게 싸운다', () => {
    const specs = WAKE_GODS.map((g) => guardianSpec(g)!)
    for (const [i, spec] of specs.entries()) {
      const god = WAKE_GODS[i]!
      expect(spec.name, god).toBe(WAKE[god]!.guardian.name)
      expect(spec.role, god).toBe('guardian')
      expect(spec.boss, god).toBeUndefined()
      expect(spec.poise, god).toBe(Infinity)
      expect(spec.realm, god).toBe(godDef(god).realm)
      expect(spec.leashRange, god).toBe(GUARDIAN_LEASH)
    }
    // 두 번째 신부터의 수호자(스카디·수르트)만 생명이 반 아래로 떨어지면 포효하며 졸개를 부른다
    expect(['thor', 'odin', 'loki', 'freyr'].map((g) => guardianSpec(g as 'thor')!.attacks.some((a) => a.name === 'roar'))).toEqual([false, false, true, true])
    // 북유럽 넷은 몸이 다 다르다 (뱀·짐승·사람·거인). 여덟 모두 모습 서명(몸·머리·머리 수·든 것)이 다르다
    expect(new Set(specs.slice(0, 4).map((s) => s.body.kind)).size).toBe(4)
    expect(new Set(specs.map((s) => [s.body.kind, s.body.head, s.body.heads, s.body.gear].join('·'))).size).toBe(specs.length)
    // 싸우는 방식: 요르문간드는 멀리 독(던지기)과 넓은 꼬리, 펜리르는 돌진과 부르기, 스카디는 물러서며 쏜다, 수르트는 큰 칼과 불덩이
    const kinds = (g: 'thor' | 'odin' | 'loki' | 'freyr') => guardianSpec(g)!.attacks.map((a) => a.area.kind)
    expect(guardianSpec('thor')!.attacks.some((a) => a.projectile?.look === 'venom')).toBe(true)
    expect(kinds('odin')).toContain('line')
    expect(kinds('odin')).toContain('summon')
    expect(guardianSpec('loki')!.keepAway).toBeGreaterThan(6)
    expect(guardianSpec('freyr')!.body.gear).toBe('sword')
    // 티폰 (E241): 수르트를 이어받지 않은 제 모습과 싸우는 방식. 폭풍(바람)을 던지고 똬리로 돌진하며, 외침으로 그리스 졸개를 부른다
    const typhon = guardianSpec('zeus')!
    expect(typhon.attacks.map((a) => a.name)).not.toEqual(guardianSpec('freyr')!.attacks.map((a) => a.name))
    expect(typhon.attacks.some((a) => a.projectile?.look === 'wind')).toBe(true)
    expect(typhon.attacks.some((a) => a.area.kind === 'line')).toBe(true)
    expect(ENEMIES[typhon.minion!]?.realm).toBe('greek')
    expect(guardianSpec('wukong')).toBeNull()
  })

  it('조각 2로 받는 유물은 그 신의 유물이고, 그때부터 칸에 들지 않아도 깨어난다', () => {
    for (const god of WAKE_GODS) expect(mythRelic(god)).toBe(godDef(god).relic)
    const base = { open: new Map<string, number>(), gear: ['lokiMask' as const], promotions: 0, hand: null }
    const asleep = computeBuild(base)
    const waking = computeBuild({ ...base, waking: 'loki' })
    expect(waking.modifiers).not.toEqual(asleep.modifiers)
    expect(waking.chosen).toBeNull()
    expect(waking.borrowed).toEqual([])
  })
})

describe('깨우는 진행 (E238)', () => {
  it('신을 하나 더 깨우려면 귀환이나 장 정복을 하나 더 해야 한다 (E305-03): 첫 신은 언제나, 두 번째 신은 첫 귀환 뒤, 셋째는 거인 왕 뒤', () => {
    expect(mayWake(0, 0, 0)).toBe(true)
    expect(mayWake(1, 0, 0)).toBe(false)
    expect(mayWake(1, 1, 0)).toBe(true)
    expect(mayWake(2, 1, 0)).toBe(false)
    expect(mayWake(2, 1, 1)).toBe(true)
    expect(mayWake(3, 2, 1)).toBe(true)
    expect(mayWake(4, 0, 0, true)).toBe(true)
  })

  it('데모의 그리스 셋과 로키·프레이는 엔딩 뒤에 응답한다 (E241·E306): 엔딩 전에는 귀환·정복이 넉넉해도 「later」, 엔딩 뒤에는 다른 흔적처럼', () => {
    const now: TraceNow = { open: false, waking: null, awakened: 5, returns: 9, conquered: 2, ending: false, level: 20 }
    for (const god of ['poseidon', 'artemis', 'hades', 'loki', 'freyr'] as const) {
      expect(traceStateOf(god, now), god).toBe('later')
      expect(traceStateOf(god, { ...now, ending: true }), god).toBe('open')
      expect(traceStateOf(god, { ...now, ending: true, waking: 'thor' }), god).toBe('busy')
      expect(traceStateOf(god, { ...now, open: true }), god).toBe('awake')
    }
    // 제우스는 데모에서 깨운다: 귀환·정복이 모자라면 잠잠하다가 응답
    expect(traceStateOf('zeus', now)).toBe('open')
    expect(traceStateOf('zeus', { ...now, awakened: 3, returns: 1, conquered: 0 })).toBe('sealed')
    expect(traceStateOf('zeus', { ...now, waking: 'zeus' })).toBe('waking')
  })

  it('토르·오딘의 흔적은 기세 3부터 응답한다 (E306 D11): 그 아래면 잠잠하고, 엔딩 뒤에는 기세를 보지 않는다. 제우스는 문턱이 없다', () => {
    const now: TraceNow = { open: false, waking: null, awakened: 0, returns: 0, conquered: 0, ending: false, level: 2 }
    for (const god of ['thor', 'odin'] as const) {
      expect(WAKE[god]!.level, god).toBe(3)
      expect(traceStateOf(god, now), god).toBe('sealed')
      expect(levelSealed(god, 2)).toBe(true)
      expect(traceStateOf(god, { ...now, level: 3 }), god).toBe('open')
      expect(traceStateOf(god, { ...now, ending: true }), god).toBe('open')
    }
    expect(WAKE.zeus!.level).toBeUndefined()
    expect(levelSealed('zeus', 0)).toBe(false)
  })

  it('사냥 수는 깨운 차례마다 (E306 D12): 첫 신 30, 둘째 40, 셋째 45, 그 뒤로는 마지막 값', () => {
    expect([0, 1, 2, 3, 9].map(huntKills)).toEqual([30, 40, 45, 45, 45])
    let order = 0
    const a = new WakeProgress(() => order)
    a.trace('odin')
    order = 1
    for (let i = 1; i < 40; i++) expect(a.addKill()).toBe(false)
    expect(a.need).toBe(40)
    expect(a.addKill()).toBe(true)
  })

  it('흔적 → 사냥 → 수호자: 조각마다 하나씩, 깨어나면 처음으로', () => {
    const a = new WakeProgress()
    const need = HUNT_KILLS[0]!
    expect(a.need).toBe(need)
    expect(a.addKill()).toBe(false)
    expect(a.trace('thor')).toBe(true)
    expect(a.fragments).toBe(1)
    // 조각 2를 모으기 전에는 깨어나지 않는다
    expect(a.awaken()).toBeNull()
    for (let i = 1; i < need; i++) expect(a.addKill()).toBe(false)
    expect(a.huntRatio).toBeCloseTo((need - 1) / need)
    expect(a.addKill()).toBe(true)
    expect(a.fragments).toBe(2)
    expect(a.huntRatio).toBe(1)
    expect(a.addKill()).toBe(false)
    expect(a.awaken()).toBe('thor')
    expect(a.toData()).toEqual({ waking: null, fragments: 0, hunt: 0 })
  })

  it('깨우는 신은 한 번에 하나: 다른 흔적은 응답하지 않고, 같은 흔적을 다시 만져도 처음으로 돌아가지 않는다', () => {
    const a = new WakeProgress()
    a.trace('odin')
    a.addKill()
    expect(a.trace('thor')).toBe(false)
    expect(a.trace('odin')).toBe(false)
    expect(a.toData()).toEqual({ waking: 'odin', fragments: 1, hunt: 1 })
  })

  it('저장에서 읽기: 깨우는 길이 없는 신·깨진 값은 처음으로, 사냥한 수는 범위 안으로', () => {
    // 사냥 수가 표의 가장 큰 값을 넘은 저장은 조각 2로, 그 아래는 그대로 (차례의 수에 닿았으면 다음 처치에 조각 2, E306)
    const most = Math.max(...HUNT_KILLS)
    expect(parseWake({ waking: 'loki', fragments: 1, hunt: 99 })).toEqual({ waking: 'loki', fragments: 2, hunt: most })
    expect(parseWake({ waking: 'loki', fragments: 1, hunt: most - 1 })).toEqual({ waking: 'loki', fragments: 1, hunt: most - 1 })
    const b = new WakeProgress(() => 0)
    b.load(parseWake({ waking: 'thor', fragments: 1, hunt: 35 }))
    expect(b.addKill()).toBe(true)
    expect(parseWake({ waking: 'loki', fragments: 7, hunt: 2 })).toEqual({ waking: 'loki', fragments: 1, hunt: 2 })
    expect(parseWake({ waking: 'wukong', fragments: 1, hunt: 2 })).toEqual({ waking: null, fragments: 0, hunt: 0 })
    expect(parseWake('broken')).toEqual({ waking: null, fragments: 0, hunt: 0 })
    const a = new WakeProgress()
    a.load(parseWake({ waking: 'freyr', fragments: 2, hunt: 0 }))
    expect(a.fragments).toBe(2)
    expect(a.huntRatio).toBe(1)
  })
})

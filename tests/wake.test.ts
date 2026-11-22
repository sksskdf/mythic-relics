import { describe, expect, it } from 'vitest'

import { computeBuild } from '../src/build/BuildState'
import { hsv } from '../src/art/palette'
import { FREE_GODS, WAKE, WAKE_GODS, GUARDIAN_LEASH, LATER_TEXT, ORDER_POWER, TRACE_DWELL, TRACE_MODELS, traceStateOf, wakePower, type TraceNow } from '../src/data/wake'
import { REGIONS } from '../src/data/regions'
import { SCENES, sceneId } from '../src/data/scenes'
import { ENEMIES } from '../src/enemies/Giant'
import { EventBus, type GameEvents } from '../src/game/events'
import { guardianSpec, traceWonLines, WakeSystem } from '../src/game/systems/Wake'
import { mythRelic } from '../src/gear/mythRelic'
import { WAKE_WON, WakeProgress, parseWake, wakingOf } from '../src/progress/Wake'
import { godDef } from '../src/relics/data'
import { TRACE_WORDS, traceNow, type TraceCardContext } from '../src/ui/traceCard'
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

  it('미드가르드에 흔적 둘(토르·오딘), 요툰헤임에 둘(로키·프레이), 그리스는 올림포스·델포이·리키아에. 수호자는 그 신의 땅에서 기다린다 (E239·E241·2026-11-22)', () => {
    expect(WAKE_GODS.filter((g) => WAKE[g]!.trace.region === 'midgard').sort()).toEqual(['odin', 'thor'])
    expect(WAKE_GODS.filter((g) => WAKE[g]!.trace.region === 'jotunheim').sort()).toEqual(['freyr', 'loki'])
    const lands = Object.fromEntries(WAKE_GODS.map((g) => [g, WAKE[g]!.land]))
    expect(lands).toEqual({ thor: 'serpentshore', odin: 'ironwood', loki: 'jotunheim', freyr: 'muspel', zeus: 'olympus', poseidon: 'delphi', artemis: 'delphi', hades: 'lycia' })
    // 제우스는 흔적·사냥·수호자가 모두 올림포스 안 (델포이는 그리스 장의 앞 할 일을 마쳐야 열린다)
    expect(WAKE.zeus!.trace.region).toBe('olympus')
    const traces = Object.fromEntries(WAKE_GODS.map((g) => [g, WAKE[g]!.trace.region]))
    expect([traces.poseidon, traces.artemis, traces.hades]).toEqual(['olympus', 'delphi', 'lycia'])
    // 데모에서 깨우는 신은 북유럽 넷과 제우스 (2026-11-22): 그리스 셋(E241)만 엔딩 뒤에 응답한다
    expect(WAKE_GODS.filter((g) => WAKE[g]!.afterEnding).sort()).toEqual(['artemis', 'hades', 'poseidon'])
    expect(WAKE_GODS.filter((g) => !WAKE[g]!.afterEnding).sort()).toEqual(['freyr', 'loki', 'odin', 'thor', 'zeus'])
    expect([...FREE_GODS].sort()).toEqual(['freyr', 'loki', 'odin', 'thor'])
    for (const g of WAKE_GODS) expect(WAKE[g]!.guardian.region, g).toBe(WAKE[g]!.land)
    // 첫 신 둘의 땅은 미드가르드 바로 옆
    for (const g of ['thor', 'odin'] as const) expect(REGIONS.midgard!.exits.map((e) => e.to)).toContain(WAKE[g]!.land)
  })

  it('그리스 흔적·수호자 자리는 무리·출구·성소·보스·다른 흔적과 수호자에서 10m 넘게 떨어진다 (E241: 다가가면 깨어나는 것이 섞이지 않게)', () => {
    const spots = WAKE_GODS.flatMap((g) => [
      { god: g, id: `${g} 흔적`, region: WAKE[g]!.trace.region, x: WAKE[g]!.trace.x, z: WAKE[g]!.trace.z },
      { god: g, id: `${g} 수호자`, region: WAKE[g]!.guardian.region, x: WAKE[g]!.guardian.x, z: WAKE[g]!.guardian.z },
    ])
    // 그리스 넷의 자리 (E241)와 요툰헤임으로 옮긴 프레이의 흔적 (2026-11-22). 북유럽 나머지 자리는 E239 그대로 둔다 (토르의 흔적은 미드가르드 무리에서 9.5m: 첫 흔적을 찾자마자 싸움이 붙는다)
    for (const spot of spots.filter((s) => godDef(s.god).realm === 'greek' || s.id === 'freyr 흔적')) {
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

  it('조각 2로 받는 유물은 그 신의 유물이고, 그 유물 힘이 칸에 있으면 그 신의 무기를 쥐지 않아도 지속 효과가 돈다', () => {
    for (const god of WAKE_GODS) expect(mythRelic(god)).toBe(godDef(god).relic)
    const base = { open: new Map<string, number>(), gear: [], promotions: 0, hand: null }
    const asleep = computeBuild(base)
    const slotted = computeBuild({ ...base, gear: ['lokiMask' as const] })
    expect(slotted.modifiers).not.toEqual(asleep.modifiers)
    expect(slotted.chosen).toBeNull()
    expect(slotted.borrowed).toEqual([])
  })
})

describe('깨우는 진행 (E238, 차례 없음 2026-11-22)', () => {
  it('아무것도 깨우지 않은 채 북유럽 넷의 흔적이 모두 응답한다: 첫 신도, 그 뒤의 차례도 정해져 있지 않다', () => {
    const now: TraceNow = { open: false, waking: false, ending: false }
    for (const god of ['thor', 'odin', 'loki', 'freyr'] as const) expect(traceStateOf(god, now), god).toBe('open')
    // 다른 신을 깨우는 중이어도 (무리를 이긴 것은 그 신의 일이다) 응답한다
    expect(traceStateOf('odin', { ...now })).toBe('open')
    expect(traceStateOf('thor', { ...now, waking: true })).toBe('waking')
    expect(traceStateOf('thor', { ...now, open: true })).toBe('awake')
  })

  it('데모의 그리스 셋은 엔딩 뒤에 응답한다 (E241): 엔딩 전에는 「later」, 엔딩 뒤에는 다른 흔적처럼. 제우스는 데모에서 응답한다', () => {
    const now: TraceNow = { open: false, waking: false, ending: false }
    for (const god of ['poseidon', 'artemis', 'hades'] as const) {
      expect(traceStateOf(god, now), god).toBe('later')
      expect(traceStateOf(god, { ...now, ending: true }), god).toBe('open')
      expect(traceStateOf(god, { ...now, ending: true, waking: true }), god).toBe('waking')
      expect(traceStateOf(god, { ...now, open: true }), god).toBe('awake')
    }
    expect(traceStateOf('zeus', now)).toBe('open')
  })

  it('흔적은 고리 안에 걷지도 싸우지도 않고 1초 서야 응답한다', () => {
    expect(TRACE_DWELL).toBe(1)
  })

  it('신마다 따로 간다: 둘을 한꺼번에 깨우는 중일 수 있고, 무리를 다시 이겨도 처음으로 돌아가지 않는다', () => {
    const a = new WakeProgress()
    // 무리를 이기지 않은 신은 깨어날 것도 없다
    expect(a.awaken('thor')).toBe(false)
    expect(a.trace('thor')).toBe(true)
    expect(a.trace('odin')).toBe(true)
    expect(a.trace('thor')).toBe(false)
    expect(a.waking).toEqual(['thor', 'odin'])
    expect(a.stage('odin')).toBe(WAKE_WON)
    expect(a.toData()).toEqual({ gods: { thor: 2, odin: 2 } })
    expect(a.awaken('odin')).toBe(true)
    expect(a.waking).toEqual(['thor'])
    expect(a.stage('odin')).toBe(0)
    expect(a.toData()).toEqual({ gods: { thor: 2 } })
  })

  it('저장 왕복: 신마다의 단계를 그대로 읽고, 옛 저장의 깨우던 신 하나(waking·fragments)는 「무리를 이김」으로 옮긴다', () => {
    const a = new WakeProgress()
    a.trace('loki')
    a.trace('freyr')
    const b = new WakeProgress()
    b.load(parseWake(JSON.parse(JSON.stringify(a.toData()))))
    expect(b.waking).toEqual(['loki', 'freyr'])
    // 옛 저장: 사냥하던 것(조각 1)도 조각 2도 「무리를 이김」, 길이 없는 신·깨진 값은 처음으로
    expect(parseWake({ waking: 'loki', fragments: 1, hunt: 12 })).toEqual({ gods: { loki: 2 } })
    expect(parseWake({ waking: 'odin', fragments: 2 })).toEqual({ gods: { odin: 2 } })
    expect(parseWake({ waking: null, fragments: 0 })).toEqual({ gods: {} })
    expect(parseWake({ waking: 'wukong', fragments: 1, hunt: 2 })).toEqual({ gods: {} })
    expect(parseWake('broken')).toEqual({ gods: {} })
    expect(parseWake({ gods: { thor: 2, wukong: 2, odin: 'x', loki: 0 } })).toEqual({ gods: { thor: 2 } })
    expect(wakingOf(parseWake({ gods: { odin: 2, thor: 2 } }))).toEqual(['odin', 'thor'])
    // 옛 저장을 불러오면 다음은 바로 그 신의 수호자다
    const c = new WakeProgress()
    c.load(parseWake({ waking: 'thor', fragments: 1, hunt: 3 }))
    expect(c.awaken('thor')).toBe(true)
  })
})

/**
 * 신을 깨우는 길의 화면 글 (E307 손 QA): 처음 보는 사람이 카드를 읽고 무엇을 하면 되는지 안다
 */
describe('신을 깨우는 길의 글 (E307 손 QA)', () => {
  it('흔적의 무리를 이긴 카드 한 장: 켜진 유물, 다음은 수호자 (힘은 흔적의 카드에서 이미 골랐다 P5. 「바로 깨어난다」로 읽히지 않고 사냥을 시키지 않는다)', () => {
    expect(traceWonLines('thor')).toEqual(['묠니르가 유물표에 켜졌다', '다음: 요르문간드를 쓰러뜨리면 토르가 깨어난다'])
    for (const god of WAKE_GODS) {
      const lines = traceWonLines(god)
      expect(lines, god).toHaveLength(2)
      expect(lines.join(' '), god).not.toMatch(/바로 깨어난다|사냥|빌린 힘|\d+\/\d+/)
      // 마지막 줄은 수호자의 이름과 그 신의 이름을 댄다
      expect(lines[1], god).toContain(WAKE[god]!.guardian.name)
      expect(lines[1], god).toMatch(new RegExp(`쓰러뜨리면 ${godDef(god).name}[이가] 깨어난다$`))
    }
  })

  it('흔적 장면의 마지막 대사는 그 수호자를 쓰러뜨리라고 한다 (「그 땅에서 더 싸워라」가 아니다)', () => {
    for (const god of WAKE_GODS) {
      const last = SCENES[sceneId('trace', god)]!.lines.at(-1)!.text
      expect(last, god).toMatch(/쓰러뜨려/)
      expect(last, god).not.toMatch(/더 (싸워|사냥)/)
    }
    expect(SCENES[sceneId('trace', 'thor')]!.lines.at(-1)!.text).toContain('요르문간드')
  })

  it('흔적 카드의 「지금 할 일」: 응답하는 흔적은 곁에 서서 물리치면 힘을 빌리고, 무리를 이겼으면 수호자. 차례를 말하는 글은 없다', () => {
    const base: TraceCardContext = { state: 'open' }
    expect(traceNow('thor', base)).toBe(TRACE_WORDS.open)
    expect(TRACE_WORDS.open).toContain('물리치면 힘을 빌린다')
    expect(traceNow('thor', { state: 'waking' })).toBe('요르문간드를 쓰러뜨리면 깨어난다')
    expect(traceNow('poseidon', { state: 'later' })).toBe(LATER_TEXT)
    expect(traceNow('thor', { state: 'awake' })).toBe('깨어난 신')
    for (const god of WAKE_GODS) for (const state of ['open', 'waking', 'later', 'awake'] as const) expect(traceNow(god, { state }), `${god} ${state}`).not.toMatch(/깨어난 뒤에|원정을 마치면/)
  })

  it('흔적 카드의 단락 이름은 자리 이름(손·심장) 대신 얻는 것을 적는다', () => {
    expect(TRACE_WORDS.gain).toBe('물리치면 무기 · 깨우면 궁극기')
    expect(TRACE_WORDS.lend).toBe('흔적에서 빌리는 힘')
    for (const words of Object.values(TRACE_WORDS)) expect(words).not.toMatch(/손과 심장/)
  })
})

describe('흔적의 무리·수호자의 세기 (2026-11-22: 이미 이긴 무리의 수를 따른다)', () => {
  it('첫 판의 넷은 이긴 무리 수(그 신을 빼고)에 따라 1 · 4 · 7 · 9: 땅의 세기와 상관없다 (요툰헤임 7.5의 로키를 첫 신으로 골라도 1)', () => {
    expect(ORDER_POWER).toEqual([1, 4, 7, 9])
    expect([0, 1, 2, 3].map((n) => wakePower(7.5, n, false))).toEqual([1, 4, 7, 9])
    expect([0, 1, 2, 3].map((n) => wakePower(1, n, false))).toEqual([1, 4, 7, 9])
    expect(wakePower(1.25, 5, false)).toBe(9)
  })

  it('그 밖의 신(그리스)은 그 땅의 세기와 견줘 큰 쪽, 엔딩 뒤에는 그 땅의 세기 그대로다', () => {
    expect(wakePower(11.7, 2, false, false)).toBe(11.7)
    expect(wakePower(1, 3, false, false)).toBe(9)
    expect(wakePower(1, 1, true)).toBe(1)
    expect(wakePower(13, 2, true, false)).toBe(13)
  })
})

describe('불러온 뒤 깨우는 길 맞추기 (`WakeSystem.settle`)', () => {
  /** settle이 읽는 것만 흉내 낸 게임 상태 */
  const settled = (now: { waking: ('thor' | 'odin')[]; has: boolean; hand: string | null; open?: boolean }) => {
    const bus = new EventBus<GameEvents>()
    const ctx = {
      bus,
      scene: { add: () => {} },
      awaken: { waking: now.waking },
      progress: { isOpen: () => now.open ?? false, pantheon: { hand: now.hand } },
      powers: { loadout: { has: () => now.has } },
    }
    const given: [string, boolean][] = []
    const pieces: GameEvents['fragment'][] = []
    bus.on('fragment', (e) => pieces.push(e))
    new WakeSystem(ctx as never, () => null, (relic, announce) => given.push([relic, announce])).settle()
    return { given, pieces }
  }

  it('무리를 이긴 신마다 유물을 연출 없이 준다. 빈 손이어도 무기는 쥐여 주지 않는다 (P5: 힘은 카드에서 고른 것만)', () => {
    const r = settled({ waking: ['thor', 'odin'], has: false, hand: null })
    expect(r.given).toEqual([
      [mythRelic('thor'), false],
      [mythRelic('odin'), false],
    ])
    expect(r.pieces).toEqual([])
  })

  it('유물이 있고 손이 차 있으면 아무것도 주지 않는다', () => {
    const r = settled({ waking: ['thor'], has: true, hand: 'odin' })
    expect(r.given).toEqual([])
    expect(r.pieces).toEqual([])
  })

  it('깨우는 신이 없거나 이미 열린 신이면 그대로 둔다', () => {
    for (const now of [
      { waking: [], has: false, hand: null },
      { waking: ['thor' as const], has: false, hand: null, open: true },
    ]) {
      const r = settled(now)
      expect(r.given).toEqual([])
      expect(r.pieces).toEqual([])
    }
  })
})

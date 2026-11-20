import { describe, expect, it } from 'vitest'

import { computeBuild } from '../src/build/BuildState'
import { hsv } from '../src/art/palette'
import { WAKE, WAKE_GODS, GUARDIAN_LEASH, LATER_TEXT, mayWake, ORDER_POWER, TRACE_MODELS, traceStateOf, wakePower, type TraceNow } from '../src/data/wake'
import { REGIONS } from '../src/data/regions'
import { SCENES, sceneId } from '../src/data/scenes'
import { ENEMIES } from '../src/enemies/Giant'
import { EventBus, type GameEvents } from '../src/game/events'
import { guardianSpec, traceWonLines, WakeSystem } from '../src/game/systems/Wake'
import { mythRelic } from '../src/gear/mythRelic'
import { WakeProgress, parseWake } from '../src/progress/Wake'
import { godDef } from '../src/relics/data'
import { swapHandNote } from '../src/ui/SwapCard'
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
    const now: TraceNow = { open: false, waking: null, awakened: 5, returns: 9, conquered: 2, ending: false }
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

  it('흔적은 수련을 얼마나 했는지 보지 않는다 (2026-11-20 문턱을 걷음): 마을을 나서자마자 첫 흔적이 응답하고, 둘째·셋째는 귀환·장 정복만 본다', () => {
    const now: TraceNow = { open: false, waking: null, awakened: 0, returns: 0, conquered: 0, ending: false }
    for (const god of ['thor', 'odin'] as const) expect(traceStateOf(god, now), god).toBe('open')
    expect(traceStateOf('odin', { ...now, awakened: 1 })).toBe('sealed')
    expect(traceStateOf('odin', { ...now, awakened: 1, returns: 1 })).toBe('open')
    expect(traceStateOf('zeus', { ...now, awakened: 2, returns: 3, conquered: 1 })).toBe('open')
  })

  it('흔적의 무리를 이기면 곧바로 조각 2이고 수호자가 다음이다 (사냥 단계 없음), 깨어나면 처음으로', () => {
    const a = new WakeProgress()
    // 깨우는 신이 없으면 깨어날 것도 없다
    expect(a.awaken()).toBeNull()
    expect(a.trace('thor')).toBe(true)
    expect(a.toData()).toEqual({ waking: 'thor', fragments: 2 })
    expect(a.awaken()).toBe('thor')
    expect(a.toData()).toEqual({ waking: null, fragments: 0 })
  })

  it('깨우는 신은 한 번에 하나: 다른 흔적은 응답하지 않고, 같은 흔적을 다시 만져도 처음으로 돌아가지 않는다', () => {
    const a = new WakeProgress()
    a.trace('odin')
    expect(a.trace('thor')).toBe(false)
    expect(a.trace('odin')).toBe(false)
    expect(a.toData()).toEqual({ waking: 'odin', fragments: 2 })
  })

  it('저장에서 읽기: 깨우는 길이 없는 신·깨진 값은 처음으로, 사냥하던 옛 저장(조각 1)은 조각 2로', () => {
    expect(parseWake({ waking: 'loki', fragments: 1, hunt: 12 })).toEqual({ waking: 'loki', fragments: 2 })
    expect(parseWake({ waking: 'loki', fragments: 7, hunt: 2 })).toEqual({ waking: 'loki', fragments: 2 })
    expect(parseWake({ waking: 'wukong', fragments: 1, hunt: 2 })).toEqual({ waking: null, fragments: 0 })
    expect(parseWake('broken')).toEqual({ waking: null, fragments: 0 })
    // 옛 저장을 불러오면 다음은 바로 수호자다
    const a = new WakeProgress()
    a.load(parseWake({ waking: 'thor', fragments: 1, hunt: 3 }))
    expect(a.awaken()).toBe('thor')
  })
})

/**
 * 신을 깨우는 길의 화면 글 (E307 손 QA): 처음 보는 사람이 카드를 읽고 무엇을 하면 되는지 안다
 */
describe('신을 깨우는 길의 글 (E307 손 QA)', () => {
  it('흔적의 무리를 이긴 카드 한 장: 빌린 힘, 켜진 유물(깨어난 것은 유물의 힘), 다음은 수호자 (「바로 깨어난다」로 읽히지 않고 사냥을 시키지 않는다)', () => {
    const thor = traceWonLines('thor')
    expect(thor[0]).toMatch(/^빌린 힘: /)
    expect(thor.slice(1)).toEqual(['묠니르가 유물표에 켜졌다 · 유물의 힘이 깨어났다', '다음: 요르문간드를 쓰러뜨리면 토르가 깨어난다'])
    for (const god of WAKE_GODS) {
      const lines = traceWonLines(god)
      expect(lines, god).toHaveLength(3)
      expect(lines.join(' '), god).not.toMatch(/바로 깨어난다|사냥|\d+\/\d+/)
      // 마지막 줄은 수호자의 이름과 그 신의 이름을 댄다
      expect(lines[2], god).toContain(WAKE[god]!.guardian.name)
      expect(lines[2], god).toMatch(new RegExp(`쓰러뜨리면 ${godDef(god).name}[이가] 깨어난다$`))
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

  it('흔적 카드의 「지금 할 일」: 응답하는 흔적은 다가가 물리치면 힘을 빌리고, 깨우는 중이면 수호자', () => {
    const sealed = '성소 화로에서 원정을 마치면 응답한다'
    const base: TraceCardContext = { state: 'open', sealedText: sealed, waking: null }
    expect(traceNow('thor', base)).toBe(TRACE_WORDS.open)
    expect(TRACE_WORDS.open).toContain('물리치면 힘을 빌린다')
    expect(traceNow('thor', { ...base, state: 'sealed' })).toBe(sealed)
    expect(traceNow('thor', { ...base, state: 'waking', waking: 'thor' })).toBe('요르문간드를 쓰러뜨리면 깨어난다')
    expect(traceNow('odin', { ...base, state: 'busy', waking: 'thor' })).toBe('토르가 깨어난 뒤에 응답한다')
    expect(traceNow('poseidon', { ...base, state: 'later' })).toBe(LATER_TEXT)
    expect(traceNow('thor', { ...base, state: 'awake' })).toBe('깨어난 신')
  })

  it('흔적 카드의 단락 이름은 자리 이름(손·심장) 대신 얻는 것을 적는다', () => {
    expect(TRACE_WORDS.gain).toBe('물리치면 무기 · 깨우면 궁극기')
    expect(TRACE_WORDS.lend).toBe('흔적에서 빌리는 힘')
    for (const words of Object.values(TRACE_WORDS)) expect(words).not.toMatch(/손과 심장/)
  })
})

describe('흔적의 무리·수호자의 세기 (2026-11-20 손 QA: 둘째 흔적의 무리가 깨어나자마자 쓰러졌다)', () => {
  it('깨운 신 수에 따른 세기는 1 · 4 · 7, 그 땅의 세기와 견줘 큰 쪽을 쓴다', () => {
    expect(ORDER_POWER).toEqual([1, 4, 7])
    // 첫 신: 그 땅 그대로 (미드가르드 1, 바닷가 1.25)
    expect(wakePower(1, 0, false)).toBe(1)
    expect(wakePower(1.25, 0, false)).toBe(1.25)
    // 깨운 신이 하나일 때 둘째 흔적(미드가르드, 세기 1)의 무리는 4, 그 수호자(철의 숲 1.25)도 4
    expect(wakePower(1, 1, false)).toBe(4)
    expect(wakePower(1.25, 1, false)).toBe(4)
    // 셋째부터는 7이지만 그리스 땅(11.7)은 땅이 더 세다
    expect(wakePower(1, 2, false)).toBe(7)
    expect(wakePower(1, 5, false)).toBe(7)
    expect(wakePower(11.7, 2, false)).toBe(11.7)
  })

  it('엔딩 뒤에는 그 땅의 세기 그대로다', () => {
    expect(wakePower(1, 1, true)).toBe(1)
    expect(wakePower(1, 4, true)).toBe(1)
    expect(wakePower(13, 2, true)).toBe(13)
  })
})

describe('불러온 뒤 깨우는 길 맞추기 (`WakeSystem.settle`)', () => {
  /** settle이 읽는 것만 흉내 낸 게임 상태 */
  const settled = (now: { waking: 'thor' | null; fragments: number; has: boolean; hand: string | null; open?: boolean }) => {
    const bus = new EventBus<GameEvents>()
    const loadout = { waking: null as string | null, has: () => now.has }
    const ctx = {
      bus,
      scene: { add: () => {} },
      awaken: { waking: now.waking, fragments: now.fragments },
      progress: { isOpen: () => now.open ?? false, pantheon: { hand: now.hand } },
      powers: { loadout },
    }
    const given: [string, boolean][] = []
    const pieces: GameEvents['fragment'][] = []
    bus.on('fragment', (e) => pieces.push(e))
    new WakeSystem(ctx as never, () => null, (relic, announce) => given.push([relic, announce])).settle()
    return { waking: loadout.waking, given, pieces }
  }

  it('사냥하던 옛 저장(조각 2로 읽힘): 유물을 연출 없이 주고, 빈 손에 그 신의 무기를 조용히 쥐여 준다 (플레이 기록에 줄이 찍히지 않는다)', () => {
    const r = settled({ waking: 'thor', fragments: 2, has: false, hand: null })
    expect(r.waking).toBe('thor')
    expect(r.given).toEqual([[mythRelic('thor'), false]])
    expect(r.pieces).toEqual([{ god: 'thor', piece: 2, silent: true }])
  })

  it('유물이 있고 손이 차 있으면 아무것도 주지 않는다 (두 갈래 카드도 띄우지 않는다)', () => {
    const r = settled({ waking: 'thor', fragments: 2, has: true, hand: 'odin' })
    expect(r.waking).toBe('thor')
    expect(r.given).toEqual([])
    expect(r.pieces).toEqual([])
  })

  it('깨우는 신이 없거나 이미 열린 신이면 그대로 둔다', () => {
    for (const now of [
      { waking: null, fragments: 0, has: false, hand: null },
      { waking: 'thor' as const, fragments: 2, has: false, hand: null, open: true },
    ]) {
      const r = settled(now)
      expect(r.waking).toBeNull()
      expect(r.given).toEqual([])
      expect(r.pieces).toEqual([])
    }
  })
})

describe('손의 두 갈래 카드 안내 (2026-11-20 손 QA)', () => {
  it('새 무기는 지금 쥘 수 있다고 적는다: 「무기는 깨어난 뒤부터」로 읽히지 않는다', () => {
    expect(swapHandNote('오딘')).toBe('오딘의 무기를 지금 쥘 수 있다. 미루면 오딘이 깨어난 뒤 신 탭에서 쥔다.')
    expect(swapHandNote('토르')).toContain('토르가 깨어난 뒤')
    expect(swapHandNote('오딘')).not.toMatch(/깨어난 뒤부터/)
  })
})

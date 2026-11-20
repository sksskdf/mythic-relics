import { describe, expect, it } from 'vitest'

import { LEVEL_CAP_BASE, RETURN_MIN_LEVEL_AFTER_ENDING, RETURN_SIGNAL, RETURN_STUCK_SECONDS, returnAsked, returnEarned, renownFor, renownMultiplier, tracesAwaitReturn } from '../src/data/cycle'
import { computeBuild } from '../src/build/BuildState'
import { layerProduct } from '../src/build/layers'
import { DEMO_MAX_LEVEL, MAX_LEVEL } from '../src/myth/ClassProgress'
import { ClassProgress } from '../src/myth/ClassProgress'
import { ExpeditionProgress, parseExpedition } from '../src/progress/Expedition'
import { OathProgress } from '../src/progress/Oaths'
import { OATH_IDS } from '../src/data/oaths'
import { EventBus, type GameEvents } from '../src/game/events'
import { ExpeditionSystem } from '../src/game/systems/Expedition'

describe('원정과 귀환 (E304)', () => {
  it('명성 배율은 1 + 0.1·√명성, 한 원정 몫은 장 깊이와 이긴 보스로', () => {
    expect(renownMultiplier(0)).toBe(1)
    expect(renownMultiplier(25)).toBeCloseTo(1.5)
    expect(renownFor(1, 1)).toBe(15)
    expect(renownFor(2, 2)).toBe(40)
  })

  it('귀환할 만한 원정 (2026-11-20 문턱을 걷음): 엔딩 전에는 깨달음 수를 보지 않고, 이번 원정에서 수호자·장 보스를 이겼거나 목표가 귀환을 바랄 때만', () => {
    // 빈손으로 화로에 서서 불씨만 뽑는 길은 없다
    expect(returnEarned({ ending: false, bosses: 0, asked: false, level: 99 })).toBe(false)
    expect(returnEarned({ ending: false, bosses: 1, asked: false, level: 0 })).toBe(true)
    expect(returnEarned({ ending: false, bosses: 0, asked: true, level: 0 })).toBe(true)
    // 둘째 길: 쓰러진 적이 있고 5분이 지났다 (엔딩 뒤에는 보지 않는다)
    expect(RETURN_STUCK_SECONDS).toBe(300)
    expect(returnEarned({ ending: false, bosses: 0, asked: false, level: 0, falls: 1, seconds: 300 })).toBe(true)
    expect(returnEarned({ ending: false, bosses: 0, asked: false, level: 0, falls: 1, seconds: 299 })).toBe(false)
    expect(returnEarned({ ending: false, bosses: 0, asked: false, level: 0, falls: 0, seconds: 999 })).toBe(false)
    expect(returnEarned({ ending: true, bosses: 0, asked: false, level: 0, falls: 9, seconds: 999 })).toBe(false)
    // 엔딩 뒤의 깊이 순환은 깨달음 8 그대로
    expect(RETURN_MIN_LEVEL_AFTER_ENDING).toBe(8)
    expect(returnEarned({ ending: true, bosses: 3, asked: true, level: 7 })).toBe(false)
    expect(returnEarned({ ending: true, bosses: 0, asked: false, level: 8 })).toBe(true)
    // 귀환 신호 (D10, DESIGN.md 5.3): 깨달음이 3분 넘게 멈췄거나 받을 배율 ×1.25
    expect(RETURN_SIGNAL).toEqual({ quietLevel: 180, gain: 1.25 })
  })

  it('첫 귀환은 ×1.45 언저리 (장 1에서 수호자 하나·둘)', () => {
    const e = new ExpeditionProgress()
    e.beatBoss()
    e.beatBoss()
    const { gain, next } = e.preview()
    expect(gain).toBe(20)
    expect(next).toBeGreaterThan(1.4)
    expect(next).toBeLessThan(1.5)
  })

  it('귀환하면 명성·불씨·기록을 남기고 원정 번호가 오르며, 이번 원정의 셈은 처음으로', () => {
    const e = new ExpeditionProgress()
    e.tick(1000)
    e.reach(2)
    e.beatBoss()
    const gain = e.return({ flame: 'stone' }, 1200, ['awaken', 'edge'])
    expect(gain).toBe(30)
    expect(e.count).toBe(2)
    expect(e.renown).toBe(30)
    expect(e.flamePoints().stone).toBe(2)
    expect(e.best).toEqual([1000])
    expect([e.elapsed, e.bosses, e.deepest]).toEqual([0, 0, 1])
    expect(e.lastTaken).toEqual(['awaken', 'edge'])
    expect(e.retakes).toBe(true)
    expect(e.heirloomSlots).toBe(1)
    expect(e.headStart).toBe(0)
    e.return({}, 900, [])
    expect(e.headStart).toBe(400)
    expect(e.autoMerges('good')).toBe(true)
    expect(e.autoMerges('rare')).toBe(false)
  })

  it('사냥 불씨는 명성 몫을 키운다', () => {
    const e = new ExpeditionProgress()
    const before = e.gain
    e.flames.hunt = 1
    expect(e.gain).toBe(Math.round(before * 1.25))
  })

  it('맹세 기록의 명성 배율이 한 원정 몫에 곱해진다 (E305-01, 맹세 탭의 「지금 ×N」과 같은 값)', () => {
    const oaths = new OathProgress()
    const e = Object.assign(new ExpeditionProgress(), { oathScale: () => oaths.renownScale() })
    e.reach(2)
    e.beatBoss()
    e.beatBoss()
    const before = e.gain
    for (const id of OATH_IDS) oaths.keep(id, 60)
    expect(oaths.renownScale()).toBeCloseTo(1.05)
    expect(e.gain).toBe(Math.round(renownFor(2, 2) * 1.05))
    expect(e.gain).toBeGreaterThan(before)
    expect(e.preview().gain).toBe(e.gain)
  })

  it('저장했다 읽어도 같고, 깨진 값은 바로잡는다', () => {
    const e = new ExpeditionProgress()
    e.return({ flame: 'wind' }, 500, ['awaken'])
    const back = new ExpeditionProgress()
    back.load(parseExpedition(JSON.parse(JSON.stringify(e.toData()))))
    expect(back.toData()).toEqual(e.toData())
    expect(parseExpedition({ count: -3, renown: 'x', flames: { wind: 2, nope: 4 } })).toMatchObject({ count: 1, renown: 0, flames: { wind: 2 } })
  })

  it('승천: 열린 신 하나가 경험치 없이 한 단계, 상한에서 멈춘다', () => {
    const p = new ClassProgress()
    expect(p.ascend('thor')).toBe(false)
    p.open('thor')
    expect(p.ascend('thor')).toBe(true)
    expect(p.level('thor')).toBe(2)
    expect(p.ascend('thor')).toBe(true)
    expect(p.ascend('thor')).toBe(false)
    expect(p.level('thor')).toBe(3)
  })

  it('장 정복 (E305-02): 신 단계 상한은 2에서 정복마다 +1, 데모 끝 3, 엔딩 뒤 4', () => {
    let conquered = 0
    let afterEnding = false
    const p = new ClassProgress(() => afterEnding, () => conquered)
    expect(p.levelCap).toBe(LEVEL_CAP_BASE)
    p.open('thor')
    expect(p.ascend('thor')).toBe(true)
    expect(p.ascend('thor')).toBe(false)
    conquered = 1
    expect(p.levelCap).toBe(DEMO_MAX_LEVEL)
    expect(p.ascend('thor')).toBe(true)
    conquered = 2
    expect(p.levelCap).toBe(DEMO_MAX_LEVEL)
    afterEnding = true
    expect(p.levelCap).toBe(MAX_LEVEL)
  })

  it('장 정복 (E305-02): 명성 배율에 지수 1 + 0.1·정복, 원정 기록·빌드 층이 같은 값을 쓴다', () => {
    expect(renownMultiplier(25, 1)).toBeCloseTo(1.5 ** 1.1)
    expect(renownMultiplier(25, 2)).toBeCloseTo(1.5 ** 1.2)
    expect(renownMultiplier(0, 2)).toBe(1)
    const e = new ExpeditionProgress()
    e.renown = 25
    e.conquests = () => 1
    expect(e.multiplier).toBeCloseTo(1.5 ** 1.1)
    expect(e.preview().now).toBeCloseTo(1.5 ** 1.1)
    const build = computeBuild({ open: new Map(), gear: [], promotions: 0, hand: null, renown: 25, conquered: 1 })
    const conquest = build.layers.find((l) => l.id === 'conquest')!
    expect(conquest.value).toBeCloseTo(1.5 ** 0.1)
    expect(layerProduct(build.layers)).toBeCloseTo(computeBuild({ open: new Map(), gear: [], promotions: 0, hand: null }).damageScale * 1.5 ** 1.1)
  })
})

describe('귀환 카드 (E304)', () => {
  it('엔딩 전의 귀환은 깨달음 수가 아니라 이번 원정에서 한 일을 본다: 빈손이면 화로에 서도 카드가 뜨지 않고, 수호자·장 보스를 이겼거나 목표가 귀환이면 뜬다', () => {
    const offered = (now: { bosses: number; goal: string | null; insights: number; elapsed?: number; falls?: number }) => {
      const expedition = new ExpeditionProgress()
      expedition.elapsed = now.elapsed ?? 300
      expedition.bosses = now.bosses
      for (let i = 0; i < (now.falls ?? 0); i++) expedition.fell()
      const ctx = {
        bus: new EventBus<GameEvents>(),
        expedition,
        chapters: { index: 1, goal: now.goal ? { kind: now.goal } : null, conquered: 0 },
        training: { insights: now.insights, unspent: 0 },
        ending: { reached: false, has: () => false },
        sanctuary: { present: true, center: { x: 0, z: 0 }, beacon: false },
        hero: { object: { position: { x: 0, y: 0, z: 0 } } },
        combat: { alive: true },
        progress: { pantheon: { hand: null, heart: null, breath: [] }, opened: ['thor'], isOpen: () => true },
        awaken: { waking: null },
        depth: { level: 1, max: 1 },
        automation: { now: {} },
        powers: { loadout: { mergeable: () => [] } },
      }
      let offers = 0
      const system = new ExpeditionSystem(ctx as never, { offer: () => (offers += 1), offering: () => offers > 0, close: () => {}, ascend: () => {}, merge: () => {}, deepen: () => {} })
      system.update(0)
      return offers
    }
    // 깨달음을 아무리 모아도 한 일이 없으면 귀환은 없다 (2분마다 불씨를 뽑는 길을 막는다)
    expect(offered({ bosses: 0, goal: 'enter', insights: 40 })).toBe(0)
    // 깨달음이 0이어도 수호자를 이겼으면 된다
    expect(offered({ bosses: 1, goal: 'enter', insights: 0 })).toBe(1)
    // 장의 목표가 귀환이면 된다
    expect(offered({ bosses: 0, goal: 'return', insights: 0 })).toBe(1)
    // 깨운 신이 하나인데 귀환이 0이라 다음 흔적이 귀환을 기다릴 때도 된다
    expect(offered({ bosses: 0, goal: 'awaken', insights: 0 })).toBe(1)
    // 떠난 지 2분이 안 됐으면 어느 쪽이든 아니다
    expect(offered({ bosses: 2, goal: 'return', insights: 40, elapsed: 100 })).toBe(0)
    // 둘째 길: 이번 원정에서 쓰러진 적이 있고 5분이 지났으면 된다 (보스 앞에서 막힌 사람). 5분 전이나 쓰러진 적이 없으면 아니다
    expect(offered({ bosses: 0, goal: 'boss', insights: 0, elapsed: 300, falls: 1 })).toBe(1)
    expect(offered({ bosses: 0, goal: 'boss', insights: 0, elapsed: 299, falls: 3 })).toBe(0)
    expect(offered({ bosses: 0, goal: 'boss', insights: 0, elapsed: 900, falls: 0 })).toBe(0)
  })

  it('쓰러지면 이번 원정의 쓰러짐으로 세고(끝없는 원정은 빼고), 귀환하면 처음으로. 저장에는 쓰러진 적이 있을 때만 남는다', () => {
    const expedition = new ExpeditionProgress()
    const region = { kind: 'field' }
    const bus = new EventBus<GameEvents>()
    new ExpeditionSystem({ bus, expedition, map: { region } } as never, {} as never)
    expect('falls' in expedition.toData()).toBe(false)
    bus.emit('heroDied', {})
    region.kind = 'endless'
    bus.emit('heroDied', {})
    expect(expedition.falls).toBe(1)
    const again = new ExpeditionProgress()
    again.load(parseExpedition(JSON.parse(JSON.stringify(expedition.toData()))))
    expect(again.falls).toBe(1)
    // 키가 없는 저장은 0, 깨진 값은 버린다
    again.load(parseExpedition({ count: 2 }))
    expect(again.falls).toBe(0)
    expect(parseExpedition({ falls: -3 }).falls).toBeUndefined()
    expedition.return({}, 0, [])
    expect(expedition.falls).toBe(0)
  })

  it('귀환을 바라는 때는 한 곳에서 센다: 목표가 귀환이거나, 깨우기 목표인데 깨우는 신이 없고 흔적이 잠잠할 때', () => {
    const now = { goal: 'awaken' as string | undefined, waking: false, awakened: 1, returns: 0, conquered: 0, afterEnding: false }
    // 깨운 신 하나·귀환 0: 다음 흔적은 귀환을 기다린다
    expect(tracesAwaitReturn(now)).toBe(true)
    expect(returnAsked(now)).toBe(true)
    // 깨우는 중이면 수호자가 먼저다
    expect(returnAsked({ ...now, waking: true })).toBe(false)
    // 귀환하거나 장을 정복했으면 흔적이 응답한다. 엔딩 뒤에는 기다리지 않는다
    expect(returnAsked({ ...now, returns: 1 })).toBe(false)
    expect(returnAsked({ ...now, conquered: 1 })).toBe(false)
    expect(returnAsked({ ...now, afterEnding: true })).toBe(false)
    // 첫 신은 언제나 깨울 수 있다
    expect(returnAsked({ ...now, awakened: 0 })).toBe(false)
    // 목표가 귀환이면 흔적과 상관없이. 흔적이 잠잠한 것은 깨우기 목표일 때만 귀환을 안내한다
    expect(returnAsked({ ...now, goal: 'return', returns: 5 })).toBe(true)
    expect(tracesAwaitReturn({ ...now, goal: 'return' })).toBe(false)
    expect(returnAsked({ ...now, goal: 'enter' })).toBe(false)
    expect(returnAsked({ ...now, goal: undefined })).toBe(false)
  })

  it('귀환 카드를 띄운 채 화로를 떠나면 카드가 닫히고, 돌아오면 다시 뜬다 (E306 리뷰: 떠 있는 동안 얻은 것 카드·장면이 끝없이 밀리던 것)', () => {
    const expedition = new ExpeditionProgress()
    expedition.elapsed = 300
    expedition.bosses = 1
    const position = { x: 0, y: 0, z: 0 }
    const ctx = {
      bus: new EventBus<GameEvents>(),
      expedition,
      chapters: { index: 1, goal: null, conquered: 0 },
      training: { insights: 30, unspent: 0 },
      ending: { reached: false, has: () => false },
      sanctuary: { present: true, center: { x: 0, z: 0 }, beacon: false },
      hero: { object: { position } },
      combat: { alive: true },
      progress: { pantheon: { hand: null, heart: null, breath: [] }, opened: [], isOpen: () => true },
      awaken: { waking: null },
      depth: { level: 1, max: 1 },
      automation: { now: {} },
      powers: { loadout: { mergeable: () => [] } },
    }
    let open = false
    let offers = 0
    const system = new ExpeditionSystem(ctx as never, {
      offer: () => ((offers += 1), (open = true)),
      offering: () => open,
      close: () => (open = false),
      ascend: () => {},
      merge: () => {},
      deepen: () => {},
    })
    system.update(0)
    expect([open, offers]).toEqual([true, 1])
    position.x = 4
    system.update(0)
    expect(open).toBe(false)
    position.x = 0
    system.update(0)
    expect([open, offers]).toEqual([true, 2])
  })
})

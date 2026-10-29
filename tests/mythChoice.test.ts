import { describe, expect, it } from 'vitest'

import { MythChoiceSystem, realmGods } from '../src/game/systems/MythChoice'
import { ClassProgress, MASTERY_TO_OPEN } from '../src/myth/ClassProgress'
import { ChapterProgress } from '../src/progress/Chapters'
import { REGIONS } from '../src/data/regions'
import { godDef } from '../src/relics/data'

/** 신화 고르기에 필요한 것만 채운 게임 상태 */
function setup() {
  let ending = false
  const progress = new ClassProgress(
    () => ending,
    () => ending,
  )
  const chapters = new ChapterProgress(
    {
      chose: (realm) => progress.opened.some((g) => godDef(g).realm === realm),
      awakened: (realm) => progress.opened.filter((g) => godDef(g).realm === realm).length,
      level: () => Math.max(0, ...progress.opened.map((g) => progress.level(g))),
      forged: () => 0,
    },
    () => ending,
  )
  const events: { name: string; payload: unknown }[] = []
  const listeners = new Map<string, ((p: unknown) => void)[]>()
  const ctx = {
    progress,
    chapters,
    ending: { get reached() {
      return ending
    } },
    map: { region: REGIONS.midgard },
    legend: { present: true, active: false, beacon: false, center: { x: 0, z: 0 } },
    hero: { object: { position: { x: 0, z: 0 } }, stop() {} },
    combat: { alive: true },
    bus: {
      emit: (name: string, payload: unknown) => events.push({ name, payload }),
      on: (name: string, fn: (p: unknown) => void) => listeners.set(name, [...(listeners.get(name) ?? []), fn]),
    },
    hud: { showGains() {}, flash() {} },
    fx: { power: { burst() {} } },
  }
  const shown: string[][] = []
  const picker = { open: false, show: (gods: string[]) => shown.push(gods), hide() {} }
  const system = new MythChoiceSystem(ctx as never, picker as never)
  system.iconOf = () => ''
  return { progress, chapters, ctx, system, events, shown, listeners, end: () => (ending = true) }
}

describe('신화 고르기 (E22-03)', () => {
  it('데모에서는 경험치가 문턱까지만 쌓이고 저절로 열리지 않는다. 엔딩 뒤에는 열린다', () => {
    let ending = false
    const progress = new ClassProgress(
      () => ending,
      () => ending,
    )
    expect(progress.addXp('thor', MASTERY_TO_OPEN * 3)).toBeNull()
    expect(progress.isOpen('thor')).toBe(false)
    expect(progress.xpOf('thor')).toBe(MASTERY_TO_OPEN)
    ending = true
    expect(progress.addXp('thor', 1)).toBe('opened')
  })

  /** 북유럽 두 신을 깨우고 거인 왕을 이긴 데까지 (E238: 북유럽은 성소에서 고르지 않고 신을 깨운다) */
  function toGreece(s: ReturnType<typeof setup>) {
    s.progress.open('thor')
    s.progress.open('odin')
    s.progress.record('thor').level = 2
    for (const id of ['midgard', 'jotunheim', 'utgard', 'olympus']) s.chapters.enter(id)
    s.chapters.bossDefeated('utgard')
  }

  it('북유럽에는 성소 고르기가 없다 (신을 깨워 연다, E238)', () => {
    const s = setup()
    s.chapters.enter('midgard')
    for (const god of realmGods('norse')) s.progress.addXp(god, MASTERY_TO_OPEN)
    expect(s.system.offer()).toBeNull()
    expect(s.system.restText('norse')).toBeNull()
  })

  it('그리스는 올림포스 성소에서 넷 가운데 하나를 연다 (경험치 없이)', () => {
    const s = setup()
    toGreece(s)
    const offer = s.system.offer()
    expect(offer?.region).toBe('olympus')
    expect(offer?.first).toBe(false)
    expect(offer?.gods).toEqual(['zeus', 'poseidon', 'hades', 'artemis'])
    s.ctx.map.region = REGIONS.olympus!
    s.system.update()
    expect(s.ctx.legend.beacon).toBe(true)
    expect(s.shown).toHaveLength(1)
    expect(s.system.restText('greek')).toBe('키마이라를 쓰러뜨리면')
    expect(s.system.pick('thor')).toBe(false)
    expect(s.system.pick('hades')).toBe(true)
    expect(s.progress.isOpen('hades')).toBe(true)
    expect(s.system.offer()).toBeNull()
  })

  it('다른 땅의 성소에서는 열리지 않는다', () => {
    const s = setup()
    toGreece(s)
    s.ctx.map.region = REGIONS.delphi!
    expect(s.system.here).toBeNull()
    s.system.update()
    expect(s.shown).toHaveLength(0)
  })

  it('거인 왕은 북유럽을 한꺼번에 열지 않고(E238), 키마이라는 그리스 나머지를 모두 연다', async () => {
    const s = setup()
    toGreece(s)
    const fire = () => {
      for (const fn of s.listeners.get('giantKilled') ?? []) fn({ giant: { spec: { role: 'boss' } } })
    }
    s.ctx.map.region = REGIONS.utgard!
    fire()
    await Promise.resolve()
    expect(s.progress.opened.sort()).toEqual(['odin', 'thor'])
    s.progress.open('zeus')
    s.ctx.map.region = REGIONS.lycia!
    s.chapters.bossDefeated('lycia')
    fire()
    // 장 진행이 이긴 보스를 적은 뒤(한 박자 늦게) 연다 (E237: 신위 칸이 그 보스로 늘어난 채)
    await Promise.resolve()
    expect(s.progress.opened.filter((g) => godDef(g).realm === 'greek').sort()).toEqual(['artemis', 'hades', 'poseidon', 'zeus'])
    expect(s.events.filter((e) => e.name === 'mythOpened').every((e) => (e.payload as { quiet?: boolean }).quiet)).toBe(true)
  })

  it('엔딩 뒤에는 고르기가 없다 (경험치·유물로 연다)', () => {
    const s = setup()
    toGreece(s)
    s.end()
    expect(s.system.offer()).toBeNull()
  })
})

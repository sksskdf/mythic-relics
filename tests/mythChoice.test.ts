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

  it('첫 신화: 북유럽 경험치가 문턱까지 차야 미드가르드 성소에서 넷 가운데 하나를 고른다', () => {
    const { progress, chapters, system, shown, ctx } = setup()
    chapters.enter('midgard')
    expect(system.offer()).toBeNull()
    for (const god of realmGods('norse')) progress.addXp(god, MASTERY_TO_OPEN)
    const offer = system.offer()
    expect(offer?.region).toBe('midgard')
    expect(offer?.first).toBe(true)
    expect(offer?.gods).toEqual(['thor', 'loki', 'odin', 'freyr'])
    // 성소 가운데에 서면 카드가 뜨고 빛기둥이 선다
    system.update()
    expect(ctx.legend.beacon).toBe(true)
    expect(shown).toHaveLength(1)
    expect(system.restText('norse')).toBe('거인 왕을 쓰러뜨리면')
    expect(system.restText('greek')).toBe('키마이라를 쓰러뜨리면')
    expect(system.pick('zeus')).toBe(false)
    expect(system.pick('odin')).toBe(true)
    expect(progress.opened).toEqual(['odin'])
    expect(system.offer()).toBeNull()
  })

  it('다른 땅의 성소에서는 열리지 않는다', () => {
    const { progress, chapters, system, ctx, shown } = setup()
    chapters.enter('midgard')
    for (const god of realmGods('norse')) progress.addXp(god, MASTERY_TO_OPEN)
    ctx.map.region = REGIONS.jotunheim!
    expect(system.here).toBeNull()
    system.update()
    expect(shown).toHaveLength(0)
  })

  it('거인 왕을 이기면 북유럽 나머지가 모두 열리고, 그리스는 올림포스에서 경험치 없이 하나를 연다', async () => {
    const { progress, chapters, system, listeners, ctx, events } = setup()
    chapters.enter('midgard')
    progress.open('thor')
    ctx.map.region = REGIONS.utgard!
    chapters.bossDefeated('utgard')
    for (const fn of listeners.get('giantKilled') ?? []) fn({ giant: { spec: { role: 'boss' } } })
    // 장 진행이 이긴 보스를 적은 뒤(한 박자 늦게) 연다 (E237: 신위 칸이 그 보스로 늘어난 채)
    await Promise.resolve()
    expect(progress.opened.sort()).toEqual(['freyr', 'loki', 'odin', 'thor'])
    expect(events.filter((e) => e.name === 'mythOpened').every((e) => (e.payload as { quiet?: boolean }).quiet)).toBe(true)
    // 대장간에서 벼리기 전에는 그리스가 아직이다
    expect(system.offer()).toBeNull()
    progress.record('thor').level = 1
    const forged = new ChapterProgress({ chose: () => true, level: () => 1, forged: () => 1 })
    forged.load(chapters.toData())
    ;(ctx as { chapters: ChapterProgress }).chapters = forged
    const offer = system.offer()
    expect(offer?.region).toBe('olympus')
    expect(offer?.first).toBe(false)
  })

  it('엔딩 뒤에는 고르기가 없다 (경험치·유물로 연다)', () => {
    const { progress, chapters, system, end } = setup()
    chapters.enter('midgard')
    for (const god of realmGods('norse')) progress.addXp(god, MASTERY_TO_OPEN)
    end()
    expect(system.offer()).toBeNull()
  })
})

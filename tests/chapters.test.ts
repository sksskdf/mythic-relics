import { describe, expect, it } from 'vitest'

import { DataError } from '../src/data/check'
import raw from '../src/data/chapters.json'
import { CHAPTERS, chapterOf, GOAL_MAX_CHARS, landScale, parseChapters, TOP_POWER } from '../src/data/chapters'
import { REGIONS } from '../src/data/regions'
import { ChapterProgress, type ChapterWorld } from '../src/progress/Chapters'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** 시험용 세계: 고른 신화권·깨운 신 수·신화 단계·유물 단계를 손으로 정한다 */
function world(): ChapterWorld & { realms: Set<string>; awake: Map<string, number>; lv: number; stage: number } {
  const w = {
    realms: new Set<string>(),
    awake: new Map<string, number>(),
    lv: 0,
    stage: 0,
    chose: (realm: string) => w.realms.has(realm) || (w.awake.get(realm) ?? 0) > 0,
    awakened: (realm: string) => w.awake.get(realm) ?? 0,
    level: () => w.lv,
    forged: () => w.stage,
  }
  return w
}

describe('장 데이터 (E22-01)', () => {
  it('서장 → 제1장 → 제2장 → 종장, 땅 단계는 오르기만 한다 (E238: 유물은 신의 조각으로 손에 들어와 막간이 없다)', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(['prologue', 'north', 'greek', 'finale'])
    for (let i = 1; i < CHAPTERS.length; i++) expect(CHAPTERS[i]!.tier).toBeGreaterThanOrEqual(CHAPTERS[i - 1]!.tier)
    expect(CHAPTERS.at(-1)!.tier).toBe(3)
  })

  it('데모 땅은 여섯 곳과 마지막 무대, 적 지수는 땅마다 오른다 (TIMELINE 4장, E22-06 곡선으로 다시 잡음)', () => {
    const lands = CHAPTERS.flatMap((c) => Object.entries(c.lands))
    expect(lands.map(([id]) => id)).toEqual(['midgard', 'jotunheim', 'utgard', 'olympus', 'delphi', 'lycia', 'sky'])
    const powers = lands.map(([, power]) => power)
    expect(powers[0]).toBe(1)
    for (let i = 1; i < powers.length; i++) expect(powers[i], lands[i]![0]).toBeGreaterThan(powers[i - 1]!)
    expect(REGIONS[lands.at(-1)![0]]!.finale).toBe(true)
    expect(chapterOf('olympus')?.id).toBe('greek')
    expect(chapterOf('sinsi')).toBeNull()
  })

  it('북유럽 신은 하나씩 깨운다 (E238: 거인 왕은 신화권을 한꺼번에 열지 않는다). 그리스는 아직 성소에서 고르고 키마이라가 나머지를 연다', () => {
    const steps = CHAPTERS.flatMap((c) => c.steps)
    expect(steps.filter((s) => s.opens).map((s) => [s.region, s.opens])).toEqual([['lycia', 'greek']])
    expect(steps.filter((s) => s.kind === 'choose').map((s) => [s.region, s.realm])).toEqual([['olympus', 'greek']])
    expect(steps.filter((s) => s.kind === 'awaken').map((s) => [s.region, s.realm, s.n])).toEqual([
      ['midgard', 'norse', 1],
      ['jotunheim', 'norse', 2],
    ])
  })

  it('장마다 보스나 대장간으로 끝나고, 목표 한 줄은 짧다', () => {
    for (const c of CHAPTERS) {
      for (const s of c.steps) expect([...s.goal].length, s.goal).toBeLessThanOrEqual(GOAL_MAX_CHARS)
    }
    expect(CHAPTERS.map((c) => c.steps.at(-1)!.kind)).toEqual(['enter', 'boss', 'boss', 'boss'])
  })

  it('틀린 데이터는 어디가 왜 틀렸는지 알리며 실패한다', () => {
    const bad = (edit: (d: Record<string, any>) => void, message: RegExp) => {
      const d = clone(raw) as Record<string, any>
      edit(d)
      expect(() => parseChapters(d)).toThrow(DataError)
      expect(() => parseChapters(d)).toThrow(message)
    }
    bad((d) => (d.north.lands.nowhere = 2), /없는 지역/)
    bad((d) => (d.north.lands.midgard = 2), /이미 열린 땅/)
    bad((d) => (d.north.steps[1].region = 'olympus'), /열리지 않은 땅/)
    bad((d) => (d.north.steps[5].region = 'midgard'), /보스가 없는 땅/)
    bad((d) => (d.finale.steps[0].region = 'midgard'), /대장간/)
    bad((d) => (d.north.steps[0].n = 9), /n/)
    bad((d) => (d.north.steps[1].realm = 'norse'), /choose·awaken에만/)
    bad((d) => (d.north.steps[0].realm = 'atlantis'), /realm/)
    bad((d) => (d.north.steps[1].goal = '가'.repeat(GOAL_MAX_CHARS + 1)), /자 안/)
    bad((d) => delete d.finale, /마지막 무대의 보스/)
    bad((d) => (d.greek.steps[0].when = 'x'), /모르는 항목/)
    bad((d) => (d.north.steps[0].opens = 'norse'), /boss에만/)
  })
})

describe('땅 세기 (E22-02)', () => {
  it('생명은 적 지수만큼, 피해는 그보다 덜 오른다', () => {
    expect(landScale(1)).toEqual({ hp: 1, damage: 1 })
    expect(landScale(4).hp).toBe(4)
    expect(landScale(4).damage).toBeGreaterThan(1)
    expect(landScale(4).damage).toBeLessThan(4)
    expect(TOP_POWER).toBe(17)
  })
})

describe('장 진행 (E22-01)', () => {
  it('처음에는 서장, 목표는 미드가르드. 마을과 미드가르드만 열려 있다', () => {
    const chapters = new ChapterProgress(world())
    expect(chapters.chapter?.id).toBe('prologue')
    expect(chapters.goal?.goal).toBe('미드가르드 설원으로')
    expect(chapters.isOpen('village')).toBe(true)
    expect(chapters.isOpen('midgard')).toBe(true)
    expect(chapters.isOpen('jotunheim')).toBe(false)
    expect(chapters.isOpen('sky')).toBe(false)
  })

  it('미드가르드에 들어서면 제1장: 목표는 첫 신 깨우기 → 요툰헤임 → 전설 → 두 번째 신 → 우트가르드 → 거인 왕', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    chapters.enter('midgard')
    expect(chapters.chapter?.id).toBe('north')
    expect(chapters.isOpen('olympus')).toBe(false)
    const goals: string[] = []
    const next = (act: () => void) => {
      act()
      goals.push(chapters.goal?.kind ?? 'none')
    }
    expect(chapters.goal?.kind).toBe('awaken')
    next(() => w.awake.set('norse', 1))
    next(() => chapters.enter('jotunheim'))
    next(() => (w.lv = 2))
    next(() => w.awake.set('norse', 2))
    next(() => chapters.enter('utgard'))
    expect(goals).toEqual(['enter', 'level', 'awaken', 'enter', 'boss'])
  })

  it('지금 장의 땅은 할 일 차례로 열린다: 요툰헤임은 첫 신을 깨운 뒤, 우트가르드는 2단계 전설과 두 번째 신 뒤 (E236-01, E238)', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    chapters.enter('midgard')
    // 첫 신을 깨우기 전에는 거인 왕의 땅까지 걸어가지 못한다
    expect(chapters.isOpen('jotunheim')).toBe(false)
    expect(chapters.isOpen('utgard')).toBe(false)
    w.awake.set('norse', 1)
    expect(chapters.isOpen('jotunheim')).toBe(true)
    expect(chapters.isOpen('utgard')).toBe(false)
    chapters.enter('jotunheim')
    w.lv = 2
    expect(chapters.isOpen('utgard')).toBe(false)
    w.awake.set('norse', 2)
    expect(chapters.isOpen('utgard')).toBe(true)
  })

  it('그리스와 마지막 무대도 차례로: 델포이는 그리스 신화를 연 뒤, 리키아는 3단계 뒤, 갈라진 하늘은 유물 2단계 뒤', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    chapters.enter('midgard')
    chapters.bossDefeated('utgard')
    w.stage = 1
    expect(chapters.isOpen('olympus')).toBe(true)
    expect(chapters.isOpen('delphi')).toBe(false)
    w.realms.add('greek')
    expect(chapters.isOpen('delphi')).toBe(true)
    expect(chapters.isOpen('lycia')).toBe(false)
    w.lv = 3
    expect(chapters.isOpen('lycia')).toBe(true)
    chapters.bossDefeated('lycia')
    expect(chapters.isOpen('sky')).toBe(false)
    w.stage = 2
    expect(chapters.isOpen('sky')).toBe(true)
  })

  it('뒤의 할 일을 먼저 했으면 앞의 것은 지나간 것으로 친다 (전설을 건너뛰고 우트가르드로)', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    chapters.enter('midgard')
    chapters.enter('utgard')
    expect(chapters.goal?.kind).toBe('boss')
    // 신화 단계가 다음 장 목표(3단계)에 먼저 닿아도 장은 건너뛰지 않는다
    w.lv = 3
    expect(chapters.chapter?.id).toBe('north')
  })

  it('거인 왕을 이기면 바로 제2장: 그리스 땅이 열린다', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    chapters.enter('midgard')
    chapters.bossDefeated('utgard')
    expect(chapters.chapter?.id).toBe('greek')
    expect(chapters.isOpen('olympus')).toBe(true)
    expect(chapters.isOpen('sky')).toBe(false)
    expect(chapters.goal?.goal).toBe('올림포스 기슭으로')
  })

  it('키마이라 뒤 종장: 갈라진 하늘이 열리고, 마지막 보스를 이기면 끝', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    chapters.enter('midgard')
    chapters.bossDefeated('utgard')
    w.stage = 1
    chapters.bossDefeated('lycia')
    expect(chapters.chapter?.id).toBe('finale')
    expect(chapters.isOpen('sky')).toBe(false)
    expect(chapters.goal?.kind).toBe('forge')
    // 2단계로 벼리지 않고 들어서도 목표는 마지막 보스로 넘어간다
    chapters.enter('sky')
    expect(chapters.goal?.kind).toBe('boss')
    expect(chapters.finished).toBe(false)
    chapters.bossDefeated('sky')
    expect(chapters.finished).toBe(true)
    expect(chapters.chapter).toBeNull()
    expect(chapters.goal).toBeNull()
  })

  it('들어서 본 땅은 장과 상관없이 열려 있고(옛 저장), 엔딩 뒤에는 모든 땅이 열리고 목표가 없다', () => {
    let ending = false
    const chapters = new ChapterProgress(world(), () => ending)
    chapters.load({ entered: ['olympus'], bosses: [] })
    expect(chapters.isOpen('olympus')).toBe(true)
    expect(chapters.isOpen('delphi')).toBe(false)
    expect(chapters.isOpen('sinsi')).toBe(false)
    ending = true
    expect(chapters.isOpen('sinsi')).toBe(true)
    expect(chapters.goal).toBeNull()
  })

  it('땅의 세기와 단계: 장 흐름의 땅은 장 데이터, 그 밖의 들판(엔딩 뒤)은 가장 센 땅만큼, 균열은 1', () => {
    const chapters = new ChapterProgress(world())
    expect(chapters.power('midgard')).toBe(1)
    expect(chapters.power('lycia')).toBe(14)
    expect(chapters.power('sinsi')).toBe(TOP_POWER)
    expect(chapters.power('rift')).toBe(1)
    expect(chapters.power('village')).toBe(1)
    expect(chapters.tier('sky')).toBe(3)
    expect(chapters.tier('olympus')).toBe(2)
    expect(chapters.tier('sinsi')).toBeNull()
  })

  it('저장한 그대로 다시 읽힌다', () => {
    const a = new ChapterProgress(world())
    a.enter('midgard')
    a.bossDefeated('utgard')
    const b = new ChapterProgress(world())
    b.load(a.toData())
    expect(b.toData()).toEqual(a.toData())
    expect(b.index).toBe(a.index)
  })
})

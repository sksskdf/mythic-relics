import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { DataError } from '../src/data/check'
import raw from '../src/data/chapters.json'
import { CHAPTERS, chapterOf, type ChapterStep, CONQUESTS, GOAL_MAX_CHARS, landScale, parseChapters, TOP_POWER } from '../src/data/chapters'
import { REGIONS } from '../src/data/regions'
import { FREE_BOSS_POWER } from '../src/data/wake'
import { ChapterProgress, type ChapterWorld } from '../src/progress/Chapters'
import { MountProgress } from '../src/progress/Mount'
import { EventBus, type GameEvents } from '../src/game/events'
import { ChapterSystem } from '../src/game/systems/Chapters'
import { MountSystem } from '../src/game/systems/Mount'
import { Encounter } from '../src/game/Encounter'
import { Loadout } from '../src/gear/Loadout'
import { rollGear } from '../src/gear/roll'
import { walkArea } from '../src/world/colliders'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** 시험용 세계: 깨운 신 수·유물 단계·귀환 수·탈것·만든 영웅·지킨 맹세를 손으로 정한다 */
function world(): ChapterWorld & { awake: Map<string, number>; stage: number; ret: number; goat: boolean; heroes: number; kept: number } {
  const w = {
    awake: new Map<string, number>(),
    ret: 0,
    stage: 0,
    goat: false,
    heroes: 0,
    kept: 0,
    awakened: (realm: string) => w.awake.get(realm) ?? 0,
    forged: () => w.stage,
    returns: () => w.ret,
    mounted: () => w.goat,
    merged: () => w.heroes,
    oathsKept: () => w.kept,
  }
  return w
}

/** 제1장을 거인 왕까지 마친 세계 (귀환 둘·신 둘. 귀환은 장 할 일이 아니지만 사람·봇은 수호자 뒤에 귀환한다) */
function pastNorth(w: ReturnType<typeof world>, chapters: ChapterProgress): void {
  chapters.enter('midgard')
  w.awake.set('norse', 2)
  w.ret = 2
  chapters.enter('jotunheim')
  chapters.enter('utgard')
  chapters.bossDefeated('utgard')
}

describe('장 데이터 (E22-01)', () => {
  it('서장 → 제1장 → 제2장 → 종장, 땅 단계는 오르기만 한다 (E238: 유물은 신의 조각으로 손에 들어와 막간이 없다)', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual(['prologue', 'north', 'greek', 'finale'])
    for (let i = 1; i < CHAPTERS.length; i++) expect(CHAPTERS[i]!.tier).toBeGreaterThanOrEqual(CHAPTERS[i - 1]!.tier)
    expect(CHAPTERS.at(-1)!.tier).toBe(3)
  })

  it('데모 땅은 북유럽 여섯·고개·그리스 셋과 마지막 무대, 적 지수는 땅마다 오른다 (TIMELINE 4장, E22-06 곡선, E239 북유럽 여섯, E241 고개)', () => {
    const lands = CHAPTERS.flatMap((c) => Object.entries(c.lands))
    expect(lands.map(([id]) => id)).toEqual(['midgard', 'ironwood', 'serpentshore', 'jotunheim', 'muspel', 'utgard', 'pass', 'olympus', 'delphi', 'lycia', 'sky'])
    const powers = lands.map(([, power]) => power)
    expect(powers[0]).toBe(1)
    // 첫 신의 수호자 땅 둘(철의 숲·바닷가)은 같은 세기, 그다음부터는 오른다
    for (let i = 1; i < powers.length; i++) expect(powers[i], lands[i]![0]).toBeGreaterThanOrEqual(powers[i - 1]!)
    expect(powers.filter((p, i) => i > 0 && p === powers[i - 1])).toHaveLength(1)
    expect(REGIONS[lands.at(-1)![0]]!.finale).toBe(true)
    expect(chapterOf('olympus')?.id).toBe('greek')
    expect(chapterOf('sinsi')).toBeNull()
  })

  it('신 깨우기는 수로만 센다: 제1장은 어느 신이든 둘, 그리스는 하나 (2026-11-22: 신의 차례와 「n번째 신」 할 일을 걷음. 장 보스는 신화권을 한꺼번에 열지 않는다)', () => {
    const steps = CHAPTERS.flatMap((c) => c.steps)
    expect(steps.filter((s) => s.kind === 'awaken').map((s) => [s.region, s.realm, s.n])).toEqual([
      ['midgard', 'norse', 2],
      ['olympus', 'greek', 1],
    ])
    // 목표 한 줄은 특정 신이나 차례를 말하지 않는다
    expect(steps.find((s) => s.kind === 'awaken')!.goal).toBe('신의 흔적을 찾는다')
    expect(steps.some((s) => 'opens' in s)).toBe(false)
  })

  it('장마다 보스나 대장간으로 끝나고, 목표 한 줄은 짧다', () => {
    for (const c of CHAPTERS) {
      for (const s of c.steps) expect([...s.goal].length, s.goal).toBeLessThanOrEqual(GOAL_MAX_CHARS)
    }
    expect(CHAPTERS.map((c) => c.steps.at(-1)!.kind)).toEqual(['enter', 'boss', 'boss', 'boss'])
  })

  it('장 할 일에 귀환이 없다(귀환은 강제하지 않는다, P5 리뷰: 처음부터 센 귀환 수로 그리스·종장의 귀환이 저절로 지나갔다), 합치기는 제1장 요툰헤임·맹세는 제2장 델포이', () => {
    const steps = CHAPTERS.flatMap((c) => c.steps)
    expect(steps.filter((s) => s.kind === 'return')).toEqual([])
    expect(steps.filter((s) => s.kind === 'merge' || s.kind === 'oath').map((s) => `${s.kind}:${s.region}:${s.n}`)).toEqual(['merge:jotunheim:1', 'oath:delphi:1'])
    expect(CHAPTERS.find((c) => c.id === 'finale')!.steps[0]).toMatchObject({ kind: 'forge', region: 'village', n: 2 })
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
    bad((d) => (d.north.steps[2].region = 'olympus'), /열리지 않은 땅/)
    bad((d) => (d.north.steps[3].region = 'midgard'), /보스가 없는 땅/)
    bad((d) => (d.finale.steps[0].region = 'midgard'), /대장간/)
    bad((d) => (d.north.steps[0].n = 9), /n/)
    bad((d) => (d.north.steps[2].realm = 'norse'), /awaken에만/)
    bad((d) => (d.north.steps[0].realm = 'atlantis'), /realm/)
    bad((d) => (d.north.steps[1].goal = '가'.repeat(GOAL_MAX_CHARS + 1)), /자 안/)
    bad((d) => delete d.finale, /마지막 무대의 보스/)
    bad((d) => (d.greek.steps[0].when = 'x'), /모르는 항목/)
    bad((d) => (d.north.steps[3].opens = 'norse'), /모르는 항목/)
    bad((d) => (d.greek.steps[1].kind = 'level'), /kind/)
    // 탈것은 고개지기가 선 땅에서만, 수·신화권 없이 (E241)
    bad((d) => (d.greek.steps[1].region = 'olympus'), /고개지기/)
    bad((d) => (d.greek.steps[1].n = 1), /n/)
    // 합치기·맹세 (E306): 수가 있어야 하고, 그 장의 땅에서, 장을 끝내는 일이 될 수 없다
    bad((d) => delete d.north.steps[1].n, /n/)
    bad((d) => delete d.greek.steps[5].n, /n/)
    bad((d) => (d.greek.steps[5].n = 9), /n/)
    bad((d) => (d.north.steps[1].region = 'midgard'), /그 장의 땅/)
    bad((d) => d.greek.steps.push({ kind: 'oath', region: 'delphi', n: 1, goal: '맹세' }), /장을 끝내는 일/)
    bad((d) => (d.north.steps[1].realm = 'norse'), /awaken에만/)
  })

  it('그리스 장은 고개부터: 고개 → 고개지기 → 올림포스 → 제우스 → 델포이 → 맹세 → 리키아 → 키마이라 (E241, E306, 귀환 없이 이어진다 P5 리뷰)', () => {
    const greek = CHAPTERS.find((c) => c.id === 'greek')!
    expect(greek.steps.map((s) => `${s.kind}:${s.region}`)).toEqual([
      'enter:pass',
      'mount:pass',
      'enter:olympus',
      'awaken:olympus',
      'enter:delphi',
      'oath:delphi',
      'enter:lycia',
      'boss:lycia',
    ])
    expect(greek.lands.pass).toBeLessThan(greek.lands.olympus!)
  })
})

describe('땅 세기 (E22-02)', () => {
  it('생명은 적 지수만큼, 피해는 그보다 덜 오른다', () => {
    expect(landScale(1)).toEqual({ hp: 1, damage: 1 })
    expect(landScale(4).hp).toBe(4)
    expect(landScale(4).damage).toBeGreaterThan(1)
    expect(landScale(4).damage).toBeLessThan(4)
    expect(TOP_POWER).toBe(6)
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

  it('제1장에 들어서면 흔적·수호자의 땅(미드가르드·요툰헤임·철의 숲·바닷가·무스펠 경계)이 모두 열리고, 우트가르드만 신 둘이 깨어나야 열린다 (2026-11-22)', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    chapters.enter('midgard')
    for (const id of ['midgard', 'jotunheim', 'ironwood', 'serpentshore', 'muspel']) expect(chapters.isOpen(id), id).toBe(true)
    expect(chapters.isOpen('utgard')).toBe(false)
    w.awake.set('norse', 1)
    expect(chapters.isOpen('utgard')).toBe(false)
    expect(chapters.goal).toMatchObject({ kind: 'awaken', n: 2 })
    // 귀환 없이도 (귀환은 장 할 일이 아니다)
    w.awake.set('norse', 2)
    expect(chapters.isOpen('utgard')).toBe(true)
  })

  it('미드가르드에 들어서면 제1장: 목표는 신 둘 → 영웅 → 우트가르드 → 거인 왕 (2026-11-22: 귀환 할 일을 걷음)', () => {
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
    next(() => w.awake.set('norse', 2))
    next(() => (w.heroes = 1))
    next(() => chapters.enter('utgard'))
    expect(goals).toEqual(['awaken', 'merge', 'enter', 'boss'])
    // 합치기는 땅을 막지 않는다: 영웅이 없어도 신 둘이면 우트가르드가 열린다
    const w2 = world()
    const c2 = new ChapterProgress(w2)
    c2.enter('midgard')
    w2.awake.set('norse', 2)
    expect(c2.goal?.kind).toBe('merge')
    expect(c2.isOpen('utgard')).toBe(true)
  })

  it('앞 장이나 차례 전에 만든 영웅·지킨 맹세는 건너뛰는 근거가 아니고, 차례에 닿으면 바로 지나간다 (E306 D4)', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    chapters.enter('midgard')
    // 귀환 1 전에 영웅을 만들었어도 목표는 첫 신부터 차례로
    w.heroes = 1
    w.kept = 1
    expect(chapters.goal?.kind).toBe('awaken')
    // 신 둘을 깨우면 이미 만든 영웅으로 합치기는 바로 지나간다
    w.awake.set('norse', 2)
    expect(chapters.goal).toMatchObject({ kind: 'enter', region: 'utgard' })
  })

  it('그리스와 마지막 무대도 차례로: 올림포스는 고개지기를 만난 뒤(귀환 없이), 델포이는 제우스를 깨운 뒤, 리키아는 델포이에 닿은 뒤(맹세를 못 지켰어도), 갈라진 하늘은 유물 2단계 뒤 (E241, E306, P5 리뷰)', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    chapters.enter('midgard')
    chapters.bossDefeated('utgard')
    w.stage = 1
    w.ret = 2
    expect(chapters.isOpen('pass')).toBe(true)
    expect(chapters.isOpen('olympus')).toBe(false)
    chapters.enter('pass')
    expect(chapters.goal?.kind).toBe('mount')
    expect(chapters.isOpen('olympus')).toBe(false)
    w.ret = 0
    w.goat = true
    // 귀환하지 않아도 고개지기를 만나면 올림포스가 열린다
    expect(chapters.isOpen('olympus')).toBe(true)
    expect(chapters.goal?.goal).toBe('올림포스 기슭으로')
    chapters.enter('olympus')
    expect(chapters.isOpen('delphi')).toBe(false)
    w.awake.set('greek', 1)
    expect(chapters.isOpen('delphi')).toBe(true)
    expect(chapters.isOpen('lycia')).toBe(false)
    chapters.enter('delphi')
    expect(chapters.goal?.kind).toBe('oath')
    expect(chapters.isOpen('lycia')).toBe(true)
    // 맹세를 지키면 목표는 리키아로
    w.kept = 1
    expect(chapters.goal?.goal).toBe('리키아 화산으로')
    chapters.bossDefeated('lycia')
    expect(chapters.chapter?.id).toBe('finale')
    expect(chapters.goal?.kind).toBe('forge')
    expect(chapters.isOpen('sky')).toBe(false)
    w.stage = 2
    expect(chapters.isOpen('sky')).toBe(true)
  })

  it('맹세를 이미 지키고 델포이에 닿으면 맹세는 바로 지나가 목표는 리키아로 (봇은 귀환 3의 출발 카드에서 걸고 티폰에서 지킨다, E306 D6)', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    pastNorth(w, chapters)
    chapters.enter('pass')
    w.goat = true
    w.ret = 3
    chapters.enter('olympus')
    w.kept = 1
    w.awake.set('greek', 1)
    expect(chapters.goal?.goal).toBe('델포이 골짜기로')
    chapters.enter('delphi')
    expect(chapters.goal?.goal).toBe('리키아 화산으로')
  })

  it('뒤의 할 일을 먼저 했으면 앞의 것은 지나간 것으로 친다 (귀환을 건너뛰고 우트가르드로)', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    chapters.enter('midgard')
    w.awake.set('norse', 2)
    chapters.enter('utgard')
    expect(chapters.goal?.kind).toBe('boss')
    // 귀환이 다음 장 목표(고개 귀환 3)에 먼저 닿아도 장은 건너뛰지 않는다
    w.ret = 3
    expect(chapters.chapter?.id).toBe('north')
  })

  it('신 깨우기는 스스로 채워야 지나간다: 신 하나만 깨우고 요툰헤임에 들어선 옛 저장은 신 깨우기 차례, 우트가르드는 닫힌 채 (E306 리뷰 → 2026-11-22)', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    chapters.enter('midgard')
    w.awake.set('norse', 1)
    w.ret = 1
    chapters.enter('jotunheim')
    expect(chapters.goal).toMatchObject({ kind: 'awaken', n: 2 })
    expect(chapters.isOpen('utgard')).toBe(false)
    w.awake.set('norse', 2)
    expect(chapters.goal?.kind).toBe('merge')
    expect(chapters.isOpen('utgard')).toBe(true)
  })

  it('종장에서 유물을 먼저 2단계로 벼렸으면 벼리기는 바로 지나가 목표는 갈라진 하늘 (귀환 없이, P5 리뷰)', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    pastNorth(w, chapters)
    for (const id of ['pass', 'olympus', 'delphi', 'lycia']) chapters.enter(id)
    w.goat = true
    w.heroes = 1
    w.kept = 1
    w.awake.set('greek', 1)
    chapters.bossDefeated('lycia')
    w.stage = 2
    expect(chapters.chapter?.id).toBe('finale')
    expect(chapters.goal).toMatchObject({ kind: 'enter', region: 'sky' })
    expect(chapters.isOpen('sky')).toBe(true)
  })

  it('제1장에서 귀환을 세 번 했어도 그리스 장은 고개·고개지기부터 차례로 (고개의 귀환을 건너뛰는 근거로 쓰지 않는다, E241)', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    pastNorth(w, chapters)
    w.ret = 3
    expect(chapters.chapter?.id).toBe('greek')
    expect(chapters.goal?.goal).toBe('우트가르드 너머 고개로')
    expect(chapters.isOpen('olympus')).toBe(false)
    chapters.enter('pass')
    expect(chapters.goal?.kind).toBe('mount')
    expect(chapters.isOpen('olympus')).toBe(false)
    // 고개지기를 만나면 이미 한 귀환은 지나가고 올림포스가 열린다
    w.goat = true
    expect(chapters.goal?.goal).toBe('올림포스 기슭으로')
    expect(chapters.isOpen('olympus')).toBe(true)
    expect(chapters.isOpen('delphi')).toBe(false)
    chapters.enter('olympus')
    expect(chapters.goal?.kind).toBe('awaken')
    expect(chapters.isOpen('lycia')).toBe(false)
    w.awake.set('greek', 1)
    expect(chapters.goal?.goal).toBe('델포이 골짜기로')
    chapters.enter('delphi')
    expect(chapters.goal?.goal).toBe('맹세 하나를 지킨다')
    expect(chapters.isOpen('lycia')).toBe(true)
  })

  it('거인 왕을 이기면 바로 제2장: 우트가르드 너머 고개가 열리고 목표는 고개로 (E241)', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    chapters.enter('midgard')
    chapters.bossDefeated('utgard')
    expect(chapters.chapter?.id).toBe('greek')
    expect(chapters.isOpen('pass')).toBe(true)
    expect(chapters.isOpen('olympus')).toBe(false)
    expect(chapters.isOpen('sky')).toBe(false)
    expect(chapters.goal?.goal).toBe('우트가르드 너머 고개로')
  })

  it('탈것 할 일은 고개지기를 만나면(탈것을 얻으면) 한 것이다 (E241)', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    const step = CHAPTERS.flatMap((c) => c.steps).find((s) => s.kind === 'mount')!
    expect(chapters.done(step)).toBe(false)
    w.goat = true
    expect(chapters.done(step)).toBe(true)
  })

  it('키마이라 뒤 종장: 첫 목표는 대장간 벼리기, 갈라진 하늘이 열리고, 마지막 보스를 이기면 끝 (E306, 귀환 할 일은 P5 리뷰에서 걷음)', () => {
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

  it('땅의 세기와 단계: 장 흐름의 땅은 장 데이터, 그 밖의 들판(엔딩 뒤)은 가장 센 땅만큼, 끝없는 원정은 1', () => {
    const chapters = new ChapterProgress(world())
    expect(chapters.power('midgard')).toBe(1)
    expect(chapters.power('lycia')).toBe(4.5)
    expect(chapters.power('sinsi')).toBe(TOP_POWER)
    expect(chapters.power('endless')).toBe(1)
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

describe('보스 처치를 적는 땅', () => {
  it('무너지는 동안 통로를 넘어 데려가도 처치는 쓰러진 땅의 것으로 친다', () => {
    const area = walkArea([{ minX: -30, maxX: 30, minZ: -30, maxZ: 30 }])
    const encounter = new Encounter({ camps: [], boss: null }, [], area)
    encounter.reset({ id: 'a', camps: [], boss: null }, [], area)
    const fallen = encounter.spawnGrunt(0, 0)
    const standing = encounter.spawnGrunt(5, 0)
    fallen.takeHit(1e6, 1, 0, 0)
    encounter.cross({ id: 'b', camps: [], boss: null }, { x: 0, z: 0 }, [], area)
    expect(encounter.fellRegion(fallen)).toBe('a')
    expect(encounter.fellRegion(standing)).toBeUndefined()
  })
})

describe('이웃 땅에 지어 둔 무리의 세기 (P5 리뷰)', () => {
  it('지어 둔 뒤 땅 세기가 바뀌었으면(만난 신이 늘어 제1장 땅이 세짐) 넘어갈 때 지금 세기로 갈아 낀다: 깎인 생명은 비율 그대로', () => {
    const area = walkArea([{ minX: -60, maxX: 60, minZ: -30, maxZ: 30 }])
    let power = 1
    const encounter = new Encounter({ camps: [], boss: null }, [], area, (id) => (id === 'b' ? power : 1))
    encounter.reset({ id: 'a', camps: [], boss: null }, [], area)
    encounter.rng = () => 0.99
    encounter.setNeighbors([{ id: 'b', layout: { id: 'b', camps: [{ x: 10, z: 0, count: 2 }], boss: null }, offset: { x: 30, z: 0 } }])
    encounter.flushNeighbors()
    const [a, b] = encounter.parkedGiants
    const base = a!.health.max
    b!.health.hp = b!.health.max / 2
    power = 4
    encounter.cross({ id: 'b', camps: [], boss: null }, { x: -30, z: 0 }, [], area)
    expect(encounter.power).toBe(4)
    expect(a!.health.max).toBeCloseTo(base * 4)
    expect(a!.health.ratio).toBeCloseTo(1)
    expect(b!.health.ratio).toBeCloseTo(0.5)
  })
})

describe('장 정복 (E305-02)', () => {
  it('장 정복 보스는 마지막 장이 아닌 장의 끝 보스: 거인 왕·키마이라', () => {
    expect(CONQUESTS).toEqual(['utgard', 'lycia'])
  })

  it('이긴 장 정복 보스만 센다 (마지막 무대·엔딩 뒤 신화권 보스는 세지 않는다)', () => {
    const chapters = new ChapterProgress(world())
    expect(chapters.conquered).toBe(0)
    chapters.bossDefeated('huoyanshan')
    chapters.bossDefeated('sky')
    expect(chapters.conquered).toBe(0)
    chapters.bossDefeated('utgard')
    expect(chapters.conquered).toBe(1)
    chapters.bossDefeated('lycia')
    expect(chapters.conquered).toBe(2)
  })
})

describe('목표 한 줄의 합치기 막대 (E306)', () => {
  it('가방에 든 같은 부위 희귀만 센다: 하나를 끼고 가방에 둘이면 2/3 (합치기는 가방의 것만 받는다, E306 리뷰)', () => {
    const w = world()
    const chapters = new ChapterProgress(w)
    chapters.enter('midgard')
    w.awake.set('norse', 2)
    w.ret = 2
    expect(chapters.goal?.kind).toBe('merge')
    const loadout = new Loadout()
    let seed = 7
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < 3; i++) {
      const item = rollGear(rng, { part: 'weapon', grade: 'rare' })
      loadout.addGear(item)
      loadout.equip(item.uid)
    }
    expect(loadout.bag).toHaveLength(2)
    const ctx = {
      bus: new EventBus<GameEvents>(),
      chapters,
      progress: { pantheon: { hand: null }, isOpen: () => true, opened: ['thor', 'odin'] },
      build: { chosen: null },
      powers: { loadout },
      awaken: { waking: [] },
      ending: { reached: false, has: () => false },
      expedition: { preview: () => ({ seconds: 0, now: 1, next: 1 }), returns: 2, elapsed: 0 },
      training: { insights: 0 },
    }
    const view = new ChapterSystem(ctx as never).goalView()
    expect(view?.ratio).toBeCloseTo(2 / 3, 9)
  })
})

describe('엔딩 전 깨우는 길의 목표 한 줄 (2026-11-20: 사냥 막대와 기세 막대를 걷음, 2026-11-22: 특정 신을 가리키지 않는다)', () => {
  /** 목표 한 줄을 읽는 데 드는 것만 흉내 낸 게임 상태 */
  const viewOf = (chapters: ChapterProgress, now: { waking?: string[]; open?: string[]; returns?: number; seconds?: number; insights?: number; bosses?: number }) => {
    const ctx = {
      bus: new EventBus<GameEvents>(),
      chapters,
      progress: { pantheon: { hand: null }, isOpen: (g: string) => (now.open ?? []).includes(g), opened: now.open ?? [] },
      build: { chosen: null },
      powers: { loadout: new Loadout() },
      awaken: { waking: now.waking ?? [] },
      ending: { reached: false, has: () => false },
      expedition: { preview: () => ({ seconds: now.seconds ?? 0, now: 1, next: 1.2 }), returns: now.returns ?? 0, elapsed: now.seconds ?? 0, bosses: now.bosses ?? 0 },
      training: { insights: now.insights ?? 0 },
    }
    return new ChapterSystem(ctx as never).goalView()
  }
  /** 「2/3」처럼 세는 꼴 */
  const counted = /\d+\s*\/\s*\d+/
  const gods = /토르|오딘|로키|프레이|요르문간드|펜리르|스카디|수르트/

  it('흔적을 찾는 목표는 깨달음이 0이어도, 신 하나를 깨운 뒤에도 그 글 그대로다 (「기세를 모은다 n/m」·「두 번째 신」이 아니다)', () => {
    const chapters = new ChapterProgress(world())
    chapters.enter('midgard')
    expect(chapters.goal?.kind).toBe('awaken')
    expect(viewOf(chapters, { insights: 0 })).toEqual({ text: '신의 흔적을 찾는다', ratio: null })
    expect(viewOf(chapters, { open: ['loki'], seconds: 200 })).toEqual({ text: '신의 흔적을 찾는다', ratio: null })
  })

  it('흔적의 무리를 이긴 뒤에는 「수호자를 쓰러뜨린다」: 수호자가 여럿 서 있어도 한 줄, 신 이름도 세는 꼴도 없다', () => {
    const chapters = new ChapterProgress(world())
    chapters.enter('midgard')
    for (const waking of [['thor'], ['odin'], ['loki', 'freyr']]) {
      const view = viewOf(chapters, { waking })
      expect(view, waking.join()).toEqual({ text: '수호자를 쓰러뜨린다', ratio: null })
      expect(view?.text).not.toMatch(counted)
      expect(view?.text).not.toMatch(gods)
    }
    // 이미 깨어난 신은 서 있는 수호자로 치지 않는다
    expect(viewOf(chapters, { waking: ['thor'], open: ['thor'] })?.text).toBe('신의 흔적을 찾는다')
  })

  it('수호자가 서 있어도 다음 할 일 하나가 더 가까운 흔적이면 「신의 흔적을 찾는다」, 귀환할 수 있으면 한 마디를 덧붙인다 (2026-11-22 손 QA)', () => {
    const chapters = new ChapterProgress(world())
    chapters.enter('midgard')
    const ctx = {
      bus: new EventBus<GameEvents>(),
      chapters,
      progress: { pantheon: { hand: null }, isOpen: () => false, opened: [] },
      build: { chosen: null },
      powers: { loadout: new Loadout() },
      awaken: { waking: ['thor'] },
      ending: { reached: false, has: () => false },
      expedition: { preview: () => ({ seconds: 200, now: 1, next: 1.2 }), returns: 0, elapsed: 200, bosses: 0, falls: 0 },
      training: { insights: 0 },
    }
    const system = new ChapterSystem(ctx as never)
    let next: 'trace' | 'guardian' = 'trace'
    system.nextWake = () => next
    expect(system.goalView()?.text).toBe('신의 흔적을 찾는다')
    next = 'guardian'
    expect(system.goalView()?.text).toBe('수호자를 쓰러뜨린다')
    // 이번 원정에서 수호자를 이겼다: 귀환할 수 있다
    ctx.expedition.bosses = 1
    expect(system.goalView()?.text).toBe('수호자를 쓰러뜨린다 · 귀환할 수 있다')
  })

  it('귀환 목표는 글만 보인다: 받을 배율(×1.20) 같은 움직이는 수도, 시간 막대도 없다 (2026-11-20 손 QA. 지금 데이터에는 귀환 할 일이 없어 고개에 귀환을 끼운 장으로 본다)', () => {
    const w = world()
    const greek = CHAPTERS.find((c) => c.id === 'greek')!
    const back = { kind: 'return', region: 'pass', n: 1, goal: '고개 성소 화로에서 원정을 마친다' } as ChapterStep
    const chapters = new ChapterProgress(w, () => false, CHAPTERS.map((c) => (c === greek ? { ...c, steps: [...c.steps.slice(0, 2), back, ...c.steps.slice(2)] } : c)))
    pastNorth(w, chapters)
    chapters.enter('pass')
    w.goat = true
    w.ret = 0
    expect(chapters.goal?.kind).toBe('return')
    const early = viewOf(chapters, { open: ['thor', 'odin'], seconds: 30, insights: 0, bosses: 1 })
    expect(early).toEqual({ text: '고개 성소 화로에서 원정을 마친다', ratio: null })
    const ripe = viewOf(chapters, { open: ['thor', 'odin'], seconds: 130, insights: 0, bosses: 1 })
    expect(ripe).toEqual({ text: '고개 성소 화로에서 원정을 마친다', ratio: null })
    for (const view of [early, ripe]) {
      expect(view?.text).not.toMatch(counted)
      expect(view?.text).not.toMatch(/[×\d]/)
    }
  })
})

describe('장 진행 시스템과 탈것 (E241)', () => {
  it('귀환 3을 먼저 한 판은 고개지기를 만나면 바로 목표가 올림포스로 넘어간다 (goalChanged: 결계·작은 지도가 다시 셈한다)', () => {
    const bus = new EventBus<GameEvents>()
    const w = world()
    const chapters = new ChapterProgress(w)
    const mount = new MountProgress()
    w.mounted = () => mount.owned
    pastNorth(w, chapters)
    w.ret = 3
    const ctx = { bus, chapters, mount, map: { region: REGIONS.pass }, hero: { rig: { root: new THREE.Group() } }, orders: {} }
    new ChapterSystem(ctx as never)
    const keeper = new MountSystem(ctx as never, new THREE.Scene(), false)
    const goals: (string | undefined)[] = []
    bus.on('goalChanged', ({ goal }) => goals.push(goal?.goal))
    bus.emit('regionEntered', { id: 'pass' })
    expect(goals).toEqual(['고개지기를 만난다'])
    expect(chapters.isOpen('olympus')).toBe(false)
    // 고치기 전: 목표는 올림포스로 넘어갔는데 알리지 않아 결계가 그대로 섰다
    keeper.give()
    expect(goals).toEqual(['고개지기를 만난다', '올림포스 기슭으로'])
    expect(chapters.isOpen('olympus')).toBe(true)
  })
})

describe('어느 땅부터 가도 되는 제1장의 땅 세기 (2026-11-22)', () => {
  it('제1장의 땅은 데이터 세기와 만난 신 수의 세기(1·1.6·2.5·3.5, P8) 가운데 작은 쪽, 거인 왕의 땅은 정한 끝까지: 로키부터 가도 첫 요툰헤임은 1', () => {
    let met = 0
    const chapters = new ChapterProgress({ ...world(), met: () => met })
    expect(CHAPTERS.find((c) => c.id === 'north')!.free).toBe(true)
    // 거인 왕의 땅은 만난 신 수와 상관없이 FREE_BOSS_POWER까지만 (P5 봇: 10.7의 거인 왕과 933초, P8: 데이터 세기와 같은 3.5)
    expect(['jotunheim', 'muspel', 'ironwood', 'serpentshore', 'utgard'].map((r) => chapters.power(r))).toEqual([1, 1, 1, 1, FREE_BOSS_POWER])
    expect(FREE_BOSS_POWER).toBeLessThan(10.7)
    met = 1
    expect(['jotunheim', 'muspel', 'ironwood', 'serpentshore'].map((r) => chapters.power(r))).toEqual([1.6, 1.6, 1.25, 1.25])
    met = 2
    expect(chapters.power('jotunheim')).toBe(2.5)
    met = 4
    // 데이터 세기가 표보다 낮은 땅은 데이터 그대로 (P8: 요툰헤임 3·무스펠 3.25)
    expect(['jotunheim', 'muspel'].map((r) => chapters.power(r))).toEqual([3, 3.25])
    // 다른 장과 만난 신 수를 모르는 세계는 데이터 그대로
    expect(chapters.power('olympus')).toBe(3.75)
    expect(new ChapterProgress(world()).power('jotunheim')).toBe(3)
    expect(new ChapterProgress(world()).power('utgard')).toBe(3.5)
  })
})

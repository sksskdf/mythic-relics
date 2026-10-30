import { describe, expect, it } from 'vitest'

import { parseAutomation } from '../src/progress/Automation'
import { parseDepth } from '../src/progress/Depth'
import { parseOaths } from '../src/progress/Oaths'
import { parseEndless } from '../src/progress/Endless'
import { STEP_TABS } from '../src/progress/Tabs'
import { parseSave, SAVE_VERSION, type SaveData, saveStorage } from '../src/save/SaveData'
import { HUNT_KILLS } from '../src/data/wake'
import { ChapterProgress } from '../src/progress/Chapters'
import { godDef } from '../src/relics/data'

const sample: SaveData = {
  version: SAVE_VERSION,
  slots: [null, null, null, null, null, null, null],
  bag: [],
  lit: ['mjolnir'],
  uniques: [],
  ground: [{ id: 'lokiMask', x: 3, z: -4 }],
  classes: { thor: { level: 2, xp: 40 } },
  pantheon: { hand: 'thor', heart: 'thor', breath: ['thor'] },
  gear: [],
  stages: {},
  materials: {},
  dropMisses: 3,
  heartGauge: 0.5,
  looks: {
    unlocked: ['adventurerHair', 'adventurerTunic', 'adventurerSleeves', 'adventurerBoots', 'shortSword', 'adventurerHood', 'mjolnirHammer', 'thorCape'],
    choices: { weapon: 'shortSword', cape: null },
  },
  body: { skin: 2, hair: 1, cloth: 3 },
  threat: parseDepth({ level: 2, unlocked: 3, reached: 2, mastery: { flame: 2 }, battle: 40 }),
  conveniences: parseAutomation({ counters: { pickups: 5 }, open: ['autoPickup'] }),
  waypoints: ['midgard', 'jotunheim'],
  oaths: parseOaths({ kept: ['glass', 'slow', 'nope'], best: { glass: 371, nope: 5 } }),
  rift: parseEndless({ best: 12, stars: 3, lit: ['thor', 'odin', 'nobody'] }),
  ending: true,
  chapters: { entered: ['village', 'midgard', 'olympus'], bosses: ['utgard'] },
  training: { xp: 1500, taken: ['awaken', 'edge'] },
  expedition: { count: 2, renown: 20, flames: { stone: 1 }, best: [900], elapsed: 30, bosses: 0, deepest: 1, lastTaken: ['awaken'], bestXp: 1200, heirloom: [], oath: 'silence', lastBranch: 'ascend:thor' },
  tabs: ['relics', 'training'],
  awaken: { waking: 'odin', fragments: 1, hunt: 7 },
  region: { id: 'olympus', x: 3.5, z: -12 },
  scenes: ['opening'],
}

describe('저장 데이터', () => {
  it('저장한 그대로 다시 읽힌다', () => {
    expect(parseSave(JSON.stringify(sample))).toEqual(sample)
  })

  it('v3: 지역과 자리. 옛 저장(v2)이나 모르는 지역이면 마을에서 시작(null), 자리는 지역 범위 안으로 (E7-09)', () => {
    const { region: _, ...v2 } = { ...sample, version: 2 }
    expect(parseSave(JSON.stringify(v2))?.region).toBeNull()
    expect(parseSave(JSON.stringify({ ...sample, region: { id: 'atlantis', x: 0, z: 0 } }))?.region).toBeNull()
    expect(parseSave(JSON.stringify({ ...sample, region: { id: 'village', x: 999, z: -999 } }))?.region).toEqual({ id: 'village', x: 24, z: -24 })
  })

  it('본 대화 장면: 옛 저장에는 없어서 빈 목록, 글자가 아니거나 겹치면 버린다 (E12-10)', () => {
    const { scenes: _, ...old } = sample
    expect(parseSave(JSON.stringify(old))?.scenes).toEqual([])
    expect(parseSave(JSON.stringify({ ...sample, scenes: ['opening', 3, 'opening'] }))?.scenes).toEqual(['opening'])
  })

  it('v4: 신화. 옛 저장(v3)은 가진 유물의 신화를 열고, 고른 신화는 유물 셋 발현 규칙으로 정한다 (E12-05)', () => {
    const { pantheon: _, ...v3 } = { ...sample, version: 3, slots: ['mjolnir', 'megingjord', null, 'jarngreipr'], bag: ['lokiMask'] }
    const data = parseSave(JSON.stringify(v3))!
    expect(data.version).toBe(SAVE_VERSION)
    // 토르는 원래 2단계 그대로, 가방의 로키 유물로 로키가 1단계로 열린다
    expect(data.classes).toEqual({ thor: { level: 2, xp: 40 }, loki: { level: 1, xp: 0 } })
    expect(data.pantheon).toEqual({ hand: 'thor', heart: 'thor', breath: ['thor'] })
    // 유물이 둘뿐이면(발현 전) 고른 신화 없이 열리기만 한다
    const two = parseSave(JSON.stringify({ ...v3, slots: ['mjolnir', 'megingjord', null, null], classes: {} }))!
    expect(two.classes.thor).toEqual({ level: 1, xp: 0 })
    expect(two.pantheon).toEqual({ hand: null, heart: null, breath: [] })
    // 옛 순환 기록이 있어도(서리 조각·심장으로 돌려받음) 그 재료를 유물로 세다 멈추지 않는다
    const cycled = parseSave(JSON.stringify({ ...v3, cycle: { essence: { flame: 250 }, ash: 7 } }))!
    expect(cycled.classes.thor).toEqual({ level: 2, xp: 40 })
    expect(cycled.materials).toMatchObject({ prototype: 6, giantHeart: 2 })
  })

  it('읽지 못하는 저장(장비 id가 숫자 등)은 게임을 멈추지 않는다', () => {
    expect(() => parseSave(JSON.stringify({ ...sample, gear: [{ uid: 5, part: 'head', grade: 'rare', base: '철 투구' }] }))).not.toThrow()
  })

  it('자리 셋은 열린 신만, 숨은 겹치지 않게 다섯까지 (E302, v14 · 엔딩 뒤 다섯째는 E305-01)', () => {
    const many = { thor: { level: 2, xp: 0 }, loki: { level: 1, xp: 0 }, odin: { level: 1, xp: 0 }, freyr: { level: 1, xp: 0 }, zeus: { level: 1, xp: 0 }, poseidon: { level: 1, xp: 0 } }
    expect(parseSave(JSON.stringify({ ...sample, pantheon: { hand: 'zeus', heart: 'nobody', breath: ['thor', 'thor', 'nobody'] } }))?.pantheon).toEqual({ hand: null, heart: null, breath: ['thor'] })
    expect(parseSave(JSON.stringify({ ...sample, classes: many, pantheon: { hand: 'loki', heart: 'odin', breath: ['thor', 'loki', 'odin', 'freyr', 'zeus', 'poseidon'] } }))?.pantheon.breath).toHaveLength(5)
    // 손은 조각 2를 모은 깨우는 신도 쥘 수 있다
    expect(parseSave(JSON.stringify({ ...sample, awaken: { waking: 'odin', fragments: 2, hunt: 0 }, pantheon: { hand: 'odin', heart: null, breath: [] } }))?.pantheon.hand).toBe('odin')
    expect(parseSave(JSON.stringify({ ...sample, awaken: { waking: 'odin', fragments: 1, hunt: 0 }, pantheon: { hand: 'odin', heart: null, breath: [] } }))?.pantheon.hand).toBeNull()
    // 개방 단계 0(숙련만 쌓인 신화)도 그대로 남는다
    expect(parseSave(JSON.stringify({ ...sample, classes: { ...sample.classes, zeus: { level: 0, xp: 120 } } }))?.classes.zeus).toEqual({ level: 0, xp: 120 })
  })

  it('v13 이하의 주신·빌린 신 칸은 주신을 손·심장·숨 첫 칸으로, 빌린 신을 숨으로 옮긴다', () => {
    const many = { thor: { level: 2, xp: 0 }, loki: { level: 1, xp: 0 }, odin: { level: 1, xp: 0 } }
    const { pantheon: _, ...rest } = sample
    const v13 = { ...rest, version: 13, classes: many, chosen: ['thor', 'loki', 'odin', 'nobody'] }
    expect(parseSave(JSON.stringify(v13))?.pantheon).toEqual({ hand: 'thor', heart: 'thor', breath: ['thor', 'loki', 'odin'] })
  })

  it('깨졌거나 버전이 다르면 새로 시작한다', () => {
    expect(parseSave(null)).toBeNull()
    expect(parseSave('{깨진')).toBeNull()
    expect(parseSave(JSON.stringify({ ...sample, version: 99 }))).toBeNull()
  })

  it('모르는 유물, 겹치는 유물, 범위 밖 값은 바로잡는다', () => {
    const data = parseSave(
      JSON.stringify({
        ...sample,
        slots: ['mjolnir', 'mjolnir', 'excalibur', null, null, null, null],
        ground: [{ id: 'mjolnir', x: 1, z: 1 }, { id: 'lokiMask', x: 1, z: 'x' }],
        classes: { thor: { level: 9, xp: -5 }, nobody: { level: 2, xp: 0 } },
        heartGauge: 3,
      }),
    )
    // v15는 칸에 유물을 두지 않는다 (유물표, E303-04)
    expect(data?.slots).toEqual([null, null, null, null, null, null, null])
    expect(data?.lit).toEqual(['mjolnir'])
    expect(data?.ground).toEqual([])
    expect(data?.classes).toEqual({ thor: { level: 4, xp: 0 } })
    expect(data?.heartGauge).toBe(1)
  })

  it('심장 게이지 (E305-04 D11): 옛 키 divine(v16 이하와 E305-04 전의 v17 개발판)도 읽고, 새 키가 있으면 그것을', () => {
    const { heartGauge: _, ...old } = sample
    expect(parseSave(JSON.stringify({ ...old, divine: 0.3 }))?.heartGauge).toBe(0.3)
    expect(parseSave(JSON.stringify({ ...old, version: 16, divine: 0.7 }))?.heartGauge).toBe(0.7)
    expect(parseSave(JSON.stringify({ ...sample, divine: 0.9 }))?.heartGauge).toBe(0.5)
  })

  it('외형 보관함: 얻지 않은 외형이나 다른 칸의 외형을 고른 것은 버린다', () => {
    const data = parseSave(
      JSON.stringify({ ...sample, looks: { unlocked: ['thorCape', 'excalibur'], choices: { cape: 'lokiCape', head: 'thorCape', face: null, mark: 'thorStormHalo' } } }),
    )
    expect(data?.looks.unlocked).toContain('thorCape')
    expect(data?.looks.unlocked).not.toContain('excalibur')
    expect(data?.looks.choices).toEqual({ face: null })
  })

  it('이전 버전(v1) 저장도 불러지고, 가진 유물과 발현해 본 클래스의 외형을 얻은 것으로 친다', () => {
    const { looks: _looks, ...rest } = sample
    const data = parseSave(JSON.stringify({ ...rest, version: 1, slots: ['mjolnir', 'megingjord', null, 'jarngreipr'] }))
    expect(data?.version).toBe(SAVE_VERSION)
    // 신화의 유물(묠니르)은 유물표에(E303-04), 재료가 된 유물(메긴교르드·야른그레이프르)은 재료로 (E13-06)
    expect(data?.slots).toEqual([null, null, null, null, null, null, null])
    expect(data?.lit).toEqual(['mjolnir'])
    expect(data?.materials).toEqual({ megingjord: 1, jarngreipr: 1 })
    expect(data?.looks.unlocked).toEqual(expect.arrayContaining(['shortSword', 'mjolnirHammer', 'megingjordBelt', 'ironGauntlets', 'thorHelm', 'thorCape']))
    expect(data?.looks.unlocked).not.toContain('lokiMaskFace')
    expect(data?.looks.choices).toEqual({})
  })

  it('v6: 옛 순환 성장은 재료로 바꿔 주고, 위협 단계(지금 깊이)는 1에서 시작한다 (E14-06)', () => {
    const { threat: _t, conveniences: _c, ...rest } = sample
    const v5 = { ...rest, version: 5, materials: { frostShard: 2 }, cycle: { essence: { flame: 250, hunt: 80.5, wind: 0, stone: 70 }, ash: 7 } }
    const data = parseSave(JSON.stringify(v5))
    expect(data?.version).toBe(SAVE_VERSION)
    // 결정 400.5 → 서리 조각 4, 재 7 → 거인 왕의 심장 2
    expect(data?.materials).toEqual({ prototype: 18, giantHeart: 2 })
    expect(data?.threat).toEqual({ level: 1, reached: 1, limitBroken: false })
    expect(data?.conveniences).toEqual({ counters: {} })
    // 옛 별자리는 v5 저장에 없으면 0
    // 깊이는 가 본 곳을 넘지 않는다 (옛 위협 단계의 열린 단계는 버린다, E305-03)
    expect(parseSave(JSON.stringify({ ...sample, threat: { level: 9, unlocked: 3, reached: 5 } }))?.threat).toEqual({ level: 5, reached: 5, limitBroken: false })
  })

  it('기본 모습은 범위 밖이거나 없으면 기본값', () => {
    const odd = parseSave(JSON.stringify({ ...sample, body: { skin: 9, hair: -1, cloth: 'red' } }))
    expect(odd?.body).toEqual({ skin: 0, hair: 0, cloth: 0 })
    const { body: _body, ...old } = sample
    expect(parseSave(JSON.stringify(old))?.body).toEqual({ skin: 0, hair: 0, cloth: 0 })
  })
})

describe('저장 v9: 세 축 정리 (E21-07)', () => {
  const v8 = (extra: Record<string, unknown>) => JSON.stringify({ ...sample, version: 8, ending: undefined, chapters: undefined, ...extra })

  it('신화 고유 재료는 그 신의 신화권 재료로 바꿔 준다 (히든 신화는 북유럽)', () => {
    const data = parseSave(v8({ materials: { thunderShard: 6, boltChip: 3, bladeShard: 2, frostShard: 4, giantHeart: 1 } }))
    // v15에서 신화권 재료는 다시 원형 셋씩으로 ((12 + 3) × 3)
    expect(data?.materials).toEqual({ prototype: 45, giantHeart: 1 })
  })

  it('물려받은 수치·원천 숙련·전투 경험은 버린다', () => {
    const data = parseSave(v8({ inherited: { mjolnir: { kind: 'damage', value: 0.05 } }, threat: { level: 1, unlocked: 1, reached: 1, mastery: { flame: 3 }, battle: 200 } }))
    expect(data && 'inherited' in data).toBe(false)
    expect(data?.threat).toEqual({ level: 1, reached: 1, limitBroken: false })
  })

  it('위협 단계·시련·균열을 해 본 옛 저장은 엔딩 뒤로, 처음 땅만 걸은 저장은 엔딩 전으로', () => {
    const fresh = { threat: { level: 1, unlocked: 1, reached: 1 }, trials: { cleared: {}, best: {} }, rift: { best: 0, stars: 0, lit: [] } }
    expect(parseSave(v8(fresh))?.ending).toBe(false)
    expect(parseSave(v8({ ...fresh, threat: { level: 1, unlocked: 2, reached: 1 } }))?.ending).toBe(true)
    expect(parseSave(v8({ ...fresh, trials: { cleared: { glass: 1 }, best: {} } }))?.ending).toBe(true)
    expect(parseSave(v8({ ...fresh, rift: { best: 3, stars: 0, lit: [] } }))?.ending).toBe(true)
    // v9부터는 적힌 그대로
    expect(parseSave(JSON.stringify({ ...sample, ending: false }))?.ending).toBe(false)
  })

  it('단계가 없던 일반 장비는 1단계로 읽는다', () => {
    const item = { uid: 'g:abc12345', part: 'head', base: '철 투구', grade: 'rare', stats: [{ kind: 'maxHp', value: 12 }], source: { id: 'flame', value: 2 } }
    const data = parseSave(v8({ gear: [item], bag: ['g:abc12345'] }))
    expect(data?.gear[0]?.tier).toBe(1)
  })
})

describe('저장 v10: 장 진행 (E22-01)', () => {
  const v9 = (extra: Record<string, unknown>) => JSON.stringify({ ...sample, version: 9, chapters: undefined, ...extra })
  // 옛 저장에는 웨이포인트 키가 없다 (켠 성소는 편의의 visited에)
  const none = { threat: { level: 1, unlocked: 1, reached: 1 }, waypoints: undefined, materials: {}, slots: [null, null, null, null, null, null, null], ground: [] }

  it('모르는 땅은 버리고, 보스가 없는 땅은 보스를 이긴 땅이 아니다', () => {
    const data = parseSave(JSON.stringify({ ...sample, chapters: { entered: ['midgard', 'nowhere', 'midgard', 3], bosses: ['lycia', 'midgard', 'nowhere'] } }))
    expect(data?.chapters).toEqual({ entered: ['midgard'], bosses: ['lycia'] })
    expect(parseSave(JSON.stringify({ ...sample, chapters: 'broken' }))?.chapters).toEqual({ entered: [], bosses: [] })
  })

  it('옛 저장: 있던 땅과 찾은 성소는 들어서 본 땅, 처음 땅만 걸었으면 이긴 보스가 없다', () => {
    const data = parseSave(v9({ ...none, conveniences: { counters: {}, open: [], visited: ['jotunheim'] } }))
    expect(new Set(data?.chapters.entered)).toEqual(new Set(['olympus', 'jotunheim']))
    expect(data?.chapters.bosses).toEqual([])
  })

  it('옛 저장: 위협 단계에서 이겼거나 보스 재료·그 신화권 유물을 가졌으면 그 신화권 보스를 이긴 것으로 친다', () => {
    expect(parseSave(v9({ ...none, threat: { level: 1, unlocked: 1, reached: 1, cleared: { greek: 1 } } }))?.chapters.bosses).toEqual(['lycia'])
    expect(parseSave(v9({ ...none, materials: { giantHeart: 1 } }))?.chapters.bosses).toEqual(['utgard'])
    const relic = parseSave(v9({ ...none, slots: ['mjolnir', null, null, null, null, null, null] }))?.chapters
    expect(relic?.bosses).toEqual(['utgard'])
    expect(relic?.entered).toContain('utgard')
  })
})

describe('저장 v11: 수련 (E236-02)', () => {
  it('모르는 마디는 버리고, 깨진 기록은 처음부터', () => {
    const data = parseSave(JSON.stringify({ ...sample, training: { xp: 900, taken: ['awaken', 'nowhere', 'awaken', 3] } }))
    expect(data?.training).toEqual({ xp: 900, taken: ['awaken'] })
    expect(parseSave(JSON.stringify({ ...sample, training: 'broken' }))?.training).toEqual({ xp: 0, taken: [] })
  })

  it('옛 저장: 모은 경험치를 신화 경험치로 짐작하고(연 문턱 + 단계 문턱 + 지금), 마디는 비워 둔다', () => {
    const data = parseSave(JSON.stringify({ ...sample, version: 10, training: undefined }))
    // 토르 2단계, 경험치 40: 600 + 1500 + 40
    expect(data?.training).toEqual({ xp: 2140, taken: [] })
    const fresh = parseSave(JSON.stringify({ ...sample, version: 10, training: undefined, classes: { thor: { level: 0, xp: 120 } } }))
    expect(fresh?.training.xp).toBe(120)
  })
})

describe('저장 v11: 연 탭 (E236-05)', () => {
  it('연 탭은 그대로, 모르는 탭은 버리고, 깨진 기록은 상태 탭만', () => {
    expect(parseSave(JSON.stringify(sample))?.tabs).toEqual(['relics', 'training'])
    expect(parseSave(JSON.stringify({ ...sample, tabs: ['map', 'nowhere', 7] }))?.tabs).toEqual(['map'])
    expect(parseSave(JSON.stringify({ ...sample, tabs: 'broken' }))?.tabs).toEqual([])
  })

  it('옛 저장(탭 기록이 없던 때)은 맹세 말고 탭을 모두 연 것으로 친다 (맹세는 불러온 뒤 귀환 수로)', () => {
    expect(parseSave(JSON.stringify({ ...sample, version: 10, tabs: undefined }))?.tabs).toEqual(STEP_TABS.filter((t) => t !== 'oaths'))
  })

  it('v16과 E305-04 전의 v17 개발판: 신화·외형 탭은 신 탭으로 (탭 id로 옛 모양을 알아본다)', () => {
    expect(parseSave(JSON.stringify({ ...sample, version: 16, tabs: ['relics', 'classes', 'looks', 'sources'] }))?.tabs).toEqual(['relics', 'gods', 'sources'])
    expect(parseSave(JSON.stringify({ ...sample, tabs: ['looks', 'map'] }))?.tabs).toEqual(['gods', 'map'])
  })
})

describe('저장 v13: 신을 깨우는 조각 (E238)', () => {
  it('깨우는 신과 조각·사냥한 수는 그대로, 조각 2면 사냥 막대는 찬 것으로', () => {
    expect(parseSave(JSON.stringify(sample))?.awaken).toEqual({ waking: 'odin', fragments: 1, hunt: 7 })
    expect(parseSave(JSON.stringify({ ...sample, awaken: { waking: 'odin', fragments: 2, hunt: 3 } }))?.awaken).toEqual({ waking: 'odin', fragments: 2, hunt: HUNT_KILLS })
  })

  it('옛 저장(v12)·깨우는 길이 없는 신·이미 연 신이면 깨우는 신 없이', () => {
    const empty = { waking: null, fragments: 0, hunt: 0 }
    expect(parseSave(JSON.stringify({ ...sample, version: 12, awaken: undefined }))?.awaken).toEqual(empty)
    expect(parseSave(JSON.stringify({ ...sample, awaken: { waking: 'hades', fragments: 1, hunt: 2 } }))?.awaken).toEqual(empty)
    expect(parseSave(JSON.stringify({ ...sample, awaken: { waking: 'thor', fragments: 1, hunt: 2 } }))?.awaken).toEqual(empty)
  })
})

describe('그리스 장의 옛 저장 (E305-03: 성소의 신화 고르기 → 제우스 깨우기)', () => {
  /** 저장의 장 진행을 그 저장의 열린 신으로 다시 판정한다 (없어진 할 일 choose는 사실로) */
  const progressOf = (data: SaveData) => {
    const opened = Object.entries(data.classes).filter(([, r]) => (r?.level ?? 0) >= 1).map(([g]) => g)
    const chapters = new ChapterProgress({
      awakened: (realm) => opened.filter((g) => godDef(g).realm === realm).length,
      forged: () => 1,
      returns: () => data.expedition.count - 1,
    })
    chapters.load(data.chapters)
    return chapters
  }
  const greek = { ...sample, version: 16, ending: false, chapters: { entered: ['village', 'midgard', 'jotunheim', 'utgard', 'olympus'], bosses: ['utgard'] }, expedition: { ...sample.expedition, count: 2 } }

  it('고르기 전: 목표는 올림포스의 흔적, 델포이는 막혀 있다', () => {
    const data = parseSave(JSON.stringify({ ...greek, classes: { thor: { level: 2, xp: 0 }, odin: { level: 1, xp: 0 } } }))!
    const chapters = progressOf(data)
    expect(chapters.goal).toMatchObject({ kind: 'awaken', region: 'olympus', realm: 'greek' })
    expect(chapters.isOpen('delphi')).toBe(false)
  })

  it('옛 고르기로 그리스 신을 연 뒤: 깨운 것으로 쳐서 델포이가 열린다. 키마이라가 연 넷도 그대로', () => {
    const chose = parseSave(JSON.stringify({ ...greek, classes: { thor: { level: 2, xp: 0 }, odin: { level: 1, xp: 0 }, hades: { level: 1, xp: 0 } } }))!
    expect(progressOf(chose).isOpen('delphi')).toBe(true)
    const all = { thor: { level: 3, xp: 0 }, odin: { level: 1, xp: 0 }, zeus: { level: 1, xp: 0 }, poseidon: { level: 1, xp: 0 }, hades: { level: 1, xp: 0 }, artemis: { level: 1, xp: 0 } }
    const after = parseSave(JSON.stringify({ ...greek, classes: all, chapters: { entered: [...greek.chapters.entered, 'delphi', 'lycia'], bosses: ['utgard', 'lycia'] }, expedition: { ...greek.expedition, count: 3 } }))!
    expect(Object.keys(after.classes).sort()).toEqual(Object.keys(all).sort())
    expect(progressOf(after).chapter?.id).toBe('finale')
  })

  it('북유럽 신을 깨우는 중인 채 그리스 장: 깨우는 신은 그대로 남는다 (제우스는 그 뒤에 응답한다)', () => {
    const data = parseSave(JSON.stringify({ ...greek, classes: { thor: { level: 2, xp: 0 } }, awaken: { waking: 'loki', fragments: 1, hunt: 5 } }))!
    expect(data.awaken).toEqual({ waking: 'loki', fragments: 1, hunt: 5 })
  })
})

describe('저장 사슬 (E301-03)', () => {
  it('옛 버전 저장을 처음 옮길 때 원본을 그 버전 이름으로 한 번 남기고, 지금 버전이면 남기지 않는다', () => {
    const store = new Map<string, string>()
    const fake = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) }
    const before = (globalThis as { localStorage?: unknown }).localStorage
    ;(globalThis as { localStorage?: unknown }).localStorage = fake
    try {
      const keys = () => [...store.keys()].filter((k) => k.endsWith('.bak'))
      const old = JSON.stringify({ version: 12, slots: [], bag: [] })
      store.set('mythic-relics/save/0', old)
      expect(saveStorage.load(0)).not.toBeNull()
      expect(keys()).toHaveLength(1)
      expect(store.get(keys()[0]!)).toBe(old)
      // 두 번째 읽기는 남긴 것을 덮지 않는다
      store.set('mythic-relics/save/0', JSON.stringify({ version: 12, slots: [], bag: [], divine: 0.5 }))
      saveStorage.load(0)
      expect(store.get(keys()[0]!)).toBe(old)
      store.clear()
      store.set('mythic-relics/save/0', JSON.stringify({ version: SAVE_VERSION, slots: [], bag: [] }))
      saveStorage.load(0)
      expect(keys()).toHaveLength(0)
    } finally {
      ;(globalThis as { localStorage?: unknown }).localStorage = before
    }
  })
})

describe('저장 v15: 원형 (E303-04)', () => {
  /** 장비 하나 (저장 모양) */
  const gear = (uid: string, grade: string, tier = 1) => ({ uid, part: 'trinket', base: 'ring', grade, tier, stats: [{ kind: 'damage', value: 0.01 }], source: { id: 'flame', value: 1 } })

  it('신화권 재료는 원형 셋씩으로 바꾸고(대장간 값이 세 배가 된 만큼), 보스 재료는 그대로', () => {
    const data = parseSave(JSON.stringify({ ...sample, version: 14, materials: { frostShard: 4, olympusMarble: 3, giantHeart: 1 } }))
    expect(data?.materials).toEqual({ prototype: 21, giantHeart: 1 })
  })

  it('유물표가 없는 v15(유물표 전의 개발판)도 칸·가방의 신화 유물을 유물표로 옮긴다', () => {
    const { lit: _lit, ...noLit } = sample
    const data = parseSave(JSON.stringify({ ...noLit, version: 15, slots: ['mjolnir', null, null, null, null, null, null], bag: ['lokiMask'], ground: [] }))!
    expect(data.lit).toEqual(['mjolnir', 'lokiMask'])
    expect(data.slots.every((s) => s === null)).toBe(true)
  })

  it('신화의 유물은 칸·가방을 떠나 유물표로, 빈 칸은 가방의 가장 좋은 장비로 채운다', () => {
    const ring = gear('g:ring', 'rare')
    const data = parseSave(JSON.stringify({ ...sample, version: 14, slots: ['mjolnir', null, null, null, null, null, null], bag: ['lokiMask', 'g:ring'], gear: [ring], ground: [] }))!
    expect(data.lit).toEqual(['mjolnir', 'lokiMask'])
    expect(data.slots).toEqual([null, null, null, null, null, 'g:ring', null])
    expect(data.bag).toEqual([])
  })

  it('12칸을 넘친 가방은 칸을 채운 뒤 낮은 등급 일반 장비부터 녹여 원형으로', () => {
    const items = [...Array.from({ length: 14 }, (_, i) => gear(`g:${i}`, 'rare')), gear('g:low1', 'common'), gear('g:low2', 'good')]
    const bag = ['lokiMask', ...items.map((g) => g.uid)]
    const data = parseSave(JSON.stringify({ ...sample, version: 14, ground: [], bag, gear: items, materials: {} }))!
    // 장신구 칸 둘을 채우고 남은 14 가운데 낮은 둘을 녹인다: 보통 1 + 좋음 3 (12칸은 v15부터라 v15 저장은 녹이지 않는다)
    expect(data.slots.filter(Boolean)).toHaveLength(2)
    expect(data.bag).toHaveLength(12)
    expect(data.bag).not.toContain('g:low1')
    expect(data.bag).not.toContain('g:low2')
    expect(data.materials.prototype).toBe(4)
    expect(data.lit).toContain('lokiMask')
    expect(data.gear).toHaveLength(14)
  })
})

describe('저장 v17: 맹세 (E305-01)', () => {
  it('v16 저장의 시련 기록은 짝인 맹세를 지킨 것으로, 원정에 건 맹세는 없이', () => {
    const v16 = JSON.stringify({ ...sample, version: 16, oaths: undefined, trials: { cleared: { noUltimate: 1, fewSlots: 3 }, best: {} }, expedition: { ...sample.expedition, oath: undefined } })
    const data = parseSave(v16)
    expect(data?.version).toBe(17)
    expect(data?.oaths.kept.sort()).toEqual(['alone', 'silence'])
    expect(data?.expedition.oath).toBeNull()
  })

  it('v17은 건 맹세와 맹세 기록을 그대로 읽는다', () => {
    const data = parseSave(JSON.stringify(sample))
    expect(data?.oaths).toEqual({ kept: ['glass', 'slow'], best: { glass: 371 } })
    expect(data?.expedition.oath).toBe('silence')
  })

  it('편의 → 자동화 (E305-03): 주운 수만 남고, 켠 성소는 웨이포인트로 (키가 없는 옛 모양은 편의의 visited에서), 지난번 갈래는 없으면 null', () => {
    const conveniences = { counters: { pickups: 9, salvaged: 30, threat: 2 }, open: ['autoPickup', 'autoSalvage'], autoSalvage: false, visited: ['ironwood', 'midgard'] }
    const old = { ...sample, conveniences, waypoints: undefined, expedition: { ...sample.expedition, lastBranch: undefined } }
    for (const version of [16, 17]) {
      const data = parseSave(JSON.stringify({ ...old, version }))
      expect(data?.conveniences).toEqual({ counters: { pickups: 9 } })
      expect(data?.waypoints).toEqual(['ironwood', 'midgard'])
      expect(data?.expedition.lastBranch).toBeNull()
    }
    // 웨이포인트 키가 있으면 그것을 쓴다 (옛 visited는 보지 않는다)
    expect(parseSave(JSON.stringify({ ...old, waypoints: ['olympus'] }))?.waypoints).toEqual(['olympus'])
    expect(parseSave(JSON.stringify({ ...sample, expedition: { ...sample.expedition, lastBranch: 'nope' } }))?.expedition.lastBranch).toBeNull()
  })

  it('성좌판을 걷었다 (E305-03): v16 이하의 밝힌 별과 남은 별은 하나마다 명성 20으로, 깊이 기록은 그대로', () => {
    const rift = { best: 12, stars: 3, lit: ['thor', 'odin', 'nobody'] }
    const v16 = parseSave(JSON.stringify({ ...sample, version: 16, rift }))
    expect(v16?.rift).toEqual({ best: 12 })
    // 남은 별 셋 + 밝힌 별 둘(모르는 신은 버림) = 다섯
    expect(v16?.expedition.renown).toBe(sample.expedition.renown + 5 * 20)
    // v5 이하 별자리의 별도 남은 별로 친다
    const v5 = parseSave(JSON.stringify({ ...sample, version: 5, rift: undefined, cycle: { stars: { a: 2, b: 1 } } }))
    expect(v5?.expedition.renown).toBe(sample.expedition.renown + 3 * 20)
    // 한 번 옮긴 v17은 다시 주지 않는다
    expect(parseSave(JSON.stringify(v16))?.expedition.renown).toBe(v16?.expedition.renown)
  })
})

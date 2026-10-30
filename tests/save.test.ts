import { describe, expect, it } from 'vitest'

import { computeBuild } from '../src/build/BuildState'
import { CONQUESTS } from '../src/data/chapters'
import { renownMultiplier } from '../src/data/cycle'
import type { StatKind } from '../src/data/mythAlways'
import { pantheonGods } from '../src/myth/pantheon'
import { automationAt } from '../src/progress/Automation'
import { OathProgress } from '../src/progress/Oaths'
import { TrainingProgress } from '../src/progress/Training'
import { estimateExpeditions, LEGACY_STAR_RENOWN, legacyTrialRenown, renownForMultiplier } from '../src/save/migrate/v17'

import { parseAutomation } from '../src/progress/Automation'
import { parseDepth } from '../src/progress/Depth'
import { parseOaths } from '../src/progress/Oaths'
import { parseEndless } from '../src/progress/Endless'
import { STEP_TABS } from '../src/progress/Tabs'
import { parseSave, SAVE_VERSION, type SaveData, saveStorage } from '../src/save/SaveData'
import { HUNT_KILLS } from '../src/data/wake'
import { ChapterProgress } from '../src/progress/Chapters'
import { type God, godDef } from '../src/relics/data'

const sample: SaveData = {
  version: SAVE_VERSION,
  slots: [null, null, null, null, null, null, null],
  bag: [],
  lit: ['mjolnir'],
  uniques: [],
  ground: [{ id: 'lokiMask', x: 3, z: -4 }],
  classes: { thor: { level: 2 } },
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
  depth: parseDepth({ level: 2, reached: 2 }),
  automation: parseAutomation({ counters: { pickups: 5 } }),
  waypoints: ['midgard', 'jotunheim'],
  oaths: parseOaths({ kept: ['glass', 'slow', 'nope'], best: { glass: 371, nope: 5 } }),
  endless: parseEndless({ best: 12 }),
  ending: true,
  chapters: { entered: ['village', 'midgard', 'olympus'], bosses: ['utgard'] },
  training: { xp: 1500, taken: ['awaken', 'edge'] },
  expedition: { count: 2, renown: 20, flames: { stone: 1 }, best: [900], elapsed: 30, bosses: 0, deepest: 1, lastTaken: ['awaken'], bestXp: 1200, heirloom: [], oath: 'silence', lastBranch: 'ascend:thor' },
  tabs: ['relics', 'training'],
  awaken: { waking: 'odin', fragments: 1, hunt: 7 },
  region: { id: 'olympus', x: 3.5, z: -12 },
  scenes: ['opening'],
}

/**
 * 옛 모양 (v16 이하): 새 키(깊이·자동화·끝없는 원정·맹세·웨이포인트·심장 게이지)를 옛 키로 되돌린다.
 * 원정 기록은 v16부터, 건 맹세·지난번 갈래는 v17부터라 뺀다
 */
function asOld(data: SaveData, version: number): Record<string, unknown> {
  const { depth, automation, endless, oaths: _oaths, expedition, waypoints, heartGauge, ...rest } = data
  const { oath: _oath, lastBranch: _branch, ...v16 } = expedition
  return {
    ...rest,
    version,
    threat: { ...depth, unlocked: depth.reached + 1, cleared: {} },
    conveniences: { counters: { ...automation.counters }, open: [], autoSalvage: true, visited: [...waypoints] },
    trials: { cleared: {}, best: {} },
    rift: { ...endless, stars: 0, lit: [] },
    divine: heartGauge,
    ...(version >= 16 ? { expedition: v16 } : {}),
  }
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
    expect(data.classes).toEqual({ thor: { level: 2 }, loki: { level: 1 } })
    expect(data.pantheon).toEqual({ hand: 'thor', heart: 'thor', breath: ['thor'] })
    // 유물이 둘뿐이면(발현 전) 고른 신화 없이 열리기만 한다
    const two = parseSave(JSON.stringify({ ...v3, slots: ['mjolnir', 'megingjord', null, null], classes: {} }))!
    expect(two.classes.thor).toEqual({ level: 1 })
    expect(two.pantheon).toEqual({ hand: null, heart: null, breath: [] })
    // 옛 순환 기록이 있어도(서리 조각·심장으로 돌려받음) 그 재료를 유물로 세다 멈추지 않는다
    const cycled = parseSave(JSON.stringify({ ...v3, cycle: { essence: { flame: 250 }, ash: 7 } }))!
    expect(cycled.classes.thor).toEqual({ level: 2 })
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
    // 단계 0(옛 신화 숙련만 쌓인 신)도 그대로 남고, 신화 경험치는 내보내지 않는다 (v17)
    expect(parseSave(JSON.stringify({ ...sample, classes: { ...sample.classes, zeus: { level: 0, xp: 120 } } }))?.classes.zeus).toEqual({ level: 0 })
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
    expect(data?.classes).toEqual({ thor: { level: 4 } })
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
    const { threat: _t, conveniences: _c, trials: _tr, rift: _r, ...rest } = asOld(sample, 5)
    const v5 = { ...rest, materials: { frostShard: 2 }, cycle: { essence: { flame: 250, hunt: 80.5, wind: 0, stone: 70 }, ash: 7 } }
    const data = parseSave(JSON.stringify(v5))
    expect(data?.version).toBe(SAVE_VERSION)
    // 결정 400.5 → 서리 조각 4, 재 7 → 거인 왕의 심장 2
    expect(data?.materials).toEqual({ prototype: 18, giantHeart: 2 })
    expect(data?.depth).toEqual({ level: 1, reached: 1, limitBroken: false })
    expect(data?.automation).toEqual({ counters: {} })
    // 깊이는 가 본 곳을 넘지 않는다 (옛 위협 단계의 열린 단계는 버린다, E305-03)
    expect(parseSave(JSON.stringify({ ...asOld(sample, 16), threat: { level: 9, unlocked: 3, reached: 5 } }))?.depth).toEqual({ level: 5, reached: 5, limitBroken: false })
  })

  it('기본 모습은 범위 밖이거나 없으면 기본값', () => {
    const odd = parseSave(JSON.stringify({ ...sample, body: { skin: 9, hair: -1, cloth: 'red' } }))
    expect(odd?.body).toEqual({ skin: 0, hair: 0, cloth: 0 })
    const { body: _body, ...old } = sample
    expect(parseSave(JSON.stringify(old))?.body).toEqual({ skin: 0, hair: 0, cloth: 0 })
  })
})

describe('저장 v9: 세 축 정리 (E21-07)', () => {
  const v8 = (extra: Record<string, unknown>) => JSON.stringify({ ...asOld(sample, 8), ending: undefined, chapters: undefined, ...extra })

  it('신화 고유 재료는 그 신의 신화권 재료로 바꿔 준다 (히든 신화는 북유럽)', () => {
    const data = parseSave(v8({ materials: { thunderShard: 6, boltChip: 3, bladeShard: 2, frostShard: 4, giantHeart: 1 } }))
    // v15에서 신화권 재료는 다시 원형 셋씩으로 ((12 + 3) × 3)
    expect(data?.materials).toEqual({ prototype: 45, giantHeart: 1 })
  })

  it('물려받은 수치·원천 숙련·전투 경험은 버린다', () => {
    const data = parseSave(v8({ inherited: { mjolnir: { kind: 'damage', value: 0.05 } }, threat: { level: 1, unlocked: 1, reached: 1, mastery: { flame: 3 }, battle: 200 } }))
    expect(data && 'inherited' in data).toBe(false)
    expect(data?.depth).toEqual({ level: 1, reached: 1, limitBroken: false })
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
  const v9 = (extra: Record<string, unknown>) => JSON.stringify({ ...asOld(sample, 9), chapters: undefined, ...extra })
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
    const data = parseSave(JSON.stringify({ ...asOld(sample, 10), training: undefined, classes: { thor: { level: 2, xp: 40 } } }))
    // 토르 2단계, 경험치 40: 600 + 1500 + 40 (신화 경험치는 내보내지 않아도 원본에서 읽는다)
    expect(data?.training).toEqual({ xp: 2140, taken: [] })
    expect(data?.classes).toEqual({ thor: { level: 2 } })
    const fresh = parseSave(JSON.stringify({ ...asOld(sample, 10), training: undefined, classes: { thor: { level: 0, xp: 120 } } }))
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

describe('저장 v17: 맹세·깊이·자동화·끝없는 원정 (E305)', () => {
  it('v16 저장의 시련 기록은 짝인 맹세를 지킨 것으로, 원정에 건 맹세는 없이', () => {
    const v16 = JSON.stringify({ ...asOld(sample, 16), trials: { cleared: { noUltimate: 1, fewSlots: 3 }, best: {} } })
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

  it('옛 키는 새 키로만 쓴다: 깊이(threat → depth)·자동화(conveniences → automation)·끝없는 원정(rift → endless)·심장 게이지(divine → heartGauge)', () => {
    const data = parseSave(JSON.stringify(asOld(sample, 16)))!
    for (const key of ['threat', 'conveniences', 'rift', 'trials', 'divine']) expect(key in data, key).toBe(false)
    expect(data.depth).toEqual(sample.depth)
    expect(data.automation).toEqual(sample.automation)
    expect(data.endless).toEqual(sample.endless)
    expect(data.heartGauge).toBe(sample.heartGauge)
    // 새 키가 있으면 옛 키는 보지 않는다 (E305 도중의 v17 개발판에 둘 다 있어도)
    const both = parseSave(JSON.stringify({ ...sample, threat: { level: 9, reached: 9 }, conveniences: { counters: { pickups: 99 } }, rift: { best: 99, stars: 9 } }))!
    expect(both.depth).toEqual(sample.depth)
    expect(both.automation).toEqual(sample.automation)
    expect(both.endless).toEqual(sample.endless)
    expect(both.expedition.renown).toBe(sample.expedition.renown)
  })

  it('편의 → 자동화 (E305-03): 주운 수만 남고, 켠 성소는 웨이포인트로 (키가 없는 옛 모양은 편의의 visited에서), 지난번 갈래는 없으면 null', () => {
    const conveniences = { counters: { pickups: 9, salvaged: 30, threat: 2 }, open: ['autoSalvage'], autoSalvage: false, visited: ['ironwood', 'midgard'] }
    const old = { ...asOld(sample, 16), conveniences }
    for (const version of [16, 17]) {
      const data = parseSave(JSON.stringify({ ...old, version }))
      expect(data?.automation).toEqual({ counters: { pickups: 9 } })
      expect(data?.waypoints).toEqual(['ironwood', 'midgard'])
      expect(data?.expedition.lastBranch).toBeNull()
    }
    // 웨이포인트 키가 있으면 그것을 쓴다 (옛 visited는 보지 않는다)
    expect(parseSave(JSON.stringify({ ...old, waypoints: ['olympus'] }))?.waypoints).toEqual(['olympus'])
    expect(parseSave(JSON.stringify({ ...sample, expedition: { ...sample.expedition, lastBranch: 'nope' } }))?.expedition.lastBranch).toBeNull()
  })

  it('성좌판을 걷었다 (E305-03): 끝없는 원정 키가 없는 저장의 밝힌 별과 남은 별은 하나마다 명성 20으로, 깊이 기록은 그대로', () => {
    const rift = { best: 12, stars: 3, lit: ['thor', 'odin', 'nobody'] }
    const v16 = parseSave(JSON.stringify({ ...asOld(sample, 16), rift }))
    expect(v16?.endless).toEqual({ best: 12 })
    // 남은 별 셋 + 밝힌 별 둘(모르는 신은 버림) = 다섯
    expect(v16?.expedition.renown).toBe(sample.expedition.renown + 5 * LEGACY_STAR_RENOWN)
    // v5 이하 별자리의 별도 남은 별로 친다
    const { rift: _r, ...noRift } = asOld(sample, 5)
    const v5 = parseSave(JSON.stringify({ ...noRift, cycle: { stars: { a: 2, b: 1 } } }))
    expect(v5?.expedition.renown).toBe(3 * LEGACY_STAR_RENOWN)
    // 성좌판을 걷기 전의 v17 개발판(별을 든 rift)도 한 번 준다
    const dev = parseSave(JSON.stringify({ ...asOld(sample, 17), expedition: sample.expedition, oaths: sample.oaths, rift }))
    expect(dev?.expedition.renown).toBe(sample.expedition.renown + 5 * LEGACY_STAR_RENOWN)
    // 한 번 옮긴 저장은 다시 주지 않는다
    expect(parseSave(JSON.stringify(v16))?.expedition.renown).toBe(v16?.expedition.renown)
  })

  it('옛 시련의 난이도: 세 칸의 짐의 모든 피해 몫만 명성 배율로 메운다 (짝인 맹세의 피해 몫은 빼고, 장 정복 수의 역함수)', () => {
    // 세 칸의 짐 5단계 + 합 4 이상(×1.25) = 모든 피해 +12.5%. 정복 둘이면 명성 1 (×1.12)
    expect(legacyTrialRenown({ cleared: { fewSlots: 5 } }, 2)).toBe(1)
    expect(renownMultiplier(1, 2)).toBeCloseTo(1.121, 3)
    // 피해 몫이 없는 시련(침묵한 신·유리 몸)만 깼으면 명성 없이 맹세만
    expect(legacyTrialRenown({ cleared: { noUltimate: 5, glass: 5, noMyth: 3 } }, 2)).toBe(0)
    // 타는 모래시계 → 모래시계의 맹세(모든 피해 +5%)가 잃은 몫을 이미 메운다
    expect(legacyTrialRenown({ cleared: { fewSlots: 2, timed: 2 } }, 2)).toBe(0)
    expect(legacyTrialRenown(undefined, 0)).toBe(0)
    // 역함수
    for (const k of [0, 1, 2]) expect(renownMultiplier(renownForMultiplier(1.3, k), k)).toBeCloseTo(1.3, 9)
  })

  it('원정 기록이 없던 저장(v15 이하)은 원정 번호를 장 진행이 지나온 할 일 「귀환」으로 짐작한다 (명성은 없이)', () => {
    const norse = (n: number) => (realm: string) => (realm === 'norse' ? n : 0)
    // 요툰헤임에 막 닿았다: 귀환 1은 아직 앞에 있다
    expect(estimateExpeditions({ entered: ['midgard', 'jotunheim'], bosses: [] }, norse(1), 1)).toBe(1)
    // 둘째 신을 깨웠다(귀환 1 뒤의 할 일): 귀환 1은 지나왔다
    expect(estimateExpeditions({ entered: ['midgard', 'jotunheim'], bosses: [] }, norse(2), 1)).toBe(2)
    // 그리스 장 들머리: 델포이의 귀환 2는 아직 앞에 있다 (CYCLE의 「1 + 보스 + ⌊신 ÷ 2⌋ = 3」이면 제우스 목표를 건너뛴다)
    expect(estimateExpeditions({ entered: ['midgard', 'jotunheim', 'utgard', 'olympus'], bosses: ['utgard'] }, norse(2), 1)).toBe(2)
    // 리키아에 닿았다: 귀환 2도 지나왔다
    expect(estimateExpeditions({ entered: ['midgard', 'jotunheim', 'utgard', 'olympus', 'delphi', 'lycia'], bosses: ['utgard'] }, norse(2), 1)).toBe(3)
    // v16부터는 적힌 그대로
    expect(parseSave(JSON.stringify(asOld(sample, 16)))?.expedition.count).toBe(sample.expedition.count)
  })
})

/** 저장의 공격 지수: 그 저장의 장비·신 단계·자리·유물표·명성·장 정복·맹세 보상·수련으로 계산한 피해 배율 */
function attackIndex(data: SaveData, over: { renown?: number; bonus?: Partial<Record<StatKind, number>> } = {}): number {
  const open = new Map<God, number>()
  for (const [god, r] of Object.entries(data.classes)) if (r && r.level >= 1) open.set(god, r.level)
  const gear = new Map(data.gear.map((g) => [g.uid, g]))
  const oaths = new OathProgress()
  oaths.load(data.oaths)
  const training = new TrainingProgress()
  training.load(data.training)
  return computeBuild({
    open,
    hand: data.pantheon.hand,
    present: pantheonGods(data.pantheon),
    gear: data.lit,
    lit: data.lit.length + data.uniques.length,
    gearItems: data.slots.flatMap((id) => (id && gear.has(id) ? [gear.get(id)!] : [])),
    promotions: [...open.values()].reduce((s, l) => s + l - 1, 0),
    renown: over.renown ?? data.expedition.renown,
    conquered: CONQUESTS.filter((r) => data.chapters.bosses.includes(r)).length,
    flames: data.expedition.flames,
    bonus: { oaths: over.bonus ?? oaths.rewards(), training: { ...training.stats() } },
  }).damageScale
}

/**
 * 옮기기 전의 공격 지수: 장비·신 단계·자리·유물표·수련은 옮긴 저장과 같고(그대로 옮긴다), v17 옮기기가 바꾸는 것만 되돌린다.
 * 명성은 원본 그대로(돌려준 명성 없이), 맹세 보상 대신 옛 시련 보상의 모든 피해 몫 (E16 규칙: 세 칸의 짐 단계마다 +2%, 깬 단계 합 4부터 ×1.25)
 */
function indexBefore(raw: Record<string, unknown>, after: SaveData): number {
  const cleared = ((raw.trials as { cleared?: Record<string, number> } | undefined)?.cleared ?? {}) as Record<string, number>
  const total = Object.values(cleared).reduce((s, n) => s + n, 0)
  const damage = (cleared.fewSlots ?? 0) * 0.02 * (total >= 4 ? 1.25 : 1)
  return attackIndex(after, { renown: (raw.expedition as { renown?: number } | undefined)?.renown ?? 0, bonus: { damage } })
}

/** 견본 장비 (그때의 저장 모양): 무기·몸·장신구 */
const kit = [
  { uid: 'g:w1', part: 'weapon', base: '도끼', grade: 'rare', tier: 2, stats: [{ kind: 'damage', value: 0.09 }, { kind: 'bossDamage', value: 0.12 }], source: { id: 'flame', value: 2 } },
  { uid: 'g:b1', part: 'body', base: '사슬 갑옷', grade: 'good', tier: 2, stats: [{ kind: 'maxHp', value: 28 }], source: { id: 'stone', value: 1 } },
  { uid: 'g:t1', part: 'trinket', base: '돌 반지', grade: 'rare', tier: 1, stats: [{ kind: 'damage', value: 0.05 }, { kind: 'areaSize', value: 0.06 }], source: { id: 'hunt', value: 2 } },
]
const looks = { unlocked: ['adventurerTunic', 'shortSword', 'mjolnirHammer', 'thorCape'], choices: { cape: 'thorCape' } }

/**
 * 버전마다 실제 모양의 견본 (`git show <그 버전 커밋>:src/save/SaveData.ts`의 형식 그대로).
 * awakened: 옮긴 뒤 깨어 있어야 할 신, chapters·waypoints: 옮긴 뒤 같아야 할 장 진행·켠 성소,
 * goal: 지금 장과 다음 할 일 (`장:할 일:땅`, 엔딩 뒤 null). 지나온 할 일 「귀환」에 다시 막히지 않는지를 본다
 */
const SAMPLES: { name: string; raw: Record<string, unknown>; awakened: string[]; chapters?: { entered: string[]; bosses: string[] }; waypoints: string[]; goal?: string | null }[] = [
  {
    name: 'v1 (M6): 유물 칸 넷, 클래스 경험치, 신위',
    raw: { version: 1, slots: ['mjolnir', 'megingjord', null, 'jarngreipr'], bag: ['lokiMask'], ground: [{ id: 'gungnir', x: 2, z: 3 }], classes: { thor: { level: 2, xp: 120 } }, dropMisses: 4, divine: 0.6 },
    // 가방의 로키 유물로 로키가 열린다 (v4), 묠니르는 토르
    awakened: ['loki', 'thor'],
    waypoints: [],
  },
  {
    name: 'v9 (E21): 장비 칸 7, 위협 단계·편의·시련·균열, 장 진행 전',
    raw: {
      version: 9, slots: ['mjolnir', null, 'g:b1', null, null, 'g:t1', null], bag: ['lokiMask', 'g:w1'], gear: kit, stages: { mjolnir: 2 }, materials: { frostShard: 5, giantHeart: 1 }, ground: [],
      classes: { thor: { level: 3, xp: 800 }, loki: { level: 1, xp: 300 } }, chosen: ['thor'], dropMisses: 2, divine: 0.4, looks, body: { skin: 1, hair: 2, cloth: 0 },
      threat: { level: 1, unlocked: 1, reached: 1, cleared: {} }, conveniences: { counters: { pickups: 12, salvaged: 3 }, open: [], autoSalvage: true, visited: ['midgard', 'jotunheim'] },
      trials: { cleared: {}, best: {} }, rift: { best: 0, stars: 0, lit: [] }, ending: false, region: { id: 'jotunheim', x: 1, z: 2 }, scenes: ['opening'],
    },
    awakened: ['loki', 'thor'],
    // 장 진행은 있던 땅·찾은 성소와 거인 왕의 심장에서 짐작한다 (v10)
    chapters: { entered: ['jotunheim', 'midgard', 'utgard'], bosses: ['utgard'] },
    waypoints: ['midgard', 'jotunheim'],
  },
  {
    name: 'v12 (E237): 주신과 빌린 신, 수련, 옛 탭 id',
    raw: {
      version: 12, slots: ['g:w1', null, 'g:b1', null, null, 'g:t1', 'mjolnir'], bag: ['gungnir'], gear: kit, stages: {}, materials: { frostShard: 8 }, ground: [],
      classes: { thor: { level: 2, xp: 1200 }, odin: { level: 1, xp: 200 } }, chosen: ['thor', 'odin'], dropMisses: 0, divine: 0.2, looks, body: { skin: 0, hair: 0, cloth: 1 },
      threat: { level: 1, unlocked: 1, reached: 1, cleared: {} }, conveniences: { counters: { pickups: 30 }, open: [], autoSalvage: true, visited: ['midgard', 'jotunheim'] },
      trials: { cleared: {}, best: {} }, rift: { best: 0, stars: 0, lit: [] }, ending: false,
      chapters: { entered: ['village', 'midgard', 'jotunheim'], bosses: [] }, training: { xp: 2600, taken: ['awaken'] }, tabs: ['relics', 'training', 'map', 'classes'],
      region: { id: 'jotunheim', x: 0, z: 0 }, scenes: ['opening'],
    },
    awakened: ['odin', 'thor'],
    chapters: { entered: ['village', 'midgard', 'jotunheim'], bosses: [] },
    waypoints: ['midgard', 'jotunheim'],
    // 둘째 신을 깨워 귀환 1은 지나왔고(원정 2), 다음은 우트가르드
    goal: 'north:enter:utgard',
  },
  {
    name: 'v13 (E238): 신을 깨우는 조각',
    raw: {
      version: 13, slots: ['g:w1', null, 'g:b1', null, null, 'g:t1', null], bag: ['mjolnir'], gear: kit, stages: { mjolnir: 2 }, materials: { frostShard: 3, giantHeart: 1 }, ground: [],
      classes: { thor: { level: 3, xp: 400 }, loki: { level: 1, xp: 0 } }, chosen: ['thor', 'loki'], dropMisses: 1, divine: 0, looks, body: { skin: 2, hair: 1, cloth: 3 },
      threat: { level: 1, unlocked: 1, reached: 1, cleared: {} }, conveniences: { counters: { pickups: 44 }, open: [], autoSalvage: true, visited: ['midgard', 'jotunheim', 'utgard'] },
      trials: { cleared: {}, best: {} }, rift: { best: 0, stars: 0, lit: [] }, ending: false,
      chapters: { entered: ['village', 'midgard', 'jotunheim', 'utgard', 'olympus'], bosses: ['utgard'] }, training: { xp: 6100, taken: ['awaken', 'edge'] }, tabs: ['relics', 'training', 'map', 'sources', 'classes', 'looks'],
      awaken: { waking: 'odin', fragments: 1, hunt: 3 }, region: { id: 'olympus', x: 2, z: -3 }, scenes: ['opening'],
    },
    awakened: ['loki', 'thor'],
    chapters: { entered: ['village', 'midgard', 'jotunheim', 'utgard', 'olympus'], bosses: ['utgard'] },
    waypoints: ['midgard', 'jotunheim', 'utgard'],
    goal: 'greek:awaken:olympus',
  },
  {
    name: 'v15 (지금 Pages): 그리스 장 한가운데, 유물표·자리 셋',
    raw: {
      version: 15, slots: ['g:w1', null, 'g:b1', null, null, 'g:t1', null], bag: [], lit: ['mjolnir', 'gungnir', 'keraunos'], uniques: [], gear: kit, stages: { mjolnir: 2 }, materials: { prototype: 40, giantHeart: 1 }, ground: [],
      classes: { thor: { level: 3, xp: 900 }, odin: { level: 1, xp: 0 }, zeus: { level: 1, xp: 0 } }, pantheon: { hand: 'thor', heart: 'thor', breath: ['thor', 'odin', 'zeus'] }, dropMisses: 0, divine: 0.8, looks, body: { skin: 1, hair: 1, cloth: 1 },
      threat: { level: 1, unlocked: 1, reached: 1, cleared: {}, limitBroken: false }, conveniences: { counters: { pickups: 61 }, open: [], autoSalvage: true, visited: ['midgard', 'jotunheim', 'utgard', 'olympus', 'delphi'] },
      trials: { cleared: {}, best: {} }, rift: { best: 0, stars: 0, lit: [] }, ending: false,
      chapters: { entered: ['village', 'midgard', 'ironwood', 'jotunheim', 'utgard', 'olympus', 'delphi'], bosses: ['utgard'] }, training: { xp: 9000, taken: ['awaken', 'edge', 'body'] },
      tabs: ['relics', 'training', 'map', 'sources', 'classes', 'looks'], awaken: { waking: null, fragments: 0, hunt: 0 }, region: { id: 'delphi', x: 0, z: 4 }, scenes: ['opening', 'chapterGreek'],
    },
    awakened: ['odin', 'thor', 'zeus'],
    chapters: { entered: ['village', 'midgard', 'ironwood', 'jotunheim', 'utgard', 'olympus', 'delphi'], bosses: ['utgard'] },
    waypoints: ['midgard', 'jotunheim', 'utgard', 'olympus', 'delphi'],
    // 델포이까지 왔으니 다음은 그 성소의 귀환 (북유럽의 귀환 1은 지나와서 원정 2, 한 번 남음)
    goal: 'greek:return:delphi',
  },
  {
    name: 'v15 엔딩 뒤: 위협 단계·시련 셋·자동 줍기',
    raw: {
      version: 15, slots: ['g:w1', null, 'g:b1', null, null, 'g:t1', null], bag: [], lit: ['mjolnir', 'gungnir', 'keraunos', 'triaina'], uniques: ['ember'], gear: kit, stages: { mjolnir: 3 }, materials: { prototype: 120, giantHeart: 4 }, ground: [],
      classes: { thor: { level: 4, xp: 0 }, odin: { level: 2, xp: 0 }, zeus: { level: 1, xp: 0 }, poseidon: { level: 1, xp: 0 } }, pantheon: { hand: 'thor', heart: 'zeus', breath: ['thor', 'odin', 'poseidon'] }, dropMisses: 0, divine: 1, looks, body: { skin: 0, hair: 3, cloth: 2 },
      threat: { level: 4, unlocked: 5, reached: 4, cleared: { norse: 3 }, limitBroken: false }, conveniences: { counters: { pickups: 140, salvaged: 40 }, open: ['autoPickup', 'autoSalvage'], autoSalvage: true, visited: ['midgard', 'jotunheim', 'utgard', 'olympus', 'delphi', 'lycia'] },
      trials: { cleared: { noUltimate: 2, fewSlots: 3, glass: 1 }, best: { 'noUltimate:2': 70 } }, rift: { best: 0, stars: 0, lit: [] }, ending: true,
      chapters: { entered: ['village', 'midgard', 'jotunheim', 'utgard', 'olympus', 'delphi', 'lycia', 'sky'], bosses: ['utgard', 'lycia', 'sky'] }, training: { xp: 30000, taken: ['awaken', 'edge'] },
      tabs: ['relics', 'training', 'map', 'sources', 'classes', 'looks'], awaken: { waking: null, fragments: 0, hunt: 0 }, region: { id: 'village', x: 0, z: 0 }, scenes: ['opening', 'ending'],
    },
    awakened: ['odin', 'poseidon', 'thor', 'zeus'],
    chapters: { entered: ['village', 'midgard', 'jotunheim', 'utgard', 'olympus', 'delphi', 'lycia', 'sky'], bosses: ['utgard', 'lycia', 'sky'] },
    waypoints: ['midgard', 'jotunheim', 'utgard', 'olympus', 'delphi', 'lycia'],
    goal: null,
  },
  {
    name: 'v16 (E304): 원정 기록, 맹세 전',
    raw: {
      version: 16, slots: ['g:w1', null, 'g:b1', null, null, 'g:t1', null], bag: [], lit: ['mjolnir', 'lokiMask'], uniques: [], gear: kit, stages: {}, materials: { prototype: 20 }, ground: [],
      classes: { thor: { level: 2, xp: 0 }, loki: { level: 1, xp: 0 } }, pantheon: { hand: 'thor', heart: 'thor', breath: ['loki'] }, dropMisses: 0, divine: 0.5, looks, body: { skin: 1, hair: 0, cloth: 0 },
      threat: { level: 1, unlocked: 1, reached: 1, cleared: {}, limitBroken: false }, conveniences: { counters: { pickups: 18 }, open: [], autoSalvage: true, visited: ['midgard', 'jotunheim'] },
      trials: { cleared: {}, best: {} }, rift: { best: 0, stars: 0, lit: [] }, ending: false,
      chapters: { entered: ['village', 'midgard', 'jotunheim'], bosses: [] }, training: { xp: 3000, taken: ['awaken'] },
      expedition: { count: 2, renown: 30, flames: { flame: 1 }, best: [960], elapsed: 200, bosses: 0, deepest: 1, lastTaken: ['awaken'], bestXp: 2500, heirloom: ['g:w1'] },
      tabs: ['relics', 'training', 'map', 'sources'], awaken: { waking: 'loki', fragments: 0, hunt: 0 }, region: { id: 'jotunheim', x: 0, z: 0 }, scenes: ['opening'],
    },
    awakened: ['loki', 'thor'],
    chapters: { entered: ['village', 'midgard', 'jotunheim'], bosses: [] },
    waypoints: ['midgard', 'jotunheim'],
    goal: 'north:enter:utgard',
  },
]

describe('저장 v17: 실제 모양의 옛 저장 견본 (v1·v9·v12·v13·v15·v16 → v17, CYCLE.md 9장)', () => {
  /** 장 진행을 그 저장의 사실로 다시 판정한다 (없어진 할 일은 사실로) */
  const progressOf = (data: SaveData) => {
    const chapters = new ChapterProgress({
      awakened: (realm) => Object.entries(data.classes).filter(([g, r]) => (r?.level ?? 0) >= 1 && godDef(g).realm === realm).length,
      forged: () => Object.values(data.stages).filter((n) => (n ?? 1) >= 2).length,
      returns: () => data.expedition.count - 1,
    }, () => data.ending)
    chapters.load(data.chapters)
    return chapters
  }

  for (const s of SAMPLES) {
    describe(s.name, () => {
      const data = parseSave(JSON.stringify(s.raw))

      it('(1) 검사를 통과하고, 다시 불러와도 그대로다 (한 번만 옮긴다)', () => {
        expect(data).not.toBeNull()
        expect(data!.version).toBe(SAVE_VERSION)
        expect(parseSave(JSON.stringify(data))).toEqual(data)
        for (const record of Object.values(data!.classes)) expect(Object.keys(record ?? {})).toEqual(['level'])
      })

      it('(2) 공격 지수가 옮기기 전의 0.9~1.1배', () => {
        const ratio = attackIndex(data!) / indexBefore(s.raw, data!)
        expect(ratio).toBeGreaterThanOrEqual(0.9)
        expect(ratio).toBeLessThanOrEqual(1.1)
      })

      it('(3) 깨운 신·장 진행·웨이포인트가 같다', () => {
        const awakened = Object.entries(data!.classes).filter(([, r]) => (r?.level ?? 0) >= 1).map(([g]) => g)
        expect(awakened.sort()).toEqual([...s.awakened].sort())
        if (s.chapters) expect({ entered: [...data!.chapters.entered].sort(), bosses: [...data!.chapters.bosses].sort() }).toEqual({ entered: [...s.chapters.entered].sort(), bosses: [...s.chapters.bosses].sort() })
        expect(data!.waypoints).toEqual(s.waypoints)
        // 지금 장과 다음 할 일: 지나온 할 일 「귀환」에 다시 막히지 않는다 (원정 번호 짐작)
        if (s.goal !== undefined) {
          const chapters = progressOf(data!)
          const goal = chapters.goal
          expect(goal ? `${chapters.chapter?.id}:${goal.kind}:${goal.region}` : null).toBe(s.goal)
        }
      })
    })
  }

  it('그리스 장 한가운데 v15 저장: 지나온 북유럽의 귀환 1은 찼고(원정 2), 델포이의 귀환 2만 새 순환대로 한 번 남는다', () => {
    const data = parseSave(JSON.stringify(SAMPLES[4]!.raw))!
    expect(data.expedition.count).toBe(2)
    expect(data.expedition.renown).toBe(0)
    const chapters = progressOf(data)
    expect(chapters.isOpen('lycia')).toBe(false)
    data.expedition.count += 1
    expect(progressOf(data).isOpen('lycia')).toBe(true)
  })

  it('엔딩 뒤 저장: 깊이·가 본 곳·자동 줍기가 남고, 시련은 맹세로, 연 탭은 신 탭으로', () => {
    const data = parseSave(JSON.stringify(SAMPLES[5]!.raw))!
    expect(data.depth).toEqual({ level: 4, reached: 4, limitBroken: false })
    expect(data.automation.counters.pickups).toBe(140)
    expect(automationAt(data.expedition.count - 1, data.ending, data.automation.counters.pickups ?? 0)).toMatchObject({ autoPickup: true, retake: true, autoMerge: { good: true, rare: true } })
    expect(data.oaths.kept.sort()).toEqual(['alone', 'glass', 'silence'])
    expect(data.tabs).toEqual(['relics', 'training', 'gods', 'map', 'sources'])
    // 세 칸의 짐 3단계(+7.5%)는 정복 둘에서 명성 0 (반올림): 모자란 몫은 공격 지수 0.9~1.1 안
    expect(data.expedition.renown).toBe(0)
  })

  it('세 칸의 짐을 5단계까지 깬 엔딩 뒤 저장: 잃은 모든 피해 +12.5%를 명성 1로 메워 공격 지수 0.9~1.1, 두 번 불러와도 한 번만', () => {
    const raw = { ...SAMPLES[5]!.raw, trials: { cleared: { fewSlots: 5, noUltimate: 5, glass: 5 }, best: {} } }
    const data = parseSave(JSON.stringify(raw))!
    expect(data.expedition.renown).toBe(1)
    const ratio = attackIndex(data) / indexBefore(raw, data)
    expect(ratio).toBeGreaterThanOrEqual(0.9)
    expect(ratio).toBeLessThanOrEqual(1.1)
    expect(parseSave(JSON.stringify(data))!.expedition.renown).toBe(1)
  })
})

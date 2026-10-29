import { describe, expect, it } from 'vitest'

import { parseConveniences } from '../src/progress/Conveniences'
import { parseThreat } from '../src/progress/Threat'
import { parseTrials } from '../src/progress/Trials'
import { parseRift } from '../src/progress/Rift'
import { STEP_TABS } from '../src/progress/Tabs'
import { parseSave, SAVE_VERSION, type SaveData } from '../src/save/SaveData'
import { HUNT_KILLS } from '../src/data/awaken'

const sample: SaveData = {
  version: SAVE_VERSION,
  slots: ['mjolnir', null, null, null, null, null, null],
  bag: [],
  ground: [{ id: 'lokiMask', x: 3, z: -4 }],
  classes: { thor: { level: 2, xp: 40 } },
  chosen: ['thor'],
  gear: [],
  stages: {},
  materials: {},
  dropMisses: 3,
  divine: 0.5,
  looks: {
    unlocked: ['adventurerHood', 'adventurerTunic', 'adventurerSleeves', 'adventurerBoots', 'shortSword', 'mjolnirHammer', 'thorCape'],
    choices: { weapon: 'shortSword', cape: null },
  },
  body: { skin: 2, hair: 1, cloth: 3 },
  threat: parseThreat({ level: 2, unlocked: 3, reached: 2, mastery: { flame: 2 }, battle: 40 }),
  conveniences: parseConveniences({ counters: { pickups: 5 }, open: ['autoPickup'] }),
  trials: parseTrials({ cleared: { glass: 2, slow: 9 }, best: { 'glass:2': 71.3, 'nope:1': 5 } }),
  rift: parseRift({ best: 12, stars: 3, lit: ['thor', 'odin', 'nobody'] }),
  ending: true,
  chapters: { entered: ['village', 'midgard', 'olympus'], bosses: ['utgard'] },
  training: { xp: 1500, taken: ['awaken', 'edge'] },
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
    const { chosen: _, ...v3 } = { ...sample, version: 3, slots: ['mjolnir', 'megingjord', null, 'jarngreipr'], bag: ['lokiMask'] }
    const data = parseSave(JSON.stringify(v3))!
    expect(data.version).toBe(SAVE_VERSION)
    // 토르는 원래 2단계 그대로, 가방의 로키 유물로 로키가 1단계로 열린다
    expect(data.classes).toEqual({ thor: { level: 2, xp: 40 }, loki: { level: 1, xp: 0 } })
    expect(data.chosen).toEqual(['thor'])
    // 유물이 둘뿐이면(발현 전) 고른 신화 없이 열리기만 한다
    const two = parseSave(JSON.stringify({ ...v3, slots: ['mjolnir', 'megingjord', null, null], classes: {} }))!
    expect(two.classes.thor).toEqual({ level: 1, xp: 0 })
    expect(two.chosen).toEqual([])
    // 옛 순환 기록이 있어도(서리 조각·심장으로 돌려받음) 그 재료를 유물로 세다 멈추지 않는다
    const cycled = parseSave(JSON.stringify({ ...v3, cycle: { essence: { flame: 250 }, ash: 7 } }))!
    expect(cycled.classes.thor).toEqual({ level: 2, xp: 40 })
    expect(cycled.materials).toMatchObject({ frostShard: 2, giantHeart: 2 })
  })

  it('읽지 못하는 저장(장비 id가 숫자 등)은 게임을 멈추지 않는다', () => {
    expect(() => parseSave(JSON.stringify({ ...sample, gear: [{ uid: 5, part: 'head', grade: 'rare', base: '철 투구' }] }))).not.toThrow()
  })

  it('고른 신화는 열린 신화만, 칸 수만큼만 남긴다', () => {
    expect(parseSave(JSON.stringify({ ...sample, chosen: ['zeus'] }))?.chosen).toEqual([])
    expect(parseSave(JSON.stringify({ ...sample, chosen: ['thor', 'thor', 'nobody'] }))?.chosen).toEqual(['thor'])
    // 신위 칸 (E237, v12): 주신 다음에 빌린 신, 넷까지
    const many = { thor: { level: 2, xp: 0 }, loki: { level: 1, xp: 0 }, odin: { level: 1, xp: 0 }, freyr: { level: 1, xp: 0 }, zeus: { level: 1, xp: 0 } }
    expect(parseSave(JSON.stringify({ ...sample, classes: many, chosen: ['thor', 'loki', 'odin'] }))?.chosen).toEqual(['thor', 'loki', 'odin'])
    expect(parseSave(JSON.stringify({ ...sample, classes: many, chosen: ['thor', 'loki', 'odin', 'freyr', 'zeus'] }))?.chosen).toHaveLength(4)
    // 개방 단계 0(숙련만 쌓인 신화)도 그대로 남는다
    expect(parseSave(JSON.stringify({ ...sample, classes: { ...sample.classes, zeus: { level: 0, xp: 120 } } }))?.classes.zeus).toEqual({ level: 0, xp: 120 })
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
        divine: 3,
      }),
    )
    expect(data?.slots).toEqual(['mjolnir', null, null, null, null, null, null])
    expect(data?.ground).toEqual([])
    expect(data?.classes).toEqual({ thor: { level: 4, xp: 0 } })
    expect(data?.divine).toBe(1)
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
    // 신화의 유물(묠니르)은 칸에, 재료가 된 유물(메긴교르드·야른그레이프르)은 재료로 (E13-06)
    expect(data?.slots).toEqual(['mjolnir', null, null, null, null, null, null])
    expect(data?.materials).toEqual({ megingjord: 1, jarngreipr: 1 })
    expect(data?.looks.unlocked).toEqual(expect.arrayContaining(['shortSword', 'mjolnirHammer', 'megingjordBelt', 'ironGauntlets', 'thorHelm', 'thorCape']))
    expect(data?.looks.unlocked).not.toContain('lokiMaskFace')
    expect(data?.looks.choices).toEqual({})
  })

  it('v6: 옛 순환 성장은 재료로 바꿔 주고, 위협 단계는 1단계에서 시작한다 (E14-06)', () => {
    const { threat: _t, conveniences: _c, ...rest } = sample
    const v5 = { ...rest, version: 5, materials: { frostShard: 2 }, cycle: { essence: { flame: 250, hunt: 80.5, wind: 0, stone: 70 }, ash: 7 } }
    const data = parseSave(JSON.stringify(v5))
    expect(data?.version).toBe(SAVE_VERSION)
    // 결정 400.5 → 서리 조각 4, 재 7 → 거인 왕의 심장 2
    expect(data?.materials).toEqual({ frostShard: 6, giantHeart: 2 })
    expect(data?.threat).toEqual({ level: 1, unlocked: 1, reached: 1, cleared: {}, limitBroken: false })
    expect(data?.conveniences.open).toEqual([])
    // 옛 별자리는 v5 저장에 없으면 0
    // 위협 단계는 열린 단계를 넘지 않는다
    expect(parseSave(JSON.stringify({ ...sample, threat: { level: 9, unlocked: 3, reached: 5 } }))?.threat).toMatchObject({ level: 3, unlocked: 3, reached: 3 })
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
    expect(data?.materials).toEqual({ frostShard: 12, olympusMarble: 3, giantHeart: 1 })
  })

  it('물려받은 수치·원천 숙련·전투 경험은 버린다', () => {
    const data = parseSave(v8({ inherited: { mjolnir: { kind: 'damage', value: 0.05 } }, threat: { level: 1, unlocked: 1, reached: 1, mastery: { flame: 3 }, battle: 200 } }))
    expect(data && 'inherited' in data).toBe(false)
    expect(data?.threat).toEqual({ level: 1, unlocked: 1, reached: 1, cleared: {}, limitBroken: false })
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
  const none = { threat: { level: 1, unlocked: 1, reached: 1 }, materials: {}, slots: [null, null, null, null, null, null, null], ground: [] }

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

  it('옛 저장(탭 기록이 없던 때)은 탭을 모두 연 것으로 친다', () => {
    expect(parseSave(JSON.stringify({ ...sample, version: 10, tabs: undefined }))?.tabs).toEqual([...STEP_TABS])
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
    expect(parseSave(JSON.stringify({ ...sample, awaken: { waking: 'zeus', fragments: 1, hunt: 2 } }))?.awaken).toEqual(empty)
    expect(parseSave(JSON.stringify({ ...sample, awaken: { waking: 'thor', fragments: 1, hunt: 2 } }))?.awaken).toEqual(empty)
  })
})

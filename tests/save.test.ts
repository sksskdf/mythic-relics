import { describe, expect, it } from 'vitest'

import { parseCycle } from '../src/progress/Cycle'
import { parseSave, SAVE_VERSION, type SaveData } from '../src/save/SaveData'

const sample: SaveData = {
  version: SAVE_VERSION,
  slots: ['mjolnir', 'megingjord', null, 'jarngreipr'],
  bag: [],
  ground: [{ id: 'lokiMask', x: 3, z: -4 }],
  classes: { thor: { level: 2, xp: 40 } },
  chosen: ['thor'],
  dropMisses: 3,
  divine: 0.5,
  looks: {
    unlocked: ['adventurerHood', 'adventurerTunic', 'adventurerSleeves', 'adventurerBoots', 'shortSword', 'mjolnirHammer', 'thorCape'],
    choices: { weapon: 'shortSword', cape: null },
  },
  body: { skin: 2, hair: 1, cloth: 3 },
  cycle: parseCycle({ essence: { flame: 12.5 }, training: { wind: 2 }, rebirths: 1 }),
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

  it('깨졌거나 버전이 다르면 새로 시작한다', () => {
    expect(parseSave(null)).toBeNull()
    expect(parseSave('{깨진')).toBeNull()
    expect(parseSave(JSON.stringify({ ...sample, version: 99 }))).toBeNull()
  })

  it('모르는 유물, 겹치는 유물, 범위 밖 값은 바로잡는다', () => {
    const data = parseSave(
      JSON.stringify({
        ...sample,
        slots: ['mjolnir', 'mjolnir', 'excalibur', null],
        ground: [{ id: 'mjolnir', x: 1, z: 1 }, { id: 'lokiMask', x: 1, z: 'x' }],
        classes: { thor: { level: 9, xp: -5 }, nobody: { level: 2, xp: 0 } },
        divine: 3,
      }),
    )
    expect(data?.slots).toEqual(['mjolnir', null, null, null])
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
    const data = parseSave(JSON.stringify({ ...rest, version: 1 }))
    expect(data?.version).toBe(SAVE_VERSION)
    expect(data?.slots).toEqual(sample.slots)
    expect(data?.looks.unlocked).toEqual(expect.arrayContaining(['shortSword', 'mjolnirHammer', 'megingjordBelt', 'ironGauntlets', 'thorHelm', 'thorCape']))
    expect(data?.looks.unlocked).not.toContain('lokiMaskFace')
    expect(data?.looks.choices).toEqual({})
  })

  it('기본 모습은 범위 밖이거나 없으면 기본값', () => {
    const odd = parseSave(JSON.stringify({ ...sample, body: { skin: 9, hair: -1, cloth: 'red' } }))
    expect(odd?.body).toEqual({ skin: 0, hair: 0, cloth: 0 })
    const { body: _body, ...old } = sample
    expect(parseSave(JSON.stringify(old))?.body).toEqual({ skin: 0, hair: 0, cloth: 0 })
  })
})

import { describe, expect, it } from 'vitest'

import { parseSave, SAVE_VERSION, type SaveData } from '../src/save/SaveData'

const sample: SaveData = {
  version: SAVE_VERSION,
  slots: ['mjolnir', 'megingjord', null, 'jarngreipr'],
  bag: [],
  ground: [{ id: 'lokiMask', x: 3, z: -4 }],
  classes: { thor: { level: 2, xp: 40 } },
  dropMisses: 3,
  divine: 0.5,
}

describe('저장 데이터', () => {
  it('저장한 그대로 다시 읽힌다', () => {
    expect(parseSave(JSON.stringify(sample))).toEqual(sample)
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
        classes: { thor: { level: 9, xp: -5 }, zeus: { level: 2, xp: 0 } },
        divine: 3,
      }),
    )
    expect(data?.slots).toEqual(['mjolnir', null, null, null])
    expect(data?.ground).toEqual([])
    expect(data?.classes).toEqual({ thor: { level: 4, xp: 0 } })
    expect(data?.divine).toBe(1)
  })
})

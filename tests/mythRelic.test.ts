import { describe, expect, it } from 'vitest'

import classes from '../src/data/classes.json'
import enemies from '../src/data/enemies.json'
import gods from '../src/data/gods.json'
import relics from '../src/data/relics.json'
import { parseGameData } from '../src/data/schema'
import { MATERIAL_RELICS, MYTH_RELICS, relicMyth, relicPart, relicSource, stageName } from '../src/gear/mythRelic'
import { GODS } from '../src/relics/data'
import { LOOK_MODELS } from '../src/voxel/models/looks'
import { RELIC_MODELS } from '../src/voxel/models/relics'

const MODELS = [...Object.keys(RELIC_MODELS), ...Object.keys(LOOK_MODELS)]
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const broken = (edit: (g: any, r: any) => void) => () => {
  const g = clone(gods)
  const r = clone(relics)
  edit(g, r)
  return parseGameData({ gods: g, relics: r, enemies: clone(enemies), classes: clone(classes) }, MODELS)
}

describe('신화의 유물 (E13-03)', () => {
  it('신화마다 유물 하나(21개), 나머지 41개는 재료', () => {
    expect(MYTH_RELICS.length).toBe(Object.keys(GODS).length)
    expect(MATERIAL_RELICS.length).toBe(Object.keys(relics).length - MYTH_RELICS.length)
    for (const god of Object.keys(GODS)) expect(relicMyth(GODS[god]!.relic)).toBe(god)
  })

  it('유물은 외형으로 부위를 차지하고(묠니르는 무기, 로키의 가면은 머리), 단계마다 원천이 커진다', () => {
    expect(relicPart('mjolnir')).toBe('weapon')
    expect(relicPart('lokiMask')).toBe('head')
    expect(relicPart('gullinbursti')).toBe('trinket')
    expect(relicSource('mjolnir', 1)).toEqual({ id: 'flame', value: 2 })
    expect(relicSource('mjolnir', 4)).toEqual({ id: 'flame', value: 5 })
  })

  it('단계 이름: 데이터에 있으면 그것, 없으면 지어 준다', () => {
    expect([1, 2, 3, 4].map((s) => stageName('mjolnir', s))).toEqual(['묠니르', '각성한 묠니르', '폭풍의 묠니르', '거인을 부수는 묠니르'])
    expect(stageName('gungnir', 2)).toContain('궁니르')
  })

  it('신화의 유물이 그 신 것이 아니거나 겹치면 데이터 검사에서 실패한다', () => {
    expect(broken((g) => (g.thor.relic = 'lokiMask'))).toThrow(/thor의 유물이 아닙니다/)
    expect(broken((g) => (g.thor.relic = 'excalibur'))).toThrow(/없는 유물/)
    expect(broken((_g, r) => (r.megingjord.stages = ['가', '나', '다']))).toThrow(/신화의 유물에만/)
  })
})

import { describe, expect, it } from 'vitest'

import { DATA } from '../src/data'
import classes from '../src/data/classes.json'
import enemies from '../src/data/enemies.json'
import gods from '../src/data/gods.json'
import relics from '../src/data/relics.json'
import { DataError, parseGameData } from '../src/data/schema'
import { LOOK_MODELS } from '../src/voxel/models/looks'
import { RELIC_MODELS } from '../src/voxel/models/relics'

const MODELS = [...Object.keys(RELIC_MODELS), ...Object.keys(LOOK_MODELS)]
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

function broken(edit: (g: any) => void): () => unknown {
  const g = clone(gods)
  edit(g)
  return () => parseGameData({ gods: g, relics: clone(relics), enemies: clone(enemies), classes: clone(classes) }, MODELS)
}

describe('신화 수치 (E12-01, 숨 칸 3단계에서 다시 쓸 자리)', () => {
  const all = Object.values(DATA.gods)

  it('21신화 모두 수치를 갖고, 메아리는 없다 (E21-02)', () => {
    expect(all.length).toBe(21)
    for (const god of all) {
      expect(god.always.stat.value.length, god.id).toBe(2)
      expect(Object.keys(god.always), god.id).toEqual(['stat'])
    }
  })

  it('수치는 4단계가 3단계의 두 배쯤이다', () => {
    for (const god of all) {
      const [a, b] = god.always.stat.value
      expect(b / a, god.id).toBeGreaterThanOrEqual(1.8)
      expect(b / a, god.id).toBeLessThanOrEqual(2.1)
    }
  })

  it('잘못 적으면 어느 값이 왜 틀렸는지 알려 준다', () => {
    expect(broken((g) => delete g.thor.always)).toThrow(DataError)
    expect(broken((g) => (g.zeus.always.echo = { part: 'skyStrike' }))).toThrow(DataError)
    expect(broken((g) => (g.susanoo.always.stat.value = [0.03, 0.06]))).toThrow(/음수/)
    expect(broken((g) => (g.loki.always.stat.value = [3, 6]))).toThrow(/1보다 작게/)
    expect(broken((g) => (g.loki.always.stat.kind = 'luck'))).toThrow(DataError)
  })
})

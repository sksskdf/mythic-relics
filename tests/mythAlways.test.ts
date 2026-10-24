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

/** 메아리가 본뜬 패시브 부품의 1단계 피해 */
function partDamage(passive: Record<string, any>, part: string): number {
  const p = passive[part]
  if (part === 'curse' || part === 'trail') return p.dps[0]
  return Array.isArray(p.damage) ? p.damage[0] : p.damage
}

describe('상시 효과 (E12-01)', () => {
  const all = Object.values(DATA.gods)

  it('21신화 모두 메아리와 수치를 갖는다', () => {
    expect(all.length).toBe(21)
    for (const god of all) {
      expect(god.always.echo.every.length, god.id).toBe(2)
      expect(god.always.stat.value.length, god.id).toBe(2)
    }
  })

  it('메아리는 그 패시브 부품 1단계 피해의 절반쯤이다', () => {
    for (const god of all) {
      const ratio = god.always.echo.damage / partDamage(god.passive as Record<string, any>, god.always.echo.part)
      expect(ratio, god.id).toBeGreaterThanOrEqual(0.3)
      expect(ratio, god.id).toBeLessThanOrEqual(0.7)
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
    expect(broken((g) => (g.zeus.always.echo.part = 'orbit'))).toThrow(/패시브에 없는 부품/)
    expect(broken((g) => (g.zeus.always.echo.every = [6, 8]))).toThrow(/자주 터져야/)
    expect(broken((g) => (g.thor.always.echo.every = [4.5, 3]))).toThrow(/정수/)
    expect(broken((g) => (g.susanoo.always.echo.every = [0.2, 1.5]))).toThrow(/0과 1 사이/)
    expect(broken((g) => (g.susanoo.always.stat.value = [0.03, 0.06]))).toThrow(/음수/)
    expect(broken((g) => (g.loki.always.stat.value = [3, 6]))).toThrow(/1보다 작게/)
    expect(broken((g) => (g.loki.always.stat.kind = 'luck'))).toThrow(DataError)
  })
})

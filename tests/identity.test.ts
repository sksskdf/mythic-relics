import { describe, expect, it } from 'vitest'

import { STYLES, styleSignature } from '../src/combat/styles'
import { DATA } from '../src/data'
import { ACTION_LOOKS } from '../src/data/schema'
import { BASE_OUTFIT, lookDef } from '../src/looks/catalog'
import { LOOK_MODELS } from '../src/voxel/models/looks'

/** 신화 개성 (E18, ART.md 9장): 무기 동작·유물 행동 모습·궁극기 모습이 신화끼리 겹치지 않는다 */
const myths = Object.values(DATA.gods)
const relicOf = (god: (typeof myths)[number]) => DATA.relics[god.relic]!

function duplicates(keys: readonly [string, string][]): string[] {
  const seen = new Map<string, string>()
  const out: string[] = []
  for (const [god, key] of keys) {
    const before = seen.get(key)
    if (before) out.push(`${before}·${god} (${key})`)
    else seen.set(key, god)
  }
  return out
}

describe('신화 개성 (E18): 겹침', () => {
  it('무기 동작이 신화마다 다르다 (판정 모양·사거리·빠르기 묶음도)', () => {
    expect(duplicates(myths.map((g) => [g.id, g.attack]))).toEqual([])
    expect(duplicates(myths.map((g) => [g.id, styleSignature(g.attack)]))).toEqual([])
  })

  it('신화의 유물은 행동 종류+모습이 모두 다르다 (같은 것을 던지지 않는다)', () => {
    expect(duplicates(myths.map((g) => [g.id, `${relicOf(g).trigger.action.kind}:${relicOf(g).trigger.action.look}`]))).toEqual([])
  })

  it('궁극기는 종류+모양이 모두 다르다', () => {
    expect(duplicates(myths.map((g) => [g.id, `${g.ultimate.kind}:${g.ultimate.style ?? ''}`]))).toEqual([])
  })

  it('같은 신화권 안에서는 유물 행동 종류도 셋 넘게 겹치지 않는다 (모습만 바꿔 같은 동작을 몰아 쓰지 않게)', () => {
    const realms = new Set(myths.map((g) => g.realm))
    for (const realm of realms) {
      const kinds = myths.filter((g) => g.realm === realm).map((g) => relicOf(g).trigger.action.kind)
      for (const kind of new Set(kinds)) expect(kinds.filter((k) => k === kind).length, `${realm} ${kind}`).toBeLessThanOrEqual(3)
    }
  })

  it('원거리 무기 동작은 날아가는 모습이 서로 다르다 (활·벼락·고리·바위)', () => {
    const ranged = myths.filter((g) => STYLES[g.attack].combo.every((c) => c.shape === 'shot'))
    expect(ranged.length).toBeGreaterThanOrEqual(3)
    expect(duplicates(ranged.map((g) => [g.id, STYLES[g.attack].shot ?? 'streak']))).toEqual([])
  })

  it('손에 든 무기는 신화마다 실루엣이 다르다 (색만 바꾼 같은 모양은 같은 것으로 친다)', () => {
    const weaponOf = (g: (typeof myths)[number]): string => {
      const relic = relicOf(g)
      return g.looks.weapon ?? (lookDef(relic.look).slot === 'weapon' ? relic.look : BASE_OUTFIT.weapon!)
    }
    const silhouette = (id: string): string => {
      const grid = LOOK_MODELS[id]!()
      return `${grid.sizeX}x${grid.sizeY}x${grid.sizeZ}:${Array.from(grid.cells, (c) => (c ? 1 : 0)).join('')}`
    }
    // 빈손(기본 짧은 검)으로 싸우는 신화는 없다
    for (const g of myths) expect(weaponOf(g), g.id).not.toBe(BASE_OUTFIT.weapon)
    expect(duplicates(myths.map((g) => [g.id, silhouette(weaponOf(g))]))).toEqual([])
  })

  it('행동 모습 목록에 없는 모습은 데이터에 없다 (스키마가 막는다)', () => {
    for (const relic of Object.values(DATA.relics)) {
      const looks: readonly string[] = ACTION_LOOKS[relic.trigger.action.kind]
      expect(looks, relic.id).toContain(relic.trigger.action.look)
    }
  })
})

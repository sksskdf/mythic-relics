import { describe, expect, it } from 'vitest'

import { MATERIALS, parseMaterials, realmMaterial, rollMaterials } from '../src/gear/materials'
import materialsJson from '../src/data/materials.json'
import { createRng } from '../src/world/rng'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

describe('재료 (E13-04 → E21-04)', () => {
  it('신화권 재료 5와 보스 재료 5, 둘뿐이다', () => {
    const kinds = Object.values(MATERIALS).map((m) => m.kind)
    expect(kinds.filter((k) => k === 'realm').length).toBe(5)
    expect(kinds.filter((k) => k === 'boss').length).toBe(5)
    expect(kinds.length).toBe(10)
  })

  it('잘못 적으면 데이터 검사에서 실패한다', () => {
    const broken = (edit: (d: any) => void) => () => {
      const d = clone(materialsJson)
      edit(d)
      return parseMaterials(d)
    }
    expect(broken((d) => (d.megingjord = { name: '가', kind: 'realm', realm: 'norse' }))).toThrow(/유물 id와 겹칩니다/)
    expect(broken((d) => delete d.frostShard)).toThrow(/norse 신화권 재료/)
    expect(broken((d) => (d.giantHeart.boss = 'nobody'))).toThrow(/없는 보스/)
    expect(broken((d) => (d.thunderShard = { name: '천둥 파편', kind: 'myth' }))).toThrow(/realm·boss/)
  })

  it('졸개는 가끔 신화권 재료, 정예는 더, 보스는 신화권 재료와 보스 재료를 늘 준다', () => {
    const rng = createRng(5)
    let common = 0
    for (let i = 0; i < 4000; i++) for (const m of rollMaterials(rng, { realm: 'norse', elite: false })) if (m.id === realmMaterial('norse')) common += m.count
    expect(common / 4000).toBeGreaterThan(0.2)
    expect(common / 4000).toBeLessThan(0.3)
    const elite = rollMaterials(createRng(1), { realm: 'norse', elite: true })
    expect(elite.find((m) => m.id === 'frostShard')!.count).toBeGreaterThanOrEqual(2)
    const boss = rollMaterials(createRng(2), { realm: 'norse', elite: false, boss: 'giantKing' })
    expect(boss.map((m) => m.id).sort()).toEqual(['frostShard', 'giantHeart'])
  })
})

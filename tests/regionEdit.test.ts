import { describe, expect, it } from 'vitest'

import { parseRegions, RAW_REGIONS } from '../src/data/regions'
import { EDIT_TOOLS, eraseNear, itemName, moveItem, nearestItem, place, type RegionDraft, TOOL_NAMES } from '../src/dev/regionEdit'

/** 지도 편집기의 편집 동작 (E7-01) */

const draft = (): RegionDraft => JSON.parse(JSON.stringify(RAW_REGIONS.midgard)) as RegionDraft
const options = { campCount: 4, exitTo: '', random: () => 0.5 }

describe('지도 편집', () => {
  it('도구마다 이름이 있다', () => {
    for (const tool of EDIT_TOOLS) expect(TOOL_NAMES[tool].length).toBeGreaterThan(0)
  })

  it('소품 도구는 누른 곳에 그 소품을 놓고, 크기·회전은 난수로 정한다', () => {
    const d = draft()
    const before = d.props.length
    expect(place(d, 'runestone', 12.3456, -7.891, options)).toBe(true)
    expect(d.props).toHaveLength(before + 1)
    expect(d.props.at(-1)).toEqual({ kind: 'runestone', x: 12.35, z: -7.89, size: 1.1, rotation: 3.14 })
  })

  it('무리는 고른 졸개 수로, 연못은 반지름 3으로 더한다', () => {
    const d = draft()
    place(d, 'camp', 20, 20, options)
    place(d, 'pond', -20, 20, options)
    expect(d.camps.at(-1)).toEqual({ x: 20, z: 20, count: 4 })
    expect(d.ponds.at(-1)).toEqual({ x: -20, z: 20, radius: 3 })
  })

  it('시작점·보스·성소는 하나뿐이라 누르면 그리로 옮긴다 (성소 반지름은 그대로)', () => {
    const d = draft()
    const radius = d.sanctuary!.radius
    place(d, 'boss', 10, -30, options)
    place(d, 'sanctuary', -10, 25, options)
    place(d, 'spawn', 2, 3, options)
    expect(d.boss).toEqual({ x: 10, z: -30 })
    expect(d.sanctuary).toEqual({ x: -10, z: 25, radius })
    expect(d.spawn).toEqual({ x: 2, z: 3 })
  })

  it('출구는 이어질 지역을 골라야 놓인다', () => {
    const d = draft()
    expect(place(d, 'exit', 0, 30, options)).toBe(false)
    expect(place(d, 'exit', 0, 30, { ...options, exitTo: 'olympus' })).toBe(true)
    expect(d.exits.at(-1)).toEqual({ x: 0, z: 30, to: 'olympus' })
  })

  it('지우기는 2m 안의 가장 가까운 것을 지우고, 시작점·성소·보스는 지우지 않는다', () => {
    const d = draft()
    const target = d.props[5]!
    const before = d.props.length
    expect(eraseNear(d, target.x + 0.3, target.z, 2)).toBe(true)
    expect(d.props).toHaveLength(before - 1)
    expect(d.props).not.toContain(target)
    expect(eraseNear(d, d.spawn.x, d.spawn.z, 0.5)).toBe(false)
    expect(eraseNear(d, 999, 999)).toBe(false)
  })

  it('옮기기: 가장 가까운 것을 골라 새 자리로 옮긴다. 소품보다 표지(무리·보스)를 먼저 고른다', () => {
    const d = draft()
    const camp = d.camps[0]!
    d.props.push({ kind: 'rock', x: camp.x + 0.6, z: camp.z, size: 1, rotation: 0 })
    const ref = nearestItem(d, camp.x + 0.4, camp.z)!
    expect(ref).toEqual({ list: 'camps', index: 0 })
    expect(itemName(d, ref)).toBe('졸개 무리')
    moveItem(d, ref, 25.555, 26)
    expect(d.camps[0]).toMatchObject({ x: 25.56, z: 26, count: camp.count })
  })

  it('편집한 지역도 지역 검사를 거친다: 시작점 옆에 소품을 놓으면 검사에서 걸린다', () => {
    const d = draft()
    place(d, 'pine', d.spawn.x + 1, d.spawn.z, options)
    expect(() => parseRegions({ ...RAW_REGIONS, midgard: d })).toThrow(/시작점/)
    const ok = draft()
    place(ok, 'pine', 20, 20, options)
    expect(parseRegions({ ...RAW_REGIONS, midgard: ok }).midgard!.props).toHaveLength(ok.props.length)
  })
})

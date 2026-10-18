import { describe, expect, it } from 'vitest'

import { DataError } from '../src/data/check'
import regionsText from '../src/data/regions.json?raw'
import { formatRegions, parseRegions, RAW_REGIONS, REGIONS, SPAWN_CLEAR } from '../src/data/regions'
import { GRUNT, KING } from '../src/enemies/Giant'
import { Encounter } from '../src/game/Encounter'
import { UtgardLegend } from '../src/game/Legend'
import { collidersFor } from '../src/world/regionMap'
import { heightAt, setPonds } from '../src/world/terrain'
import { NavGrid } from '../src/world/navGrid'

/**
 * 지역 데이터 (E7-01). regions.json의 지역 전부를 돈다: 지역을 더하면 같은 검사가 저절로 붙는다.
 */

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const regions = Object.values(REGIONS)

describe.each(regions.map((r) => [r.id, r] as const))('지역 %s', (_id, region) => {
  const colliders = region.props.flatMap(collidersFor)
  const heroNav = new NavGrid(region.halfExtent, 0.5, colliders, 0.4)
  const kingNav = new NavGrid(region.halfExtent, 0.5, colliders, KING.radius)

  it('시작점이 막혀 있지 않다', () => {
    expect(heroNav.isBlocked(region.spawn)).toBe(false)
  })

  it('시작점에서 성소·무리·보스·출구까지 길이 있다 (길이 막히지 않음)', () => {
    const goals = [
      ['성소', region.sanctuary],
      ['보스', region.boss],
      ...region.camps.map((c, i) => [`무리 ${i}`, c] as const),
      ...region.exits.map((e) => [`출구 → ${e.to}`, e] as const),
    ] as const
    for (const [name, goal] of goals) {
      const path = heroNav.findPath(region.spawn, goal)
      expect(path.length, `${name}까지 길이 없다`).toBeGreaterThan(0)
      const end = path[path.length - 1]!
      expect(Math.hypot(end.x - goal.x, end.z - goal.z), `${name} 가까이 가지 못한다`).toBeLessThan(3)
    }
  })

  it('보스가 설 자리가 있고, 무리는 시작점에서 떨어져 있다', () => {
    expect(kingNav.nearestFree(region.boss)).not.toBeNull()
    for (const camp of region.camps) expect(Math.hypot(camp.x - region.spawn.x, camp.z - region.spawn.z)).toBeGreaterThan(8)
  })

  it('성소 결계 안에 소품이 없다 (전설 싸움터가 트여 있다)', () => {
    for (const prop of region.props) {
      expect(Math.hypot(prop.x - region.sanctuary.x, prop.z - region.sanctuary.z), `${prop.kind} (${prop.x}, ${prop.z})`).toBeGreaterThan(4)
    }
  })

  it('연못 위는 평평하다', () => {
    setPonds(region.ponds)
    for (const pond of region.ponds) {
      const a = heightAt(pond.x, pond.z)
      const b = heightAt(pond.x + pond.radius * 0.7, pond.z)
      expect(Math.abs(a - b)).toBeLessThan(0.01)
    }
  })
})

describe('지역 데이터 검사', () => {
  it('regions.json은 편집기가 쓰는 모양 그대로다 (편집기로 저장해도 diff가 생기지 않는다)', () => {
    expect(regionsText).toBe(formatRegions(RAW_REGIONS))
  })

  it('편집기 모양: 위치·소품은 한 줄에 하나, 숫자는 소수 둘째 자리까지', () => {
    const text = formatRegions({ a: { spawn: { x: 1.23456, z: -2 }, props: [{ kind: 'pine', x: 1, z: 2, size: 1, rotation: 0.5 }] } })
    expect(text).toContain('"spawn": { "x": 1.23, "z": -2 }')
    expect(text).toContain('{ "kind": "pine", "x": 1, "z": 2, "size": 1, "rotation": 0.5 }')
  })

  const cases: [string, (d: any) => void, RegExp][] = [
    ['범위 밖 소품', (d) => (d.midgard.props[0].x = 99), /props\[0\]\.x: .*38 이하/],
    ['없는 소품 종류', (d) => (d.midgard.props[0].kind = 'castle'), /props\[0\]\.kind/],
    ['없는 지역으로 가는 출구', (d) => d.midgard.exits.push({ x: 0, z: 30, to: 'atlantis' }), /exits\[0\]\.to: regions\.json에 없는 지역/],
    ['자기 자신으로 가는 출구', (d) => d.midgard.exits.push({ x: 0, z: 30, to: 'midgard' }), /자기 자신으로/],
    ['시작점 바로 옆 소품', (d) => d.midgard.props.push({ kind: 'rock', x: 1, z: 1, size: 1, rotation: 0 }), new RegExp(`시작점 ${SPAWN_CLEAR}m 안`)],
    ['무리가 없음', (d) => (d.midgard.camps = []), /camps: 졸개 무리가 하나 이상/],
    ['히든 신화권', (d) => (d.midgard.realm = 'hidden'), /realm: 지역의 신화권은 히든일 수 없습니다/],
    ['모르는 칸', (d) => (d.midgard.weather = 'snow'), /weather/],
  ]
  for (const [name, edit, message] of cases) {
    it(`틀린 데이터: ${name}`, () => {
      const d = clone(RAW_REGIONS)
      edit(d)
      const run = () => parseRegions(d)
      expect(run).toThrow(DataError)
      expect(run).toThrow(message)
    })
  }
})

describe('지역을 바꿔 다시 짓기', () => {
  it('길찾기 격자를 다른 충돌체로 다시 짜면 막힌 칸이 바뀐다', () => {
    const nav = new NavGrid(20, 0.5, [{ x: 0, z: 0, radius: 2 }], 0.4)
    expect(nav.isBlocked({ x: 0, z: 0 })).toBe(true)
    nav.rebuild(30, [{ x: 10, z: 10, radius: 2 }])
    expect(nav.isBlocked({ x: 0, z: 0 })).toBe(false)
    expect(nav.isBlocked({ x: 10, z: 10 })).toBe(true)
    expect(nav.halfExtent).toBe(30)
  })

  it('적 배치를 바꾸면 거인을 모두 지우고 새 무리·보스를 세운다', () => {
    const encounter = new Encounter({ camps: [{ x: 10, z: 0, count: 3 }], boss: { x: -10, z: 0 } }, [], 30)
    expect(encounter.giants.filter((g) => g.spec === GRUNT)).toHaveLength(3)
    const old = [...encounter.giants]
    encounter.reset({ camps: [{ x: 5, z: 5, count: 2 }, { x: -5, z: 5, count: 4 }], boss: { x: 0, z: -20 } }, [], 30)
    expect(encounter.giants.some((g) => old.includes(g))).toBe(false)
    expect(encounter.giants.filter((g) => g.spec === GRUNT)).toHaveLength(6)
    expect(encounter.boss).not.toBeNull()
    expect(encounter.spots.boss.z).toBeCloseTo(-20, 0)
  })

  it('성소를 옮기면 결계 중심과 반지름이 바뀐다 (전설이 진행 중이면 그대로)', () => {
    const legend = new UtgardLegend({ x: 0, z: 0 }, 11)
    legend.moveTo({ x: 5, z: -5 }, 8)
    expect(legend.center).toEqual({ x: 5, z: -5 })
    expect(legend.radius).toBe(8)
    expect(legend.object.position.x).toBe(5)
  })
})

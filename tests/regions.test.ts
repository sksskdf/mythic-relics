import { describe, expect, it } from 'vitest'

import { DataError } from '../src/data/check'
import regionsText from '../src/data/regions.json?raw'
import { arrivalSpot, exitColor, formatRegions, nextHop, worldLayout, parseRegions, RAW_REGIONS, REALM_COLORS, REGIONS, SPAWN_CLEAR, START_REGION } from '../src/data/regions'
import { GRUNT, KING } from '../src/enemies/Giant'
import { Encounter } from '../src/game/Encounter'
import { UtgardLegend } from '../src/game/Legend'
import { collidersFor } from '../src/world/regionMap'
import { heightAt, setPonds } from '../src/world/terrain'
import { NavGrid } from '../src/world/navGrid'

/**
 * 지역 데이터 (E7). regions.json의 지역 전부를 돈다: 지역을 더하면 같은 검사가 저절로 붙는다.
 */

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const regions = Object.values(REGIONS)

describe.each(regions.map((r) => [r.id, r] as const))('지역 %s', (_id, region) => {
  const colliders = [...region.props.flatMap(collidersFor), ...region.npcs.map((n) => ({ x: n.x, z: n.z, radius: 0.45 }))]
  const heroNav = new NavGrid(region.halfExtent, 0.5, colliders, 0.4)
  const kingNav = new NavGrid(region.halfExtent, 0.5, colliders, KING.radius)

  it('시작점이 막혀 있지 않다', () => {
    expect(heroNav.isBlocked(region.spawn)).toBe(false)
  })

  it('시작점에서 성소·무리·보스·출구·마을 사람까지 길이 있다 (길이 막히지 않음)', () => {
    const goals: [string, { x: number; z: number } | null][] = [
      ['성소', region.sanctuary],
      ['보스', region.boss],
      ...region.camps.map((c, i): [string, typeof c] => [`무리 ${i}`, c]),
      ...region.exits.map((e): [string, typeof e] => [`출구 → ${e.to}`, e]),
      ...region.npcs.map((n): [string, typeof n] => [n.name, n]),
    ]
    for (const [name, goal] of goals) {
      if (!goal) continue
      const path = heroNav.findPath(region.spawn, goal)
      expect(path.length, `${name}까지 길이 없다`).toBeGreaterThan(0)
      const end = path[path.length - 1]!
      expect(Math.hypot(end.x - goal.x, end.z - goal.z), `${name} 가까이 가지 못한다`).toBeLessThan(3)
    }
  })

  it('보스는 무리·성소에서 18m 이상 떨어져 지나가다 깨우지 않는다 (DESIGN 9.2.1)', () => {
    if (!region.boss) return
    for (const camp of region.camps) expect(Math.hypot(camp.x - region.boss.x, camp.z - region.boss.z), `무리 (${camp.x}, ${camp.z})`).toBeGreaterThanOrEqual(18)
    if (region.sanctuary) expect(Math.hypot(region.sanctuary.x - region.boss.x, region.sanctuary.z - region.boss.z)).toBeGreaterThanOrEqual(18)
  })

  it('보스가 설 자리가 있고, 무리는 시작점에서 떨어져 있다', () => {
    if (region.boss) expect(kingNav.nearestFree(region.boss)).not.toBeNull()
    for (const camp of region.camps) expect(Math.hypot(camp.x - region.spawn.x, camp.z - region.spawn.z)).toBeGreaterThan(8)
  })

  it('성소 결계 안에 소품이 없다 (전설 싸움터가 트여 있다)', () => {
    const sanctuary = region.sanctuary
    if (!sanctuary) return
    for (const prop of region.props) {
      expect(Math.hypot(prop.x - sanctuary.x, prop.z - sanctuary.z), `${prop.kind} (${prop.x}, ${prop.z})`).toBeGreaterThan(4)
    }
  })

  it('다른 지역에서 들어온 자리가 막혀 있지 않고, 거기서 시작점까지 길이 있다 (출구 바로 위가 아니다)', () => {
    for (const from of Object.values(REGIONS).filter((r) => r.exits.some((e) => e.to === region.id))) {
      const at = arrivalSpot(region, from.id)
      expect(heroNav.isBlocked(at), `${from.id}에서 온 자리`).toBe(false)
      const back = region.exits.find((e) => e.to === from.id)!
      expect(Math.hypot(at.x - back.x, at.z - back.z)).toBeGreaterThan(3.2)
      expect(heroNav.findPath(at, region.spawn).length).toBeGreaterThan(0)
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

describe('세계 (E7, E15)', () => {
  it('마을 하나와 신화권마다 입구 들판·깊은 땅·보스의 땅, 모두 16곳이고 마을에서 시작한다 (E15-01)', () => {
    const hubs = regions.filter((r) => r.kind === 'hub')
    expect(hubs).toHaveLength(1)
    expect(START_REGION).toBe(hubs[0]!.id)
    expect(regions).toHaveLength(16)
    const fields = regions.filter((r) => r.kind === 'field')
    for (const realm of ['china', 'greek', 'japan', 'korea', 'norse']) {
      expect(fields.filter((r) => r.realm === realm).map((r) => r.zone).sort(), realm).toEqual(['boss', 'deep', 'entrance'])
    }
    expect(new Set(fields.filter((r) => r.zone === 'entrance').map((r) => r.theme)).size).toBe(5)
  })

  it('마을 → 입구 들판 → 깊은 땅 → 보스의 땅으로 이어지고, 이웃은 서로 오간다', () => {
    const hub = REGIONS[START_REGION]!
    const entrances = regions.filter((r) => r.zone === 'entrance')
    expect(hub.exits.map((e) => e.to).sort()).toEqual(entrances.map((r) => r.id).sort())
    for (const entrance of entrances) {
      const deep = regions.find((r) => r.zone === 'deep' && r.realm === entrance.realm)!
      const boss = regions.find((r) => r.zone === 'boss' && r.realm === entrance.realm)!
      expect(entrance.exits.map((e) => e.to).sort(), entrance.id).toEqual([deep.id, hub.id].sort())
      expect(deep.exits.map((e) => e.to).sort(), deep.id).toEqual([boss.id, entrance.id].sort())
      expect(boss.exits.map((e) => e.to), boss.id).toEqual([deep.id])
    }
    for (const r of regions) for (const e of r.exits) expect(REGIONS[e.to]!.exits.some((back) => back.to === r.id), `${r.id} → ${e.to}`).toBe(true)
  })

  it('어느 지역에서 어느 지역으로든 이웃을 따라 갈 수 있다 (봇·지도의 다음 이웃)', () => {
    expect(nextHop('village', 'utgard')).toBe('midgard')
    expect(nextHop('midgard', 'utgard')).toBe('jotunheim')
    expect(nextHop('utgard', 'songdo')).toBe('jotunheim')
    expect(nextHop('village', 'village')).toBeNull()
    for (const a of regions) {
      for (const b of regions) {
        if (a === b) continue
        // 다음 이웃을 따라가면 16번 안에 닿는다
        let at = a.id
        for (let i = 0; i < regions.length && at !== b.id; i++) at = nextHop(at, b.id)!
        expect(at, `${a.id} → ${b.id}`).toBe(b.id)
      }
    }
  })

  it('세계 지도: 마을이 가운데, 모든 지역이 서로 다른 자리에, 입구·깊은 땅·보스의 땅 차례로 멀어진다 (E15-04)', () => {
    const layout = worldLayout()
    expect(Object.keys(layout).sort()).toEqual(regions.map((r) => r.id).sort())
    expect(layout[START_REGION]).toEqual({ x: 0, y: 0 })
    const spots = Object.values(layout).map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    expect(new Set(spots).size).toBe(spots.length)
    const far = (id: string) => Math.hypot(layout[id]!.x, layout[id]!.y)
    for (const r of regions.filter((x) => x.zone === 'entrance')) {
      const deep = regions.find((x) => x.zone === 'deep' && x.realm === r.realm)!
      const boss = regions.find((x) => x.zone === 'boss' && x.realm === r.realm)!
      expect(far(r.id)).toBeCloseTo(1)
      expect(far(deep.id)).toBeCloseTo(2)
      expect(far(boss.id)).toBeCloseTo(3)
    }
  })

  it('보스는 보스의 땅에만, 깊은 땅은 정예가 더 섞인다', () => {
    for (const r of regions.filter((x) => x.kind === 'field')) {
      expect(r.boss !== null, r.id).toBe(r.zone === 'boss')
      if (r.zone === 'deep') expect(r.elite, r.id).toBeGreaterThan(0)
    }
  })

  it('출구 빛기둥 색은 갈 곳의 신화권 색이다 (글 없이 어디로 가는지 안다)', () => {
    const hub = REGIONS[START_REGION]!
    const colors = hub.exits.map((e) => exitColor(e.to))
    expect(new Set(colors).size).toBe(hub.exits.length)
    expect(exitColor('midgard')).toBe(REALM_COLORS.norse)
    expect(exitColor(hub.id)).toBe(REALM_COLORS.hub)
  })

  it('마을에는 적·보스·성소가 없고 말을 거는 사람이 있다. 필드에는 사람이 없다', () => {
    for (const r of regions) {
      if (r.kind === 'hub') {
        expect(r.camps).toHaveLength(0)
        expect(r.boss).toBeNull()
        expect(r.sanctuary).toBeNull()
        expect(r.npcs.length).toBeGreaterThanOrEqual(2)
        for (const npc of r.npcs) expect(npc.lines.length).toBeGreaterThan(0)
      } else {
        expect(r.camps.length).toBeGreaterThanOrEqual(3)
        expect(r.npcs).toHaveLength(0)
      }
    }
  })

  it('필드마다 그 땅에만 있는 소품이 있다 (같은 모습이 아니다)', () => {
    const own: Record<string, string[]> = { olympus: ['olive', 'column', 'cypress'], hwagwasan: ['peach', 'spire'], takamagahara: ['cherry', 'torii', 'lantern'], sinsi: ['maple', 'cairn', 'jangseung'] }
    for (const [id, kinds] of Object.entries(own)) {
      const used = new Set(REGIONS[id]!.props.map((p) => p.kind))
      for (const kind of kinds) expect(used.has(kind as never), `${id}의 ${kind}`).toBe(true)
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
    ['마을에 적', (d) => d.village.camps.push({ x: 10, z: 10, count: 3 }), /마을에는 적과 자리를 두지 않습니다/],
    ['돌아오는 출구가 없음', (d) => (d.jotunheim.exits = d.jotunheim.exits.filter((e: { to: string }) => e.to !== 'utgard')), /jotunheim에서 돌아오는 출구가 없습니다/],
    ['보스의 땅이 아닌데 보스', (d) => (d.midgard.boss = { x: 0, z: -20 }), /보스 자리는 보스의 땅에만/],
    ['성소 없는 필드', (d) => delete d.olympus.sanctuary, /olympus\.sanctuary: 필드는 성소가/],
    ['신화권 없는 필드', (d) => delete d.sinsi.realm, /sinsi\.realm: 필드는 신화권이/],
    ['너무 긴 말', (d) => (d.village.npcs[0].lines[0] = '가'.repeat(41)), /lines\[0\]: 1~40글자/],
    ['점 하나짜리 길', (d) => (d.olympus.paths[0].points = [{ x: 0, z: 0 }]), /points: 점이 둘 이상/],
    ['없는 테마', (d) => (d.olympus.theme = 'mars'), /olympus\.theme/],
    ['없는 소품 종류', (d) => (d.midgard.props[0].kind = 'castle'), /props\[0\]\.kind/],
    ['없는 지역으로 가는 출구', (d) => (d.midgard.exits[0].to = 'atlantis'), /exits\[0\]\.to: regions\.json에 없는 지역/],
    ['자기 자신으로 가는 출구', (d) => (d.midgard.exits[0].to = 'midgard'), /자기 자신으로/],
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
    expect(encounter.spots.boss?.z).toBeCloseTo(-20, 0)
  })

  it('보스가 없는 배치(마을)는 보스를 세우지 않는다', () => {
    const encounter = new Encounter({ camps: [], boss: null }, [], 20)
    expect(encounter.giants).toHaveLength(0)
    expect(encounter.boss).toBeNull()
    encounter.update(30, { hero: { x: 0, z: 0, radius: 0.4, alive: true } } as never)
    expect(encounter.giants).toHaveLength(0)
  })

  it('성소가 없는 지역이면 성소를 감추고 전설이 열리지 않는다', () => {
    const legend = new UtgardLegend({ x: 0, z: 0 }, 11)
    legend.moveTo(null)
    expect(legend.present).toBe(false)
    expect(legend.object.visible).toBe(false)
  })

  it('성소를 옮기면 결계 중심과 반지름이 바뀐다 (전설이 진행 중이면 그대로)', () => {
    const legend = new UtgardLegend({ x: 0, z: 0 }, 11)
    legend.moveTo({ x: 5, z: -5 }, 8)
    expect(legend.center).toEqual({ x: 5, z: -5 })
    expect(legend.radius).toBe(8)
    expect(legend.object.position.x).toBe(5)
  })
})

import { describe, expect, it } from 'vitest'

import { DataError } from '../src/data/check'
import regionsText from '../src/data/regions.json?raw'
import { arrivalSpot, exitColor, formatRegions, nextHop, parseRegions, RAW_REGIONS, REALM_COLORS, REGIONS, SPAWN_CLEAR, START_REGION } from '../src/data/regions'
import { GRUNT, KING } from '../src/enemies/Giant'
import { LAND_DAMAGE_EXPONENT } from '../src/data/chapters'
import { Encounter } from '../src/game/Encounter'
import { CROSS_MARGIN, crossingAt, regionLinks, walkRects } from '../src/data/world'
import { walkArea } from '../src/world/colliders'
import { collidersFor, streamColliders } from '../src/world/regionMap'
import { cliffColliders, heightAt, setLand } from '../src/world/terrain'
import { NavGrid } from '../src/world/navGrid'

/**
 * 지역 데이터 (E7). regions.json의 지역 전부를 돈다: 지역을 더하면 같은 검사가 저절로 붙는다.
 */

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const regions = Object.values(REGIONS)
/** 신화권 다섯의 땅과 마을 (마지막 무대 빼고) */
const realmLands = regions.filter((r) => !r.finale)

describe.each(regions.map((r) => [r.id, r] as const))('지역 %s', (_id, region) => {
  // 게임과 같은 충돌: 소품·마을 사람에 절벽과 개울까지 (E24-07: 다리 틈이 막히면 개울 건너 출구에 못 간다)
  setLand(region)
  const colliders = [...region.props.flatMap(collidersFor), ...region.npcs.map((n) => ({ x: n.x, z: n.z, radius: 0.45 })), ...cliffColliders(region), ...streamColliders(region)]
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

  it('계단식 땅·개울이 있는 땅은 갇힌 빈터가 없다: 빈 칸은 거의 다 시작점에서 걸어서 닿는다 (E24-07)', () => {
    if (region.terraces.length === 0 && region.streams.length === 0) return
    const h = region.halfExtent
    const n = Math.floor((2 * h) / 0.5)
    const at = (i: number, k: number) => ({ x: -h + (i + 0.5) * 0.5, z: -h + (k + 0.5) * 0.5 })
    const seen = new Uint8Array(n * n)
    const start = { i: Math.floor((region.spawn.x + h) / 0.5), k: Math.floor((region.spawn.z + h) / 0.5) }
    const queue = [start]
    seen[start.k * n + start.i] = 1
    while (queue.length) {
      const { i, k } = queue.pop()!
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const ni = i + di
        const nk = k + dk
        if (ni < 0 || nk < 0 || ni >= n || nk >= n || seen[nk * n + ni] || heroNav.isBlocked(at(ni, nk))) continue
        seen[nk * n + ni] = 1
        queue.push({ i: ni, k: nk })
      }
    }
    const stranded: string[] = []
    for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) if (!seen[k * n + i] && !heroNav.isBlocked(at(i, k))) stranded.push(`(${at(i, k).x}, ${at(i, k).z})`)
    // 소품 틈의 한두 칸은 봐준다 (2m² 안)
    expect(stranded.length, `갇힌 빈 칸: ${stranded.slice(0, 8).join(' ')}`).toBeLessThanOrEqual(8)
  })

  it('시작점에서 이웃으로 가는 통로마다 걸어서 가운데를 넘을 수 있다 (E19-07: 16곳 걷기)', () => {
    const links = regionLinks(REGIONS, region.id)
    expect(links.length).toBe(region.exits.length)
    const walkNav = new NavGrid(walkArea(walkRects(region.halfExtent, links)), 0.5, colliders, 0.4)
    for (const link of links) {
      const r = link.rect
      const along = link.mid + link.dir * (CROSS_MARGIN + 1)
      const goal = link.axis === 'x' ? { x: along, z: (r.minZ + r.maxZ) / 2 } : { x: (r.minX + r.maxX) / 2, z: along }
      expect(crossingAt(links, goal.x, goal.z)?.to, `${link.to} 통로의 넘는 자리`).toBe(link.to)
      const path = walkNav.findPath(region.spawn, goal)
      expect(path.length, `${link.to} 통로까지 길이 없다`).toBeGreaterThan(0)
      const end = path[path.length - 1]!
      expect(Math.hypot(end.x - goal.x, end.z - goal.z), `${link.to} 통로 가운데를 넘지 못한다`).toBeLessThan(1)
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
    setLand(region)
    for (const pond of region.ponds) {
      const a = heightAt(pond.x, pond.z)
      const b = heightAt(pond.x + pond.radius * 0.7, pond.z)
      expect(Math.abs(a - b)).toBeLessThan(0.01)
    }
  })
})

describe('세계 (E7, E15)', () => {
  it('마을 하나에 북유럽 여섯, 다른 신화권마다 입구 들판·깊은 땅·보스의 땅, 마지막 무대 하나, 마을에서 시작한다 (E15-01, E22, E239)', () => {
    const hubs = regions.filter((r) => r.kind === 'hub')
    expect(hubs).toHaveLength(1)
    expect(START_REGION).toBe(hubs[0]!.id)
    expect(realmLands).toHaveLength(19)
    expect(regions.filter((r) => r.finale).map((r) => r.id)).toEqual(['sky'])
    const fields = realmLands.filter((r) => r.kind === 'field')
    for (const realm of ['china', 'greek', 'japan', 'korea']) {
      expect(fields.filter((r) => r.realm === realm).map((r) => r.zone).sort(), realm).toEqual(['boss', 'deep', 'entrance'])
    }
    // 북유럽: 입구 미드가르드, 둘레의 깊은 땅 넷(철의 숲·바닷가·요툰헤임·무스펠), 가장 북쪽 우트가르드
    const norse = fields.filter((r) => r.realm === 'norse')
    expect(norse.map((r) => r.id).sort()).toEqual(['ironwood', 'jotunheim', 'midgard', 'muspel', 'serpentshore', 'utgard'])
    expect(norse.filter((r) => r.zone === 'deep').map((r) => r.id).sort()).toEqual(['ironwood', 'jotunheim', 'muspel', 'serpentshore'])
    expect(new Set(fields.filter((r) => r.zone === 'entrance').map((r) => r.theme)).size).toBe(5)
  })

  it('마을 밖 길은 미드가르드 하나, 북유럽 → 우트가르드 너머 그리스 → 그 너머 다른 신화권으로 한 줄로 이어지고, 이웃은 서로 오간다 (E239-01)', () => {
    const to = (id: string) => REGIONS[id]!.exits.map((e) => e.to).sort()
    expect(to('village')).toEqual(['midgard'])
    expect(to('midgard')).toEqual(['ironwood', 'jotunheim', 'serpentshore', 'village'])
    expect(to('ironwood')).toEqual(['midgard'])
    expect(to('serpentshore')).toEqual(['midgard'])
    expect(to('jotunheim')).toEqual(['midgard', 'muspel', 'utgard'])
    expect(to('muspel')).toEqual(['jotunheim', 'utgard'])
    expect(to('utgard')).toEqual(['jotunheim', 'muspel', 'olympus'])
    expect(to('olympus')).toEqual(['delphi', 'hwagwasan', 'sky', 'takamagahara', 'utgard'])
    expect(to('lycia')).toEqual(['delphi', 'sinsi'])
    // 그리스 너머 신화권은 입구 → 깊은 땅 → 보스의 땅
    for (const entrance of realmLands.filter((r) => r.zone === 'entrance' && r.realm !== 'norse' && r.realm !== 'greek')) {
      const deep = realmLands.find((r) => r.zone === 'deep' && r.realm === entrance.realm)!
      const boss = realmLands.find((r) => r.zone === 'boss' && r.realm === entrance.realm)!
      expect(entrance.exits.map((e) => REGIONS[e.to]!.realm), entrance.id).toContain('greek')
      expect(entrance.exits.map((e) => e.to), entrance.id).toContain(deep.id)
      expect(deep.exits.map((e) => e.to).sort(), deep.id).toEqual([boss.id, entrance.id].sort())
      expect(boss.exits.map((e) => e.to), boss.id).toEqual([deep.id])
    }
    for (const r of regions) for (const e of r.exits) expect(REGIONS[e.to]!.exits.some((back) => back.to === r.id), `${r.id} → ${e.to}`).toBe(true)
  })

  it('마지막 무대는 올림포스에서 걸어 들어간다 (E22, E239)', () => {
    expect(REGIONS.sky!.exits.map((e) => e.to)).toEqual(['olympus'])
    // 마지막 보스는 균열의 우트가르드의 왕과 모습·이름이 같고 세기는 따로 (E22-05)
    expect(REGIONS.sky!.boss?.enemy).toBe('skyKing')
    const into = regions.filter((r) => r.exits.some((e) => e.to === 'sky')).map((r) => r.id)
    expect(into).toEqual(['olympus'])
  })

  it('어느 지역에서 어느 지역으로든 이웃을 따라 갈 수 있다 (봇·지도의 다음 이웃)', () => {
    expect(nextHop('village', 'utgard')).toBe('midgard')
    expect(nextHop('midgard', 'utgard')).toBe('jotunheim')
    expect(nextHop('village', 'serpentshore')).toBe('midgard')
    expect(nextHop('utgard', 'songdo')).toBe('olympus')
    expect(nextHop('village', 'village')).toBeNull()
    for (const a of regions) {
      for (const b of regions) {
        if (a === b) continue
        // 다음 이웃을 따라가면 지역 수 안에 닿는다
        let at = a.id
        for (let i = 0; i < regions.length && at !== b.id; i++) at = nextHop(at, b.id)!
        expect(at, `${a.id} → ${b.id}`).toBe(b.id)
      }
    }
  })

  it('세계 칸: 마을은 남쪽 끝, 북유럽 위에 그리스, 그 위에 다른 신화권 (E239-01)', () => {
    const row = (id: string) => REGIONS[id]!.cell!.row
    for (const r of regions) if (r.id !== 'village') expect(row(r.id), r.id).toBeGreaterThan(row('village'))
    const norse = realmLands.filter((r) => r.realm === 'norse')
    const greek = realmLands.filter((r) => r.realm === 'greek')
    const beyond = realmLands.filter((r) => r.realm && !['norse', 'greek'].includes(r.realm))
    expect(Math.max(...norse.map((r) => r.cell!.row))).toBe(row('utgard'))
    expect(Math.min(...greek.map((r) => r.cell!.row))).toBeGreaterThan(row('utgard'))
    for (const r of beyond) expect(r.cell!.row, r.id).toBeGreaterThanOrEqual(row('olympus'))
    // 첫 신의 수호자 땅(철의 숲·바닷가)은 미드가르드 바로 옆 (걸어서 2~3분)
    for (const id of ['ironwood', 'serpentshore']) expect(REGIONS.midgard!.exits.map((e) => e.to)).toContain(id)
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
    ['벽돌 자리가 아닌 세계 칸', (d) => (d.midgard.cell = { col: 0, row: 1 }), /midgard\.cell: 벽돌 자리/],
    ['겹친 세계 칸', (d) => (d.kunlun.cell = { ...d.hwagwasan.cell }), /칸이 겹칩니다/],
    ['이웃이 아닌 칸으로 가는 출구', (d) => (d.huoyanshan.cell = { col: 4, row: 0 }), /이웃 칸이 아닙니다: (kunlun|huoyanshan)/],
    ['통로 입구에서 벗어난 출구', (d) => (d.midgard.exits[0].x -= 2), /midgard\.exits\[0\]: 통로 입구/],
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

  it('땅마다 적의 세기가 다르다: 생명은 적 지수만큼, 피해는 덜 (E22-02)', () => {
    const layout = (id: string) => ({ id, camps: [{ x: 10, z: 0, count: 2 }], boss: { x: -10, z: 0 } })
    const power = (id: string | undefined) => (id === 'lycia' ? 4 : 1)
    const weak = new Encounter(layout('midgard'), [], 30, power)
    const strong = new Encounter(layout('lycia'), [], 30, power)
    // 정예는 생명이 더 크니 가장 약한 졸개끼리 견준다
    const gruntHp = (e: Encounter) => Math.min(...e.giants.filter((g) => g.spec === GRUNT).map((g) => g.health.max))
    expect(gruntHp(strong)).toBeCloseTo(gruntHp(weak) * 4)
    expect(strong.boss!.health.max).toBeCloseTo(weak.boss!.health.max * 4)
    expect(strong.boss!.damageScale).toBeCloseTo(4 ** LAND_DAMAGE_EXPONENT)
    // 전설의 적도 그 땅의 세기로
    expect(strong.spawn(GRUNT, { x: 0, z: 5 }, false).health.max).toBeCloseTo(GRUNT.hp * 4)
  })

  it('보스가 없는 배치(마을)는 보스를 세우지 않는다', () => {
    const encounter = new Encounter({ camps: [], boss: null }, [], 20)
    expect(encounter.giants).toHaveLength(0)
    expect(encounter.boss).toBeNull()
    encounter.update(30, { hero: { x: 0, z: 0, radius: 0.4, alive: true } } as never)
    expect(encounter.giants).toHaveLength(0)
  })
})

describe('이어진 세계의 적 (E19-04)', () => {
  // 지금 땅 A(±30)와 북쪽 이웃 B(칸 자리 차이 z −100). 통로는 A의 z −28에서 B의 남쪽 끝(−70)까지
  const square = (h: number, oz = 0) => ({ minX: -h, maxX: h, minZ: oz - h, maxZ: oz + h })
  const passage = { minX: -3, maxX: 3, minZ: -72, maxZ: -28 }
  const areaA = walkArea([square(30), passage])
  const areaB = walkArea([square(30), { ...passage, minZ: passage.minZ + 100, maxZ: passage.maxZ + 100 }])
  const layoutA = { id: 'a', camps: [{ x: 10, z: 10, count: 2 }], boss: null }
  const layoutB = { id: 'b', camps: [{ x: -8, z: 5, count: 3 }], boss: { x: 0, z: -20 } }
  const neighborB = { id: 'b', layout: layoutB, offset: { x: 0, z: -100 } }
  const neighborA = { id: 'a', layout: layoutA, offset: { x: 0, z: 100 } }

  function setup() {
    const encounter = new Encounter({ camps: [], boss: null }, [], areaA)
    encounter.eliteChance = 0
    encounter.reset(layoutA, [], areaA)
    encounter.setNeighbors([neighborB])
    encounter.flushNeighbors()
    return encounter
  }

  it('이웃 땅의 무리를 미리 그 자리에 세워 두되, 지금 땅의 적(공격 대상)에는 넣지 않는다', () => {
    const encounter = setup()
    expect(encounter.giants).toHaveLength(2)
    const parked = encounter.parkedGiants
    expect(parked).toHaveLength(4)
    expect(parked.every((g) => g.z < -60)).toBe(true)
    expect(encounter.object.children).toHaveLength(6)
  })

  it('넘어가면 미리 세워 둔 무리를 그대로 깨우고, 앞 땅의 무리는 그 자리에 남겨 둔다', () => {
    const encounter = setup()
    const waiting = encounter.parkedGiants
    const before = encounter.giants.map((g) => ({ g, z: g.z }))
    encounter.cross(layoutB, { x: 0, z: 100 }, [], areaB)
    // B의 적은 같은 거인이 B 좌표로 (갑자기 새로 생기지 않는다)
    expect(encounter.giants).toHaveLength(4)
    expect(encounter.giants.every((g) => waiting.includes(g))).toBe(true)
    expect(encounter.boss?.z).toBeCloseTo(-20, 0)
    // A의 적은 이웃 땅(남쪽)에 서 있다
    for (const { g, z } of before) {
      expect(encounter.parkedGiants).toContain(g)
      expect(g.z).toBeCloseTo(z + 100)
    }
    // 되돌아가면 A의 같은 무리를 깨운다
    encounter.setNeighbors([neighborA])
    encounter.cross(layoutA, { x: 0, z: -100 }, [], areaA)
    expect(encounter.giants.map((g) => g)).toEqual(before.map((b) => b.g))
    expect(encounter.giants[0]!.z).toBeCloseTo(before[0]!.z)
  })

  it('쫓아오던 적은 통로를 넘어서도 계속 쫓는다', () => {
    const encounter = setup()
    const chaser = encounter.giants[0]!
    chaser.shift(-10, -55) // 통로 안 (z ≈ −45)
    chaser.alert()
    encounter.cross(layoutB, { x: 0, z: 100 }, [], areaB)
    expect(encounter.giants).toContain(chaser)
    expect(chaser.state).toBe('chase')
    expect(encounter.parkedGiants).not.toContain(chaser)
  })

  it('이웃 땅 무리는 그 땅의 바위를 비켜 서고, 깨우면 집 자리가 막힌 칸이 아니다', () => {
    const encounter = new Encounter({ camps: [], boss: null }, [], areaA)
    encounter.eliteChance = 0
    encounter.reset(layoutA, [], areaA)
    // B의 무리 자리(지금 땅 좌표 −8, −95)에 큰 바위
    const rock = { x: -8, z: -95, radius: 2.5 }
    encounter.setNeighbors([{ ...neighborB, colliders: [rock] }])
    encounter.flushNeighbors()
    for (const g of encounter.parkedGiants) expect(Math.hypot(g.x - rock.x, g.z - rock.z)).toBeGreaterThan(rock.radius)
    const rockB = { ...rock, z: rock.z + 100 }
    encounter.cross(layoutB, { x: 0, z: 100 }, [rockB], areaB)
    const nav = new NavGrid(areaB, 0.5, [rockB], GRUNT.radius)
    for (const g of encounter.giants.filter((x) => x.spec === GRUNT)) expect(nav.isBlocked(g.home)).toBe(false)
  })

  it('이웃이 아니게 된 땅의 무리는 지운다', () => {
    const encounter = setup()
    const parked = encounter.parkedGiants
    encounter.setNeighbors([])
    expect(encounter.parkedGiants).toHaveLength(0)
    expect(parked.every((g) => !g.alive && !g.object.parent)).toBe(true)
  })
})

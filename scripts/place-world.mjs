// 하나로 이어진 세계 놓기 (E19-01, E239-01): 지역마다 세계 칸(벽돌 배치)과 이웃 사이 길을 정하고, 통로 자리로 출구와 길을 옮긴다.
// 이음(LINKS)에 없는 출구는 없애고(그 문으로 끝나던 길 끝도), 없는 출구는 이웃 문과 마주 보는 자리에 새로 내어 가까운 길에서 잇는다.
// 출구(문)는 통로 입구로 옮기고, 그 출구로 끝나던 길은 새 문까지 이은 뒤 숲 띠를 질러 칸 끝까지 늘린다.
// 새 길과 문 둘레의 소품은 치운다. 같은 입력이면 같은 결과가 나오고, 이미 옮긴 데이터에 다시 돌려도 바뀌지 않는다.
// 사용법: node scripts/place-world.mjs   (gen-regions.mjs·gen-north.mjs로 땅을 다시 만들었으면 그 뒤에 돌린다. 마을은 그 뒤 gen-village.mjs)
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const FILE = 'src/data/regions.json'

/**
 * 세계 칸 (E239-01, MYTHBUILD.md 4장): 마을은 북유럽 남쪽 끝. 미드가르드 둘레에 철의 숲(서)·세계 뱀의 바닷가(동)·요툰헤임(북서)·무스펠 경계(북동),
 * 가장 북쪽에 우트가르드. 그리스는 우트가르드 너머, 중국(동)·일본(서)·한국(북서)은 그리스 너머로 뻗는다 (엔딩 뒤)
 */
const CELLS = {
  village: [0, 0],
  midgard: [-0.5, 1], ironwood: [-1.5, 1], serpentshore: [0.5, 1],
  jotunheim: [-1, 2], muspel: [0, 2],
  utgard: [-0.5, 3],
  olympus: [0, 4], sky: [-0.5, 5], delphi: [0.5, 5], lycia: [1, 6],
  hwagwasan: [1, 4], kunlun: [2, 4], huoyanshan: [3, 4],
  takamagahara: [-1, 4], izumo: [-2, 4], hiikawa: [-3, 4],
  sinsi: [0, 6], taebaek: [-1, 6], songdo: [-2, 6],
}

/** 이웃 사이 길: 마을 밖 길은 미드가르드 하나, 그다음은 한 줄로 (마지막 무대는 올림포스에서만) */
const LINKS = [
  ['village', 'midgard'],
  ['midgard', 'ironwood'], ['midgard', 'serpentshore'], ['midgard', 'jotunheim'],
  ['jotunheim', 'muspel'], ['jotunheim', 'utgard'], ['muspel', 'utgard'],
  ['utgard', 'olympus'], ['olympus', 'sky'], ['olympus', 'delphi'], ['delphi', 'lycia'],
  ['olympus', 'hwagwasan'], ['hwagwasan', 'kunlun'], ['kunlun', 'huoyanshan'],
  ['olympus', 'takamagahara'], ['takamagahara', 'izumo'], ['izumo', 'hiikawa'],
  ['lycia', 'sinsi'], ['sinsi', 'taebaek'], ['taebaek', 'songdo'],
]

/** 예전 마을 문을 새 이웃으로 가는 문으로 쓴다 (E239-01: 길 모양을 그대로 두려고). 옮긴 뒤에는 할 일이 없다 */
const RENAME = { olympus: { village: 'utgard' }, hwagwasan: { village: 'olympus' }, takamagahara: { village: 'olympus' }, sinsi: { village: 'lycia' } }

/** 새로 내는 문의 가장자리를 따른 자리 (없으면 이웃 문과 마주 보는 자리). 올림포스의 다카마가하라 문은 성소를 비켜 북쪽에 */
const DOOR_AT = { olympus: { takamagahara: -23 } }

const r2 = (v) => Math.round(v * 100) / 100
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)
/** 점에서 꺾은선까지 거리 */
function toLine(p, points) {
  let best = Infinity
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]
    const b = points[i + 1]
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2))
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)))
  }
  return best
}

const pathLength = (points) => points.reduce((s, pt, i) => (i === 0 ? 0 : s + dist(pt, points[i - 1])), 0)

const regions = JSON.parse(readFileSync(FILE, 'utf8'))
// 모듈은 지역 데이터를 읽지 않는 것만 먼저 불러 둔다 (regions.ts는 불러오며 지금 파일을 검사하므로 다 옮긴 뒤에)
const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { passages, cellOrigin, adjacency, CELL, EXIT_INSET } = await vite.ssrLoadModule('/src/data/world.ts')
await vite.close()

// 1. 칸 (theme 다음 자리에 넣어 diff가 읽히게)
for (const [id, region] of Object.entries(regions)) {
  const cell = CELLS[id]
  if (!cell) throw new Error(`${id}의 세계 칸이 없습니다`)
  const entries = Object.entries(region).filter(([k]) => k !== 'cell')
  const at = entries.findIndex(([k]) => k === 'theme') + 1
  entries.splice(at, 0, ['cell', { col: cell[0], row: cell[1] }])
  regions[id] = Object.fromEntries(entries)
}

// 2. 이음: 예전 마을 문 → 새 이웃 문, 이음에 없는 출구 없애기, 없는 출구 내기
const want = new Map(Object.keys(regions).map((id) => [id, new Set()]))
for (const [a, b] of LINKS) {
  if (!regions[a] || !regions[b]) throw new Error(`이음 ${a}–${b}: 없는 지역입니다`)
  want.get(a).add(b)
  want.get(b).add(a)
}
for (const [id, renames] of Object.entries(RENAME)) {
  for (const exit of regions[id].exits) if (renames[exit.to] && !regions[id].exits.some((e) => e.to === renames[exit.to])) exit.to = renames[exit.to]
}
let cut = 0
for (const [id, region] of Object.entries(regions)) {
  const half = region.halfExtent
  const outside = (pt) => Math.abs(pt.x) > half + 0.01 || Math.abs(pt.z) > half + 0.01
  for (const exit of region.exits.filter((e) => !want.get(id).has(e.to))) {
    // 그 문에서 끝나던 길 끝을 걷어낸다 (숲 띠 쪽 점과 문)
    for (const path of region.paths) {
      const trim = (pts) => {
        while (pts.length > 0 && outside(pts.at(-1))) pts.pop()
        if (pts.length > 0 && dist(pts.at(-1), exit) < 0.6) pts.pop()
      }
      const before = path.points.length
      const pts = [...path.points]
      trim(pts)
      if (pts.length === before) {
        pts.reverse()
        trim(pts)
        pts.reverse()
      }
      path.points = pts
    }
    region.paths = region.paths.filter((path) => path.points.length >= 2 && pathLength(path.points) >= 12)
    region.exits = region.exits.filter((e) => e !== exit)
    cut++
  }
}
let added = 0
for (const [id, region] of Object.entries(regions)) {
  for (const to of want.get(id)) {
    if (region.exits.some((e) => e.to === to)) continue
    const kind = adjacency(region.cell, regions[to].cell)
    if (!kind) throw new Error(`이음 ${id}–${to}: 이웃 칸이 아닙니다`)
    // 이웃 문과 마주 보는 자리 (이웃에 아직 문이 없으면 가장자리 가운데)
    const back = regions[to].exits.find((e) => e.to === id)
    const o = cellOrigin(region.cell)
    const ob = cellOrigin(regions[to].cell)
    const edge = region.halfExtent - EXIT_INSET
    // 통로는 두 문 자리의 가운데에 서므로 (world.ts의 passages), 이웃 문이 있으면 미리 가운데로
    const mirror = back ? (kind === 'side' ? back.z : back.x + ob.x - o.x) : kind === 'side' ? 0 : Math.sign(ob.x - o.x) * region.halfExtent * 0.5
    const hint = DOOR_AT[id]?.[to]
    const along = Math.max(-edge, Math.min(edge, hint === undefined ? mirror : back ? (hint + mirror) / 2 : hint))
    const door = kind === 'side' ? { x: Math.sign(ob.x - o.x) * edge, z: r2(along) } : { x: r2(along), z: Math.sign(ob.z - o.z) * edge }
    region.exits.push({ ...door, to })
    // 가장 가까운 길에서 새 문까지 (1m마다 짚어 본다)
    const inside = (pt) => Math.abs(pt.x) <= region.halfExtent && Math.abs(pt.z) <= region.halfExtent
    // 성소 안과 다른 문 둘레(그 문 길로 이어 붙지 않게)는 빼고
    const free = (pt) => (!region.sanctuary || dist(pt, region.sanctuary) > region.sanctuary.radius + 1.5) && region.exits.every((e) => e.to === to || dist(pt, e) > 7)
    const clearLine = (a, b) => !region.sanctuary || toLine(region.sanctuary, [a, b]) > region.sanctuary.radius + 1
    let near = region.spawn
    for (const path of region.paths) {
      const pts = path.points.filter(inside)
      for (let i = 0; i + 1 < pts.length; i++) {
        const n = Math.max(1, Math.ceil(dist(pts[i], pts[i + 1])))
        for (let k = 0; k <= n; k++) {
          const q = { x: pts[i].x + ((pts[i + 1].x - pts[i].x) * k) / n, z: pts[i].z + ((pts[i + 1].z - pts[i].z) * k) / n }
          if (free(q) && dist(q, door) < dist(near, door) && clearLine(q, door)) near = q
        }
      }
    }
    region.paths.push({ points: [{ x: r2(near.x), z: r2(near.z) }, { ...door }].filter((pt, i, all) => i === 0 || dist(pt, all[i - 1]) > 0.3), width: 2.4 })
    added++
  }
}

try {
  // 3. 통로 → 출구·길
  const placed = Object.fromEntries(Object.entries(regions).map(([id, r]) => [id, { id, cell: r.cell, halfExtent: r.halfExtent, exits: r.exits }]))
  const list = passages(placed)
  for (const p of list) {
    for (const [self, other, world] of [[p.from, p.to, p.fromExit], [p.to, p.from, p.toExit]]) {
      const region = regions[self]
      const o = cellOrigin(region.cell)
      const exit = region.exits.find((e) => e.to === other)
      const was = { x: exit.x, z: exit.z }
      const now = { x: r2(world.x - o.x), z: r2(world.z - o.z) }
      exit.x = now.x
      exit.z = now.z
      // 통로 쪽 (칸 끝): 문에서 가까운 가장자리 쪽으로
      const side = Math.abs(now.x) > Math.abs(now.z) ? { x: Math.sign(now.x) * CELL / 2, z: now.z } : { x: now.x, z: Math.sign(now.z) * CELL / 2 }
      const edge = { x: r2(side.x), z: r2(side.z) }
      // 옛 출구에서 끝나던 길은 새 문까지 잇는다 (문이 다른 가장자리로 옮겨 가면 옛 숲 띠 쪽 끝은 걷어낸다)
      const outside = (pt) => Math.abs(pt.x) > region.halfExtent + 0.01 || Math.abs(pt.z) > region.halfExtent + 0.01
      for (const path of region.paths) {
        const pts = path.points
        if (pts.length >= 3 && outside(pts.at(-1)) && dist(pts.at(-2), was) < 0.6) pts.pop()
        if (pts.length >= 3 && outside(pts[0]) && dist(pts[1], was) < 0.6) pts.shift()
      }
      let joined = false
      for (const path of region.paths) {
        for (const end of [0, path.points.length - 1]) {
          const pt = path.points[end]
          if (dist(pt, was) > 6 && dist(pt, now) > 0.5 && dist(pt, edge) > 0.5) continue
          joined = true
          if (dist(pt, edge) <= 0.5) continue
          path.points[end] = { ...now }
          // 숲 띠를 지르는 길: 문 → 칸 끝
          if (end === 0) path.points.unshift(edge)
          else path.points.push(edge)
        }
      }
      if (!joined) region.paths.push({ points: [now, edge], width: 2.4 })
      // 같은 점이 이어지지 않게
      for (const path of region.paths) path.points = path.points.filter((pt, i, all) => i === 0 || dist(pt, all[i - 1]) > 0.3)
    }
  }
  // 4. 새 길과 문 둘레의 소품 치우기
  let removed = 0
  for (const region of Object.values(regions)) {
    const before = region.props.length
    region.props = region.props.filter((prop) => region.paths.every((path) => toLine(prop, path.points) > 2.6) && region.exits.every((e) => dist(prop, e) > 5))
    removed += before - region.props.length
  }
  // 다 옮긴 뒤 검사와 편집기 모양으로 다시 쓰기 (regions.ts는 불러오며 새 파일을 검사한다)
  writeFileSync(FILE, JSON.stringify(regions, null, 2) + '\n')
  const check = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
  try {
    const { formatRegions, parseRegions } = await check.ssrLoadModule('/src/data/regions.ts')
    parseRegions(regions)
    writeFileSync(FILE, formatRegions(regions))
  } finally {
    await check.close()
  }
  console.log(`통로 ${list.length}개, 없앤 출구 ${cut}개, 새 출구 ${added}개, 치운 소품 ${removed}개`)
  for (const p of list) console.log(`  ${p.from} ↔ ${p.to}: (${r2(p.fromExit.x)}, ${r2(p.fromExit.z)}) ↔ (${r2(p.toExit.x)}, ${r2(p.toExit.z)})`)
} catch (e) {
  console.error('실패:', e?.message ?? e)
  process.exitCode = 1
}

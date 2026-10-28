// 하나로 이어진 세계 놓기 (E19-01): 지역마다 세계 칸(벽돌 배치)을 정하고, 이웃 사이 통로 자리로 출구와 길을 옮긴다.
// 출구(문)는 통로 입구로 옮기고, 그 출구로 끝나던 길은 새 문까지 이은 뒤 숲 띠를 질러 칸 끝까지 늘린다.
// 새 길과 문 둘레의 소품은 치운다. 같은 입력이면 같은 결과가 나오고, 이미 옮긴 데이터에 다시 돌려도 바뀌지 않는다.
// 사용법: node scripts/place-world.mjs   (gen-regions.mjs로 땅을 다시 만들었으면 그 뒤에 돌린다)
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const FILE = 'src/data/regions.json'

/** 세계 칸: 마을이 가운데, 북유럽 북서·그리스 북동·중국 동·한국 서·일본 남서로 뻗는다 (남동은 다음 신화권 자리) */
const CELLS = {
  village: [0, 0],
  midgard: [-0.5, 1], jotunheim: [-1, 2], utgard: [-1.5, 3],
  olympus: [0.5, 1], delphi: [1, 2], lycia: [1.5, 3],
  hwagwasan: [1, 0], kunlun: [2, 0], huoyanshan: [3, 0],
  sinsi: [-1, 0], taebaek: [-2, 0], songdo: [-3, 0],
  takamagahara: [-0.5, -1], izumo: [-1, -2], hiikawa: [-1.5, -3],
  sky: [0, 2],
}

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

const regions = JSON.parse(readFileSync(FILE, 'utf8'))
// 1. 칸 (theme 다음 자리에 넣어 diff가 읽히게). vite 설정이 지역 데이터를 검사하므로 서버를 띄우기 전에 써 둔다
for (const [id, region] of Object.entries(regions)) {
  const cell = CELLS[id]
  if (!cell) throw new Error(`${id}의 세계 칸이 없습니다`)
  const entries = Object.entries(region).filter(([k]) => k !== 'cell')
  const at = entries.findIndex(([k]) => k === 'theme') + 1
  entries.splice(at, 0, ['cell', { col: cell[0], row: cell[1] }])
  regions[id] = Object.fromEntries(entries)
}
writeFileSync(FILE, JSON.stringify(regions, null, 2) + '\n')
// 모듈은 파일을 다시 쓰기 전에 모두 불러 둔다 (설정이 지역 데이터를 읽으므로, 쓰고 나면 서버가 다시 뜨며 끊긴다)
const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { passages, cellOrigin, CELL } = await vite.ssrLoadModule('/src/data/world.ts')
const { formatRegions, parseRegions } = await vite.ssrLoadModule('/src/data/regions.ts')
await vite.close()
try {
  // 2. 통로 → 출구·길
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
      // 옛 출구에서 끝나던 길은 새 문까지 잇는다
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
  // 3. 새 길과 문 둘레의 소품 치우기
  let removed = 0
  for (const region of Object.values(regions)) {
    const before = region.props.length
    region.props = region.props.filter((prop) => region.paths.every((path) => toLine(prop, path.points) > 2.6) && region.exits.every((e) => dist(prop, e) > 5))
    removed += before - region.props.length
  }
  parseRegions(regions)
  writeFileSync(FILE, formatRegions(regions))
  console.log(`통로 ${list.length}개, 치운 소품 ${removed}개`)
  for (const p of list) console.log(`  ${p.from} ↔ ${p.to}: (${r2(p.fromExit.x)}, ${r2(p.fromExit.z)}) ↔ (${r2(p.toExit.x)}, ${r2(p.toExit.z)})`)
} catch (e) {
  console.error('실패:', e?.message ?? e)
  process.exitCode = 1
}

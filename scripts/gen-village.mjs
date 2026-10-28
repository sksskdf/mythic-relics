// 마을 다시 짓기 (E24-07, 사용자 결정 2026-10-28: "마을이 단순해서 입체감이 없다"): 모닥불 마을을 규칙으로 짓는다.
// 가운데 언덕 위 광장(높이 1.5m) → 북쪽에 한 단 더 높은 족장의 터(3m). 광장 둘레 계단이 신화권마다 뻗은 길로 내려간다.
// 문(출구)과 길 바깥 끝은 세계 통로 자리 그대로 둔다 (place-world.mjs가 맞춘 것). 같은 시드면 같은 마을이 나온다.
// 사용법: node scripts/gen-village.mjs   (regions.json의 village를 덮어쓴다)
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const FILE = 'src/data/regions.json'
const ID = 'village'
const regions = JSON.parse(readFileSync(FILE, 'utf8'))
const village = regions[ID]

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
/** 점이 꼭짓점들 안에 있나 */
function inside(points, p) {
  let hit = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]
    const b = points[j]
    if (a.z > p.z !== b.z > p.z && p.x < ((b.x - a.x) * (p.z - a.z)) / (b.z - a.z) + a.x) hit = !hit
  }
  return hit
}

// 변과 계단은 세계 축에 맞춘다: 쿼터뷰에서는 화면의 사선이 되어 깨끗하고, 세계 대각선 변은 복셀이 톱니로 보인다
// 광장: x −9~9, z −6~8 (18×14m), 높이 1.5m
const CENTER = { x: 0, z: 1 }
const rect = (x0, z0, x1, z1) => [
  { x: x0, z: z0 },
  { x: x1, z: z0 },
  { x: x1, z: z1 },
  { x: x0, z: z1 },
]
const plaza = rect(-9, -6, 9, 8)
/** 광장 변(n·e·s·w)의 한 자리(at: 변을 따라 x 또는 z)로 내려가는 계단: 발치는 변 밖 3m, 윗끝은 변 안 1.6m */
function plazaStair(edge, at, width = 2.4) {
  const [x0, z0, x1, z1] = [-9, -6, 9, 8]
  if (edge === 'n') return { from: { x: at, z: z0 - 3 }, to: { x: at, z: z0 + 1.6 }, width }
  if (edge === 's') return { from: { x: at, z: z1 + 3 }, to: { x: at, z: z1 - 1.6 }, width }
  if (edge === 'w') return { from: { x: x0 - 3, z: at }, to: { x: x0 + 1.6, z: at }, width }
  return { from: { x: x1 + 3, z: at }, to: { x: x1 - 1.6, z: at }, width }
}

// 길마다 광장을 나가는 계단 (그 신화권 문 쪽 변)
const stairs = {
  midgard: plazaStair('n', -7),
  olympus: plazaStair('n', 7),
  hwagwasan: plazaStair('e', 4),
  takamagahara: plazaStair('s', -6),
  sinsi: plazaStair('w', -1),
}
// 남쪽 계단: 시작점에서 집들과 연못 쪽으로
const south = plazaStair('s', 4)

// 족장의 터: 광장 북쪽에 한 단 더 (광장 안으로 1.5m 걸친다), 광장에서 오르는 계단 하나
const keep = rect(-5, -15, 5, -4.5)
const keepStair = { from: { x: 0, z: -2 }, to: { x: 0, z: -7 }, width: 2.2 }

village.terraces = [
  { points: plaza, height: 1.5, stairs: [...Object.values(stairs), south] },
  { points: keep, height: 3, stairs: [keepStair] },
]

// 길: 광장 가운데 → 그 길의 계단 윗끝 → 발치 → 문 → 통로 끝 (문과 바깥 끝은 그대로)
const outer = Object.fromEntries(
  village.exits.map((exit) => {
    const path = village.paths.find((p) => dist(p.points.at(-2), exit) < 0.5)
    return [exit.to, path.points.at(-1)]
  }),
)
village.paths = [
  ...village.exits.map((exit) => {
    const s = stairs[exit.to]
    return { points: [CENTER, s.to, s.from, { x: exit.x, z: exit.z }, outer[exit.to]], width: 2.2 }
  }),
  { points: [CENTER, south.to, south.from, { x: 0, z: 16 }], width: 2 },
  { points: [CENTER, keepStair.from, keepStair.to, { x: 0, z: -11 }], width: 2 },
]

// 사람: 촌장은 모닥불 곁, 대장장이는 광장 동쪽 아래, 아이는 남쪽 계단 아래
const npc = (name) => village.npcs.find((n) => n.name === name)
Object.assign(npc('촌장'), { x: -2.6, z: 2.6 })
Object.assign(npc('대장장이'), { x: 12, z: -3 })
Object.assign(npc('아이'), { x: -2, z: 13 })
village.spawn = { x: 0, z: 5 }

// 소품: 광장·족장의 터·계단·길 위에 걸리는 것은 치우고, 모닥불을 광장 가운데에
const steps = village.terraces.flatMap((t) => t.stairs)
village.props = village.props.filter(
  (p) =>
    !inside(plaza, p) &&
    !inside(keep, p) &&
    steps.every((s) => toLine(p, [s.from, s.to]) > s.width / 2 + 1.5) &&
    village.paths.every((path) => toLine(p, path.points) > path.width / 2 + 1) &&
    dist(p, village.spawn) > 4,
)
village.props.unshift({ kind: 'campfire', x: CENTER.x, z: CENTER.z, size: 1.2, rotation: 0 })

const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { formatRegions, parseRegions } = await vite.ssrLoadModule('/src/data/regions.ts')
  parseRegions(regions)
  writeFileSync(FILE, formatRegions(regions))
  console.log(`${village.name}: 계단식 땅 ${village.terraces.length}(계단 ${steps.length}), 길 ${village.paths.length}, 소품 ${village.props.length}`)
} finally {
  await vite.close()
}

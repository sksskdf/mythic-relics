// 마을 다시 짓기 (E24-07, 사용자 결정 2026-10-28: "마을이 단순해서 입체감이 없다"): 모닥불 마을을 규칙으로 짓는다.
// 가운데 언덕 위 광장(높이 1.5m) → 북쪽에 한 단 더 높은 족장의 터(3m, 긴 집). 광장 둘레 계단이 신화권마다 뻗은 길로 내려간다.
// 아랫마을의 집·대장간, 둘레의 목책과 망루, 북에서 남으로 흐르는 개울과 다리 둘.
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
// 북쪽 끝은 긴 집 뒤에 갇힌 띠가 남지 않게 긴 집 지붕 끝(z −14)에 맞춘다
const keep = rect(-5, -14, 5, -4.5)
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
  { points: [CENTER, south.to, south.from, { x: 4, z: 16 }], width: 2 },
  { points: [CENTER, keepStair.from, keepStair.to, { x: 0, z: -9 }], width: 2 },
]

// 개울: 북쪽 숲에서 내려와 올림포스 길·화과산 길 아래를 지나(다리 둘) 연못을 거쳐 남쪽 숲으로
village.streams = [
  {
    points: [
      { x: 13, z: -32 },
      { x: 13.5, z: -22 },
      { x: 13.2, z: -15.2 },
      { x: 15.5, z: -7 },
      { x: 17, z: -1 },
      { x: 15.6, z: 2.5 },
      { x: 14.5, z: 5.67 },
      { x: 13.6, z: 11 },
      { x: 11.5, z: 17 },
      { x: 10.5, z: 24 },
      { x: 10, z: 32 },
    ],
    width: 2,
  },
]
village.ponds = [{ x: 17.5, z: -1, radius: 2.6 }]
/** 길 방향(from → to)을 x축으로 삼는 소품 회전 */
const facing = (from, to) => Math.atan2(-(to.z - from.z), to.x - from.x)
/** 앞(+z)이 to를 보게 하는 회전 */
const lookAt = (at, to) => Math.atan2(to.x - at.x, to.z - at.z)
const bridges = [
  { kind: 'bridge', x: 13.2, z: -15.2, size: 1, rotation: r2(facing(stairs.olympus.from, { x: 19, z: -21 })) },
  { kind: 'bridge', x: 14.5, z: 5.67, size: 1, rotation: r2(facing(stairs.hwagwasan.from, { x: 21, z: 10 })) },
]

// 사람: 촌장은 모닥불 곁, 대장장이는 대장간 앞, 아이는 남쪽 계단 아래
const npc = (name) => village.npcs.find((n) => n.name === name)
Object.assign(npc('촌장'), { x: -2.6, z: 2.6 })
Object.assign(npc('대장장이'), { x: 11, z: -4.2 })
Object.assign(npc('아이'), { x: -1.5, z: 12.5 })
village.spawn = { x: 0, z: 5 }

// 건물: 족장의 터에 긴 집, 광장에 노점 둘과 우물, 아랫마을에 집 다섯과 대장간
const buildings = [
  { kind: 'longhouse', x: 0, z: -11.6, size: 1, rotation: 0 },
  { kind: 'brazier', x: -3.4, z: -7.2, size: 0.9, rotation: 0 },
  { kind: 'brazier', x: 3.4, z: -7.2, size: 0.9, rotation: 0 },
  { kind: 'stall', x: -6.6, z: 3, size: 1, rotation: r2(lookAt({ x: -6.6, z: 3 }, CENTER)) },
  { kind: 'stall', x: 6.9, z: 6.6, size: 1, rotation: r2(lookAt({ x: 6.9, z: 6.6 }, CENTER)) },
  { kind: 'well', x: 4, z: -2.6, size: 1, rotation: 0 },
  { kind: 'lantern', x: -8, z: 7, size: 1, rotation: 0 },
  { kind: 'forge', x: 12.2, z: -0.4, size: 1, rotation: r2(-Math.PI / 2) },
  { kind: 'house2', x: -14.5, z: -9.5, size: 1, rotation: r2(lookAt({ x: -14.5, z: -9.5 }, { x: -9, z: -4 })) },
  { kind: 'house2', x: -15.5, z: 7.5, size: 1, rotation: r2(Math.PI / 2) },
  { kind: 'house2', x: 8.6, z: -17.5, size: 1, rotation: 0 },
  { kind: 'house', x: -9, z: -17.5, size: 1, rotation: 0 },
  { kind: 'house', x: -9.5, z: 17.5, size: 1, rotation: r2(lookAt({ x: -9.5, z: 17.5 }, { x: -8, z: 13 })) },
  { kind: 'house', x: -1.5, z: 16.5, size: 1, rotation: Math.PI },
  { kind: 'house', x: 7.8, z: 15.4, size: 1, rotation: Math.PI },
  { kind: 'fence', x: -4.6, z: 19.8, size: 1, rotation: 0 },
  { kind: 'fence', x: 4.8, z: 19.2, size: 1, rotation: 0 },
]

// 목책: 걸을 수 있는 네모 안쪽 22.5m 둘레를 3.9m 칸으로, 길·개울이 지나는 곳은 비운다. 망루 셋
const WALL = 22.5
const SEG = 3.9
const gaps = [
  ...village.exits.map((e) => ({ x: e.x, z: e.z })),
  ...densifyLine(village.streams[0].points, 0.5),
]
function densifyLine(points, step) {
  const out = []
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]
    const b = points[i + 1]
    const n = Math.max(1, Math.ceil(dist(a, b) / step))
    for (let k = 0; k < n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, z: a.z + ((b.z - a.z) * k) / n })
  }
  return out
}
const walls = []
for (const [axis, fixed] of [['x', -WALL], ['x', WALL], ['z', -WALL], ['z', WALL]]) {
  for (let t = -WALL + SEG / 2; t < WALL; t += SEG) {
    const at = axis === 'x' ? { x: fixed, z: r2(t) } : { x: r2(t), z: fixed }
    if (gaps.some((g) => dist(g, at) < 4.2)) continue
    walls.push({ kind: 'palisade', ...at, size: 1, rotation: axis === 'x' ? r2(Math.PI / 2) : 0 })
  }
}
const towers = [
  { kind: 'watchtower', x: 20.5, z: 20.5, size: 1, rotation: 0 },
  { kind: 'watchtower', x: -20.5, z: 11, size: 1, rotation: r2(Math.PI / 2) },
  { kind: 'watchtower', x: 4.5, z: -20.5, size: 1, rotation: Math.PI },
]

// 원래 있던 나무·덤불·바위·둔덕 가운데 새 마을과 겹치지 않는 것만 남긴다
const steps = village.terraces.flatMap((t) => t.stairs)
const NATURE = ['pine', 'bush', 'rock', 'mound']
const placed = [...buildings, ...bridges, ...towers]
const clear = (p, room) =>
  !inside(plaza, p) &&
  !inside(keep, p) &&
  steps.every((s) => toLine(p, [s.from, s.to]) > s.width / 2 + room) &&
  village.paths.every((path) => toLine(p, path.points) > path.width / 2 + room) &&
  village.streams.every((st) => toLine(p, st.points) > st.width / 2 + room) &&
  dist(p, village.spawn) > 4
const nature = village.props.filter((p) => NATURE.includes(p.kind) && clear(p, 1.2) && placed.every((b) => dist(b, p) > 4) && Math.abs(p.x) < WALL - 1 && Math.abs(p.z) < WALL - 1)
village.props = [{ kind: 'campfire', x: CENTER.x, z: CENTER.z, size: 1.2, rotation: 0 }, ...buildings, ...bridges, ...towers, ...walls, ...nature]
const blocked = buildings.filter((b) => !['brazier', 'lantern', 'well', 'stall', 'longhouse', 'forge'].includes(b.kind) && !clear(b, 1))
if (blocked.length) console.warn(`길·계단·개울에 걸린 건물: ${blocked.map((b) => `${b.kind}(${b.x}, ${b.z})`).join(' ')}`)

const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { formatRegions, parseRegions } = await vite.ssrLoadModule('/src/data/regions.ts')
  parseRegions(regions)
  writeFileSync(FILE, formatRegions(regions))
  console.log(`${village.name}: 계단식 땅 ${village.terraces.length}(계단 ${steps.length}), 길 ${village.paths.length}, 개울 ${village.streams.length}(다리 ${bridges.length}), 건물 ${buildings.length}, 목책 ${walls.length}, 망루 ${towers.length}, 소품 ${village.props.length}`)
} finally {
  await vite.close()
}

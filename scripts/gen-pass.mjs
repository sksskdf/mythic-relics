// 올림포스 고개 (E241-02, MYTHBUILD.md 4장·CYCLE.md 6장): 우트가르드와 올림포스 사이의 작은 고갯길 하나를 짓는다.
// 서쪽 문(우트가르드)에서 남쪽으로 굽은 길이 계단을 올라 고갯마루(계단식 땅)의 성소를 지나, 북쪽 계단을 내려가 북쪽 문(올림포스)으로 간다.
// 계단 앞 길가에 고개지기와 그의 산양이 선다 (다가가면 탈것을 준다). 무리는 셋, 거리 두는 적(하르피이아)은 하나만.
// 같은 시드면 같은 땅이 나온다. 이미 있는 고개를 덮어쓰고 다른 땅은 건드리지 않는다.
// 사용법: node scripts/gen-pass.mjs && node scripts/place-world.mjs && node scripts/gen-village.mjs   (문 자리는 place-world가 통로 입구로 맞춘다)
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const FILE = 'src/data/regions.json'
const ID = 'pass'
const HALF = 28
/** 문은 가장자리에서 이만큼 안쪽 (world.ts의 EXIT_INSET) */
const DOOR = HALF - 3
const regions = JSON.parse(readFileSync(FILE, 'utf8'))

// 고개지기 이름은 탈것 데이터에서 (장 흐름의 mount 할 일이 이 이름의 사람을 찾는다)
const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { KEEPER } = await vite.ssrLoadModule('/src/data/mount.ts')
await vite.close()

/** 같은 시드면 같은 수 (mulberry32) */
function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
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
const pt = ([x, z]) => ({ x, z })

/** 굽은 길: 꼭짓점 사이를 5m 남짓으로 나누고 옆으로 살짝 흔든다 (꼭짓점에서는 0). 계단 위 구간은 곧게 (straight) */
function road(keys, straight, rand) {
  const out = [keys[0]]
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    const len = dist(a, b)
    const n = straight.has(i) ? 1 : Math.max(1, Math.round(len / 5))
    const side = { x: -(b.z - a.z) / (len || 1), z: (b.x - a.x) / (len || 1) }
    const amp = Math.min(1.8, len / 10) * (rand() < 0.5 ? -1 : 1)
    for (let k = 1; k <= n; k++) {
      const t = k / n
      const s = k === n ? 0 : Math.sin(Math.PI * t) * amp
      out.push({ x: a.x + (b.x - a.x) * t + side.x * s, z: a.z + (b.z - a.z) * t + side.z * s })
    }
  }
  return out.map((p) => ({ x: r2(p.x), z: r2(p.z) }))
}

const rand = rng(41)
const doors = [
  { x: -DOOR, z: 15, to: 'utgard' },
  { x: -23, z: -DOOR, to: 'olympus' },
]
const spawn = { x: -19, z: 15 }
/** 고갯마루: 둘레보다 1m 높은 바위 턱. 서쪽 계단으로 오르고 북쪽 계단으로 내려간다 */
const ridge = {
  points: [[-1, -15], [10, -18], [23, -15], [25, -2], [22, 10], [4, 11], [-1, 4]].map(pt),
  height: 1,
  stairs: [
    { from: { x: -5.5, z: 1 }, to: { x: 0.5, z: 1 }, width: 2.6 },
    { from: { x: 1, z: -19.5 }, to: { x: 1, z: -14 }, width: 2.6 },
  ],
}
const sanctuary = { x: 12, z: -2, radius: 9 }
const keeper = { x: -5, z: 4.6 }
// 큰길: 서쪽 문 → 남쪽으로 굽어 → 서쪽 계단 → 고갯마루 → 북쪽 계단 → 북쪽 문 (계단 위 구간은 곧게)
const keys = [doors[0], [-17, 18], [-10, 14], [-7.5, 6], [-5.5, 1], [0.5, 1], [2, -6], [1, -14], [1, -19.5], [-8, -22], doors[1]].map((k) => (Array.isArray(k) ? pt(k) : { x: k.x, z: k.z }))
const main = { points: road(keys, new Set([3, 4, 5, 6, 7]), rand), width: 2.4 }
// 성소로 갈라지는 짧은 길 (성소 고리 1m 안까지)
const fork = { x: 2, z: -6 }
const toward = { x: sanctuary.x - fork.x, z: sanctuary.z - fork.z }
const len = Math.hypot(toward.x, toward.z)
const reach = len - sanctuary.radius + 1
const branch = { points: [fork, { x: r2(fork.x + (toward.x / len) * reach), z: r2(fork.z + (toward.z / len) * reach) }], width: 2 }
const paths = [main, branch]

const camps = [
  { x: -9, z: 23, count: 4, members: ['spartoi', 'spartoi', 'cyclops', 'spartoi'] },
  { x: -17, z: -8, count: 4, members: ['cyclops', 'spartoi', 'harpy', 'spartoi'] },
  { x: 14, z: 20, count: 3, members: ['spartoi', 'cyclops', 'spartoi'] },
]
const ponds = [{ x: 20, z: -23, radius: 3 }]
for (const c of camps) {
  const near = [...doors.filter((d) => dist(c, d) < 9).map((d) => `문 ${d.to}`), ...(dist(c, spawn) < 9 ? ['시작점'] : []), ...(dist(c, sanctuary) < sanctuary.radius + 10 ? ['성소'] : []), ...(dist(c, keeper) < 12 ? ['고개지기'] : [])]
  if (near.length) console.warn(`고개 무리 (${c.x}, ${c.z})가 ${near.join('·')}에 가깝습니다`)
}

/** 고갯마루 가장자리(절벽)까지 거리 */
const toCliff = (p) => toLine(p, [...ridge.points, ridge.points[0]])
const stairLines = ridge.stairs.map((s) => [s.from, s.to])

// 소품: 성소 둘레 대리석 기둥, 그리고 눈 남은 바위·소나무·사이프러스를 흩뿌림
const props = []
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2 + 0.2
  const p = { x: r2(sanctuary.x + Math.cos(a) * (sanctuary.radius + 1.6)), z: r2(sanctuary.z + Math.sin(a) * (sanctuary.radius + 1.6)) }
  if (paths.some((path) => toLine(p, path.points) < 2.5) || toCliff(p) < 1.2) continue
  props.push({ kind: 'column', x: p.x, z: p.z, size: 1, rotation: r2(a) })
}
const weights = [['rock', 7], ['pine', 4], ['cypress', 3], ['mound', 2], ['column', 1], ['ruin', 1], ['bush', 1], ['olive', 1]]
const total = weights.reduce((s, [, w]) => s + w, 0)
const kind = () => {
  let roll = rand() * total
  for (const [k, w] of weights) if ((roll -= w) < 0) return k
  return weights[0][0]
}
const clear = (p) =>
  paths.every((path) => toLine(p, path.points) > path.width / 2 + 2.2) &&
  camps.every((c) => dist(p, c) > 5.5) &&
  dist(p, sanctuary) > sanctuary.radius + 3.2 &&
  dist(p, spawn) > 6 &&
  dist(p, keeper) > 4 &&
  doors.every((d) => dist(p, d) > 6) &&
  ponds.every((q) => dist(p, q) > q.radius + 1.5) &&
  toCliff(p) > 1.6 &&
  stairLines.every((s) => toLine(p, s) > 3) &&
  props.every((q) => dist(p, q) > 1.8)
for (let tries = 0; props.length < 70 && tries < 8000; tries++) {
  const p = { x: r2((rand() * 2 - 1) * (HALF - 1)), z: r2((rand() * 2 - 1) * (HALF - 1)) }
  if (!clear(p)) continue
  props.push({ kind: kind(), x: p.x, z: p.z, size: r2(0.8 + rand() * 0.5), rotation: r2(rand() * Math.PI * 2) })
}

const old = regions[ID] ?? {}
const pass = {
  name: '올림포스 고개',
  kind: 'field',
  zone: 'entrance',
  realm: 'greek',
  theme: 'pass',
  ...(old.cell ? { cell: old.cell } : {}),
  halfExtent: HALF,
  seed: 41,
  spawn,
  sanctuary,
  ponds,
  terraces: [ridge],
  paths,
  camps,
  exits: doors,
  npcs: [{ ...keeper, name: KEEPER, lines: ['산을 넘는 길은 길고 험하지.', '이 산양을 데려가게. 먼 길은 녀석이 안다네.'], body: [1, 0, 2] }],
  props,
}
// 우트가르드: 거인 왕 너머 북쪽 숲으로 가던 옛 올림포스 길은 왕의 자리에서 끝낸다 (고개 문은 동쪽, 길은 place-world가 낸다)
const utgard = regions.utgard
if (utgard?.boss) {
  for (const path of utgard.paths) {
    const at = path.points.findIndex((p) => dist(p, utgard.boss) < 2.5)
    // 남는 문(요툰헤임·무스펠·고개)으로 이어지는 길은 그대로 둔다
    const keep = utgard.exits.filter((e) => e.to !== 'olympus')
    const tail = path.points.slice(at + 1)
    if (at >= 0 && tail.length > 0 && !tail.some((p) => keep.some((e) => dist(p, e) < 0.6))) {
      path.points = path.points.slice(0, at + 1)
    }
  }
}

// 고개는 리키아 뒤에 둔다 (그리스 입구 들판을 찾는 곳이 올림포스를 먼저 만나게)
const out = {}
for (const [id, region] of Object.entries(regions)) {
  if (id === ID) continue
  out[id] = region
  if (id === 'lycia') out[ID] = pass
}
if (!out[ID]) out[ID] = pass
writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n')
console.log(`${pass.name}(${ID}): 문 ${pass.exits.map((e) => e.to).join('·')}, 무리 ${camps.length}, 소품 ${props.length}`)
console.log('이어서 node scripts/place-world.mjs && node scripts/gen-village.mjs 로 칸·문 자리를 맞춘다')

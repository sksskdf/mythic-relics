// 마지막 무대 만들기 (E22-05): 「갈라진 하늘」을 세계 칸(place-world.mjs CELLS의 sky 자리)에 놓고, 올림포스에서 걸어 들어오게 잇는다 (E239: 이음은 올림포스 하나).
// 남쪽 문(올림포스) → 시작점 → 북쪽으로 꺾인 큰길을 따라 무리 → 큰길 끝의 우트가르드의 왕. 성소는 서쪽 샛길 옆.
// 같은 시드면 같은 땅이 나온다. 이미 있으면 덮어쓰니 규칙을 바꿀 때만 돌린다.
// 사용법: node scripts/gen-finale.mjs && node scripts/place-world.mjs   (통로 자리로 문과 길을 옮긴다)
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const FILE = 'src/data/regions.json'
const HALF = 40
const ID = 'sky'
const SEED = 301
const regions = JSON.parse(readFileSync(FILE, 'utf8'))

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

const rand = rng(SEED)
const pt = (x, z) => ({ x: r2(x), z: r2(z) })
// 두 신화권의 적이 섞여 몰려온다
const enemies = ['grunt', 'draugr', 'wolf', 'frostWitch', 'stoneThrower', 'cyclops', 'harpy', 'spartoi']
const pick = () => enemies[Math.floor(rand() * enemies.length)]

const exits = [{ ...pt(20, 37), to: 'olympus' }]
const spawn = pt(0, 31)
const boss = { ...pt(0, -30), enemy: 'skyKing' }
const main = [pt(0, 31), pt(3, 22), pt(-2, 12), pt(2, 2), pt(-3, -8), pt(1, -18), pt(0, -27)]
const sanctuary = { ...pt(-25, 10), radius: 9 }
const paths = [
  { points: [pt(20, 37), pt(8, 34), spawn], width: 2.4 },
  { points: main, width: 2.4 },
  { points: [pt(-2, 12), pt(-15, 10)], width: 2 },
]
const camps = [
  [12, 20, 4],
  [-12, 2, 4],
  [13, -6, 4],
  [-14, -12, 3],
  [20, 6, 3],
].map(([x, z, count]) => ({ ...pt(x, z), count, members: Array.from({ length: count }, pick) }))
const pond = { ...pt(26, -24), radius: 3.5 }

// 소품: 성소 둘레에 룬석과 기둥을 번갈아, 그리고 거인의 돌밭(바위·죽은 나무·폐허·무덤)을 흩뿌림
const props = []
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2 + 0.2
  const p = pt(sanctuary.x + Math.cos(a) * (sanctuary.radius + 1.6), sanctuary.z + Math.sin(a) * (sanctuary.radius + 1.6))
  if (toLine(p, paths[2].points) < 2.5 || Math.abs(p.x) > HALF - 1 || Math.abs(p.z) > HALF - 1) continue
  props.push({ kind: i % 2 ? 'column' : 'runestone', ...p, size: 1, rotation: r2(a) })
}
const weights = [['rock', 6], ['deadTree', 4], ['ruin', 3], ['mound', 3], ['brazier', 1], ['pine', 2]]
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
  exits.every((e) => dist(p, e) > 6) &&
  dist(p, boss) > 9 &&
  dist(p, pond) > pond.radius + 1.5 &&
  props.every((q) => dist(p, q) > 1.8)
for (let tries = 0; props.length < 110 && tries < 6000; tries++) {
  const p = pt((rand() * 2 - 1) * (HALF - 1), (rand() * 2 - 1) * (HALF - 1))
  if (!clear(p)) continue
  props.push({ kind: kind(), ...p, size: r2(0.8 + rand() * 0.6), rotation: r2(rand() * Math.PI * 2) })
}

// 지역 모듈은 불러올 때 regions.json을 검사하므로, 아직 고치지 않은 파일로 먼저 불러온다 (고친 것은 메모리에서 검사한 뒤 한 번만 쓴다)
const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { formatRegions, parseRegions } = await vite.ssrLoadModule('/src/data/regions.ts')
  const { passages, cellOrigin, CELL } = await vite.ssrLoadModule('/src/data/world.ts')
  regions[ID] = {
    name: '갈라진 하늘',
    kind: 'field',
    zone: 'boss',
    elite: 0.3,
    finale: true,
    realm: 'norse',
    theme: 'sky',
    cell: regions[ID]?.cell ?? { col: -0.5, row: 5 },
    halfExtent: HALF,
    seed: SEED,
    spawn,
    sanctuary,
    ponds: [pond],
    paths,
    camps,
    boss,
    exits: [],
    npcs: [],
    props,
  }
  // 문 잇기: 전에 낸 마지막 무대 문을 걷고, 마지막 무대의 남쪽 문과 올림포스의 북쪽 문을 단다
  for (const region of Object.values(regions)) region.exits = region.exits.filter((e) => e.to !== ID)
  regions[ID].exits = exits
  for (const [from, x] of [['olympus', -20]]) regions[from].exits.push({ x, z: -37, to: ID })
  const placed = Object.fromEntries(Object.entries(regions).map(([id, r]) => [id, { id, cell: r.cell, halfExtent: r.halfExtent, exits: r.exits }]))
  for (const p of passages(placed).filter((q) => q.from === ID || q.to === ID)) {
    for (const [self, other, world] of [[p.from, p.to, p.fromExit], [p.to, p.from, p.toExit]]) {
      const region = regions[self]
      const o = cellOrigin(region.cell)
      const exit = region.exits.find((e) => e.to === other)
      const was = { x: exit.x, z: exit.z }
      exit.x = r2(world.x - o.x)
      exit.z = r2(world.z - o.z)
      const edge = { x: exit.x, z: r2(Math.sign(exit.z) * CELL / 2) }
      if (self === ID) {
        // 마지막 무대: 그 문으로 시작하던 길을 새 문 → 칸 끝까지
        const path = region.paths.find((q) => dist(q.points[0], was) < 0.5)
        path.points[0] = { x: exit.x, z: exit.z }
        path.points.unshift(edge)
      } else {
        // 이웃 들판: 큰길에서 가장 가까운 점 → 문 → 칸 끝 (다시 돌리면 전에 낸 길은 바꾼다)
        region.paths = region.paths.filter((q) => dist(q.points.at(-1), edge) > 0.5)
        const main = region.paths[0].points
        const near = main.reduce((a, b) => (dist(b, exit) < dist(a, exit) ? b : a))
        region.paths.push({ points: [{ ...near }, { x: exit.x, z: exit.z }, edge], width: 2.4 })
      }
      region.props = region.props.filter((prop) => region.paths.every((path) => toLine(prop, path.points) > 2.6) && dist(prop, exit) > 5)
    }
  }
  parseRegions(regions)
  writeFileSync(FILE, formatRegions(regions))
  console.log(`${regions[ID].name}: 무리 ${camps.length}, 소품 ${regions[ID].props.length}, 문 ${regions[ID].exits.map((e) => `${e.to}(${e.x}, ${e.z})`).join(' · ')}`)
} finally {
  await vite.close()
}

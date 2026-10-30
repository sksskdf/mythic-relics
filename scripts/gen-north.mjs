// 한 줄로 이은 북유럽 (E239-01·02, MYTHBUILD.md 4장): 미드가르드 둘레의 땅 다섯을 규칙으로 짓는다.
// 철의 숲(서, 펜리르)·세계 뱀의 바닷가(동, 요르문간드)·요툰헤임 빙하(북서, 스카디·로키의 흔적)·무스펠 경계(북동, 수르트·프레이의 흔적)·우트가르드(북, 거인 왕).
// 땅마다 문 → 모이는 곳 → 수호자 자리(우트가르드는 보스)로 굽은 큰길, 문 가까이 성소(웨이포인트), 길가 무리, 그 땅 소품.
// 미드가르드는 손으로 놓은 입구 들판이라 덮어쓰지 않고, 큰길 양 끝에 철의 숲·바닷가로 가는 문만 낸다.
// 같은 시드면 같은 땅이 나온다. 이미 있는 그 땅을 덮어쓰니 규칙을 바꿀 때만 돌린다.
// 사용법: node scripts/gen-north.mjs && node scripts/place-world.mjs   (문 자리는 place-world가 통로 입구로 맞추고 검사한다)
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const FILE = 'src/data/regions.json'
const HALF = 40
/** 문은 가장자리에서 이만큼 안쪽 (world.ts의 EXIT_INSET) */
const DOOR = HALF - 3
const regions = JSON.parse(readFileSync(FILE, 'utf8'))

// 흔적과 수호자 자리는 신을 깨우는 길 데이터에서 (소품·무리를 비켜 둔다)
const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
const { WAKE } = await vite.ssrLoadModule('/src/data/wake.ts')
await vite.close()
const traces = (id) => Object.values(WAKE).filter((a) => a.trace.region === id).map((a) => a.trace)
const lairs = (id) => Object.values(WAKE).filter((a) => a.guardian.region === id).map((a) => a.guardian)

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
/** 꺾은선 위 가장 가까운 꼭짓점 */
const nearestPoint = (p, points) => points.reduce((a, b) => (dist(b, p) < dist(a, p) ? b : a))

/** 문 자리: 가장자리(n·s·e·w)와 그 가장자리를 따른 자리 */
function door(edge, at) {
  if (edge === 'n') return { x: at, z: -DOOR }
  if (edge === 's') return { x: at, z: DOOR }
  if (edge === 'w') return { x: -DOOR, z: at }
  return { x: DOOR, z: at }
}

/** 굽은 길: 꼭짓점 사이를 5m 남짓으로 나누고 옆으로 살짝 흔든다 (꼭짓점에서는 0) */
function road(keys, width, rand) {
  const out = [keys[0]]
  for (let i = 0; i + 1 < keys.length; i++) {
    const a = keys[i]
    const b = keys[i + 1]
    const len = dist(a, b)
    const n = Math.max(1, Math.round(len / 5))
    const side = { x: -(b.z - a.z) / (len || 1), z: (b.x - a.x) / (len || 1) }
    const amp = Math.min(2.4, len / 10) * (rand() < 0.5 ? -1 : 1)
    for (let k = 1; k <= n; k++) {
      const t = k / n
      const s = k === n ? 0 : Math.sin(Math.PI * t) * amp
      out.push({ x: a.x + (b.x - a.x) * t + side.x * s, z: a.z + (b.z - a.z) * t + side.z * s })
    }
  }
  return { points: out.map((p) => ({ x: r2(p.x), z: r2(p.z) })), width }
}

/**
 * 땅 하나.
 * - doors: 가는 곳마다 { to, edge, at }. 첫 문이 들어오는 문(시작점이 그 앞)
 * - roads: 꼭짓점 목록들 ('door:<to>'는 그 문, 'hub'는 모이는 곳)
 * - sanctuary: 성소(웨이포인트·전설), branch는 성소로 갈라지는 길이 나오는 큰길 차례
 * - camps: [x, z, 수], 무리는 pool에서 뽑는다
 * - props: 소품 종류의 무게, ring: 성소 둘레 상징물
 */
function makeLand(id, def) {
  const rand = rng(def.seed)
  const doors = def.doors.map((d) => ({ ...door(d.edge, d.at), to: d.to }))
  const pick = (k) => (k === 'hub' ? def.hub : typeof k === 'string' ? doors.find((d) => d.to === k.slice(5)) : { x: k[0], z: k[1] })
  const paths = def.roads.map((keys, i) => road(keys.map(pick), i === 0 ? 2.4 : 2.2, rand))
  const sanctuary = { ...def.sanctuary }
  const from = nearestPoint(sanctuary, paths[def.sanctuary.branch].points)
  const toward = { x: sanctuary.x - from.x, z: sanctuary.z - from.z }
  const len = Math.hypot(toward.x, toward.z) || 1
  const reach = Math.max(0, len - sanctuary.radius + 1)
  const branch = { points: [from, { x: r2(from.x + (toward.x / len) * reach), z: r2(from.z + (toward.z / len) * reach) }], width: 2 }
  if (reach > 0.5) paths.push(branch)
  delete sanctuary.branch
  const entry = doors[0]
  const inward = { x: -Math.sign(entry.x) * (Math.abs(entry.x) > Math.abs(entry.z) ? 1 : 0), z: -Math.sign(entry.z) * (Math.abs(entry.z) >= Math.abs(entry.x) ? 1 : 0) }
  const spawn = { x: r2(entry.x + inward.x * 6), z: r2(entry.z + inward.z * 6) }
  const marks = [...traces(id), ...lairs(id)]
  const camps = def.camps.map(([x, z, count]) => ({ x, z, count, members: Array.from({ length: count }, () => def.pool[Math.floor(rand() * def.pool.length)]) }))
  // 무리가 문·시작점·성소·흔적·수호자 자리에 너무 붙지 않았는지 (지을 때 알린다)
  for (const c of camps) {
    const near = [
      ...doors.filter((d) => dist(c, d) < 9).map((d) => `문 ${d.to}`),
      ...(dist(c, spawn) < 9 ? ['시작점'] : []),
      ...(dist(c, sanctuary) < sanctuary.radius + 4 ? ['성소'] : []),
      ...marks.filter((m) => dist(c, m) < 10).map((m) => m.name),
      ...(def.boss && dist(c, def.boss) < 12 ? ['보스'] : []),
    ]
    if (near.length) console.warn(`${id} 무리 (${c.x}, ${c.z})가 ${near.join('·')}에 가깝습니다`)
  }

  // 소품: 성소 둘레 상징물, 그리고 그 땅 소품을 흩뿌림
  const props = []
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2
    const p = { x: r2(sanctuary.x + Math.cos(a) * (sanctuary.radius + 1.6)), z: r2(sanctuary.z + Math.sin(a) * (sanctuary.radius + 1.6)) }
    if (toLine(p, branch.points) < 2.5 || paths.some((path) => toLine(p, path.points) < 2.4) || Math.abs(p.x) > HALF - 1 || Math.abs(p.z) > HALF - 1) continue
    props.push({ kind: def.ring, x: p.x, z: p.z, size: 1, rotation: r2(a) })
  }
  for (const extra of def.landmarks ?? []) props.push({ ...extra })
  const total = def.props.reduce((s, [, w]) => s + w, 0)
  const kind = () => {
    let roll = rand() * total
    for (const [k, w] of def.props) if ((roll -= w) < 0) return k
    return def.props[0][0]
  }
  const ponds = def.ponds.map(([x, z, radius]) => ({ x, z, radius }))
  const clear = (p) =>
    paths.every((path) => toLine(p, path.points) > path.width / 2 + 2.2) &&
    camps.every((c) => dist(p, c) > 5.5) &&
    dist(p, sanctuary) > sanctuary.radius + 3.2 &&
    dist(p, spawn) > 6 &&
    doors.every((d) => dist(p, d) > 6) &&
    marks.every((m) => dist(p, m) > (m.base ? 10 : 6)) &&
    (!def.boss || dist(p, def.boss) > 12) &&
    ponds.every((q) => dist(p, q) > q.radius + 1.5) &&
    props.every((q) => dist(p, q) > 1.8)
  for (let tries = 0; props.length < def.count && tries < 8000; tries++) {
    const p = { x: r2((rand() * 2 - 1) * (HALF - 1)), z: r2((rand() * 2 - 1) * (HALF - 1)) }
    if (!clear(p)) continue
    props.push({ kind: kind(), x: p.x, z: p.z, size: r2(0.8 + rand() * 0.5), rotation: r2(rand() * Math.PI * 2) })
  }
  const old = regions[id] ?? {}
  return {
    name: def.name,
    kind: 'field',
    zone: def.zone,
    ...(def.elite ? { elite: def.elite } : {}),
    realm: 'norse',
    theme: def.theme,
    ...(old.cell ? { cell: old.cell } : {}),
    halfExtent: HALF,
    seed: def.seed,
    spawn,
    sanctuary,
    ponds,
    paths,
    camps,
    ...(def.boss ? { boss: def.boss } : {}),
    exits: doors,
    npcs: [],
    props,
  }
}

/** 북유럽 졸개: 땅마다 그 땅에만 있는 적 둘(E239-04)을 섞는다 */
const POOL = {
  ironwood: ['varg', 'varg', 'varg', 'ironWitch', 'ironWitch', 'wolf', 'grunt'],
  serpentshore: ['seaSerpent', 'seaSerpent', 'drowned', 'drowned', 'draugr', 'draugr', 'grunt'],
  jotunheim: ['grunt', 'grunt', 'wolf', 'wolf', 'stoneThrower', 'stoneThrower', 'draugr', 'frostWitch'],
  muspel: ['fireGiant', 'fireGiant', 'fireGiant', 'emberSpirit', 'emberSpirit', 'stoneThrower', 'draugr'],
  utgard: ['grunt', 'grunt', 'grunt', 'stoneThrower', 'stoneThrower', 'draugr', 'draugr', 'frostWitch', 'wolf'],
}

const LANDS = {
  /** 철의 숲: 미드가르드 서쪽. 동쪽 문에서 숲길이 서북쪽 깊은 곳(펜리르)으로, 성소는 문 가까이 북쪽 */
  ironwood: {
    name: '철의 숲',
    theme: 'ironwood',
    zone: 'deep',
    elite: 0.1,
    seed: 311,
    doors: [{ to: 'midgard', edge: 'e', at: 5 }],
    hub: { x: 2, z: 4 },
    roads: [
      ['door:midgard', [18, 6], 'hub', [-10, -6], [-20, -16]],
      ['hub', [-10, 16], [-22, 26]],
    ],
    sanctuary: { x: 16, z: -20, radius: 10, branch: 0 },
    camps: [[18, 18, 3], [0, -14, 4], [-8, 12, 4], [-24, 4, 4], [-4, -28, 3], [-28, 28, 4]],
    pool: POOL.ironwood,
    ponds: [[-30, -2, 3.5]],
    props: [['pine', 9], ['deadTree', 4], ['rock', 2], ['mound', 2], ['bush', 1]],
    ring: 'runestone',
    count: 150,
  },
  /** 세계 뱀의 바닷가: 미드가르드 동쪽. 서쪽 문에서 자갈 해변을 따라 동북쪽 물가(요르문간드)로, 동쪽 끝은 바다 웅덩이 */
  serpentshore: {
    name: '세계 뱀의 바닷가',
    theme: 'shore',
    zone: 'deep',
    elite: 0.1,
    seed: 313,
    doors: [{ to: 'midgard', edge: 'w', at: -5 }],
    hub: { x: 0, z: -2 },
    roads: [
      ['door:midgard', [-18, -6], 'hub', [12, -10], [18, -16]],
      ['hub', [10, 12], [16, 26]],
    ],
    sanctuary: { x: -18, z: 22, radius: 10, branch: 0 },
    camps: [[-16, -18, 3], [-6, 10, 3], [12, 4, 4], [-2, -26, 4], [26, 10, 4], [24, 30, 3]],
    pool: POOL.serpentshore,
    ponds: [[30, -28, 7], [32, -10, 5], [31, 18, 5], [8, 33, 4]],
    props: [['rock', 6], ['mound', 2], ['deadTree', 3], ['pine', 2], ['bush', 1]],
    ring: 'runestone',
    count: 110,
  },
  /** 요툰헤임 빙하: 미드가르드 북서. 남쪽 문에서 동쪽 큰길이 우트가르드(북)로, 무스펠(동)로 갈라지고, 서쪽 얼음 골짜기에 스카디와 로키의 흔적 */
  jotunheim: {
    name: '요툰헤임 빙하',
    theme: 'glacier',
    zone: 'deep',
    elite: 0.2,
    seed: 101,
    doors: [
      { to: 'midgard', edge: 's', at: 25 },
      { to: 'utgard', edge: 'n', at: 25 },
      { to: 'muspel', edge: 'e', at: -2 },
    ],
    hub: { x: 16, z: 2 },
    roads: [
      ['door:midgard', [20, 20], 'hub', [20, -18], 'door:utgard'],
      ['hub', 'door:muspel'],
      ['hub', [-2, -4], [-14, -14], [-22, -18]],
      [[-2, -4], [-14, 6], [-22, 8]],
    ],
    sanctuary: { x: -4, z: 22, radius: 11, branch: 0 },
    camps: [[10, 32, 3], [31, 12, 4], [5, 6, 5], [31, -14, 4], [6, -24, 5], [-12, -4, 4], [-28, 26, 4]],
    pool: POOL.jotunheim,
    ponds: [[-30, -6, 4], [2, -12, 3]],
    props: [['pine', 5], ['bush', 3], ['rock', 3], ['mound', 2], ['deadTree', 2], ['ruin', 1]],
    ring: 'runestone',
    count: 120,
  },
  /** 무스펠 경계: 미드가르드 북동. 서쪽 문(요툰헤임)에서 북쪽 문(우트가르드)과 동쪽 불길(수르트)로, 남동쪽에 프레이의 흔적 */
  muspel: {
    name: '무스펠 경계',
    theme: 'muspel',
    zone: 'deep',
    elite: 0.25,
    seed: 317,
    doors: [
      { to: 'jotunheim', edge: 'w', at: -2 },
      { to: 'utgard', edge: 'n', at: -25 },
    ],
    hub: { x: -12, z: -2 },
    roads: [
      ['door:jotunheim', 'hub', [6, -2], [16, -10], [20, -14]],
      ['hub', [-22, -18], 'door:utgard'],
      [[6, -2], [10, 12], [14, 18]],
    ],
    sanctuary: { x: -16, z: 22, radius: 10, branch: 0 },
    camps: [[-26, 12, 3], [-2, -16, 4], [0, 12, 4], [12, 0, 4], [30, 28, 4], [8, -30, 4], [-30, -22, 3]],
    pool: POOL.muspel,
    ponds: [[30, 6, 5], [0, -28, 3.5], [33, -30, 5], [-4, 32, 3]],
    props: [['rock', 6], ['deadTree', 4], ['mound', 2], ['ruin', 2], ['brazier', 1]],
    ring: 'runestone',
    count: 110,
  },
  /** 우트가르드: 가장 북쪽. 남쪽 두 문(요툰헤임·무스펠)에서 모인 길이 성터 가운데 거인 왕을 지나 북쪽 고개(올림포스)로 */
  utgard: {
    name: '우트가르드',
    theme: 'utgard',
    zone: 'boss',
    seed: 203,
    doors: [
      { to: 'jotunheim', edge: 's', at: -25 },
      { to: 'muspel', edge: 's', at: 25 },
      { to: 'olympus', edge: 'n', at: 19 },
    ],
    hub: { x: 0, z: 16 },
    roads: [
      ['door:jotunheim', [-14, 26], 'hub', [-4, 2], [0, -12], [10, -24], 'door:olympus'],
      ['door:muspel', [14, 26], 'hub'],
    ],
    boss: { x: 0, z: -14 },
    sanctuary: { x: -26, z: 2, radius: 9, branch: 0 },
    camps: [[0, 30, 4], [22, 12, 4], [-20, 16, 3], [14, 0, 5], [-18, -20, 4], [26, -16, 4]],
    pool: POOL.utgard,
    ponds: [[30, -2, 3.5]],
    props: [['rock', 4], ['ruin', 4], ['pine', 3], ['deadTree', 2], ['mound', 2], ['bush', 2], ['brazier', 1]],
    ring: 'runestone',
    count: 120,
  },
}

const built = Object.fromEntries(Object.entries(LANDS).map(([id, def]) => [id, makeLand(id, def)]))

// 미드가르드: 큰길 서쪽 끝은 철의 숲, 동쪽 끝은 바닷가로 가는 문 (길·소품은 그대로, place-world가 통로 자리로 맞춘다)
const midgard = regions.midgard
const main = midgard.paths[0].points
for (const [to, end] of [['ironwood', main[0]], ['serpentshore', main.at(-1)]]) {
  if (midgard.exits.some((e) => e.to === to)) continue
  midgard.exits.push({ x: r2(Math.sign(end.x) * (midgard.halfExtent - 3)), z: r2(end.z), to })
}

// 마을·미드가르드 다음에 북유럽 새 땅, 그다음은 있던 차례대로
const order = ['village', 'midgard', 'ironwood', 'serpentshore', 'jotunheim', 'muspel', 'utgard']
const out = {}
for (const id of order) out[id] = built[id] ?? regions[id]
for (const [id, region] of Object.entries(regions)) if (!out[id]) out[id] = region
writeFileSync(FILE, JSON.stringify(out, null, 2) + '\n')
for (const [id, land] of Object.entries(built)) console.log(`${land.name}(${id}): 문 ${land.exits.map((e) => e.to).join('·')}, 무리 ${land.camps.length}, 소품 ${land.props.length}, 연못 ${land.ponds.length}`)
console.log('이어서 node scripts/place-world.mjs 로 칸·문 자리를 맞춘다')

// 이어진 세계 만들기 (E15-01~03): 입구 들판 다섯을 다듬고(보스를 빼고 깊은 땅으로 가는 문을 냄), 신화권마다 깊은 땅·보스의 땅을 만든다.
// 같은 시드면 같은 땅이 나온다. 이미 있는 깊은 땅·보스의 땅은 덮어쓴다 (지도 편집기로 고친 것도 사라지니, 처음 한 번 또는 규칙을 바꿀 때만 돌린다).
// 사용법: node scripts/gen-regions.mjs
// 만든 뒤 vite로 src/data/regions.ts를 불러 검사하고, 편집기와 같은 모양(formatRegions)으로 다시 쓴다.
import { readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'vite'

const FILE = 'src/data/regions.json'
const HALF = 40
const regions = JSON.parse(readFileSync(FILE, 'utf8'))

/** 신화권마다: 입구 들판, 새 땅 둘의 id·이름, 성소 둘레 상징물, 보스 */
const REALMS = [
  { realm: 'norse', entrance: 'midgard', deep: ['jotunheim', '요툰헤임 빙하', 'glacier'], boss: ['utgard', '우트가르드', 'utgard'], ring: 'runestone', enemy: undefined },
  { realm: 'greek', entrance: 'olympus', deep: ['delphi', '델포이 골짜기', 'delphi'], boss: ['lycia', '리키아 화산', 'volcano'], ring: 'column', enemy: 'chimera' },
  { realm: 'china', entrance: 'hwagwasan', deep: ['kunlun', '곤륜산 기슭', 'kunlun'], boss: ['huoyanshan', '화염산', 'flame'], ring: 'spire', enemy: 'bullDemonKing' },
  { realm: 'japan', entrance: 'takamagahara', deep: ['izumo', '이즈모 숲', 'izumo'], boss: ['hiikawa', '히이카와 강변', 'river'], ring: 'lantern', enemy: 'orochi' },
  { realm: 'korea', entrance: 'sinsi', deep: ['taebaek', '태백산 숲', 'taebaek'], boss: ['songdo', '송도 옛터', 'ruins'], ring: 'cairn', enemy: 'bulgasari' },
]

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

/** 출구 쪽 단위 벡터 (가장자리 쪽으로 반올림) */
function edgeDir(p) {
  return Math.abs(p.x) >= Math.abs(p.z) ? { x: Math.sign(p.x), z: 0 } : { x: 0, z: Math.sign(p.z) }
}

/** 입구 들판 다듬기: 보스를 빼고, 보스가 있던 쪽 가장자리에 깊은 땅으로 가는 문과 길을 낸다 */
function trimEntrance(def) {
  const region = regions[def.entrance]
  const boss = region.boss
  const dir = edgeDir(boss)
  const exit = { x: dir.x !== 0 ? dir.x * 37 : boss.x, z: dir.z !== 0 ? dir.z * 37 : boss.z }
  // 큰길에서 보스 자리에 가장 가까운 점 → 보스 자리 → 문
  const main = region.paths[0].points
  const from = main.reduce((a, b) => (dist(b, boss) < dist(a, boss) ? b : a))
  const path = { points: [from, { x: boss.x, z: boss.z }, exit].map((p) => ({ x: r2(p.x), z: r2(p.z) })), width: 2.4 }
  delete region.boss
  region.zone = 'entrance'
  region.paths.push(path)
  region.exits.push({ ...exit, to: def.deep[0] })
  region.props = region.props.filter((p) => toLine(p, path.points) > 3 && dist(p, exit) > 5)
  return dir
}

/** 그 신화권 졸개들 (입구 들판 무리에서) */
function realmEnemies(def) {
  return [...new Set(regions[def.entrance].camps.flatMap((c) => c.members ?? []))]
}

/** 그 신화권 소품의 무게 (입구 들판에서, 성소 둘레 상징물은 빼고) */
function propWeights(def) {
  const counts = {}
  for (const p of regions[def.entrance].props) if (p.kind !== def.ring && p.kind !== 'torii' && p.kind !== 'jangseung') counts[p.kind] = (counts[p.kind] ?? 0) + 1
  return Object.entries(counts)
}

/**
 * 새 땅 하나. dir은 들어오는 문의 반대쪽(앞으로 나아가는 쪽).
 * 들어오는 문 → 시작점 → 꺾인 큰길을 따라 무리 → (깊은 땅) 다음 땅의 문 / (보스의 땅) 큰길 끝의 보스. 성소는 샛길 옆.
 */
function makeRegion(def, zone, [id, name, theme], from, onward, dir, seed) {
  const rand = rng(seed)
  const side = { x: -dir.z, z: dir.x }
  const at = (t, s) => ({ x: r2(dir.x * t + side.x * s), z: r2(dir.z * t + side.z * s) })
  const wave = (t) => 5 * Math.sin(t / 13 + seed)
  const end = zone === 'deep' ? 40 : 27
  const main = []
  for (let t = -40; t <= end; t += 8) main.push(at(t, wave(t)))
  main.push(at(end, wave(end)))
  const spawn = at(-31, wave(-31))
  const exits = [{ ...at(-37, wave(-37)), to: from }]
  if (onward) exits.push({ ...at(37, wave(37)), to: onward })
  const sanctT = zone === 'deep' ? -6 : -14
  const sanctuary = { ...at(sanctT, -24), radius: zone === 'deep' ? 11 : 9 }
  const branch = { points: [at(sanctT, wave(sanctT)), at(sanctT, -24 + sanctuary.radius - 1)], width: 2 }
  const enemies = realmEnemies(def)
  const pick = () => enemies[Math.floor(rand() * enemies.length)]
  const campSpots = zone === 'deep' ? [[-15, 9], [-1, -9], [12, 9], [25, -8], [4, 26]] : [[-14, 10], [0, -10], [8, 12]]
  const camps = campSpots.map(([t, s]) => {
    const count = zone === 'deep' ? 4 + Math.floor(rand() * 2) : 3
    return { ...at(t, wave(t) + s), count, members: Array.from({ length: count }, pick) }
  })
  const boss = zone === 'boss' ? { ...at(end, wave(end)), ...(def.enemy ? { enemy: def.enemy } : {}) } : undefined
  const pond = { ...at(14 - rand() * 20, 26), radius: 3.5 }
  const paths = [{ points: main, width: 2.4 }, branch]

  // 소품: 성소 둘레 상징물, 그리고 땅의 소품을 흩뿌림
  const props = []
  const ringCount = 8
  for (let i = 0; i < ringCount; i++) {
    const a = (i / ringCount) * Math.PI * 2 + 0.2
    const p = { x: r2(sanctuary.x + Math.cos(a) * (sanctuary.radius + 1.6)), z: r2(sanctuary.z + Math.sin(a) * (sanctuary.radius + 1.6)) }
    if (toLine(p, branch.points) < 2.5 || Math.abs(p.x) > HALF - 1 || Math.abs(p.z) > HALF - 1) continue
    props.push({ kind: def.ring, x: p.x, z: p.z, size: 1, rotation: r2(a) })
  }
  const weights = propWeights(def)
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
    (!boss || dist(p, boss) > 8) &&
    dist(p, pond) > pond.radius + 1.5 &&
    props.every((q) => dist(p, q) > 1.8)
  for (let tries = 0; props.length < 120 && tries < 6000; tries++) {
    const p = { x: r2((rand() * 2 - 1) * (HALF - 1)), z: r2((rand() * 2 - 1) * (HALF - 1)) }
    if (!clear(p)) continue
    props.push({ kind: kind(), x: p.x, z: p.z, size: r2(0.8 + rand() * 0.5), rotation: r2(rand() * Math.PI * 2) })
  }
  return {
    name,
    kind: 'field',
    zone,
    ...(zone === 'deep' ? { elite: 0.2 } : {}),
    realm: def.realm,
    theme,
    halfExtent: HALF,
    seed,
    spawn,
    sanctuary,
    ponds: [pond],
    paths,
    camps,
    ...(boss ? { boss } : {}),
    exits,
    npcs: [],
    props,
  }
}

const out = {}
for (const [id, region] of Object.entries(regions)) {
  const def = REALMS.find((d) => d.deep[0] === id || d.boss[0] === id)
  if (!def) out[id] = region
}
REALMS.forEach((def, i) => {
  const dir = regions[def.entrance].zone === 'entrance' ? edgeDir(regions[def.entrance].exits.find((e) => e.to === def.deep[0])) : trimEntrance(def)
  out[def.deep[0]] = makeRegion(def, 'deep', def.deep, def.entrance, def.boss[0], dir, 101 + i * 7)
  out[def.boss[0]] = makeRegion(def, 'boss', def.boss, def.deep[0], null, dir, 203 + i * 7)
})
// 마을과 입구 들판을 앞에, 신화권마다 깊은 땅·보스의 땅을 차례로
const order = ['village', ...REALMS.flatMap((d) => [d.entrance, d.deep[0], d.boss[0]])]
const sorted = Object.fromEntries([...order.filter((id) => out[id]), ...Object.keys(out).filter((id) => !order.includes(id))].map((id) => [id, out[id]]))
writeFileSync(FILE, JSON.stringify(sorted, null, 2) + '\n')

// 검사와 편집기 모양으로 다시 쓰기
const vite = await createServer({ configFile: false, server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' })
try {
  const { formatRegions, parseRegions } = await vite.ssrLoadModule('/src/data/regions.ts')
  parseRegions(sorted)
  writeFileSync(FILE, formatRegions(sorted))
  console.log(`지역 ${Object.keys(sorted).length}곳: ${Object.keys(sorted).join(', ')}`)
} finally {
  await vite.close()
}

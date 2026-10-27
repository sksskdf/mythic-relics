import { type PropKind, type RegionDef, REGIONS, type Spot } from '../data/regions'
import { createRng } from './rng'

/**
 * 균열 층 (E17-02, DESIGN.md 9.4): 들어갈 때마다 바뀌는 작은 땅.
 * 시드로 신화권 하나를 골라 그 땅의 얼굴·소품·적을 빌리고, 들어온 문 → 꺾인 길 → 무리 → 다음 층 문 차례로 놓는다.
 * 5층마다 그 신화권 보스, 10층마다 종말 보스(우트가르드의 왕)가 문을 지킨다 (E17-06). 무리는 다시 나타나지 않는다.
 * 지역 생성 규칙(scripts/gen-regions.mjs)을 작은 땅에 맞춘 것이다.
 */
export const RIFT_HALF = 30
/** 다음 층으로 가는 문: 층을 깨면 열린다 (RiftSystem이 빛기둥을 세운다) */
export interface RiftFloor {
  region: RegionDef
  /** 다음 층 문 자리 */
  portal: Spot
  /** 보스 층인가 (5층마다), 종말 보스 층인가 (10층마다) */
  boss: boolean
  doom: boolean
}

/** 종말 보스 (E17-06): 균열 10층마다의 문지기 */
export const DOOM_BOSS = 'utgardKing'

const fields = () => Object.values(REGIONS).filter((r) => r.kind === 'field')

/** 점에서 꺾은선까지 거리 */
function toLine(p: Spot, points: readonly Spot[]): number {
  let best = Infinity
  for (let i = 0; i + 1 < points.length; i++) {
    const a = points[i]!
    const b = points[i + 1]!
    const dx = b.x - a.x
    const dz = b.z - a.z
    const len2 = dx * dx + dz * dz || 1
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2))
    best = Math.min(best, Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t)))
  }
  return best
}

const r2 = (v: number) => Math.round(v * 100) / 100
const dist = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.z - b.z)
/** 성소 둘레 상징물 (흩뿌리지 않는다) */
const RING_KINDS: readonly PropKind[] = ['runestone', 'column', 'spire', 'lantern', 'cairn', 'torii', 'jangseung', 'brazier']

/** depth층 (1부터). 같은 runSeed·depth면 같은 땅 */
export function riftFloor(depth: number, runSeed: number): RiftFloor {
  const rand = createRng(runSeed * 1009 + depth * 97 + 13)
  const pool = fields()
  const template = pool[Math.floor(rand() * pool.length)]!
  const realmFields = pool.filter((r) => r.realm === template.realm)
  const enemies = [...new Set(realmFields.flatMap((r) => r.camps.flatMap((c) => c.members ?? [])))]
  const realmBoss = realmFields.find((r) => r.boss)?.boss?.enemy
  const doom = depth % 10 === 0
  const boss = depth % 5 === 0
  // 나아가는 쪽: 네 방향 가운데 하나
  const dirs = [
    { x: 0, z: -1 },
    { x: 1, z: 0 },
    { x: 0, z: 1 },
    { x: -1, z: 0 },
  ]
  const dir = dirs[Math.floor(rand() * dirs.length)]!
  const side = { x: -dir.z, z: dir.x }
  const phase = rand() * 6
  const wave = (t: number) => 4 * Math.sin(t / 10 + phase)
  const at = (t: number, s: number): Spot => ({ x: r2(dir.x * t + side.x * s), z: r2(dir.z * t + side.z * s) })
  const H = RIFT_HALF
  const main: Spot[] = []
  for (let t = -H; t <= 24; t += 6) main.push(at(t, wave(t)))
  main.push(at(24, wave(24)))
  const spawn = at(-24, wave(-24))
  const leave = at(-28, wave(-28))
  const portal = at(22, wave(22))
  const bossSpot = boss ? at(16, wave(16)) : null
  const pick = () => enemies[Math.floor(rand() * enemies.length)]!
  // 무리: 깊을수록 많고 크다 (보스 층은 둘)
  const count = boss ? 2 : Math.min(6, 3 + Math.floor(depth / 4))
  const camps: RegionDef['camps'] = []
  for (let i = 0; i < count; i++) {
    const t = -12 + (i * (boss ? 10 : 30)) / Math.max(1, count - 1)
    const s = wave(t) + (i % 2 === 0 ? 8 : -8)
    const size = Math.min(6, 3 + Math.floor(depth / 5))
    camps.push({ ...at(t, s), count: size, members: Array.from({ length: size }, pick) })
  }
  const paths = [{ points: main, width: 2.4 }]
  const weights = new Map<PropKind, number>()
  for (const p of template.props) if (!RING_KINDS.includes(p.kind)) weights.set(p.kind, (weights.get(p.kind) ?? 0) + 1)
  const kinds = [...weights.entries()]
  const total = kinds.reduce((s, [, w]) => s + w, 0)
  const kind = (): PropKind => {
    let roll = rand() * total
    for (const [k, w] of kinds) if ((roll -= w) < 0) return k
    return kinds[0]?.[0] ?? 'rock'
  }
  const props: RegionDef['props'] = []
  const clear = (p: Spot) =>
    toLine(p, main) > 3.4 &&
    camps.every((c) => dist(p, c) > 5.5) &&
    dist(p, spawn) > 6 &&
    dist(p, leave) > 6 &&
    dist(p, portal) > 5 &&
    (!bossSpot || dist(p, bossSpot) > 8) &&
    props.every((q) => dist(p, q) > 1.8)
  for (let tries = 0; props.length < 70 && tries < 4000; tries++) {
    const p = { x: r2((rand() * 2 - 1) * (H - 1)), z: r2((rand() * 2 - 1) * (H - 1)) }
    if (clear(p)) props.push({ kind: kind(), x: p.x, z: p.z, size: r2(0.8 + rand() * 0.5), rotation: r2(rand() * Math.PI * 2) })
  }
  const region: RegionDef = {
    id: 'rift',
    name: `균열 ${depth}층`,
    kind: 'rift',
    zone: null,
    finale: false,
    elite: Math.min(0.4, 0.04 * depth),
    realm: template.realm,
    theme: template.theme,
    cell: null,
    halfExtent: H,
    seed: runSeed + depth,
    spawn,
    sanctuary: null,
    ponds: [],
    paths,
    camps,
    boss: bossSpot ? { ...bossSpot, ...(doom ? { enemy: DOOM_BOSS } : realmBoss ? { enemy: realmBoss } : {}) } : null,
    exits: [{ ...leave, to: 'village' }],
    npcs: [],
    props,
  }
  return { region, portal, boss, doom }
}

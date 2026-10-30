/**
 * 지역 데이터 (E7-01): 맵 하나 = 지역 하나. 지형 테마, 소품 배치, 시작점·성소·무리·보스·출구가 `regions.json`에 있다.
 * 개발 패널의 지도 편집기(src/dev/RegionEditor.ts)가 같은 파일을 고쳐 쓴다. 숫자만 바꿔도 되고 편집기로 찍어도 된다.
 */
import { REALM_COLORS as PALETTE_REALMS } from '../art/palette'
import { THEME_IDS, type ThemeId } from '../world/themes'
import { DataError, list, num, type Obj, obj, oneOf, onlyKeys, optNum, str, table } from './check'
import { REALMS, type Realm } from './classKit'
import raw from './regions.json'
import { adjacency, CELL, type Cell, cellKey, cellOrigin, passages, validCell } from './world'

/** 지형 테마: 땅 색·흩뿌림·테두리 숲·하늘빛 (src/world/themes.ts) */
export const REGION_THEMES = THEME_IDS
export type RegionTheme = ThemeId

/** 지역에 놓는 소품 종류 (src/world/regionMap.ts의 BUILDERS) */
export const PROP_KINDS = [
  'pine', 'rock', 'mound', 'ruin', 'deadTree', 'bush', 'runestone', 'brazier',
  'olive', 'cypress', 'column', 'peach', 'spire', 'bamboo', 'cherry', 'torii', 'lantern', 'maple', 'cairn', 'jangseung',
  'house', 'campfire', 'well', 'fence',
  // 마을 다시 짓기 (E24-07)
  'palisade', 'watchtower', 'longhouse', 'house2', 'forge', 'stall', 'bridge',
] as const
export type PropKind = (typeof PROP_KINDS)[number]

/** 지역 종류: 싸우는 필드 / 적이 없는 마을 (E7-04) / 끝없는 원정의 층 (E17·E305, 데이터에는 없고 그때그때 만든다) */
export const REGION_KINDS = ['field', 'hub', 'endless'] as const
export type RegionKind = (typeof REGION_KINDS)[number]

/** 필드의 자리 (E15-01): 입구 들판(마을과 이어짐) → 깊은 땅(정예·전설 성소) → 보스의 땅(신화 보스 무대) */
export const REGION_ZONES = ['entrance', 'deep', 'boss'] as const
export type RegionZone = (typeof REGION_ZONES)[number]

export type FieldRealm = Exclude<Realm, 'hidden'>

/** 신화권 색: 출구의 빛기둥·지도. 마을은 모닥불 빛 */
/** 신화권 색 (`src/art/palette.ts`) */
export const REALM_COLORS: Readonly<Record<FieldRealm | 'hub', number>> = PALETTE_REALMS

export interface Spot {
  x: number
  z: number
}

export interface PropPlacement extends Spot {
  kind: PropKind
  /** 크기 배율 */
  size: number
  /** 회전 (라디안) */
  rotation: number
}

/** 마을 사람: 가까이 가면 머리 위에 한두 줄 말을 한다 */
export interface NpcDef extends Spot {
  name: string
  lines: string[]
  /** 기본 모습: 피부·머리카락·옷 색 번호 (src/looks/body.ts의 BODY_OPTIONS) */
  body: [number, number, number]
}

export interface RegionDef {
  id: string
  name: string
  kind: RegionKind
  /** 필드의 자리 (마을은 null) */
  zone: RegionZone | null
  /** 무리에 정예가 섞일 확률에 더하는 값 (깊은 땅) */
  elite: number
  /** 마지막 무대 (E22-05): 신화권 셋씩의 줄 밖에 있고, 두 신화권의 적이 섞인다 */
  finale: boolean
  /** 이 지역에서 주로 떨어지는 유물의 신화권 (마을은 없음) */
  realm: FieldRealm | null
  theme: RegionTheme
  /** 하나로 이어진 세계의 칸 (E19, `src/data/world.ts`). 세계 밖의 끝없는 원정 층은 null */
  cell: Cell | null
  /** 움직일 수 있는 범위 (한 변의 절반, m) */
  halfExtent: number
  /** 흩뿌림·테두리 숲의 시드 */
  seed: number
  spawn: Spot
  /** 승급 전설 성소와 결계 반지름 (마을은 없음) */
  sanctuary: (Spot & { radius: number }) | null
  /** 연못 같은 평평한 웅덩이 */
  ponds: (Spot & { radius: number })[]
  /** 개울 (E24-07): 꺾은선을 따라 흐르는 얕은 물. 건너지 못하고, 다리(소품 bridge) 자리에서만 건넌다 */
  streams: { points: Spot[]; width: number }[]
  /** 계단식 땅 (E24-07): 둘레보다 높은 평평한 땅(꼭짓점·높이)과, 아랫땅 발치(from)에서 윗면(to)으로 오르는 계단 */
  terraces: { points: Spot[]; height: number; stairs: { from: Spot; to: Spot; width: number }[] }[]
  /** 다져진 길: 점을 잇는 꺾은선과 폭 */
  paths: { points: Spot[]; width: number }[]
  /** 적 무리: 수와 무리를 이루는 적 (enemies.json의 id, 없으면 졸개) */
  camps: (Spot & { count: number; members?: string[] })[]
  /** 지역 보스가 기다리는 곳과 보스 (마을은 없음, enemy가 없으면 거인 왕) */
  boss: (Spot & { enemy?: string }) | null
  /** 다른 지역으로 가는 길 끝 */
  exits: (Spot & { to: string })[]
  npcs: NpcDef[]
  props: PropPlacement[]
}

/** 시작점 둘레에 소품을 두지 않는 반지름 */
export const SPAWN_CLEAR = 4

function spot(raw: unknown, path: string, extra: readonly string[], half: number): Obj & Spot {
  const o = obj(raw, path)
  onlyKeys(o, path, ['x', 'z', ...extra])
  const x = num(o, 'x', path, { min: -half, max: half })
  const z = num(o, 'z', path, { min: -half, max: half })
  return { ...o, x, z }
}

function spots(o: Obj, key: string, path: string): unknown[] {
  const v = o[key] ?? []
  if (!Array.isArray(v)) throw new DataError(`${path}.${key}`, '목록이어야 합니다')
  return v
}

/** 점이 꼭짓점들로 둘러싼 땅 안에 있나 (짝홀 규칙) */
export function insideOutline(points: readonly Spot[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!
    const b = points[j]!
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside
  }
  return inside
}

/** 계단식 땅 하나 (E24-07): 꼭짓점 셋 이상, 높이는 0.5m 단위, 계단은 바깥 발치에서 안쪽 윗면으로 */
function parseTerrace(raw: unknown, q: string, half: number): RegionDef['terraces'][number] {
  const o = obj(raw, q)
  onlyKeys(o, q, ['points', 'height', 'stairs'])
  const points = list(o, 'points', q).map((pt, j) => {
    const s = spot(pt, `${q}.points[${j}]`, [], half)
    return { x: s.x, z: s.z }
  })
  if (points.length < 3) throw new DataError(`${q}.points`, '꼭짓점이 셋 이상이어야 합니다')
  const height = num(o, 'height', q, { min: 0.5, max: 6 })
  if (Math.abs(height * 2 - Math.round(height * 2)) > 1e-6) throw new DataError(`${q}.height`, '높이는 0.5m 단위여야 합니다 (땅 복셀 한 칸)')
  const stairs = (o.stairs === undefined ? [] : list(o, 'stairs', q)).map((r, j) => {
    const sq = `${q}.stairs[${j}]`
    const so = obj(r, sq)
    onlyKeys(so, sq, ['from', 'to', 'width'])
    const from = spot(so.from, `${sq}.from`, [], half)
    const to = spot(so.to, `${sq}.to`, [], half)
    if (!insideOutline(points, to.x, to.z)) throw new DataError(`${sq}.to`, '계단 윗끝은 계단식 땅 안이어야 합니다')
    if (insideOutline(points, from.x, from.z)) throw new DataError(`${sq}.from`, '계단 발치는 계단식 땅 밖이어야 합니다')
    const width = num(so, 'width', sq, { min: 1, max: 6 })
    return { from: { x: from.x, z: from.z }, to: { x: to.x, z: to.z }, width }
  })
  return { points, height, stairs }
}

/** regions.json 검사. 위치는 지역 안에 있어야 하고, 출구는 있는 지역으로 이어져야 한다. */
export function parseRegions(rawRegions: unknown, path = 'regions.json'): Record<string, RegionDef> {
  const out: Record<string, RegionDef> = {}
  for (const [id, o] of table(rawRegions, path)) {
    const p = `${path}.${id}`
    onlyKeys(o, p, ['name', 'kind', 'zone', 'elite', 'finale', 'realm', 'theme', 'cell', 'halfExtent', 'seed', 'spawn', 'sanctuary', 'ponds', 'streams', 'terraces', 'paths', 'camps', 'boss', 'exits', 'npcs', 'props'])
    const half = num(o, 'halfExtent', p, { min: 10, max: CELL / 2 - 4 })
    const c = obj(o.cell, `${p}.cell`)
    onlyKeys(c, `${p}.cell`, ['col', 'row'])
    const cell = { col: num(c, 'col', `${p}.cell`), row: num(c, 'row', `${p}.cell`) }
    if (!validCell(cell)) throw new DataError(`${p}.cell`, '벽돌 자리여야 합니다 (짝수 줄은 정수 칸, 홀수 줄은 반 칸)')
    const kind = o.kind === undefined ? 'field' : oneOf(o, 'kind', p, REGION_KINDS)
    let realm: FieldRealm | null = null
    if (o.realm !== undefined) {
      const r = oneOf(o, 'realm', p, REALMS)
      if (r === 'hidden') throw new DataError(`${p}.realm`, '지역의 신화권은 히든일 수 없습니다')
      realm = r
    }
    let sanctuary: RegionDef['sanctuary'] = null
    if (o.sanctuary !== undefined) {
      const s = spot(o.sanctuary, `${p}.sanctuary`, ['radius'], half)
      sanctuary = { x: s.x, z: s.z, radius: num(s, 'radius', `${p}.sanctuary`, { min: 4, max: 20 }) }
    }
    const region: RegionDef = {
      id,
      name: str(o, 'name', p),
      kind,
      zone: o.zone === undefined ? null : oneOf(o, 'zone', p, REGION_ZONES),
      elite: optNum(o, 'elite', p) ?? 0,
      finale: o.finale === true,
      realm,
      theme: oneOf(o, 'theme', p, REGION_THEMES),
      cell,
      halfExtent: half,
      seed: num(o, 'seed', p),
      spawn: spot(o.spawn, `${p}.spawn`, [], half),
      sanctuary,
      ponds: spots(o, 'ponds', p).map((r, i) => {
        const s = spot(r, `${p}.ponds[${i}]`, ['radius'], half)
        return { x: s.x, z: s.z, radius: num(s, 'radius', `${p}.ponds[${i}]`, { min: 1, max: 12 }) }
      }),
      streams: spots(o, 'streams', p).map((r, i) => {
        const q = `${p}.streams[${i}]`
        const so = obj(r, q)
        onlyKeys(so, q, ['points', 'width'])
        // 개울은 숲 띠로 흘러 나갈 수 있다 (칸 끝까지)
        const points = list(so, 'points', q).map((pt, j) => {
          const s = spot(pt, `${q}.points[${j}]`, [], CELL / 2)
          return { x: s.x, z: s.z }
        })
        if (points.length < 2) throw new DataError(`${q}.points`, '점이 둘 이상이어야 합니다')
        return { points, width: num(so, 'width', q, { min: 1, max: 6 }) }
      }),
      terraces: spots(o, 'terraces', p).map((r, i) => parseTerrace(r, `${p}.terraces[${i}]`, half)),
      paths: spots(o, 'paths', p).map((r, i) => {
        const q = `${p}.paths[${i}]`
        const po = obj(r, q)
        onlyKeys(po, q, ['points', 'width'])
        const points = list(po, 'points', q).map((pt, j) => {
          // 길은 숲 띠를 지르는 통로까지 이어질 수 있다 (칸 끝까지)
          const s = spot(pt, `${q}.points[${j}]`, [], CELL / 2)
          return { x: s.x, z: s.z }
        })
        if (points.length < 2) throw new DataError(`${q}.points`, '점이 둘 이상이어야 합니다')
        return { points, width: num(po, 'width', q, { min: 0.5, max: 8 }) }
      }),
      camps: spots(o, 'camps', p).map((r, i) => {
        const q = `${p}.camps[${i}]`
        const s = spot(r, q, ['count', 'members'], half)
        const members = s.members === undefined ? undefined : list(s, 'members', q).map((m, j) => {
          if (typeof m !== 'string') throw new DataError(`${q}.members[${j}]`, '적 id여야 합니다')
          return m
        })
        return { x: s.x, z: s.z, count: num(s, 'count', q, { min: 1, max: 12 }), ...(members ? { members } : {}) }
      }),
      boss: o.boss === undefined ? null : (() => {
        const s = spot(o.boss, `${p}.boss`, ['enemy'], half)
        return { x: s.x, z: s.z, ...(s.enemy === undefined ? {} : { enemy: str(s, 'enemy', `${p}.boss`) }) }
      })(),
      exits: spots(o, 'exits', p).map((r, i) => {
        const s = spot(r, `${p}.exits[${i}]`, ['to'], half)
        return { x: s.x, z: s.z, to: str(s, 'to', `${p}.exits[${i}]`) }
      }),
      npcs: spots(o, 'npcs', p).map((r, i) => {
        const q = `${p}.npcs[${i}]`
        const s = spot(r, q, ['name', 'lines', 'body'], half)
        const lines = list(s, 'lines', q).map((line, j) => {
          if (typeof line !== 'string' || line.length === 0 || line.length > 40) throw new DataError(`${q}.lines[${j}]`, '1~40글자 말이어야 합니다')
          return line
        })
        if (lines.length === 0 || lines.length > 3) throw new DataError(`${q}.lines`, '말은 한두 줄(많아야 셋)입니다')
        const body = list(s, 'body', q)
        if (body.length !== 3 || body.some((v) => !Number.isInteger(v) || (v as number) < 0 || (v as number) > 3)) {
          throw new DataError(`${q}.body`, '피부·머리카락·옷 색 번호 셋(0~3)이어야 합니다')
        }
        return { x: s.x, z: s.z, name: str(s, 'name', q), lines, body: body as [number, number, number] }
      }),
      props: spots(o, 'props', p).map((r, i) => {
        const s = spot(r, `${p}.props[${i}]`, ['kind', 'size', 'rotation'], half)
        const q = `${p}.props[${i}]`
        return {
          kind: oneOf(s, 'kind', q, PROP_KINDS),
          x: s.x,
          z: s.z,
          size: num(s, 'size', q, { min: 0.2, max: 4 }),
          rotation: optNum(s, 'rotation', q) ?? 0,
        }
      }),
    }
    if (kind === 'field') {
      if (!realm) throw new DataError(`${p}.realm`, '필드는 신화권이 있어야 합니다')
      if (region.camps.length === 0) throw new DataError(`${p}.camps`, '졸개 무리가 하나 이상 있어야 합니다')
      if (!region.zone) throw new DataError(`${p}.zone`, '필드는 자리(entrance·deep·boss)가 있어야 합니다')
      if ((region.zone === 'boss') !== (region.boss !== null)) throw new DataError(`${p}.boss`, '보스 자리는 보스의 땅에만 있어야 합니다')
      if (!region.sanctuary) throw new DataError(`${p}.sanctuary`, '필드는 성소가 있어야 합니다 (워프)')
      if (region.elite < 0 || region.elite > 0.5) throw new DataError(`${p}.elite`, '정예 확률은 0~0.5입니다')
      if (region.finale && !region.boss) throw new DataError(`${p}.boss`, '마지막 무대에는 보스가 있어야 합니다')
    } else if (region.camps.length > 0 || region.boss || region.zone) throw new DataError(`${p}.camps`, '마을에는 적과 자리를 두지 않습니다')
    out[id] = region
  }
  for (const region of Object.values(out)) {
    region.exits.forEach((exit, i) => {
      if (!out[exit.to]) throw new DataError(`${path}.${region.id}.exits[${i}].to`, `regions.json에 없는 지역입니다 ("${exit.to}")`)
      if (exit.to === region.id) throw new DataError(`${path}.${region.id}.exits[${i}].to`, '자기 자신으로 가는 출구입니다')
    })
    region.props.forEach((prop, i) => {
      if (Math.hypot(prop.x - region.spawn.x, prop.z - region.spawn.z) < SPAWN_CLEAR) {
        throw new DataError(`${path}.${region.id}.props[${i}]`, `시작점 ${SPAWN_CLEAR}m 안에 소품을 둘 수 없습니다`)
      }
    })
  }
  // 이웃은 서로 이어진다: 가는 출구가 있으면 돌아오는 출구도 있다 (E15-01)
  for (const region of Object.values(out)) {
    region.exits.forEach((exit, i) => {
      if (!out[exit.to]!.exits.some((back) => back.to === region.id)) throw new DataError(`${path}.${region.id}.exits[${i}].to`, `${exit.to}에서 돌아오는 출구가 없습니다`)
    })
  }
  // 세계 칸 (E19): 칸마다 지역 하나, 출구는 이웃 칸으로만
  const taken = new Map<string, string>()
  for (const region of Object.values(out)) {
    const key = cellKey(region.cell!)
    if (taken.has(key)) throw new DataError(`${path}.${region.id}.cell`, `칸이 겹칩니다: ${taken.get(key)}`)
    taken.set(key, region.id)
  }
  for (const region of Object.values(out)) {
    region.exits.forEach((exit, i) => {
      if (!adjacency(region.cell!, out[exit.to]!.cell!)) throw new DataError(`${path}.${region.id}.exits[${i}].to`, `이웃 칸이 아닙니다: ${exit.to} (출구는 이웃 칸으로만)`)
    })
  }
  // 출구는 이웃 사이 통로의 입구에 선다 (옮기는 것은 scripts/place-world.mjs)
  const placed = Object.fromEntries(Object.values(out).map((r) => [r.id, { ...r, cell: r.cell! }]))
  for (const passage of passages(placed)) {
    for (const [self, other, at] of [[passage.from, passage.to, passage.fromExit], [passage.to, passage.from, passage.toExit]] as const) {
      const region = out[self]!
      const o = cellOrigin(region.cell!)
      const i = region.exits.findIndex((e) => e.to === other)
      const exit = region.exits[i]!
      const want = { x: Math.round((at.x - o.x) * 100) / 100, z: Math.round((at.z - o.z) * 100) / 100 }
      if (Math.hypot(exit.x - want.x, exit.z - want.z) > 0.05) {
        throw new DataError(`${path}.${self}.exits[${i}]`, `통로 입구 (${want.x}, ${want.z})에 있어야 합니다 (node scripts/place-world.mjs)`)
      }
    }
  }
  if (Object.keys(out).length === 0) throw new DataError(path, '지역이 하나 이상 있어야 합니다')
  return out
}

/**
 * regions.json으로 쓸 글. 숫자 몇 개짜리 작은 객체(위치·소품)는 한 줄에 하나씩 둬서 편집기로 고친 diff가 읽히게 한다.
 * 편집기의 저장과 검사 테스트가 같은 모양을 쓴다.
 */
export function formatRegions(regions: Record<string, unknown>): string {
  const round = (_key: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)
  const text = JSON.stringify(regions, round, 2)
    // 짧은 값 목록(무리 구성·몸 색 번호)은 한 줄로
    .replace(/\[\n\s+([^{}[\]"]*?|"[^{}[\]]*?")\n\s*\]/g, (m, inner: string) => {
      const line = `[${inner.split(/,\n\s*/).join(', ')}]`
      return line.length <= 80 ? line : m
    })
    .replace(/\{\n\s+("(?:[^{}[\]]|\[[^\n{}[\]]*\])*?)\n\s*\}/g, (_m, inner: string) => `{ ${inner.split(/,\n\s*/).join(', ')} }`)
  return `${text}\n`
}

/** 검사를 마친 지역들. 마을(첫 hub)에서 시작한다 */
export const REGIONS: Readonly<Record<string, RegionDef>> = parseRegions(raw)
export const START_REGION = Object.values(REGIONS).find((r) => r.kind === 'hub')?.id ?? Object.keys(REGIONS)[0]!

/** 출구 빛기둥 색: 갈 곳의 신화권 색 (마을이면 모닥불 빛) */
export function exitColor(to: string): number {
  const region = REGIONS[to]
  return region?.realm ? REALM_COLORS[region.realm] : REALM_COLORS.hub
}

/** from에서 to로 가려면 먼저 넘어갈 이웃 지역 (출구를 따라 가장 적게 넘는 길). 같거나 길이 없으면 null (E15-07) */
export function nextHop(from: string, to: string, regions: Readonly<Record<string, RegionDef>> = REGIONS): string | null {
  if (from === to || !regions[from] || !regions[to]) return null
  const firstStep = new Map<string, string>()
  const queue: string[] = []
  for (const e of regions[from]!.exits) {
    if (firstStep.has(e.to)) continue
    firstStep.set(e.to, e.to)
    queue.push(e.to)
  }
  while (queue.length > 0) {
    const id = queue.shift()!
    if (id === to) return firstStep.get(id)!
    for (const e of regions[id]?.exits ?? []) {
      if (e.to === from || firstStep.has(e.to)) continue
      firstStep.set(e.to, firstStep.get(id)!)
      queue.push(e.to)
    }
  }
  return null
}

/** 들어간 곳: 갈 지역에서 온 지역으로 되돌아가는 출구 앞 (없으면 시작점) */
export function arrivalSpot(to: RegionDef, from: string): Spot {
  const back = to.exits.find((e) => e.to === from)
  if (!back) return to.spawn
  // 출구에서 지역 가운데 쪽으로 몇 걸음 들어온 곳 (바로 다시 나가지 않게)
  const len = Math.hypot(back.x, back.z) || 1
  const step = Math.min(4, len)
  return { x: back.x - (back.x / len) * step, z: back.z - (back.z / len) * step }
}
export const RAW_REGIONS = raw as Record<string, unknown>

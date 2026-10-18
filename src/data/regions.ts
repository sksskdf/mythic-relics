/**
 * 지역 데이터 (E7-01): 맵 하나 = 지역 하나. 지형 테마, 소품 배치, 시작점·성소·무리·보스·출구가 `regions.json`에 있다.
 * 개발 패널의 지도 편집기(src/dev/RegionEditor.ts)가 같은 파일을 고쳐 쓴다. 숫자만 바꿔도 되고 편집기로 찍어도 된다.
 */
import { DataError, num, type Obj, obj, oneOf, onlyKeys, optNum, str, table } from './check'
import { REALMS, type Realm } from './classKit'
import raw from './regions.json'

/** 지형 테마: 땅 색·흩뿌림·테두리 숲·하늘빛 (src/world/themes.ts) */
export const REGION_THEMES = ['snow'] as const
export type RegionTheme = (typeof REGION_THEMES)[number]

/** 지역에 놓는 소품 종류 (src/world/regionMap.ts의 BUILDERS) */
export const PROP_KINDS = ['pine', 'rock', 'mound', 'ruin', 'deadTree', 'bush', 'runestone', 'brazier'] as const
export type PropKind = (typeof PROP_KINDS)[number]

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

export interface RegionDef {
  id: string
  name: string
  /** 이 지역에서 주로 떨어지는 유물의 신화권 */
  realm: Exclude<Realm, 'hidden'>
  theme: RegionTheme
  /** 움직일 수 있는 범위 (한 변의 절반, m) */
  halfExtent: number
  /** 흩뿌림·테두리 숲의 시드 */
  seed: number
  spawn: Spot
  /** 승급 전설 성소와 결계 반지름 */
  sanctuary: Spot & { radius: number }
  /** 얼어붙은 연못 같은 평평한 웅덩이 */
  ponds: (Spot & { radius: number })[]
  /** 졸개 무리 */
  camps: (Spot & { count: number })[]
  /** 지역 보스가 기다리는 곳 */
  boss: Spot
  /** 다른 지역으로 가는 길 끝 */
  exits: (Spot & { to: string })[]
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
  const v = o[key]
  if (!Array.isArray(v)) throw new DataError(`${path}.${key}`, '목록이어야 합니다')
  return v
}

/** regions.json 검사. 위치는 지역 안에 있어야 하고, 출구는 있는 지역으로 이어져야 한다. */
export function parseRegions(rawRegions: unknown, path = 'regions.json'): Record<string, RegionDef> {
  const out: Record<string, RegionDef> = {}
  for (const [id, o] of table(rawRegions, path)) {
    const p = `${path}.${id}`
    onlyKeys(o, p, ['name', 'realm', 'theme', 'halfExtent', 'seed', 'spawn', 'sanctuary', 'ponds', 'camps', 'boss', 'exits', 'props'])
    const half = num(o, 'halfExtent', p, { min: 10, max: 120 })
    const realm = oneOf(o, 'realm', p, REALMS)
    if (realm === 'hidden') throw new DataError(`${p}.realm`, '지역의 신화권은 히든일 수 없습니다')
    const sanctuary = spot(o.sanctuary, `${p}.sanctuary`, ['radius'], half)
    out[id] = {
      id,
      name: str(o, 'name', p),
      realm,
      theme: oneOf(o, 'theme', p, REGION_THEMES),
      halfExtent: half,
      seed: num(o, 'seed', p),
      spawn: spot(o.spawn, `${p}.spawn`, [], half),
      sanctuary: { x: sanctuary.x, z: sanctuary.z, radius: num(sanctuary, 'radius', `${p}.sanctuary`, { min: 4, max: 20 }) },
      ponds: spots(o, 'ponds', p).map((r, i) => {
        const s = spot(r, `${p}.ponds[${i}]`, ['radius'], half)
        return { x: s.x, z: s.z, radius: num(s, 'radius', `${p}.ponds[${i}]`, { min: 1, max: 12 }) }
      }),
      camps: spots(o, 'camps', p).map((r, i) => {
        const s = spot(r, `${p}.camps[${i}]`, ['count'], half)
        return { x: s.x, z: s.z, count: num(s, 'count', `${p}.camps[${i}]`, { min: 1, max: 12 }) }
      }),
      boss: spot(o.boss, `${p}.boss`, [], half),
      exits: spots(o, 'exits', p).map((r, i) => {
        const s = spot(r, `${p}.exits[${i}]`, ['to'], half)
        return { x: s.x, z: s.z, to: str(s, 'to', `${p}.exits[${i}]`) }
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
    if (out[id]!.camps.length === 0) throw new DataError(`${p}.camps`, '졸개 무리가 하나 이상 있어야 합니다')
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
  if (Object.keys(out).length === 0) throw new DataError(path, '지역이 하나 이상 있어야 합니다')
  return out
}

/**
 * regions.json으로 쓸 글. 숫자 몇 개짜리 작은 객체(위치·소품)는 한 줄에 하나씩 둬서 편집기로 고친 diff가 읽히게 한다.
 * 편집기의 저장과 검사 테스트가 같은 모양을 쓴다.
 */
export function formatRegions(regions: Record<string, unknown>): string {
  const round = (_key: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v)
  const text = JSON.stringify(regions, round, 2).replace(/\{\n\s+("[^{}[\]]*?)\n\s*\}/g, (_m, inner: string) => `{ ${inner.split(/,\n\s*/).join(', ')} }`)
  return `${text}\n`
}

/** 검사를 마친 지역들. 첫 지역에서 시작한다 */
export const REGIONS: Readonly<Record<string, RegionDef>> = parseRegions(raw)
export const START_REGION = Object.keys(REGIONS)[0]!
export const RAW_REGIONS = raw as Record<string, unknown>

/**
 * 클래스 부품 (E6-09): 발현 패시브·궁극기·승급 전설을 종류별 부품으로 두고, 클래스는 gods.json에서 골라 숫자만 정한다.
 * 새 클래스는 이 부품들을 조합하는 데이터만으로 만든다. 새로운 종류가 꼭 필요할 때만 여기와 src/skills/ClassPassives.ts·Ultimate.ts에 더한다.
 * 레벨마다 달라지는 수(Leveled)는 숫자 하나 또는 [Lv1, Lv2, Lv3, Lv4]로 쓴다.
 */
import { color, DataError, type Leveled, leveled, num, type Obj, obj, oneOf, onlyKeys, optNum, str } from './check'

/** 하늘에서 내리치는 것의 모양 (hammer: 번개 두른 망치가 떨어짐, storm: 북 울림 고리와 번개 여럿, E18) */
export const SKY_STYLES = ['lightning', 'sun', 'moon', 'stone', 'water', 'fire', 'hammer', 'storm'] as const
/** 동료·분신의 모습 */
export const COMPANION_LOOKS = ['shadow', 'monkey', 'shade', 'spirit', 'raven', 'boar', 'hound'] as const
/** 몸 둘레를 도는 것의 모양 */
export const ORBIT_SHAPES = ['orb', 'ring', 'flame', 'bead', 'mirror'] as const
/** 궁극기 종류 */
export const ULTIMATE_KINDS = ['skyBarrage', 'legion', 'bladeDance', 'wave', 'rain'] as const
/** 비처럼 쏟아지는 것 */
export const RAIN_STYLES = ['arrow', 'spear', 'fire', 'star', 'petal', 'stone', 'foxfire'] as const
/** 퍼지는 물결의 모양 (E18): 꽃잎·물벽·겹물결·어둠 원반·칼바람·혼령 */
export const WAVE_STYLES = ['bloom', 'tide', 'ripple', 'night', 'gale', 'spirit'] as const
/** 칼춤의 모양 (E18): 여섯 칼, 불꽃 */
export const BLADE_STYLES = ['six', 'fire'] as const
/** 승급 전설 종류: 무리 뒤 보스 / 시간 안에 처치 수 / 시간 동안 버티기 */
export const LEGEND_KINDS = ['boss', 'tally', 'survive'] as const
/** 신화권 (hidden은 히든 클래스) */
export const REALMS = ['norse', 'greek', 'china', 'japan', 'korea', 'hidden'] as const

export type SkyStyle = (typeof SKY_STYLES)[number]
export type CompanionLook = (typeof COMPANION_LOOKS)[number]
export type OrbitShape = (typeof ORBIT_SHAPES)[number]
export type UltimateKind = (typeof ULTIMATE_KINDS)[number]
export type RainStyle = (typeof RAIN_STYLES)[number]
export type WaveStyle = (typeof WAVE_STYLES)[number]
export type BladeStyle = (typeof BLADE_STYLES)[number]
export type LegendKind = (typeof LEGEND_KINDS)[number]
export type Realm = (typeof REALMS)[number]

/** 패시브 부품마다 공통: 화면에 보일 이름, 열리는 레벨 */
interface PartBase {
  name: string
  /** 이 레벨부터 켜진다 (기본 1) */
  minLevel: number
}

export interface ClassPassive {
  /** 이 클래스로 주는 모든 피해 배율 */
  damageScale: number
  /** 기본 공격 빠르기 배율 */
  attackSpeed: number
  /** 기본 공격이 맞을 때 첫 적에게 번개 (천둥) */
  basicLightning?: { damage: number; finisherDamage: number }
  /** 번개가 옮겨 붙는다. minLevel부터, Lv4에서 topJumps */
  chainLightning?: { minLevel: number; jumps: number; topJumps?: number; range: number; damage: number; finisherDamage: number }
  /** 칼날 폭풍: 맞힐 때마다 주변 적에게 칼 base + perLevel × (레벨 − 1) */
  bladeStorm?: { damage: number; radius: number; base: number; perLevel: number; color?: string }
  /** 하늘에서 내리치기: interval초마다 주변 적 targets명에게 */
  skyStrike?: PartBase & { interval: Leveled; targets: Leveled; radius: number; damage: Leveled; style: SkyStyle }
  /** 동료·분신: 곁을 따르다 가까운 적에게 달려들어 친다. counts는 Lv1~4 수, burstMinLevel부터 일격이 터진다 */
  companions?: PartBase & { look: CompanionLook; color: string; counts: Leveled; interval: number; damage: Leveled; range: number; burstMinLevel: number; burstRadius: number; burstDamage: number }
  /** 몸 둘레를 도는 것: 닿는 적을 친다 */
  orbit?: PartBase & { shape: OrbitShape; color: string; count: Leveled; radius: number; damage: Leveled; hitInterval: number; speed: number }
  /** 파동: interval초마다 둘레로 퍼지며 친다 */
  pulse?: PartBase & { color: string; interval: Leveled; radius: Leveled; damage: Leveled; knockback: number }
  /** 화살 연사: 기본 공격이 맞을 때 다른 가까운 적 count명에게도 날아간다 */
  volley?: PartBase & { color: string; count: Leveled; damage: Leveled; range: number }
  /** 저주: 기본 공격에 맞은 적이 duration초 동안 초당 dps. spreadMinLevel부터 쓰러지면 옆 적에게 옮는다 */
  curse?: PartBase & { color: string; dps: Leveled; duration: number; spreadMinLevel: number }
  /** 불꽃 길: 걸은 자리에 life초 남는 길, 그 위의 적은 초당 dps */
  trail?: PartBase & { color: string; dps: Leveled; life: number; width: number }
  /** 꽃핌: interval초마다 생명 heal 회복 */
  bloom?: PartBase & { color: string; interval: number; heal: Leveled }
  /** 버팀: 생명이 threshold(비율) 아래로 떨어지면 heal 회복, cooldown초에 한 번 */
  guard?: PartBase & { color: string; threshold: number; heal: Leveled; cooldown: number }
}

export interface UltimateDef {
  kind: UltimateKind
  name: string
  color: string
  /** 쓸 만한 때: 이 거리 안에 적 셋 이상 (또는 보스가 가까이) */
  reach: number
  /** 한 번에 주는 피해 */
  damage: number
  /** 번개·분신·칼질·파도 겹·떨어지는 수 */
  count: number
  /** 맞는 범위 (m) */
  radius: number
  /** 다음 것까지 간격 (초) */
  interval: number
  style?: SkyStyle | CompanionLook | RainStyle | WaveStyle | BladeStyle
  /** 쓰는 순간 회복 (생명) */
  heal?: number
}

export interface LegendDef {
  name: string
  kind: LegendKind
}

function part(o: Obj, path: string, keys: readonly string[]): PartBase {
  onlyKeys(o, path, ['name', 'minLevel', ...keys])
  return { name: str(o, 'name', path), minLevel: optNum(o, 'minLevel', path, { min: 1, max: 4 }) ?? 1 }
}

/** 패시브 부품 이름 (빌려줄 수 있는 것, E237) */
export const PASSIVE_PARTS = ['basicLightning', 'chainLightning', 'bladeStorm', 'skyStrike', 'companions', 'orbit', 'pulse', 'volley', 'curse', 'trail', 'bloom', 'guard'] as const
export type PassivePart = (typeof PASSIVE_PARTS)[number]

/** gods.json의 passive */
export function parsePassive(raw: unknown, p: string): ClassPassive {
  const o = obj(raw ?? {}, p)
  onlyKeys(o, p, ['damageScale', 'attackSpeed', ...PASSIVE_PARTS])
  const out: ClassPassive = {
    damageScale: optNum(o, 'damageScale', p, { min: 0 }) ?? 1,
    attackSpeed: optNum(o, 'attackSpeed', p, { min: 0.5, max: 2 }) ?? 1,
  }
  const sub = (key: string) => (o[key] === undefined ? null : ([obj(o[key], `${p}.${key}`), `${p}.${key}`] as const))
  let s
  if ((s = sub('basicLightning'))) {
    const [b, q] = s
    onlyKeys(b, q, ['damage', 'finisherDamage'])
    out.basicLightning = { damage: num(b, 'damage', q, { min: 0 }), finisherDamage: num(b, 'finisherDamage', q, { min: 0 }) }
  }
  if ((s = sub('chainLightning'))) {
    const [c, q] = s
    onlyKeys(c, q, ['minLevel', 'jumps', 'topJumps', 'range', 'damage', 'finisherDamage'])
    const topJumps = optNum(c, 'topJumps', q, { min: 1 })
    out.chainLightning = {
      minLevel: num(c, 'minLevel', q, { min: 1, max: 4 }),
      jumps: num(c, 'jumps', q, { min: 1 }),
      ...(topJumps === undefined ? {} : { topJumps }),
      range: num(c, 'range', q, { min: 0 }),
      damage: num(c, 'damage', q, { min: 0 }),
      finisherDamage: num(c, 'finisherDamage', q, { min: 0 }),
    }
  }
  if ((s = sub('bladeStorm'))) {
    const [b, q] = s
    onlyKeys(b, q, ['damage', 'radius', 'base', 'perLevel', 'color'])
    out.bladeStorm = {
      damage: num(b, 'damage', q, { min: 0 }),
      radius: num(b, 'radius', q, { min: 0 }),
      base: num(b, 'base', q, { min: 0 }),
      perLevel: num(b, 'perLevel', q, { min: 0 }),
      ...(b.color === undefined ? {} : { color: color(b, 'color', q) }),
    }
  }
  if ((s = sub('skyStrike'))) {
    const [b, q] = s
    out.skyStrike = {
      ...part(b, q, ['interval', 'targets', 'radius', 'damage', 'style']),
      interval: leveled(b, 'interval', q, { min: 0.2 }),
      targets: leveled(b, 'targets', q, { min: 1 }),
      radius: num(b, 'radius', q, { min: 0 }),
      damage: leveled(b, 'damage', q, { min: 0 }),
      style: oneOf(b, 'style', q, SKY_STYLES),
    }
  }
  if ((s = sub('companions'))) {
    const [b, q] = s
    const counts = leveled(b, 'counts', q, { min: 0, max: 6 })
    out.companions = {
      ...part(b, q, ['look', 'color', 'counts', 'interval', 'damage', 'range', 'burstMinLevel', 'burstRadius', 'burstDamage']),
      look: oneOf(b, 'look', q, COMPANION_LOOKS),
      color: color(b, 'color', q),
      counts,
      interval: num(b, 'interval', q, { min: 0.2 }),
      damage: leveled(b, 'damage', q, { min: 0 }),
      range: num(b, 'range', q, { min: 0 }),
      burstMinLevel: optNum(b, 'burstMinLevel', q, { min: 1, max: 5 }) ?? 5,
      burstRadius: optNum(b, 'burstRadius', q, { min: 0 }) ?? 0,
      burstDamage: optNum(b, 'burstDamage', q, { min: 0 }) ?? 0,
    }
  }
  if ((s = sub('orbit'))) {
    const [b, q] = s
    out.orbit = {
      ...part(b, q, ['shape', 'color', 'count', 'radius', 'damage', 'hitInterval', 'speed']),
      shape: oneOf(b, 'shape', q, ORBIT_SHAPES),
      color: color(b, 'color', q),
      count: leveled(b, 'count', q, { min: 1, max: 8 }),
      radius: num(b, 'radius', q, { min: 0.5 }),
      damage: leveled(b, 'damage', q, { min: 0 }),
      hitInterval: num(b, 'hitInterval', q, { min: 0.1 }),
      speed: optNum(b, 'speed', q, { min: 0.1 }) ?? 2.4,
    }
  }
  if ((s = sub('pulse'))) {
    const [b, q] = s
    out.pulse = {
      ...part(b, q, ['color', 'interval', 'radius', 'damage', 'knockback']),
      color: color(b, 'color', q),
      interval: leveled(b, 'interval', q, { min: 0.3 }),
      radius: leveled(b, 'radius', q, { min: 0.5 }),
      damage: leveled(b, 'damage', q, { min: 0 }),
      knockback: num(b, 'knockback', q, { min: 0 }),
    }
  }
  if ((s = sub('volley'))) {
    const [b, q] = s
    out.volley = {
      ...part(b, q, ['color', 'count', 'damage', 'range']),
      color: color(b, 'color', q),
      count: leveled(b, 'count', q, { min: 1, max: 8 }),
      damage: leveled(b, 'damage', q, { min: 0 }),
      range: num(b, 'range', q, { min: 0 }),
    }
  }
  if ((s = sub('curse'))) {
    const [b, q] = s
    out.curse = {
      ...part(b, q, ['color', 'dps', 'duration', 'spreadMinLevel']),
      color: color(b, 'color', q),
      dps: leveled(b, 'dps', q, { min: 0 }),
      duration: num(b, 'duration', q, { min: 0.5 }),
      spreadMinLevel: optNum(b, 'spreadMinLevel', q, { min: 1, max: 5 }) ?? 5,
    }
  }
  if ((s = sub('trail'))) {
    const [b, q] = s
    out.trail = {
      ...part(b, q, ['color', 'dps', 'life', 'width']),
      color: color(b, 'color', q),
      dps: leveled(b, 'dps', q, { min: 0 }),
      life: num(b, 'life', q, { min: 0.3 }),
      width: num(b, 'width', q, { min: 0.2 }),
    }
  }
  if ((s = sub('bloom'))) {
    const [b, q] = s
    out.bloom = {
      ...part(b, q, ['color', 'interval', 'heal']),
      color: color(b, 'color', q),
      interval: num(b, 'interval', q, { min: 0.5 }),
      heal: leveled(b, 'heal', q, { min: 0 }),
    }
  }
  if ((s = sub('guard'))) {
    const [b, q] = s
    out.guard = {
      ...part(b, q, ['color', 'threshold', 'heal', 'cooldown']),
      color: color(b, 'color', q),
      threshold: num(b, 'threshold', q, { min: 0.05, max: 0.9 }),
      heal: leveled(b, 'heal', q, { min: 0 }),
      cooldown: num(b, 'cooldown', q, { min: 1 }),
    }
  }
  return out
}

/** gods.json의 ultimate */
export function parseUltimate(raw: unknown, p: string): UltimateDef {
  const o = obj(raw, p)
  onlyKeys(o, p, ['kind', 'name', 'color', 'reach', 'damage', 'count', 'radius', 'interval', 'style', 'heal'])
  const kind = oneOf(o, 'kind', p, ULTIMATE_KINDS)
  const styles: readonly string[] = { skyBarrage: SKY_STYLES, legion: COMPANION_LOOKS, rain: RAIN_STYLES, wave: WAVE_STYLES, bladeDance: BLADE_STYLES }[kind]
  const def: UltimateDef = {
    kind,
    name: str(o, 'name', p),
    color: color(o, 'color', p),
    reach: num(o, 'reach', p, { min: 2 }),
    damage: num(o, 'damage', p, { min: 0 }),
    count: num(o, 'count', p, { min: 1, max: 40 }),
    radius: num(o, 'radius', p, { min: 0.5 }),
    interval: num(o, 'interval', p, { min: 0.02 }),
    ...(o.heal === undefined ? {} : { heal: num(o, 'heal', p, { min: 0 }) }),
  }
  if (styles.length > 0) def.style = oneOf(o, 'style', p, styles) as UltimateDef['style']
  else if (o.style !== undefined) throw new DataError(`${p}.style`, `${kind}에는 모양을 쓰지 않습니다`)
  return def
}

/** gods.json의 legend (없으면 그 신의 승급 전설은 아직 없다) */
export function parseLegend(raw: unknown, p: string): LegendDef | undefined {
  if (raw === undefined) return undefined
  const o = obj(raw, p)
  onlyKeys(o, p, ['name', 'kind'])
  return { name: str(o, 'name', p), kind: oneOf(o, 'kind', p, LEGEND_KINDS) }
}

/** 동료 수처럼 레벨이 오르면 늘어야 하는 값이 줄지 않는지 (데이터 실수를 막는다) */
export function nonDecreasing(values: Leveled, path: string): void {
  for (let i = 1; i < 4; i++) if (values[i]! < values[i - 1]!) throw new DataError(path, `레벨이 오르면 줄면 안 됩니다 (${values.join(', ')})`)
}


/**
 * 상시 효과 (E12-01, DESIGN.md 4.2.1): 열린 신화는 고르지 않아도 모두 이것을 낸다.
 * - 메아리(1·2단계): 그 신화 고유 패시브 부품 하나가 가끔 한 번 터진다. 동료·도는 것도 잠깐 나타나 한 번 치고 사라진다.
 * - 수치(3·4단계): 신화마다 정해진 능력치 하나. 4단계는 3단계의 두 배.
 * 추가 효과(고른 신화만)는 따로 적지 않는다: 지금의 패시브·강화·궁극기·표식 전부다.
 */
import { DataError, num, type Obj, obj, oneOf, onlyKeys } from './check'
import type { ClassPassive } from './classKit'

/** 메아리가 될 수 있는 패시브 부품과, 그 부품이 터지는 때 */
export const ECHO_TRIGGERS = {
  /** 기본 공격 N번에 1번 */
  basicLightning: 'hits',
  volley: 'hits',
  curse: 'hits',
  /** 때릴 때 확률 */
  bladeStorm: 'chance',
  /** N초마다 */
  skyStrike: 'seconds',
  companions: 'seconds',
  orbit: 'seconds',
  pulse: 'seconds',
  /** 걷는 동안 N초마다 */
  trail: 'walking',
} as const
export type EchoPart = keyof typeof ECHO_TRIGGERS
export type EchoTrigger = (typeof ECHO_TRIGGERS)[EchoPart]
export const ECHO_PARTS = Object.keys(ECHO_TRIGGERS) as EchoPart[]

/** 수치 종류. 값은 비율(0.05 = 5%) 또는 그 단위의 수 (UNITS) */
export const STAT_KINDS = [
  'damage',
  'bossDamage',
  'basicDamage',
  'skyDamage',
  'companionDamage',
  'orbitDamage',
  'pulseDamage',
  'dotDamage',
  'attackSpeed',
  'moveSpeed',
  'areaSize',
  'maxHp',
  'maxHpPct',
  'regen',
  'healOnKill',
  'healingTaken',
  'damageTaken',
  'lowHpGuard',
  'ultCharge',
  'masteryGain',
  'dropChance',
] as const
export type StatKind = (typeof STAT_KINDS)[number]

/** 비율이 아니라 그 단위의 수로 쓰는 수치 */
const FLAT: readonly StatKind[] = ['maxHp', 'regen', 'healOnKill']
/** 줄어드는 쪽이 좋은 수치 (값이 음수) */
const LOWER: readonly StatKind[] = ['damageTaken', 'lowHpGuard']

export interface MythAlways {
  /** 1·2단계 메아리 */
  echo: {
    part: EchoPart
    trigger: EchoTrigger
    /** [1단계, 2단계]. hits = 공격 수, seconds·walking = 초, chance = 0~1 확률 */
    every: readonly [number, number]
    /** 한 번 터질 때 피해 */
    damage: number
  }
  /** 3·4단계 수치 */
  stat: { kind: StatKind; value: readonly [number, number] }
}

function pair(o: Obj, key: string, path: string): [number, number] {
  const v = o[key]
  if (!Array.isArray(v) || v.length !== 2) throw new DataError(`${path}.${key}`, '[앞 단계, 뒤 단계] 두 개여야 합니다')
  return [num(v as unknown as Obj, '0', `${path}.${key}`), num(v as unknown as Obj, '1', `${path}.${key}`)]
}

export function parseAlways(raw: unknown, passive: ClassPassive, path: string): MythAlways {
  const o = obj(raw, path)
  onlyKeys(o, path, ['echo', 'stat'])

  const ep = `${path}.echo`
  const e = obj(o.echo, ep)
  onlyKeys(e, ep, ['part', 'every', 'damage'])
  const part = oneOf(e, 'part', ep, ECHO_PARTS)
  if (!(passive as unknown as Record<string, unknown>)[part]) throw new DataError(`${ep}.part`, `이 신화의 패시브에 없는 부품입니다 ("${part}")`)
  const trigger = ECHO_TRIGGERS[part]
  const every = pair(e, 'every', ep)
  if (trigger === 'chance') {
    if (every.some((v) => v <= 0 || v >= 1)) throw new DataError(`${ep}.every`, '확률은 0과 1 사이여야 합니다')
    if (every[1] <= every[0]) throw new DataError(`${ep}.every`, '2단계는 1단계보다 자주 터져야 합니다 (확률이 커야 함)')
  } else {
    if (every.some((v) => v <= 0)) throw new DataError(`${ep}.every`, '0보다 커야 합니다')
    if (trigger === 'hits' && every.some((v) => !Number.isInteger(v))) throw new DataError(`${ep}.every`, '공격 수는 정수여야 합니다')
    if (every[1] >= every[0]) throw new DataError(`${ep}.every`, '2단계는 1단계보다 자주 터져야 합니다 (간격이 짧아야 함)')
  }

  const sp = `${path}.stat`
  const s = obj(o.stat, sp)
  onlyKeys(s, sp, ['kind', 'value'])
  const kind = oneOf(s, 'kind', sp, STAT_KINDS)
  const value = pair(s, 'value', sp)
  const lower = LOWER.includes(kind)
  if (value.some((v) => (lower ? v >= 0 : v <= 0))) throw new DataError(`${sp}.value`, lower ? '줄어드는 수치라 음수여야 합니다' : '0보다 커야 합니다')
  if (!FLAT.includes(kind) && value.some((v) => Math.abs(v) >= 1)) throw new DataError(`${sp}.value`, '비율은 0.05처럼 1보다 작게 씁니다')
  if (Math.abs(value[1]) <= Math.abs(value[0])) throw new DataError(`${sp}.value`, '4단계가 3단계보다 커야 합니다')

  return {
    echo: { part, trigger, every, damage: num(e, 'damage', ep, { min: 1 }) },
    stat: { kind, value },
  }
}

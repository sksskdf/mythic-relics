/**
 * 신화마다의 수치 (E12-01에서 상시 효과였고, E21에서 엔딩 뒤 성좌판으로 옮김, 성좌판은 E305-03에서 걷음).
 * 상시 효과는 열린 신화마다 같은 생명뿐이고(피해는 유물표, E303-04), 이 수치는 지금 쓰는 곳이 없다 (숨 칸 3단계에서 다시 쓸 자리, `CYCLE.md` 7장).
 * 메아리(가끔 터지는 다른 신의 효과)는 E21-02에서 없앴다.
 */
import { DataError, num, type Obj, obj, oneOf, onlyKeys } from './check'

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
  /** 별을 밝혔을 때의 수치 [앞 단계, 뒤 단계] */
  stat: { kind: StatKind; value: readonly [number, number] }
}

function pair(o: Obj, key: string, path: string): [number, number] {
  const v = o[key]
  if (!Array.isArray(v) || v.length !== 2) throw new DataError(`${path}.${key}`, '[앞 단계, 뒤 단계] 두 개여야 합니다')
  return [num(v as unknown as Obj, '0', `${path}.${key}`), num(v as unknown as Obj, '1', `${path}.${key}`)]
}

export function parseAlways(raw: unknown, path: string): MythAlways {
  const o = obj(raw, path)
  onlyKeys(o, path, ['stat'])

  const sp = `${path}.stat`
  const s = obj(o.stat, sp)
  onlyKeys(s, sp, ['kind', 'value'])
  const kind = oneOf(s, 'kind', sp, STAT_KINDS)
  const value = pair(s, 'value', sp)
  const lower = LOWER.includes(kind)
  if (value.some((v) => (lower ? v >= 0 : v <= 0))) throw new DataError(`${sp}.value`, lower ? '줄어드는 수치라 음수여야 합니다' : '0보다 커야 합니다')
  if (!FLAT.includes(kind) && value.some((v) => Math.abs(v) >= 1)) throw new DataError(`${sp}.value`, '비율은 0.05처럼 1보다 작게 씁니다')
  if (Math.abs(value[1]) <= Math.abs(value[0])) throw new DataError(`${sp}.value`, '4단계가 3단계보다 커야 합니다')

  return { stat: { kind, value } }
}

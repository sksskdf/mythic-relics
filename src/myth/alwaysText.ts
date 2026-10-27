import { statAt } from '../build/BuildState'
import type { StatKind } from '../data/mythAlways'
import { type God, godDef } from '../relics/data'
import { PER_OPENED } from './ClassProgress'

/** 수치 종류의 화면 이름 */
const STAT_LABELS: Record<StatKind, string> = {
  damage: '주는 피해',
  bossDamage: '정예·보스에게 피해',
  basicDamage: '기본 공격 피해',
  skyDamage: '하늘에서 떨어지는 공격 피해',
  companionDamage: '동료 피해',
  orbitDamage: '도는 것 피해',
  pulseDamage: '파동 피해',
  dotDamage: '지속 피해',
  attackSpeed: '공격 빠르기',
  moveSpeed: '이동 속도',
  areaSize: '범위 공격 넓이',
  maxHp: '최대 생명',
  maxHpPct: '최대 생명',
  regen: '초당 생명 재생',
  healOnKill: '처치할 때 생명',
  healingTaken: '받는 회복',
  damageTaken: '받는 피해',
  lowHpGuard: '생명이 35% 아래일 때 받는 피해',
  ultCharge: '궁극기 충전',
  masteryGain: '신화 경험치 얻는 양',
  dropChance: '유물이 떨어질 확률',
}

/** 비율이 아니라 그 단위의 수로 보이는 수치 */
const FLAT: readonly StatKind[] = ['maxHp', 'regen', 'healOnKill']

const num = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

/** 수치 한 줄: 「정예·보스에게 피해 +10%」 */
export function statText(kind: StatKind, value: number): string {
  const sign = value < 0 ? '−' : '+'
  const amount = FLAT.includes(kind) ? num(Math.abs(value)) : `${Math.round(Math.abs(value) * 100)}%`
  return `${STAT_LABELS[kind]} ${sign}${amount}`
}

/** 수집 보너스 한 줄 (E21-02): 열린 신화 하나마다 같은 덧셈 */
export function collectionText(): string {
  return `모든 피해 +${Math.round(PER_OPENED.damage * 100)}%, 최대 생명 +${PER_OPENED.maxHp}`
}

/** 성좌판에서 별을 밝힌 신화의 수치 한 줄 (엔딩 뒤, E17-04). stage는 별 수치 단계 (3부터 작동) */
export function starText(god: God, stage: number): string {
  const { stat } = godDef(god).always
  return statText(stat.kind, stage >= 3 ? statAt(stat, stage) : stat.value[0])
}

import { echoEvery, statAt } from '../build/BuildState'
import type { StatKind } from '../data/mythAlways'
import { type God, godDef } from '../relics/data'

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
  masteryGain: '신화 숙련 얻는 양',
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

/** 메아리가 본뜬 패시브 부품의 이름 */
function partName(god: God): string {
  const def = godDef(god)
  const { part } = def.always.echo
  const named = (def.passive as unknown as Record<string, { name?: string } | undefined>)[part]
  if (named?.name) return named.name
  return part === 'basicLightning' ? '작은 번개' : part === 'bladeStorm' ? '칼 한 자루' : def.name
}

/** 메아리 한 줄: 「8초마다 벼락 한 번」 (그 단계의 간격, 단계 0이면 1단계 기준) */
export function echoText(god: God, stage: number): string {
  const { echo } = godDef(god).always
  const every = echoEvery(echo.every, echo.trigger, Math.max(1, stage))
  const name = partName(god)
  switch (echo.trigger) {
    case 'hits':
      return `기본 공격 ${every}번에 1번 ${name}`
    case 'chance':
      return `때릴 때 ${Math.round(every * 100)}% 확률로 ${name}`
    case 'walking':
      return `걷는 동안 ${num(every)}초마다 ${name}`
    default:
      return `${num(every)}초마다 ${name} 한 번`
  }
}

/** 상시 효과 줄들: 메아리와 수치. active는 지금 작동하는가 (수치는 3단계부터) */
export function alwaysLines(god: God, stage: number): { text: string; active: boolean; from: number }[] {
  const { stat } = godDef(god).always
  const value = stage >= 3 ? statAt(stat, stage) : stat.value[0]
  return [
    { text: `메아리: ${echoText(god, stage)}`, active: stage >= 1, from: 1 },
    { text: statText(stat.kind, value), active: stage >= 3, from: 3 },
  ]
}

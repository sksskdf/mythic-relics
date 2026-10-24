import { GODS, type God } from '../relics/data'
import type { StatKind } from './mythAlways'
import { SOURCE_IDS, type SourceId } from './schema'

/**
 * 균열과 성좌판 (E17, DESIGN.md 9.4).
 * - 균열: 들어갈 때마다 1층부터. 층마다 셋 중 하나의 임시 축복을 골라 쌓고, 나오거나 쓰러지면 사라진다
 * - 깊이 기록·재료·별만 남는다. 별로 성좌판의 별을 밝힌다 (이웃한 별만)
 */

/** 층이 깊어질 때마다 적 생명력 ×1.12, 피해 ×1.06 (위협 RIFT_BASE_THREAT단계 배율에 곱한다) */
export const RIFT_SCALE = { hp: 1.12, damage: 1.06 } as const
/** 균열 1층의 세기: 고른 위협 단계와 상관없이 위협 5단계. 10층쯤에서 위협 10단계와 비슷해진다 (생명력 ×2.07 × 2.77 ≈ ×5.7) */
export const RIFT_BASE_THREAT = 5

export function riftScale(depth: number): { hp: number; damage: number } {
  const n = Math.max(0, depth - 1)
  return { hp: RIFT_SCALE.hp ** n, damage: RIFT_SCALE.damage ** n }
}

/** 별: 처음 닿은 5층마다 하나, 종말 보스를 쓰러뜨리면 둘 */
export const STAR_EVERY = 5
export const STARS_PER_DOOM = 2

/** 임시 축복 (E17-03): 수치 하나를 올리거나, 원천 하나의 각성을 한 단계 올린다 */
export interface Blessing {
  id: string
  name: string
  text: string
  stat?: { kind: StatKind; value: number }
  awaken?: SourceId
}

const SOURCE_NAME: Record<SourceId, string> = { flame: '불꽃', hunt: '사냥', wind: '바람', stone: '바위' }

export const BLESSINGS: readonly Blessing[] = [
  { id: 'fury', name: '분노', text: '모든 피해 +12%', stat: { kind: 'damage', value: 0.12 } },
  { id: 'edge', name: '날 선 칼', text: '기본 공격 피해 +20%', stat: { kind: 'basicDamage', value: 0.2 } },
  { id: 'storm', name: '하늘의 분노', text: '하늘 공격 피해 +25%', stat: { kind: 'skyDamage', value: 0.25 } },
  { id: 'pack', name: '무리의 힘', text: '동료 피해 +25%', stat: { kind: 'companionDamage', value: 0.25 } },
  { id: 'orbit', name: '도는 별', text: '도는 것 피해 +25%', stat: { kind: 'orbitDamage', value: 0.25 } },
  { id: 'wave', name: '물결', text: '파동 피해 +25%', stat: { kind: 'pulseDamage', value: 0.25 } },
  { id: 'giantBane', name: '거인 사냥꾼', text: '정예·보스에게 피해 +20%', stat: { kind: 'bossDamage', value: 0.2 } },
  { id: 'haste', name: '빠른 손', text: '공격 속도 +10%', stat: { kind: 'attackSpeed', value: 0.1 } },
  { id: 'stride', name: '바람의 발', text: '이동 속도 +10%', stat: { kind: 'moveSpeed', value: 0.1 } },
  { id: 'reach', name: '넓은 손길', text: '범위 +15%', stat: { kind: 'areaSize', value: 0.15 } },
  { id: 'vigor', name: '굳센 몸', text: '최대 생명 +40', stat: { kind: 'maxHp', value: 40 } },
  { id: 'spring', name: '샘물', text: '초마다 생명 +2', stat: { kind: 'regen', value: 2 } },
  { id: 'feast', name: '사냥의 잔치', text: '처치할 때 생명 +3', stat: { kind: 'healOnKill', value: 3 } },
  { id: 'guard', name: '방패', text: '받는 피해 −10%', stat: { kind: 'damageTaken', value: -0.1 } },
  { id: 'divine', name: '신의 숨', text: '신위 충전 +20%', stat: { kind: 'ultCharge', value: 0.2 } },
  { id: 'luck', name: '행운', text: '장비가 떨어질 확률 +20%', stat: { kind: 'dropChance', value: 0.2 } },
  ...SOURCE_IDS.map((s): Blessing => ({ id: `awaken-${s}`, name: `${SOURCE_NAME[s]}의 불씨`, text: `${SOURCE_NAME[s]} 각성 한 단계 위`, awaken: s })),
]

export const blessingDef = (id: string): Blessing | undefined => BLESSINGS.find((b) => b.id === id)

/** 셋을 뽑는다 (이미 고른 것도 다시 나온다: 겹쳐 쌓인다). 같은 rng면 같은 셋 */
export function rollBlessings(rng: () => number, count = 3): Blessing[] {
  const pool = [...BLESSINGS]
  const out: Blessing[] = []
  while (out.length < count && pool.length > 0) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]!)
  return out
}

/**
 * 성좌판 (E17-05): 신화마다 별 하나. 같은 신화권 별끼리 한 줄로 이웃하고, 신화권의 끝 별이 다음 신화권의 첫 별과 이웃해 둥근 고리가 된다.
 * 히든 신화(아수라왕)는 가운데에서 신화권마다 첫 별과 이웃한다. 이웃한 별만 밝힐 수 있고, 첫 별은 열린 신화 아무것이나.
 * 밝힌 별: 그 신화의 상시 효과가 한 단계 위로 돈다 (5단계까지).
 */
export interface Star {
  god: God
  /** 판 위 자리 (가운데 0, 반지름 1) */
  x: number
  y: number
  neighbors: God[]
}

export function starChart(): Record<God, Star> {
  const gods = Object.values(GODS)
  const realms = [...new Set(gods.filter((g) => !g.hidden).map((g) => g.realm))]
  const out: Record<God, Star> = {}
  const ring = realms.flatMap((realm) => gods.filter((g) => g.realm === realm && !g.hidden).map((g) => g.id))
  ring.forEach((god, i) => {
    const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2
    out[god] = { god, x: Math.cos(a), y: Math.sin(a), neighbors: [] }
  })
  const link = (a: God, b: God) => {
    if (!out[a]!.neighbors.includes(b)) out[a]!.neighbors.push(b)
    if (!out[b]!.neighbors.includes(a)) out[b]!.neighbors.push(a)
  }
  // 고리: 이웃한 자리끼리 (같은 신화권 안, 그리고 신화권 끝 → 다음 신화권 첫 별)
  ring.forEach((god, i) => link(god, ring[(i + 1) % ring.length]!))
  for (const hidden of gods.filter((g) => g.hidden)) {
    out[hidden.id] = { god: hidden.id, x: 0, y: 0, neighbors: [] }
    for (const realm of realms) link(hidden.id, ring.find((g) => GODS[g]!.realm === realm)!)
  }
  return out
}

export const STARS: Readonly<Record<God, Star>> = starChart()

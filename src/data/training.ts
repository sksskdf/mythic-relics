import type { StatKind } from './mythAlways'

/**
 * 수련 (E236-02, 사용자 결정 2026-10-28): 신화를 고르기 전부터 몇 분마다 강해지는 공용 빌드 트리.
 * - 적을 잡아 모은 경험치가 문턱을 넘을 때마다 깨달음 한 점. 처음 10분에 다섯쯤, 엔딩까지 스물쯤
 * - 뿌리에서 갈래 셋(힘·몸·손)이 뻗고, 갈래 중간에 고르는 가지, 끝에 그 갈래의 큰 마디
 * - 깨달음 한 점으로 마디 하나. 이웃한 앞 마디(가지는 그중 하나)를 찍어야 찍을 수 있다
 * - 찍은 마디는 언제든 무료로 모두 되돌린다
 * 수련은 신화(캐릭터) 축에 든다: 신화가 어느 신의 힘인지를, 수련은 어떻게 싸우는지를 정한다.
 */

export type BranchId = 'root' | 'might' | 'body' | 'hand'

export interface Branch {
  id: BranchId
  name: string
  /** 한 줄 설명 */
  text: string
  /** 마디 테두리·이은 줄 색 (`--c-*` 토큰 이름) */
  color: string
}

export const BRANCHES: Readonly<Record<BranchId, Branch>> = {
  root: { id: 'root', name: '뿌리', text: '모든 갈래의 시작', color: 'gold' },
  might: { id: 'might', name: '힘', text: '더 세게 친다', color: 'src-flame' },
  body: { id: 'body', name: '몸', text: '더 오래 버틴다', color: 'heal' },
  hand: { id: 'hand', name: '손', text: '더 빠르고 넓게 친다', color: 'src-wind' },
}

export interface TrainingNode {
  id: string
  name: string
  branch: BranchId
  /** 트리 위 자리: 열(갈래 안 가지는 ±0.5)과 깊이(뿌리 0) */
  col: number
  row: number
  /** 이 가운데 하나를 찍어야 찍을 수 있다 (뿌리는 없음) */
  after: readonly string[]
  /** 더하는 수치 (같은 종류끼리 더해 빌드 상태로) */
  stats: readonly { kind: StatKind; value: number }[]
  /** 갈래 끝의 큰 마디 */
  big?: boolean
}

const node = (id: string, name: string, branch: BranchId, col: number, row: number, after: string[], stats: TrainingNode['stats'], big = false): TrainingNode => ({
  id,
  name,
  branch,
  col,
  row,
  after,
  stats,
  ...(big ? { big } : {}),
})

/** 열: 힘 0, 몸 2, 손 4 (뿌리는 2). 가지는 갈래 열 ±0.5 */
export const TRAINING_NODES: readonly TrainingNode[] = [
  node('awaken', '깨어난 몸', 'root', 2, 0, [], [
    { kind: 'damage', value: 0.05 },
    { kind: 'maxHp', value: 10 },
  ]),

  node('edge', '날 선 칼', 'might', 0, 1, ['awaken'], [{ kind: 'basicDamage', value: 0.12 }]),
  node('fury', '분노', 'might', 0, 2, ['edge'], [{ kind: 'damage', value: 0.08 }]),
  node('cleave', '거인 베기', 'might', 0, 3, ['fury'], [{ kind: 'bossDamage', value: 0.15 }]),
  node('storm', '하늘의 분노', 'might', -0.5, 4, ['cleave'], [{ kind: 'skyDamage', value: 0.25 }]),
  node('pack', '무리의 힘', 'might', 0.5, 4, ['cleave'], [{ kind: 'companionDamage', value: 0.25 }]),
  node('boil', '끓는 피', 'might', 0, 5, ['storm', 'pack'], [{ kind: 'damage', value: 0.1 }]),
  node('slayer', '거인 사냥꾼', 'might', 0, 6, ['boil'], [
    { kind: 'bossDamage', value: 0.3 },
    { kind: 'basicDamage', value: 0.1 },
  ], true),

  node('sturdy', '굳센 몸', 'body', 2, 1, ['awaken'], [{ kind: 'maxHp', value: 20 }]),
  node('spring', '샘물', 'body', 2, 2, ['sturdy'], [{ kind: 'regen', value: 1.5 }]),
  node('shield', '방패', 'body', 2, 3, ['spring'], [{ kind: 'damageTaken', value: -0.08 }]),
  node('feast', '사냥의 잔치', 'body', 1.5, 4, ['shield'], [{ kind: 'healOnKill', value: 3 }]),
  node('grace', '신의 가호', 'body', 2.5, 4, ['shield'], [{ kind: 'healingTaken', value: 0.25 }]),
  node('stone', '바위 같은 몸', 'body', 2, 5, ['feast', 'grace'], [{ kind: 'maxHpPct', value: 0.1 }]),
  node('unbroken', '불굴', 'body', 2, 6, ['stone'], [
    { kind: 'lowHpGuard', value: -0.3 },
    { kind: 'damageTaken', value: -0.05 },
  ], true),

  node('quick', '빠른 손', 'hand', 4, 1, ['awaken'], [{ kind: 'attackSpeed', value: 0.06 }]),
  node('stride', '바람의 발', 'hand', 4, 2, ['quick'], [{ kind: 'moveSpeed', value: 0.08 }]),
  node('reach', '넓은 손길', 'hand', 4, 3, ['stride'], [{ kind: 'areaSize', value: 0.12 }]),
  node('breath', '신의 숨', 'hand', 3.5, 4, ['reach'], [{ kind: 'ultCharge', value: 0.2 }]),
  node('study', '배움', 'hand', 4.5, 4, ['reach'], [{ kind: 'masteryGain', value: 0.15 }]),
  node('flurry', '몰아치기', 'hand', 4, 5, ['breath', 'study'], [{ kind: 'attackSpeed', value: 0.08 }]),
  node('whirl', '회오리', 'hand', 4, 6, ['flurry'], [
    { kind: 'attackSpeed', value: 0.1 },
    { kind: 'areaSize', value: 0.2 },
  ], true),
]

const BY_ID = new Map(TRAINING_NODES.map((n) => [n.id, n]))
export const trainingNode = (id: string): TrainingNode | undefined => BY_ID.get(id)

/** 봇과 엔딩 무렵 빌드(`dev.endgame`)가 찍는 차례: 힘 → 몸 → 손. 찍을 수 없는 것(앞 마디가 아직)은 건너뛴다 */
export const SAMPLE_ORDER: readonly string[] = ['awaken', 'edge', 'fury', 'cleave', 'storm', 'boil', 'slayer', 'sturdy', 'spring', 'shield', 'feast', 'stone', 'unbroken', 'quick', 'stride', 'reach', 'study', 'flurry', 'whirl']

/**
 * 깨달음 문턱: k번째 점(1부터)을 얻는 데 드는 경험치는 FIRST + STEP × (k − 1).
 * 봇 기준 경험치는 1분에 55~100쯤 쌓여(처치 8~16, 정예·보스는 더) 처음 다섯 점이 10분 안에, 스무 점이 엔딩 무렵에 온다
 */
export const INSIGHT_COST = { first: 60, step: 25 } as const

/** 경험치 xp까지 모은 깨달음의 수 */
export function insightsAt(xp: number): number {
  const { first, step } = INSIGHT_COST
  let n = 0
  let need = first
  while (xp >= need) {
    n += 1
    need += first + step * n
  }
  return n
}

/** 다음 깨달음까지: 이번 점에서 모은 경험치와 그 점에 드는 경험치 */
export function insightProgress(xp: number): { have: number; need: number } {
  const { first, step } = INSIGHT_COST
  const n = insightsAt(xp)
  // n점까지의 합: first·n + step·n(n−1)/2
  const before = first * n + (step * n * (n - 1)) / 2
  return { have: xp - before, need: first + step * n }
}

/** 데이터 검사: 이름·자리가 겹치지 않고, 앞 마디가 있고 더 얕으며 목록에서 먼저 오고, 갈래 끝에만 큰 마디 (tests/training.test.ts) */
export function checkTraining(nodes: readonly TrainingNode[] = TRAINING_NODES): string[] {
  const problems: string[] = []
  const ids = new Set<string>()
  const spots = new Set<string>()
  for (const n of nodes) {
    if (ids.has(n.id)) problems.push(`${n.id}: id가 겹칩니다`)
    ids.add(n.id)
    const spot = `${n.col},${n.row}`
    if (spots.has(spot)) problems.push(`${n.id}: 자리(${spot})가 겹칩니다`)
    spots.add(spot)
    if (n.stats.length === 0) problems.push(`${n.id}: 수치가 없습니다`)
    if ((n.branch === 'root') !== (n.after.length === 0)) problems.push(`${n.id}: 뿌리만 앞 마디가 없어야 합니다`)
    for (const a of n.after) {
      const before = nodes.find((m) => m.id === a)
      if (!before) problems.push(`${n.id}: 앞 마디 ${a}가 없습니다`)
      else if (before.row >= n.row) problems.push(`${n.id}: 앞 마디 ${a}가 더 얕아야 합니다`)
      else if (nodes.indexOf(before) > nodes.indexOf(n)) problems.push(`${n.id}: 앞 마디 ${a}가 목록에서 먼저 와야 합니다`)
    }
  }
  for (const branch of ['might', 'body', 'hand'] as const) {
    const deepest = Math.max(...nodes.filter((n) => n.branch === branch).map((n) => n.row))
    for (const n of nodes.filter((m) => m.branch === branch && m.big)) if (n.row !== deepest) problems.push(`${n.id}: 큰 마디는 갈래 끝에만 둡니다`)
  }
  return problems
}

import { LEASH_REENGAGE } from '../enemies/Giant'
import type { Point2 } from '../world/colliders'

/**
 * 봇의 판정 가운데 값만으로 정해지는 것 (E307 0C 「재는 자」): 귀환 갈래, 목표 보스를 치는 때, 큰 싸움에서 맞으며 붙는 예고,
 * 보스를 줄 밖으로 끌고 나가지 않는 자리.
 * 봇의 규칙은 재는 자의 일부라(규칙이 바뀌면 봇 시각·싸움 초가 바뀐다) 세계 없이 값으로 시험한다 (`tests/botRules.test.ts`)
 */

/**
 * 귀환 갈래를 고르는 법:
 * - `ascend`: 승천할 신이 있으면 늘 승천한다. 사람은 늘 승천을 고르고(승천이 불씨보다 늘 낫다), 덩어리 1부터는 승천만 보인다
 * - `old`: 옛 고정 차례 (E306 D15). 불씨를 섞어 엔딩 무렵 봇이 사람보다 약하다. 옛 기준선과 견줄 때만 쓴다 (`--branch=old`)
 */
export type BranchMode = 'ascend' | 'old'

export const BRANCH_MODES: readonly BranchMode[] = ['ascend', 'old']

/** 옛 고정 차례 (E306 D15, `TIMELINE.md` 9장): n번째 귀환에 승천 → 불꽃 → 승천 → 사냥, 그 뒤로는 승천 */
export const OLD_BRANCH_ORDER = ['ascend', 'flame:flame', 'ascend', 'flame:hunt'] as const

/** 목표 보스·수호자와 싸우는 동안 이 생명 위면 떨어지는 것(원 예고)은 맞으며 붙는다. 보스는 치기 시작하는 문턱과 같다 */
const SOAK_HP = { guardian: 0.5, boss: 0.6 } as const
/** 목표 보스는 주인공의 생명이 이 위일 때 친다 */
const BOSS_HP = 0.6
/** 보스가 이 거리(m) 안이면 둘레의 적과 상관없이 보스를 친다 */
const BOSS_NEAR = 20

/**
 * 봇이 고를 귀환 갈래. ids는 귀환 카드의 갈래(엔딩 전 `return` 하나, 엔딩 뒤 `ascend:신`·`flame:원천`), hand는 손의 신, returns는 지금까지 귀환한 횟수.
 * 승천은 손의 신부터, 손의 신이 다 올랐으면 오를 수 있는 다른 신. 승천할 신이 없으면 불꽃 불씨
 */
export function returnBranch(ids: readonly string[], hand: string | null, returns: number, mode: BranchMode): string {
  // 엔딩 전 귀환은 고르는 것이 없다 (P6): 갈래가 「돌아간다」 하나뿐이면 그것
  if (ids.length === 1 && ids[0] === 'return') return 'return'
  const ascend = ids.find((id) => id === `ascend:${hand}`) ?? ids.find((id) => id.startsWith('ascend:'))
  const order = mode === 'old' ? (OLD_BRANCH_ORDER[returns] ?? 'ascend') : 'ascend'
  return (order === 'ascend' ? ascend : order) ?? 'flame:flame'
}

/**
 * 목표 보스를 칠 때인가 (보스가 살아 있을 때 묻는다): 주인공의 생명이 넉넉하고, 둘레(9m)에 다른 적이 없거나
 * 보스가 20m 안이거나 보스가 이미 싸움에 끼어들었으면(쫓아오거나 치는 중) 둘레의 적과 상관없이 보스를 친다. 수호자 규칙과 같다.
 * 옛 규칙(둘레의 적이 하나 이하일 때만)은 무리가 계속 다시 서는 땅에서 졸개를 치우느라 보스에 닿지 못했고,
 * 졸개를 쫓는 사이 보스가 줄 끝에서 돌아가 생명이 되찼다
 */
export function bossTurn(s: { hp: number; distance: number; engaged: boolean; strays: number }): boolean {
  return s.hp > BOSS_HP && (s.strays === 0 || s.distance < BOSS_NEAR || s.engaged)
}

/**
 * 떨어지는 것(원 예고)을 맞으며 붙는가: 수호자·목표 보스와 싸우는 동안 생명이 넉넉할 때.
 * 멀리서 던지는 큰 적을 피하기만 하면 싸움이 끝나지 않는다 (E239 수호자, E307 0C 보스)
 */
export function soaksFalling(fight: 'guardian' | 'boss' | null, hp: number): boolean {
  return fight !== null && hp > SOAK_HP[fight]
}

/**
 * 장 흐름 봇이 스스로 귀환할 때인가 (2026-11-22: 제1장의 할 일이 귀환을 시키지 않는다): 이번 원정에서 수호자·장 보스를 이겼고,
 * 지금 땅에 성소가 있고, 귀환할 수 있다. 수호자 → 귀환 → 다음 흔적. 깊이 봇은 제 규칙으로 귀환한다
 */
export function selfReturn(s: { chapters: boolean; deepen: boolean; bosses: number; sanctuary: boolean; canReturn: boolean }): boolean {
  return s.chapters && !s.deepen && s.bosses >= 1 && s.sanctuary && s.canReturn
}

/** 보스를 붙들어 두는 자리: 보스의 집과, 집에서 이 거리 안 (줄 길이 × 되돌아 쫓는 몫) */
export interface Hold {
  home: Point2
  radius: number
}

/**
 * 그 보스를 붙드는 원: 집에서 줄(`leashRange`) × `LEASH_REENGAGE` 안. 거인 왕·키마이라 22.5m, 갈라진 하늘의 왕 30m.
 * 줄 끝까지 쓰면 안 된다: 주인공이 줄 끝에 서면 쫓아온 보스가 집으로 돌아서고, 이 원 안으로 들어온 뒤에야 다시 쫓는다
 */
export function holdOf(boss: { home: Point2; spec: { leashRange: number } }): Hold {
  return { home: boss.home, radius: boss.spec.leashRange * LEASH_REENGAGE }
}

/**
 * 피하거나 물러날 자리로 골라도 되는가: 붙드는 원 안이거나, 이미 원 밖이면 지금보다 집에 가까운 곳.
 * 주인공이 원 밖으로 나가면 쫓아온 보스가 줄 끝에서 집으로 돌아가며 생명을 되채운다. 붙드는 싸움이 없으면(null) 어디든 된다
 */
export function staysInHold(point: Point2, here: Point2, hold: Hold | null): boolean {
  if (!hold) return true
  const d = Math.hypot(point.x - hold.home.x, point.z - hold.home.z)
  return d <= hold.radius || d < Math.hypot(here.x - hold.home.x, here.z - hold.home.z)
}

/**
 * 힘 카드에서 고르는 법 (재미 재설계 P5): `rule`은 무기 칸이 비었으면 무기 → 궁극기 칸이 비었으면 궁극기 → 끼우면 조합이 켜지는 힘 → 첫째 줄.
 * 첫째 줄은 칸에 바로 드는 줄 가운데 첫째다: 찬 무기·궁극기 칸을 바꿔 끼우는 줄과 「가진 힘으로 남는」 줄은 늘어나는 것이 없어 뒤로 미룬다
 * (흔적은 무기를 맨 앞에 내밀어, 그대로 첫째 줄을 고르면 둘째 흔적부터 무기만 바꿔 쥐고 도는 힘 칸은 비어 있었다. P5 봇 판 2026-11-22).
 * `first`·`last`는 늘 첫째·마지막 줄 (봇이 고르는 것에 따라 판이 얼마나 달라지나 잴 때, `--pick=`)
 */
export type PickMode = 'rule' | 'first' | 'last'

export const PICK_MODES: readonly PickMode[] = ['rule', 'first', 'last']

/** 카드의 한 줄 가운데 봇이 보는 것: 종류, 끼우면 켜지는 조합, 칸이 차서 가진 힘으로만 남는가 */
export interface PickRow {
  id: string
  kind: 'weapon' | 'ultimate' | 'aura'
  combo?: string
  spare?: boolean
}

/** 봇이 고를 줄의 id. 줄이 없으면 null */
export function pickPower(rows: readonly PickRow[], slots: { weapon: string | null; ultimate: string | null }, mode: PickMode): string | null {
  if (rows.length === 0) return null
  if (mode === 'first') return rows[0]!.id
  if (mode === 'last') return rows.at(-1)!.id
  const pick =
    (slots.weapon === null ? rows.find((r) => r.kind === 'weapon') : undefined) ??
    (slots.ultimate === null ? rows.find((r) => r.kind === 'ultimate') : undefined) ??
    rows.find((r) => r.combo !== undefined && !r.spare) ??
    rows.find((r) => r.kind === 'aura' && !r.spare) ??
    rows[0]!
  return pick.id
}

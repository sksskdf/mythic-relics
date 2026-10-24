import type { StatKind } from '../data/mythAlways'
import { TRIAL_IDS, TRIAL_LEVELS, TRIAL_MILESTONES, TRIAL_PAR, type TrialId, TRIALS } from '../data/trials'

export interface TrialData {
  /** 시련마다 깬 가장 높은 난이도 (0이면 아직) */
  cleared: Partial<Record<TrialId, number>>
  /** 시련·난이도마다 가장 빠른 기록 (초), 키는 `시련:난이도` */
  best: Record<string, number>
}

/**
 * 시련 기록과 영구 보상 (E16-02·03).
 * 보상은 시련마다 깬 가장 높은 난이도 × 그 시련의 보상. 깬 난이도의 합으로 마일스톤이 열린다.
 * 균열 보상 배율(E17)은 깬 난이도와 가장 높은 난이도의 기록이 빠를수록 커진다.
 */
export class TrialProgress {
  readonly cleared: Partial<Record<TrialId, number>> = {}
  readonly best: Record<string, number> = {}

  /** 깬 난이도의 합 (마일스톤) */
  get total(): number {
    return TRIAL_IDS.reduce((s, id) => s + (this.cleared[id] ?? 0), 0)
  }

  has(milestone: number): boolean {
    return this.total >= milestone
  }

  /** 시련 보상: 수치 종류마다 더한 값 (마일스톤 「시련의 맛」이면 ×1.25) */
  rewards(): Partial<Record<StatKind, number>> {
    const out: Partial<Record<StatKind, number>> = {}
    const scale = this.has(TRIAL_MILESTONES[0].at) ? 1.25 : 1
    for (const id of TRIAL_IDS) {
      const level = this.cleared[id] ?? 0
      if (level <= 0) continue
      const { kind, per } = TRIALS[id].reward
      out[kind] = (out[kind] ?? 0) + level * per * scale
    }
    return out
  }

  /** 깼다: 기록을 남기고 새로 오른 난이도가 있으면 true */
  win(id: TrialId, level: number, seconds: number): { record: boolean; raised: boolean } {
    const key = `${id}:${level}`
    const record = this.best[key] === undefined || seconds < this.best[key]!
    if (record) this.best[key] = Math.round(seconds * 10) / 10
    const raised = level > (this.cleared[id] ?? 0)
    if (raised) this.cleared[id] = level
    return { record, raised }
  }

  /** 균열 보상 배율 (E17): 시련마다 깬 난이도 × 2% × 빠르기(기준 90초 / 그 난이도 기록, 0.5~1.5), 마일스톤 「시련의 이름」이면 +10% */
  riftScale(): number {
    let bonus = 0
    for (const id of TRIAL_IDS) {
      const level = this.cleared[id] ?? 0
      if (level <= 0) continue
      const best = this.best[`${id}:${level}`] ?? TRIAL_PAR
      bonus += level * 0.02 * Math.min(1.5, Math.max(0.5, TRIAL_PAR / best))
    }
    return 1 + bonus + (this.has(TRIAL_MILESTONES[2].at) ? 0.1 : 0)
  }

  toData(): TrialData {
    return { cleared: { ...this.cleared }, best: { ...this.best } }
  }

  load(data: TrialData): void {
    Object.assign(this.cleared, data.cleared)
    Object.assign(this.best, data.best)
  }
}

export function parseTrials(raw: unknown): TrialData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const c = (typeof o.cleared === 'object' && o.cleared !== null ? o.cleared : {}) as Record<string, unknown>
  const cleared: TrialData['cleared'] = {}
  for (const id of TRIAL_IDS) {
    const n = c[id]
    if (typeof n === 'number' && Number.isFinite(n) && n >= 1) cleared[id] = Math.min(TRIAL_LEVELS, Math.round(n))
  }
  const b = (typeof o.best === 'object' && o.best !== null ? o.best : {}) as Record<string, unknown>
  const best: Record<string, number> = {}
  for (const [key, v] of Object.entries(b)) {
    const [id, level] = key.split(':')
    if (!TRIAL_IDS.includes(id as TrialId) || !/^[1-5]$/.test(level ?? '')) continue
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) best[key] = Math.min(3600, v)
  }
  return { cleared, best }
}

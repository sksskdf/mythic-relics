import type { StatKind } from '../data/mythAlways'
import { OATH, OATH_IDS, type OathId, OATHS, TRIAL_TO_OATH } from '../data/oaths'

export interface OathData {
  /** 지킨 맹세 */
  kept: OathId[]
  /** 맹세마다 가장 빨리 지킨 기록 (떠난 뒤 초) */
  best: Partial<Record<OathId, number>>
}

/**
 * 맹세 기록과 영구 보상 (E305-01). 어떤 귀환도 지우지 않는다.
 * 보상은 지킨 맹세마다 한 번(홀로의 맹세는 숨 칸), 기록이 기준보다 빠를수록 명성이 더 붙는다(모두 기준 안이면 +5%)
 */
export class OathProgress {
  readonly kept = new Set<OathId>()
  readonly best: Partial<Record<OathId, number>> = {}

  has(id: OathId): boolean {
    return this.kept.has(id)
  }

  /** 지킨 맹세의 수치: 종류마다 더한 값 */
  rewards(): Partial<Record<StatKind, number>> {
    const out: Partial<Record<StatKind, number>> = {}
    for (const id of this.kept) {
      const { kind, value } = OATHS[id].reward
      if (kind) out[kind] = (out[kind] ?? 0) + value
    }
    return out
  }

  /** 홀로의 맹세를 지켜 늘어난 숨 칸 */
  get breath(): number {
    return this.kept.has('alone') ? OATHS.alone.reward.value : 0
  }

  /** 명성 배율: 지킨 맹세마다 기준 / 기록(1까지)을 맹세 수로 나눠 더한다 */
  renownScale(): number {
    let sum = 0
    for (const id of this.kept) sum += Math.min(1, OATH.par / Math.max(1, this.best[id] ?? OATH.par))
    return 1 + (OATH.renown * sum) / OATH_IDS.length
  }

  /** 지켰다: 기록을 남기고 처음 지켰으면 true */
  keep(id: OathId, seconds: number): { first: boolean; record: boolean } {
    const first = !this.kept.has(id)
    this.kept.add(id)
    const record = this.best[id] === undefined || seconds < this.best[id]!
    if (record) this.best[id] = Math.round(seconds)
    return { first, record }
  }

  toData(): OathData {
    return { kept: [...this.kept], best: { ...this.best } }
  }

  load(data: OathData): void {
    for (const id of data.kept) this.kept.add(id)
    Object.assign(this.best, data.best)
  }
}

const isOath = (id: unknown): id is OathId => OATH_IDS.includes(id as OathId)

export function parseOaths(raw: unknown): OathData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const kept = Array.isArray(o.kept) ? [...new Set(o.kept.filter(isOath))] : []
  const b = (typeof o.best === 'object' && o.best !== null ? o.best : {}) as Record<string, unknown>
  const best: OathData['best'] = {}
  for (const [id, v] of Object.entries(b)) if (isOath(id) && typeof v === 'number' && Number.isFinite(v) && v > 0) best[id] = Math.min(36000, Math.round(v))
  return { kept, best }
}

/**
 * 옛 시련 기록(v16 이하) → 맹세 (`CYCLE.md` 9장 v17): 한 단계라도 깬 시련은 짝인 맹세를 지킨 것으로.
 * 시련 기록(결계 싸움 초)은 원정 기록과 재는 것이 달라 기준 시간으로 둔다
 */
export function oathsFromTrials(raw: unknown): OathData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const c = (typeof o.cleared === 'object' && o.cleared !== null ? o.cleared : {}) as Record<string, unknown>
  const kept: OathId[] = []
  const best: OathData['best'] = {}
  for (const [trial, n] of Object.entries(c)) {
    const id = TRIAL_TO_OATH[trial]
    if (!id || typeof n !== 'number' || !(n >= 1) || kept.includes(id)) continue
    kept.push(id)
    best[id] = OATH.par
  }
  return { kept, best }
}

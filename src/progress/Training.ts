import type { StatKind } from '../data/mythAlways'
import { insightsAt, TRAINING_NODES, trainingNode } from '../data/training'

/** 저장되는 수련 기록 */
export interface TrainingData {
  /** 지금까지 모은 경험치 (깨달음 문턱을 잰다) */
  xp: number
  /** 찍은 마디 */
  taken: string[]
}

/**
 * 수련 (E236-02): 경험치로 깨달음을 얻고, 깨달음 한 점으로 마디 하나를 찍는다.
 * 찍은 마디의 수치는 빌드 상태에 더해진다. 되돌리기는 언제든 무료.
 */
export class TrainingProgress {
  xp = 0
  readonly taken = new Set<string>()

  /** 모은 깨달음 */
  get insights(): number {
    return insightsAt(this.xp)
  }

  /** 아직 쓰지 않은 깨달음 */
  get unspent(): number {
    return Math.max(0, this.insights - this.taken.size)
  }

  /** 경험치를 더한다. 새로 얻은 깨달음 수 */
  gain(amount: number): number {
    if (!(amount > 0)) return 0
    const before = this.insights
    this.xp += amount
    return this.insights - before
  }

  /** 지금 찍을 수 있나: 남은 깨달음이 있고, 아직 안 찍었고, 앞 마디 하나를 찍었다 */
  canTake(id: string): boolean {
    const node = trainingNode(id)
    if (!node || this.taken.has(id) || this.unspent <= 0) return false
    return node.after.length === 0 || node.after.some((a) => this.taken.has(a))
  }

  take(id: string): boolean {
    if (!this.canTake(id)) return false
    this.taken.add(id)
    return true
  }

  /** 찍은 마디를 모두 되돌린다 (무료). 되돌린 수 */
  reset(): number {
    const n = this.taken.size
    this.taken.clear()
    return n
  }

  /** 찍은 마디 수치의 합 (같은 종류끼리 더한다) */
  stats(): Partial<Record<StatKind, number>> {
    const out: Partial<Record<StatKind, number>> = {}
    for (const id of this.taken) for (const s of trainingNode(id)?.stats ?? []) out[s.kind] = (out[s.kind] ?? 0) + s.value
    return out
  }

  toData(): TrainingData {
    return { xp: this.xp, taken: [...this.taken] }
  }

  /** 불러온다. 찍을 수 없는 마디(앞 마디가 빠짐·깨달음보다 많음)는 버린다 */
  load(data: TrainingData): void {
    this.xp = data.xp
    this.taken.clear()
    for (const node of TRAINING_NODES) if (data.taken.includes(node.id) && this.canTake(node.id)) this.taken.add(node.id)
  }
}

/** 저장된 수련 기록을 검사한다. 모르는 마디는 버린다 */
export function parseTraining(raw: unknown, fallbackXp = 0): TrainingData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const xp = typeof o.xp === 'number' && Number.isFinite(o.xp) ? Math.min(1e7, Math.max(0, o.xp)) : fallbackXp
  const taken = Array.isArray(o.taken) ? [...new Set(o.taken.filter((id): id is string => typeof id === 'string' && trainingNode(id) !== undefined))] : []
  return { xp, taken }
}

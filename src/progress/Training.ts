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
  /** 찍은 마디 수치의 합 (빌드 상태가 피해마다 읽어서, 찍고 되돌릴 때만 다시 센다) */
  private totals: Partial<Record<StatKind, number>> = {}

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
    this.recount()
    return true
  }

  /** 찍은 마디를 모두 되돌린다 (무료). 되돌린 수 */
  reset(): number {
    const n = this.taken.size
    this.taken.clear()
    this.recount()
    return n
  }

  /** 마디를 모두 찍었나 (더 얻는 깨달음은 쓸 곳이 없다) */
  get complete(): boolean {
    return this.taken.size >= TRAINING_NODES.length
  }

  /** 찍은 마디 수치의 합 (같은 종류끼리 더한다). 읽기만 한다 */
  stats(): Readonly<Partial<Record<StatKind, number>>> {
    return this.totals
  }

  private recount(): void {
    const out: Partial<Record<StatKind, number>> = {}
    for (const id of this.taken) for (const s of trainingNode(id)?.stats ?? []) out[s.kind] = (out[s.kind] ?? 0) + s.value
    this.totals = out
  }

  toData(): TrainingData {
    return { xp: this.xp, taken: [...this.taken] }
  }

  /**
   * 불러온다. 찍을 수 없는 마디(앞 마디가 빠짐·깨달음보다 많음)는 버린다.
   * 찍은 차례대로 다시 찍되, 앞 마디가 뒤에 적혀 있어도 찍힐 때까지 되풀이한다 (깨달음이 모자라면 나중에 찍은 것부터 빠진다)
   */
  load(data: TrainingData): void {
    this.xp = data.xp
    this.taken.clear()
    let added = true
    while (added) {
      added = false
      for (const id of data.taken) {
        if (this.taken.has(id) || !this.canTake(id)) continue
        this.taken.add(id)
        added = true
      }
    }
    this.recount()
  }
}

/** 저장된 수련 기록을 검사한다. 모르는 마디는 버린다 */
export function parseTraining(raw: unknown, fallbackXp = 0): TrainingData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const xp = typeof o.xp === 'number' && Number.isFinite(o.xp) ? Math.min(1e7, Math.max(0, o.xp)) : fallbackXp
  const taken = Array.isArray(o.taken) ? [...new Set(o.taken.filter((id): id is string => typeof id === 'string' && trainingNode(id) !== undefined))] : []
  return { xp, taken }
}

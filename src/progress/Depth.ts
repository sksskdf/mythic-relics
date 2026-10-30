import { DEPTH_LIMIT, DEPTH_LIMITLESS } from '../data/depth'

/** 저장되는 깊이 (저장 키는 옛 이름 그대로 `threat`, E305-03) */
export interface DepthData {
  level: number
  reached: number
  /** 한계를 깼다: 깊이의 끝이 사라지고 균열이 열린다 */
  limitBroken: boolean
}

/**
 * 깊이 (E305-03, 옛 위협 단계 E14-03). 엔딩 뒤 장치다.
 * - 지금 원정의 깊이(level)와 가 본 가장 깊은 곳(reached). 귀환 카드에서 다음 원정을 그대로나 한 걸음 더 깊이 고른다
 * - 한계를 깸(D8): 깊이 10 원정에서 장 보스나 수호자를 이기고 귀환하면 끝이 사라진다
 */
export class DepthProgress {
  level = 1
  reached = 1
  limitBroken = false

  /** 깊이의 끝 (한계를 깨면 사실상 없음) */
  get max(): number {
    return this.limitBroken ? DEPTH_LIMITLESS : DEPTH_LIMIT
  }

  /** 다음 원정에 고를 수 있는 가장 깊은 곳: 가 본 곳보다 한 걸음 더 (끝까지) */
  get deepest(): number {
    return Math.min(this.max, this.reached + 1)
  }

  /** 다음 원정의 깊이를 고른다. 처음 가는 깊이면 가 본 곳도 오른다 */
  choose(level: number): boolean {
    if (!Number.isInteger(level) || level < 1 || level > this.deepest) return false
    this.level = level
    this.reached = Math.max(this.reached, level)
    return true
  }

  toData(): DepthData {
    return { level: this.level, reached: this.reached, limitBroken: this.limitBroken }
  }

  load(data: DepthData): void {
    this.reached = data.reached
    this.level = data.level
    this.limitBroken = data.limitBroken
  }
}

/**
 * 저장된 깊이를 검사한다. 틀리거나 없으면 처음 상태.
 * 옛 위협 단계의 열린 단계(unlocked)·신화권마다 이긴 단계(cleared)는 버린다 (옛 저장 옮기기는 `migrate/legacy.ts`의 `oldThreat`가 읽는다)
 */
export function parseDepth(raw: unknown): DepthData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const int = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback)
  const limitBroken = o.limitBroken === true
  const reached = int(o.reached, 1, limitBroken ? DEPTH_LIMITLESS : DEPTH_LIMIT, 1)
  const level = int(o.level, 1, reached, 1)
  return { level, reached, limitBroken }
}

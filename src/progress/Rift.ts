import { STARS } from '../data/rift'
import { type God, GODS } from '../relics/data'

export interface RiftData {
  /** 가장 깊이 내려간 층 */
  best: number
  /** 쓰지 않은 별 */
  stars: number
  /** 밝힌 별 (신화 id) */
  lit: God[]
}

/**
 * 균열 기록과 성좌판 (E17-04·05). 균열 안의 축복·층은 저장하지 않는다 (나가면 끝).
 */
export class RiftProgress {
  best = 0
  stars = 0
  readonly lit = new Set<God>()

  /** 그 별을 밝힐 수 있나: 별이 남았고, 이웃한 별이 밝혀졌거나(첫 별이면) 그 신화가 열렸다 */
  canLight(god: God, isOpen: (god: God) => boolean): boolean {
    const star = STARS[god]
    if (!star || this.lit.has(god) || this.stars <= 0) return false
    if (this.lit.size === 0) return isOpen(god)
    return star.neighbors.some((n) => this.lit.has(n))
  }

  light(god: God, isOpen: (god: God) => boolean): boolean {
    if (!this.canLight(god, isOpen)) return false
    this.stars -= 1
    this.lit.add(god)
    return true
  }

  /** 층에 처음 닿았다: 기록을 올리고 새로 얻은 별 수 (처음 닿은 5층마다 하나) */
  reach(depth: number, every: number): number {
    if (depth <= this.best) return 0
    const before = Math.floor(this.best / every)
    this.best = depth
    const gained = Math.floor(depth / every) - before
    this.stars += gained
    return gained
  }

  toData(): RiftData {
    return { best: this.best, stars: this.stars, lit: [...this.lit] }
  }

  load(data: RiftData): void {
    this.best = data.best
    this.stars = data.stars
    for (const god of data.lit) this.lit.add(god)
  }
}

export function parseRift(raw: unknown, refund = 0): RiftData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const int = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0)
  return {
    best: int(o.best, 9999),
    stars: Math.min(999, int(o.stars, 999) + refund),
    lit: [...new Set((Array.isArray(o.lit) ? o.lit : []).filter((g): g is God => typeof g === 'string' && Object.hasOwn(GODS, g)))],
  }
}

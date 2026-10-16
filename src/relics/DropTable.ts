import { DATA } from '../data'
import { type God, RELIC_IDS, relicDef, type RelicId } from './data'

/** 보스마다 반드시 떨어뜨리는 유물 (DESIGN.md 9.3). 적 데이터의 fixedDrop에서 모은다. */
export const BOSS_RELICS: Readonly<Record<string, RelicId>> = Object.fromEntries(
  Object.values(DATA.enemies).flatMap((e) => (e.boss && e.fixedDrop ? [[e.boss, e.fixedDrop]] : [])),
)

export interface DropTuning {
  /** 일반 괴물의 기본 드랍 확률 */
  base: number
  /** 보스의 드랍 확률 */
  boss: number
  /** 유물이 안 나올 때마다 오르는 확률 (불운 보정) */
  pity: number
}

export const DEFAULT_DROPS: DropTuning = { base: 0.015, boss: 0.7, pity: 0.006 }

/**
 * 유물 드랍 규칙. (DESIGN.md 9.3)
 * - 보스 확정 유물: 아직 없으면 반드시 떨어뜨린다.
 * - 나머지는 무작위. 이미 가진 유물(땅에 떨어진 것 포함)은 나오지 않는다.
 * - 불운 보정: 유물이 안 나올수록 확률이 오르고, 나오면 처음으로 돌아간다.
 * - 이미 유물을 가진 신의 남은 유물이 더 잘 나온다. (그 신 유물 1개마다 가중치 +1) 발현까지의 운 차이를 줄인다.
 */
export class DropTable {
  /** 마지막으로 유물이 나온 뒤 놓친 횟수 */
  misses = 0

  constructor(
    private readonly rng: () => number = Math.random,
    readonly tuning: DropTuning = DEFAULT_DROPS,
    /** 무작위로 나올 수 있는 유물 (보스 확정 유물은 빼 둔다) */
    private readonly pool: readonly RelicId[] = RELIC_IDS.filter((id) => !Object.values(BOSS_RELICS).includes(id)),
  ) {}

  /** 지금 일반 괴물을 잡았을 때의 드랍 확률 */
  get chance(): number {
    return Math.min(1, this.tuning.base + this.misses * this.tuning.pity)
  }

  /**
   * 괴물을 쓰러뜨렸을 때 떨어질 유물을 정한다.
   * @param owned 이미 가졌거나 땅에 떨어져 있는 유물
   * @param boss 보스 이름 (보스가 아니면 없음)
   */
  roll(owned: ReadonlySet<RelicId>, boss?: string): RelicId | null {
    const fixed = boss ? BOSS_RELICS[boss] : undefined
    if (fixed && !owned.has(fixed)) {
      this.misses = 0
      return fixed
    }
    const candidates = this.pool.filter((id) => !owned.has(id))
    if (candidates.length === 0) return null
    const chance = boss ? Math.max(this.tuning.boss, this.chance) : this.chance
    if (this.rng() >= chance) {
      this.misses += 1
      return null
    }
    this.misses = 0
    const owners = new Map<God, number>()
    for (const id of owned) owners.set(relicDef(id).god, (owners.get(relicDef(id).god) ?? 0) + 1)
    const weights = candidates.map((id) => 1 + (owners.get(relicDef(id).god) ?? 0))
    let pick = this.rng() * weights.reduce((a, b) => a + b, 0)
    for (let i = 0; i < candidates.length; i++) {
      pick -= weights[i]!
      if (pick < 0) return candidates[i]!
    }
    return candidates.at(-1)!
  }
}

import { DATA } from '../data'
import type { Realm } from '../data/schema'
import { type God, godDef, RELIC_IDS, relicDef, type RelicId } from '../relics/data'
import { relicGods } from '../relics/model'
import { MATERIAL_RELICS } from './mythRelic'

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
  /** 이미 가진 같은 신 유물 1개마다 더하는 가중치 (발현까지의 운 차이를 줄인다) */
  sameGod: number
  /** 지금 지역과 다른 신화권 유물의 가중치 배율 (다른 땅에서 흘러온 유물, E6-18) */
  foreign: number
}

export const DEFAULT_DROPS: DropTuning = { base: 0.015, boss: 0.7, pity: 0.012, sameGod: 4, foreign: 0.04 }

/**
 * 유물 드랍 규칙. (DESIGN.md 9.3)
 * - 보스 확정 유물: 아직 없으면 반드시 떨어뜨린다. 그다음은 그 땅 신들의 대표 유물 가운데 없는 것을 반드시 (E7-06).
 * - 나머지는 무작위. 이미 가진 유물(땅에 떨어진 것 포함)은 나오지 않는다.
 * - 불운 보정: 유물이 안 나올수록 확률이 오르고, 나오면 처음으로 돌아간다.
 * - 이미 유물을 가진 신의 남은 유물이 더 잘 나온다. (그 신 유물 1개마다 가중치 +sameGod) 발현까지의 운 차이를 줄인다.
 * - 지금 지역의 신화권 유물이 주로 나오고, 다른 신화권 유물은 드물게 섞인다. (가중치 × foreign, DESIGN.md 9.3)
 */
/** 그 신화권 신들의 대표 유물: 신마다 relics.json에서 첫 유물 (히든 클래스 제외) */
export function representatives(realm: Realm): RelicId[] {
  const out: RelicId[] = []
  const seen = new Set<string>()
  for (const id of RELIC_IDS) {
    const god = godDef(relicDef(id).god)
    if (god.hidden || god.realm !== realm || seen.has(god.id)) continue
    seen.add(god.id)
    out.push(id)
  }
  return out
}

export class DropTable {
  /** 마지막으로 유물이 나온 뒤 놓친 횟수 */
  misses = 0
  /** 지금 있는 지역의 신화권 (E7에서 지역마다 바뀐다. 지금은 북유럽 설원뿐) */
  realm: Realm = 'norse'

  constructor(
    private readonly rng: () => number = Math.random,
    readonly tuning: DropTuning = DEFAULT_DROPS,
    /**
     * 무작위로 나올 수 있는 유물: 재료가 된 유물만 (E13-03). 신화의 유물은 지역 보스가 떨어뜨리거나 대장간에서 만든다.
     * 히든 신화의 재료(아메노오하바리)도 재료라 나온다. 히든 신화의 유물(후츠노미타마)은 대장간에서만.
     */
    private readonly pool: readonly RelicId[] = MATERIAL_RELICS.filter((id) => !Object.values(BOSS_RELICS).includes(id)),
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
    // 보스 확정 유물은 그 유물의 신화권 땅에서만 (예전 저장이나 개발 패널로 다른 땅에 거인 왕을 부를 수 있다)
    const fixed = boss ? BOSS_RELICS[boss] : undefined
    if (fixed && !owned.has(fixed) && godDef(relicDef(fixed).god).realm === this.realm) {
      this.misses = 0
      return fixed
    }
    // 지역 보스: 이 땅 신들의 대표 유물(신마다 첫 유물) 가운데 아직 없는 것을 반드시 떨어뜨린다 (E7-06)
    if (boss) {
      const reps = representatives(this.realm).filter((id) => !owned.has(id))
      if (reps.length > 0) {
        this.misses = 0
        return this.pickWeighted(reps, owned)
      }
    }
    const candidates = this.pool.filter((id) => !owned.has(id))
    if (candidates.length === 0) return null
    const chance = boss ? Math.max(this.tuning.boss, this.chance) : this.chance
    if (this.rng() >= chance) {
      this.misses += 1
      return null
    }
    this.misses = 0
    return this.pickWeighted(candidates, owned)
  }

  /** 같은 신 유물을 가진 만큼, 지금 땅의 신화권일수록 잘 나오게 하나 고른다 */
  private pickWeighted(candidates: readonly RelicId[], owned: ReadonlySet<RelicId>): RelicId {
    const owners = new Map<God, number>()
    for (const id of owned) for (const god of relicGods(relicDef(id))) owners.set(god, (owners.get(god) ?? 0) + 1)
    const weights = candidates.map((id) => {
      const def = relicDef(id)
      const local = godDef(def.god).realm === this.realm ? 1 : this.tuning.foreign
      return local * (1 + (owners.get(def.god) ?? 0) * this.tuning.sameGod)
    })
    let pick = this.rng() * weights.reduce((a, b) => a + b, 0)
    for (let i = 0; i < candidates.length; i++) {
      pick -= weights[i]!
      if (pick < 0) return candidates[i]!
    }
    return candidates.at(-1)!
  }
}

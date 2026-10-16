import { type Archetype, type God, GODS } from '../relics/data'

export const MAX_LEVEL = 4
/** 레벨마다 다음 승급까지 필요한 경험치 (Lv1→2, Lv2→3, Lv3→4) */
export const XP_TO_PROMOTE: readonly number[] = [150, 400, 900]

export interface ClassRecord {
  level: number
  xp: number
}

/** 승급 한 번마다 오르는 기본 능력치 (DESIGN.md 6.2: 총 승급 횟수에서 나온다) */
export const PER_PROMOTION = { maxHp: 15, damage: 0.05 }
/** 원형 친화도 1마다 그 원형 스킬 피해가 늘어나는 비율 */
export const AFFINITY_DAMAGE = 0.1

/**
 * 클래스 성장 기록. (DESIGN.md 5.2)
 * - 발현 상태로 괴물을 잡으면 그 클래스에 경험치가 쌓인다. 가호 상태에서는 쌓이지 않는다.
 * - 경험치 바가 가득 차면 승급 대기. 승급 전설을 깨면 다음 레벨로 오른다.
 * - 승급하면 그 원형의 친화도가 오르고, 총 승급 횟수만큼 기본 능력치가 오른다.
 */
export class ClassProgress {
  readonly records = new Map<God, ClassRecord>()

  record(god: God): ClassRecord {
    let record = this.records.get(god)
    if (!record) {
      record = { level: 1, xp: 0 }
      this.records.set(god, record)
    }
    return record
  }

  level(god: God): number {
    return this.record(god).level
  }

  title(god: God): string {
    return GODS[god].titles[this.level(god) - 1]!
  }

  /** 다음 승급까지 필요한 경험치. 최고 레벨이면 0 */
  xpNeeded(god: God): number {
    return XP_TO_PROMOTE[this.level(god) - 1] ?? 0
  }

  /** 경험치 바 비율 0~1 */
  xpRatio(god: God): number {
    const needed = this.xpNeeded(god)
    return needed > 0 ? Math.min(1, this.record(god).xp / needed) : 1
  }

  /** 경험치 바가 가득 차서 승급 전설에 들어갈 수 있는가 */
  readyToPromote(god: God): boolean {
    const needed = this.xpNeeded(god)
    return needed > 0 && this.record(god).xp >= needed
  }

  /** 경험치를 더한다. 바가 가득 차면 더 쌓이지 않는다. */
  addXp(god: God, amount: number): void {
    const record = this.record(god)
    const needed = this.xpNeeded(god)
    if (needed <= 0) return
    record.xp = Math.min(needed, record.xp + amount)
  }

  /** 승급 전설을 깼다. 승급했으면 true */
  promote(god: God): boolean {
    if (!this.readyToPromote(god)) return false
    const record = this.record(god)
    record.level += 1
    record.xp = 0
    return true
  }

  /** 총 승급 횟수 */
  get promotions(): number {
    let total = 0
    for (const record of this.records.values()) total += record.level - 1
    return total
  }

  /** 원형 친화도: 그 원형에 속한 클래스들의 승급 횟수 합 */
  affinity(archetype: Archetype): number {
    let total = 0
    for (const [god, record] of this.records) {
      if (GODS[god].archetype === archetype) total += record.level - 1
    }
    return total
  }
}

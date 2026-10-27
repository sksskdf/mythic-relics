import { type God, godDef } from '../relics/data'

export const MAX_LEVEL = 4
/** 데모(첫 엔딩까지)의 단계 끝: 4단계는 엔딩 뒤 (E21-01, TIMELINE.md 3장) */
export const DEMO_MAX_LEVEL = 3
/** 1단계(신화 개방)에 필요한 신화 경험치 */
export const MASTERY_TO_OPEN = 200
/** 단계마다 다음 단계까지 필요한 신화 경험치 (1→2, 2→3, 3→4). 차면 그 신화의 전설을 깨야 오른다 */
export const XP_TO_PROMOTE: readonly number[] = [1000, 2000, 3500]

export interface ClassRecord {
  /** 개방 단계 0~4. 0은 아직 못 연 신화, 한 번 열면 내려가지 않는다 */
  level: number
  /** 신화 숙련: 지금 단계에서 쌓인 양 (단계가 오르면 0부터) */
  xp: number
}

/** 고를 수 있는 신화 수. 위협 단계·균열·시련 보상으로 2까지 늘린다 (E16·E17) */
export const CHOSEN_SLOTS = 1

/** 숙련을 더한 결과 */
export type MasteryResult = 'opened' | null

/**
 * 단계 하나가 큰 걸음이다 (E21-01, TIMELINE.md 5.1): 승급 한 번마다 모든 피해 ×1.35, 최대 생명 +25%.
 * 총 승급 횟수에서 나오므로 다른 신화로 바꿔도 남는다.
 */
export const PER_PROMOTION = { damage: 1.35, maxHpPct: 0.25 }

/** 수집 보너스 (E21-02): 열린 신화 하나마다 모든 피해 +4%, 최대 생명 +5. 메아리 대신 신화를 모으는 이유 */
export const PER_OPENED = { damage: 0.04, maxHp: 5 }

/**
 * 신화 성장 기록. (DESIGN.md 5.2, E12-02 → E21-01)
 * - 몬스터를 잡으면 고른 신화만 경험치를 받는다 (`masteryShares`). 고른 신화가 없으면 그 신화권 신들이 받아 첫 신화를 연다.
 * - 경험치가 문턱을 넘으면 1단계가 열린다. 데모에서는 문턱에서 멈추고 성소에서 넷 중 하나를 고른다 (E22-03). 한 번 열면 영구다.
 * - 2단계부터는 경험치가 차고 그 신화의 전설을 깨야 오른다. 데모는 3단계까지 (levelCap).
 * - 총 승급 횟수만큼 기본 능력치가 크게 오른다 (PER_PROMOTION).
 */
export class ClassProgress {
  readonly records = new Map<God, ClassRecord>()
  /** 고른 신화 (E12-04). 지금은 1개, 보상으로 2개까지 (CHOSEN_SLOTS) */
  chosen: God[] = []
  /**
   * afterEnding: 엔딩 뒤인가. 그 뒤로는 4단계까지 오른다.
   * openByXp: 경험치가 문턱을 넘으면 신화가 저절로 열리는가. 데모(엔딩 전)에서는 끄고, 문턱까지만 쌓아 성소에서 고르게 한다 (E22-03)
   */
  constructor(
    private readonly afterEnding: () => boolean = () => false,
    private readonly openByXp: () => boolean = () => true,
  ) {}

  /** 개발 지름길이 데모 끝 단계를 넘겼다 (4단계 외형·궁극기 점검) */
  uncapped = false

  /** 오를 수 있는 가장 높은 단계 (데모 3, 엔딩 뒤 4) */
  get levelCap(): number {
    return this.uncapped || this.afterEnding() ? MAX_LEVEL : DEMO_MAX_LEVEL
  }

  record(god: God): ClassRecord {
    let record = this.records.get(god)
    if (!record) {
      record = { level: 0, xp: 0 }
      this.records.set(god, record)
    }
    return record
  }

  /** 개방 단계 (못 연 신화는 0) */
  level(god: God): number {
    return this.records.get(god)?.level ?? 0
  }

  /** 열린 신화인가 */
  isOpen(god: God): boolean {
    return this.level(god) >= 1
  }

  /** 열린 신화들 */
  get opened(): God[] {
    return [...this.records].filter(([, r]) => r.level >= 1).map(([god]) => god)
  }

  /** 지금 단계의 칭호 (못 연 신화는 1단계 칭호) */
  title(god: God): string {
    return godDef(god).titles[Math.max(1, this.level(god)) - 1]!
  }

  /** 쌓인 경험치 (기록을 만들지 않고 읽는다) */
  xpOf(god: God): number {
    return this.records.get(god)?.xp ?? 0
  }

  /** 다음 단계까지 필요한 경험치. 오를 수 있는 끝 단계면 0 */
  xpNeeded(god: God): number {
    const level = this.level(god)
    if (level >= this.levelCap) return 0
    return level === 0 ? MASTERY_TO_OPEN : (XP_TO_PROMOTE[level - 1] ?? 0)
  }

  /** 숙련 바 비율 0~1 */
  xpRatio(god: God): number {
    const needed = this.xpNeeded(god)
    return needed > 0 ? Math.min(1, (this.records.get(god)?.xp ?? 0) / needed) : 1
  }

  /** 숙련이 차서 전설에 들어갈 수 있는가 (열린 신화만) */
  readyToPromote(god: God): boolean {
    const needed = this.xpNeeded(god)
    return this.isOpen(god) && needed > 0 && this.record(god).xp >= needed
  }

  /** 신화를 연다 (숙련 문턱, 또는 유물 발현). 새로 열었으면 true */
  open(god: God): boolean {
    const record = this.record(god)
    if (record.level >= 1) return false
    record.level = 1
    record.xp = 0
    return true
  }

  /** 숙련을 더한다. 문턱을 넘으면 신화가 열리고 남은 숙련은 다음 바로 넘어간다. 열린 신화는 바가 가득 차면 더 쌓이지 않는다. */
  addXp(god: God, amount: number): MasteryResult {
    const record = this.record(god)
    const total = record.xp + amount
    if (record.level === 0) {
      if (total < MASTERY_TO_OPEN || !this.openByXp()) {
        // 데모에서는 문턱까지만 쌓인다: 그 신화권 성소에서 하나를 고르는 순간이 된다 (E22-03)
        record.xp = Math.min(total, MASTERY_TO_OPEN)
        return null
      }
      this.open(god)
      record.xp = Math.min(this.xpNeeded(god), total - MASTERY_TO_OPEN)
      return 'opened'
    }
    const needed = this.xpNeeded(god)
    if (needed > 0) record.xp = Math.min(needed, total)
    return null
  }

  /** 전설을 깼다. 승급했으면 true */
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
    for (const record of this.records.values()) total += Math.max(0, record.level - 1)
    return total
  }

}

/**
 * 몬스터 하나를 잡았을 때 신화 경험치가 누구에게 가는가 (E21-01: 숙련 나눠 주기를 없앰).
 * - 고른 신화가 있으면 고른 신화만 전부 받는다 (어느 신화권 몬스터든).
 * - 아직 고른 신화가 없으면 그 몬스터 신화권의 신들이 받는다: 첫 신화를 여는 데 쓰인다.
 * - 히든 신화는 몬스터로 쌓이지 않는다 (유물로 연다).
 */
export function masteryShares(amount: number, realm: string | undefined, chosen: God | null, gods: readonly { id: God; realm: string; hidden: boolean }[]): Map<God, number> {
  const out = new Map<God, number>()
  if (chosen) out.set(chosen, amount)
  else if (realm) for (const g of gods) if (!g.hidden && g.realm === realm) out.set(g.id, amount)
  return out
}

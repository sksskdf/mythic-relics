import { CONQUEST, LEVEL_CAP_BASE } from '../data/cycle'
import { type God, godDef } from '../relics/data'
import { emptyPantheon, type Pantheon } from './pantheon'

export const MAX_LEVEL = 4
/** 데모(첫 엔딩까지)의 단계 끝: 4단계는 엔딩 뒤 (E21-01, TIMELINE.md 3장) */
export const DEMO_MAX_LEVEL = 3

export interface ClassRecord {
  /** 개방 단계 0~4. 0은 아직 못 연 신화, 한 번 열면 내려가지 않는다 */
  level: number
}

/**
 * 단계 하나가 큰 걸음이다 (E21-01, TIMELINE.md 5.1): 승급 한 번마다 모든 피해 ×1.35, 최대 생명 +25%.
 * 총 승급 횟수에서 나오므로 다른 신화로 바꿔도 남는다.
 */
export const PER_PROMOTION = { damage: 1.35, maxHpPct: 0.25 }

/** 열린 신화 하나마다 최대 생명 +5 (E21-02의 수집 보너스에서 생명만 남김) */
export const PER_OPENED = { maxHp: 5 }
/** 유물표 (E303-04): 켠 칸(신화의 유물·고유 효과) 하나마다 모든 피해 +1% */
export const PER_LIT = 0.01

/**
 * 신화 성장 기록. (DESIGN.md 5.2, E12-02 → E21-01 → E305-03)
 * - 신은 조각 셋(흔적·사냥·수호자)으로 깨우면 1단계로 열린다 (`open`, 엔딩 뒤에는 유물로도). 한 번 열면 영구다.
 * - 단계는 귀환 갈래 「승천」으로만 오른다 (`ascend`, E304). 신화 경험치와 성소 전설로 오르던 길은 E305-03에서 걷었다.
 *   데모는 2에서 장 정복마다 +1, 끝 3 (levelCap).
 * - 총 승급 횟수만큼 기본 능력치가 크게 오른다 (PER_PROMOTION).
 */
export class ClassProgress {
  readonly records = new Map<God, ClassRecord>()
  /** 신의 자리 셋 (E302): 손·심장·숨에 낀 신 */
  pantheon: Pantheon = emptyPantheon()
  /** afterEnding: 엔딩 뒤인가. 그 뒤로는 4단계까지 오른다 */
  constructor(
    private readonly afterEnding: () => boolean = () => false,
    /** 정복한 장의 수 (E305-02): 데모의 신 단계 상한이 2에서 하나씩 오른다. 장 진행을 넘기지 않으면 데모 끝(3)까지 연다 */
    private readonly conquered: () => number = () => DEMO_MAX_LEVEL - LEVEL_CAP_BASE,
  ) {}

  /** 개발 지름길이 데모 끝 단계를 넘겼다 (4단계 외형·궁극기 점검) */
  uncapped = false

  /** 오를 수 있는 가장 높은 단계: 데모는 2에서 장 정복마다 +1(끝 3), 엔딩 뒤 4 */
  get levelCap(): number {
    if (this.uncapped || this.afterEnding()) return MAX_LEVEL
    return Math.min(DEMO_MAX_LEVEL, LEVEL_CAP_BASE + CONQUEST.levelCap * this.conquered())
  }

  record(god: God): ClassRecord {
    let record = this.records.get(god)
    if (!record) {
      record = { level: 0 }
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

  /** 신화를 연다 (신이 깨어남, 엔딩 뒤에는 유물). 새로 열었으면 true */
  open(god: God): boolean {
    const record = this.record(god)
    if (record.level >= 1) return false
    record.level = 1
    return true
  }

  /** 승천 (E304): 귀환 갈래로 열린 신 하나를 한 단계 올린다 (상한 levelCap까지). 올랐으면 true */
  ascend(god: God): boolean {
    const record = this.record(god)
    if (record.level < 1 || record.level >= this.levelCap) return false
    record.level += 1
    return true
  }

  /** 총 승급 횟수 */
  get promotions(): number {
    let total = 0
    for (const record of this.records.values()) total += Math.max(0, record.level - 1)
    return total
  }
}

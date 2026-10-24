import { zeroSources } from '../data/awakening'
import { SOURCE_IDS, type SourceId } from '../data/schema'
import { THREAT_MAX } from '../data/threat'

/** 전투 경험: 잡을 때마다 (정예·보스는 더) */
export const BATTLE = { kill: 1, elite: 4, boss: 25 } as const
/** 단계를 올릴 때 붓는 원천 숙련: 전투 경험 120마다 1, 적어도 1, 많아야 4 */
export const BATTLE_PER_MASTERY = 120
export const POUR_MAX = 4

export interface ThreatData {
  level: number
  unlocked: number
  reached: number
  cleared: Record<string, number>
  mastery: Record<SourceId, number>
  battle: number
}

/**
 * 세계 위협 단계와 원천 갈래 (E14-03·04, DESIGN.md 6.3·9.4).
 * - 단계: 지금 고른 단계(level), 열린 가장 높은 단계(unlocked), 올라가 본 가장 높은 단계(reached)
 * - 열린 가장 높은 단계에서 지역 보스를 이기면 다음 단계가 열린다. 신화권마다 이긴 가장 높은 단계를 적는다 (E17 한계를 깸)
 * - 처음 오르는 단계로 갈 때 그동안의 전투 경험을 원천 하나에 부어 영구 원천 숙련을 올린다
 * - 공명: 네 원천 숙련의 최솟값
 */
export class ThreatProgress {
  level = 1
  unlocked = 1
  reached = 1
  cleared: Record<string, number> = {}
  readonly mastery: Record<SourceId, number> = zeroSources()
  battle = 0

  get resonance(): number {
    return Math.min(...SOURCE_IDS.map((s) => this.mastery[s]))
  }

  /** 지금 단계를 처음 오를 때 부을 숙련 */
  get pour(): number {
    return Math.max(1, Math.min(POUR_MAX, Math.floor(this.battle / BATTLE_PER_MASTERY)))
  }

  gainBattle(amount: number): void {
    this.battle = Math.min(1e6, this.battle + amount)
  }

  /** 지역 보스를 이겼다. 열린 가장 높은 단계에서 이겼으면 다음 단계가 열린다. 새로 열렸으면 true */
  bossDefeated(realm: string | undefined): boolean {
    if (realm) this.cleared[realm] = Math.max(this.cleared[realm] ?? 0, this.level)
    if (this.level < this.unlocked || this.unlocked >= THREAT_MAX) return false
    this.unlocked++
    return true
  }

  /** 올라가 본 단계 안에서 고른다. 처음 오르는 단계는 advance로 */
  choose(level: number): boolean {
    if (!Number.isInteger(level) || level < 1 || level > this.reached) return false
    this.level = level
    return true
  }

  /** 다음 단계로 처음 오른다: 전투 경험을 그 원천에 붓는다. 부은 숙련 (못 오르면 0) */
  advance(source: SourceId): number {
    if (this.reached >= this.unlocked) return 0
    const pour = this.pour
    this.mastery[source] += pour
    this.battle = 0
    this.reached++
    this.level = this.reached
    return pour
  }

  toData(): ThreatData {
    return { level: this.level, unlocked: this.unlocked, reached: this.reached, cleared: { ...this.cleared }, mastery: { ...this.mastery }, battle: this.battle }
  }

  load(data: ThreatData): void {
    this.unlocked = data.unlocked
    this.reached = data.reached
    this.level = data.level
    this.cleared = { ...data.cleared }
    for (const s of SOURCE_IDS) this.mastery[s] = data.mastery[s]
    this.battle = data.battle
  }
}

/** 저장된 위협 단계를 검사한다. 틀리거나 없으면 처음 상태 */
export function parseThreat(raw: unknown): ThreatData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const int = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback)
  const unlocked = int(o.unlocked, 1, THREAT_MAX, 1)
  const reached = int(o.reached, 1, unlocked, 1)
  const level = int(o.level, 1, reached, 1)
  const cleared: Record<string, number> = {}
  if (typeof o.cleared === 'object' && o.cleared !== null) {
    for (const [realm, n] of Object.entries(o.cleared as Record<string, unknown>)) if (realm.length < 20) cleared[realm] = int(n, 0, THREAT_MAX, 0)
  }
  const m = (typeof o.mastery === 'object' && o.mastery !== null ? o.mastery : {}) as Record<string, unknown>
  const mastery = zeroSources()
  for (const s of SOURCE_IDS) mastery[s] = int(m[s], 0, 99, 0)
  return { level, unlocked, reached, cleared, mastery, battle: int(o.battle, 0, 1e6, 0) }
}

import { LIMIT_REALMS, THREAT_LIMITLESS, THREAT_MAX } from '../data/threat'

export interface ThreatData {
  level: number
  unlocked: number
  reached: number
  cleared: Record<string, number>
  /** 한계를 깼다 (E17-01): 위협 단계의 끝이 사라지고 균열이 열린다 */
  limitBroken: boolean
}

/**
 * 세계 위협 단계 (E14-03, DESIGN.md 6.3·9.4). 엔딩 뒤 장치다 (E21-06).
 * - 단계: 지금 고른 단계(level), 열린 가장 높은 단계(unlocked), 올라가 본 가장 높은 단계(reached)
 * - 열린 가장 높은 단계에서 지역 보스를 이기면 다음 단계가 열린다. 신화권마다 이긴 가장 높은 단계를 적는다 (E17 한계를 깸)
 * - 원천 갈래·공명·원천 숙련은 E21-05에서 없앴다 (원천은 장비 속성만)
 */
export class ThreatProgress {
  level = 1
  unlocked = 1
  reached = 1
  cleared: Record<string, number> = {}
  limitBroken = false

  /** 위협 단계의 끝 (한계를 깨면 사실상 없음) */
  get max(): number {
    return this.limitBroken ? THREAT_LIMITLESS : THREAT_MAX
  }

  /** 다섯 신화권 보스를 모두 10단계에서 이겼나 (한계를 깰 수 있다) */
  get canBreak(): boolean {
    return LIMIT_REALMS.every((r) => (this.cleared[r] ?? 0) >= THREAT_MAX)
  }

  /** 지역 보스를 이겼다. 열린 가장 높은 단계에서 이겼으면 다음 단계가 열린다. 새로 열렸으면 true */
  bossDefeated(realm: string | undefined): boolean {
    if (realm) this.cleared[realm] = Math.max(this.cleared[realm] ?? 0, this.level)
    if (this.level < this.unlocked || this.unlocked >= this.max) return false
    this.unlocked++
    return true
  }

  /** 열린 단계 안에서 고른다. 처음 오르는 단계면 올라가 본 단계도 오른다 */
  choose(level: number): boolean {
    if (!Number.isInteger(level) || level < 1 || level > this.unlocked) return false
    this.level = level
    this.reached = Math.max(this.reached, level)
    return true
  }

  toData(): ThreatData {
    return { level: this.level, unlocked: this.unlocked, reached: this.reached, cleared: { ...this.cleared }, limitBroken: this.limitBroken }
  }

  load(data: ThreatData): void {
    this.unlocked = data.unlocked
    this.reached = data.reached
    this.level = data.level
    this.cleared = { ...data.cleared }
    this.limitBroken = data.limitBroken
  }
}

/** 저장된 위협 단계를 검사한다. 틀리거나 없으면 처음 상태 (옛 저장의 원천 숙련·전투 경험은 버린다, E21-05) */
export function parseThreat(raw: unknown): ThreatData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const int = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback)
  const limitBroken = o.limitBroken === true
  const unlocked = int(o.unlocked, 1, limitBroken ? THREAT_LIMITLESS : THREAT_MAX, 1)
  const reached = int(o.reached, 1, unlocked, 1)
  const level = int(o.level, 1, reached, 1)
  const cleared: Record<string, number> = {}
  if (typeof o.cleared === 'object' && o.cleared !== null) {
    for (const [realm, n] of Object.entries(o.cleared as Record<string, unknown>)) if (realm.length < 20) cleared[realm] = int(n, 0, THREAT_LIMITLESS, 0)
  }
  return { level, unlocked, reached, cleared, limitBroken }
}

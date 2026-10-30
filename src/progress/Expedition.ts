import { atCount, AUTOMATION, FLAME, NEW_FIRE, renownFor, renownMultiplier } from '../data/cycle'
import { SOURCE_IDS, type SourceId } from '../data/schema'

/** 저장되는 원정 기록 */
export interface ExpeditionData {
  /** 지금 원정 번호 (1부터, 귀환할 때마다 +1) */
  count: number
  /** 누적 명성 */
  renown: number
  /** 원천 불씨: 원천마다 고른 횟수 */
  flames: Partial<Record<SourceId, number>>
  /** 원정마다 걸린 초 (끝난 원정만) */
  best: number[]
  /** 이번 원정을 떠난 뒤 흐른 초 */
  elapsed: number
  /** 이번 원정에서 이긴 수호자·장 보스 수 */
  bosses: number
  /** 이번 원정에서 가장 깊이 닿은 장 (1부터) */
  deepest: number
  /** 지난 원정에서 익힌 마디 차례 (귀환 1 뒤로 저절로 다시 찍는다) */
  lastTaken: string[]
  /** 지난 원정들의 가장 많은 기세 경험치 (출발점) */
  bestXp: number
  /** 가보: 귀환해도 남기는 일반 장비 id */
  heirloom: string[]
}

/** 귀환 카드에 보일 것 */
export interface ReturnPreview {
  /** 이번에 받을 명성 */
  gain: number
  /** 지금 배율과 귀환 뒤 배율 */
  now: number
  next: number
  /** 이번 원정 시간과 지난 기록 (없으면 null) */
  seconds: number
  last: number | null
}

/**
 * 원정 (E304, `CYCLE.md` 3장): 원정 번호·명성·원천 불씨·기록·가보·출발점.
 * 기세(수련 경험치와 마디)는 `TrainingProgress`가 갖고, 귀환할 때 이 기록이 그것을 지우고 다시 찍을 차례를 남긴다.
 */
export class ExpeditionProgress {
  count = 1
  renown = 0
  flames: Partial<Record<SourceId, number>> = {}
  best: number[] = []
  elapsed = 0
  bosses = 0
  deepest = 1
  lastTaken: string[] = []
  bestXp = 0
  heirloom: string[] = []
  /** 새 불길이 남은 초 (저장하지 않는다) */
  fire = 0

  /** 귀환한 횟수 */
  get returns(): number {
    return this.count - 1
  }

  /** 지금 명성 배율 */
  get multiplier(): number {
    return renownMultiplier(this.renown)
  }

  /** 사냥 불씨가 키운 명성 배율 */
  get renownScale(): number {
    return FLAME.hunt.renown ** (this.flames.hunt ?? 0)
  }

  /** 이번 원정의 명성 몫 */
  get gain(): number {
    return Math.round(renownFor(this.deepest, this.bosses) * this.renownScale)
  }

  preview(): ReturnPreview {
    return { gain: this.gain, now: this.multiplier, next: renownMultiplier(this.renown + this.gain), seconds: this.elapsed, last: this.best.at(-1) ?? null }
  }

  /** 원천 불씨가 더하는 원천 수치 */
  flamePoints(): Record<SourceId, number> {
    return Object.fromEntries(SOURCE_IDS.map((s) => [s, (this.flames[s] ?? 0) * FLAME.points])) as Record<SourceId, number>
  }

  /** 가보 칸 수 */
  get heirloomSlots(): number {
    return atCount(AUTOMATION.heirloom, this.returns)
  }

  /** 다음 원정의 기세 출발 경험치 */
  get headStart(): number {
    return Math.round(this.bestXp * atCount(AUTOMATION.head, this.returns))
  }

  /** 마디를 저절로 다시 찍는가 */
  get retakes(): boolean {
    return this.returns >= AUTOMATION.retake
  }

  /** 그 등급까지 저절로 합치는가 (보통은 좋음 문턱과 함께) */
  autoMerges(grade: 'common' | 'good' | 'rare'): boolean {
    const need = grade === 'rare' ? AUTOMATION.autoMerge.rare : AUTOMATION.autoMerge.good
    return this.returns >= need
  }

  /** 이긴 수호자·장 보스 */
  beatBoss(): void {
    this.bosses += 1
  }

  /** 닿은 장 */
  reach(chapter: number): void {
    this.deepest = Math.max(this.deepest, chapter)
  }

  /** 시간이 흐른다 */
  tick(dt: number): void {
    this.elapsed += dt
    this.fire = Math.max(0, this.fire - dt)
  }

  /**
   * 귀환한다: 명성을 받고 불씨를 더하고 기록을 남긴 뒤 새 원정을 연다. 받은 명성.
   * 기세 경험치와 익힌 마디는 다음 출발점·다시 찍기에 쓴다 (지우는 것은 시스템이 한다)
   */
  return(pick: { flame?: SourceId }, xp: number, taken: readonly string[]): number {
    const gain = this.gain
    this.renown += gain
    if (pick.flame) this.flames[pick.flame] = (this.flames[pick.flame] ?? 0) + 1
    this.best.push(Math.round(this.elapsed))
    if (this.best.length > 20) this.best.shift()
    this.bestXp = Math.max(this.bestXp, xp)
    this.lastTaken = [...taken]
    this.count += 1
    this.elapsed = 0
    this.bosses = 0
    this.deepest = 1
    this.heirloom = this.heirloom.slice(0, this.heirloomSlots)
    this.fire = NEW_FIRE.seconds
    return gain
  }

  toData(): ExpeditionData {
    return { count: this.count, renown: this.renown, flames: { ...this.flames }, best: [...this.best], elapsed: Math.round(this.elapsed), bosses: this.bosses, deepest: this.deepest, lastTaken: [...this.lastTaken], bestXp: this.bestXp, heirloom: [...this.heirloom] }
  }

  load(data: ExpeditionData): void {
    Object.assign(this, { ...data, flames: { ...data.flames }, best: [...data.best], lastTaken: [...data.lastTaken], heirloom: [...data.heirloom] })
  }
}

const num = (v: unknown, min: number, max: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback)
const strings = (v: unknown, max: number): string[] => (Array.isArray(v) ? [...new Set(v.filter((s): s is string => typeof s === 'string' && s.length <= 40))].slice(0, max) : [])

/** 저장된 원정 기록을 검사한다. 없으면(옛 저장) 첫 원정 */
export function parseExpedition(raw: unknown): ExpeditionData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const f = (typeof o.flames === 'object' && o.flames !== null ? o.flames : {}) as Record<string, unknown>
  const flames: Partial<Record<SourceId, number>> = {}
  for (const s of SOURCE_IDS) if (typeof f[s] === 'number' && (f[s] as number) >= 1) flames[s] = Math.min(50, Math.round(f[s] as number))
  return {
    count: Math.round(num(o.count, 1, 999, 1)),
    renown: num(o.renown, 0, 1e7, 0),
    flames,
    best: (Array.isArray(o.best) ? o.best : []).filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0).slice(-20).map(Math.round),
    elapsed: num(o.elapsed, 0, 1e6, 0),
    bosses: Math.round(num(o.bosses, 0, 99, 0)),
    deepest: Math.round(num(o.deepest, 1, 9, 1)),
    lastTaken: strings(o.lastTaken, 40),
    bestXp: num(o.bestXp, 0, 1e7, 0),
    heirloom: strings(o.heirloom, 4),
  }
}

import { SOURCE_IDS, type SourceId } from '../data/schema'

/**
 * 순환 성장 (DESIGN.md 6.3, ROADMAP E4.5). 회색 박스: 규칙과 수치만, 그림은 나중에.
 * 1 전투: 싸우면 원천 결정이 들어온다. 2 단련: 결정으로 원천마다 능력치 갈래를 올린다.
 * 3 승급: 원천 숙련이 결정 배율과 단련 할인을 준다. 4 윤회: 단련·결정을 버리고 재와 별자리를 얻는다.
 * 5 종말: 종말 보스를 쓰러뜨리면 윤회의 규칙을 바꾸는 태초의 법을 하나 고른다.
 */

/** 서로 키우는 고리: 바람 → 불꽃 → 사냥 → 바위 → 바람. 앞 원천의 단련이 뒤 원천의 결정을 늘린다. */
export const RING_NEXT: Record<SourceId, SourceId> = { wind: 'flame', flame: 'hunt', hunt: 'stone', stone: 'wind' }
export const RING_PREV: Record<SourceId, SourceId> = { flame: 'wind', hunt: 'flame', stone: 'hunt', wind: 'stone' }

/** 단련 한 단계마다 오르는 것 */
export const TRAINING = {
  flame: { damage: 0.05 },
  hunt: { healOnKill: 2 },
  wind: { moveSpeed: 0.03 },
  stone: { maxHp: 8, damageTaken: 0.02 },
} as const
export const TRAINING_TEXT: Record<SourceId, (level: number) => string> = {
  flame: (n) => `모든 피해 +${Math.round(n * TRAINING.flame.damage * 100)}%`,
  hunt: (n) => `쓰러뜨릴 때마다 생명 +${n * TRAINING.hunt.healOnKill}`,
  wind: (n) => `이동 속도 +${Math.round(n * TRAINING.wind.moveSpeed * 100)}%`,
  stone: (n) => `최대 생명 +${n * TRAINING.stone.maxHp}, 받는 피해 −${Math.round(Math.min(0.5, n * TRAINING.stone.damageTaken) * 100)}%`,
}

/** 고리의 앞 원천 단련 1단계마다 뒤 원천 결정 +4% */
export const RING_BONUS = 0.04
/** 숙련 1마다 그 원천 결정 +25% */
export const MASTERY_GAIN = 0.25
/** 윤회할 때마다 모든 결정 +10% (영구) */
export const REBIRTH_GAIN = 0.1
/** 윤회하려면 이번 판에 모은 결정이 이만큼 */
export const REBIRTH_NEED = 500
/** 원천 짝 공명: 두 원천의 단련이 모두 이만큼이면 두 원천 결정 +10% */
export const RESONANCE_LEVEL = 5

/** 장치가 열리는 때 */
export const UNLOCKS = {
  rebirthToStars: 1,
  autoTrain: 2,
  resonance: 3,
  challenge: 5,
  doom: 3,
} as const

/** 별자리 노드: 윤회의 재로 밝힌다 */
export const STARS = {
  gain: { name: '넘치는 결정', max: 5, cost: (n: number) => 2 + n, text: (n: number) => `모든 결정 +${n * 20}%` },
  cheap: { name: '익숙한 손', max: 5, cost: (n: number) => 2 + n, text: (n: number) => `단련 비용 −${n * 8}%` },
  start: { name: '남은 불씨', max: 3, cost: (n: number) => 3 + n * 2, text: (n: number) => `윤회한 뒤 결정 넷 +${n * 30}` },
  hp: { name: '굳은 몸', max: 5, cost: (n: number) => 2 + n, text: (n: number) => `최대 생명 +${n * 10}` },
} as const
export type StarId = keyof typeof STARS

/** 태초의 법: 종말 보스를 쓰러뜨릴 때마다 하나 고른다 */
export const LAWS = {
  keep: { name: '이어지는 단련', text: '윤회해도 단련의 20%가 남는다' },
  flow: { name: '흐르는 원천', text: '들어오는 결정의 10%가 고리의 다음 원천으로도 들어온다' },
  ash: { name: '짙은 재', text: '윤회의 재 +50%' },
} as const
export type LawId = keyof typeof LAWS

/** 순환의 단계: 단련은 첫 발현에, 윤회는 첫 승급에 열린다. 그 뒤 장치는 윤회 횟수로 열린다 (UNLOCKS). */
export type Stage = 'train' | 'rebirth'
export const STAGES: readonly Stage[] = ['train', 'rebirth']

const zero = (): Record<SourceId, number> => ({ flame: 0, hunt: 0, wind: 0, stone: 0 })

export interface CycleData {
  essence: Record<SourceId, number>
  training: Record<SourceId, number>
  /** 이번 판에 모은 결정 (윤회 조건과 재) */
  runTotal: number
  rebirths: number
  ash: number
  stars: Partial<Record<StarId, number>>
  /** 지금 걸고 있는 도전 (그 원천 결정이 들어오지 않는다) */
  challenge: SourceId | null
  /** 끝낸 도전: 그 원천 결정 영구 +25% */
  cleared: SourceId[]
  dooms: number
  laws: LawId[]
  /** 열린 단계: 단련(첫 발현), 윤회(첫 승급) */
  opened: Stage[]
}

export class Cycle {
  essence = zero()
  training = zero()
  runTotal = 0
  rebirths = 0
  ash = 0
  stars: Partial<Record<StarId, number>> = {}
  challenge: SourceId | null = null
  cleared = new Set<SourceId>()
  dooms = 0
  laws: LawId[] = []
  opened = new Set<Stage>()
  /** 원천 숙련 (승급에서 온다). 시스템이 채운다. */
  mastery: (source: SourceId) => number = () => 0
  /** 총 승급 횟수 (단련 할인). 시스템이 채운다. */
  promotions: () => number = () => 0

  star(id: StarId): number {
    return this.stars[id] ?? 0
  }

  /** 원천 결정이 들어오는 배율 */
  gainScale(source: SourceId): number {
    if (this.challenge === source) return 0
    let scale = 1 + this.mastery(source) * MASTERY_GAIN
    scale *= 1 + this.training[RING_PREV[source]] * RING_BONUS
    scale *= 1 + this.rebirths * REBIRTH_GAIN
    scale *= 1 + this.star('gain') * 0.2
    if (this.cleared.has(source)) scale *= 1.25
    if (this.resonating(source)) scale *= 1.1
    return scale
  }

  /** 원천 짝 공명이 이 원천에 걸려 있는가 */
  resonating(source: SourceId): boolean {
    if (this.rebirths < UNLOCKS.resonance) return false
    if (this.training[source] < RESONANCE_LEVEL) return false
    return SOURCE_IDS.some((other) => other !== source && this.training[other] >= RESONANCE_LEVEL)
  }

  /** 결정을 얻는다. 실제로 들어온 양(배율 적용, 반올림 전)을 원천마다 돌려준다. */
  gain(source: SourceId, base: number): Partial<Record<SourceId, number>> {
    const out: Partial<Record<SourceId, number>> = {}
    const amount = base * this.gainScale(source)
    if (amount <= 0) return out
    out[source] = amount
    if (this.laws.includes('flow')) {
      const next = RING_NEXT[source]
      if (this.challenge !== next) out[next] = (out[next] ?? 0) + amount * 0.1
    }
    for (const [s, v] of Object.entries(out) as [SourceId, number][]) {
      this.essence[s] += v
      this.runTotal += v
    }
    return out
  }

  /** 다음 단련 비용 */
  cost(source: SourceId): number {
    const base = 10 * Math.pow(1.35, this.training[source])
    const discount = (1 + this.promotions() * 0.1) * (1 / Math.max(0.2, 1 - this.star('cheap') * 0.08))
    return Math.ceil(base / discount)
  }

  canTrain(source: SourceId): boolean {
    return this.opened.has('train') && this.essence[source] >= this.cost(source)
  }

  /** 단련: count번 (Infinity면 살 수 있는 만큼). 실제로 올린 단계 수를 돌려준다. */
  train(source: SourceId, count = 1): number {
    let done = 0
    while (done < count && this.canTrain(source)) {
      this.essence[source] -= this.cost(source)
      this.training[source] += 1
      done += 1
    }
    return done
  }

  /** count번(Infinity면 살 수 있는 만큼) 단련할 때 실제로 오를 단계와 비용 합. 하나도 못 사면 다음 한 단계 비용 */
  quote(source: SourceId, count: number): { levels: number; cost: number } {
    const saved = this.training[source]
    let levels = 0
    let cost = 0
    let left = this.essence[source]
    while (levels < count && levels < 500) {
      const next = this.cost(source)
      if (left < next) break
      left -= next
      cost += next
      levels += 1
      this.training[source] += 1
    }
    this.training[source] = saved
    return { levels, cost: levels > 0 ? cost : this.cost(source) }
  }

  /** 자동 단련: 살 수 있는 것 중 가장 싼 것 하나 */
  autoTrain(): SourceId | null {
    if (this.rebirths < UNLOCKS.autoTrain) return null
    const affordable = SOURCE_IDS.filter((s) => this.canTrain(s)).sort((a, b) => this.cost(a) - this.cost(b))
    const pick = affordable[0] ?? null
    if (pick) this.train(pick)
    return pick
  }

  /** 윤회하면 얻을 재 */
  ashForRebirth(): number {
    if (!this.opened.has('rebirth') || this.runTotal < REBIRTH_NEED) return 0
    const base = Math.floor(Math.sqrt(this.runTotal / REBIRTH_NEED) * 3)
    return Math.floor(base * (this.laws.includes('ash') ? 1.5 : 1))
  }

  /** 윤회: 단련·결정을 버리고 재를 얻는다. 도전을 걸었다면 끝낸 것으로 친다. */
  rebirth(nextChallenge: SourceId | null = null): number {
    const ash = this.ashForRebirth()
    if (ash <= 0) return 0
    this.ash += ash
    this.rebirths += 1
    if (this.challenge) this.cleared.add(this.challenge)
    const keep = this.laws.includes('keep') ? 0.2 : 0
    for (const s of SOURCE_IDS) {
      this.training[s] = Math.floor(this.training[s] * keep)
      this.essence[s] = this.star('start') * 30
    }
    this.runTotal = 0
    this.challenge = this.rebirths >= UNLOCKS.challenge ? nextChallenge : null
    return ash
  }

  /** 별 하나를 밝힌다 */
  lightStar(id: StarId): boolean {
    const def = STARS[id]
    const level = this.star(id)
    if (this.rebirths < UNLOCKS.rebirthToStars || level >= def.max || this.ash < def.cost(level)) return false
    this.ash -= def.cost(level)
    this.stars[id] = level + 1
    return true
  }

  /** 종말 보스에 도전할 수 있는가 */
  get doomReady(): boolean {
    return this.rebirths >= UNLOCKS.doom
  }

  /** 종말 보스를 쓰러뜨렸다: 태초의 법을 하나 고를 수 있게 된다 */
  conquer(): void {
    this.dooms += 1
  }

  /** 고를 수 있는 태초의 법이 남아 있는가 */
  get lawPending(): boolean {
    return this.dooms > this.laws.length && this.laws.length < Object.keys(LAWS).length
  }

  chooseLaw(law: LawId): boolean {
    if (!this.lawPending || this.laws.includes(law)) return false
    this.laws.push(law)
    return true
  }

  // ── 능력치 ──
  get damageScale(): number {
    return 1 + this.training.flame * TRAINING.flame.damage
  }
  get healOnKill(): number {
    return this.training.hunt * TRAINING.hunt.healOnKill
  }
  get moveSpeedScale(): number {
    return 1 + this.training.wind * TRAINING.wind.moveSpeed
  }
  get bonusHp(): number {
    return this.training.stone * TRAINING.stone.maxHp + this.star('hp') * 10
  }
  get damageTakenScale(): number {
    return 1 - Math.min(0.5, this.training.stone * TRAINING.stone.damageTaken)
  }

  toData(): CycleData {
    return {
      essence: { ...this.essence },
      training: { ...this.training },
      runTotal: this.runTotal,
      rebirths: this.rebirths,
      ash: this.ash,
      stars: { ...this.stars },
      challenge: this.challenge,
      cleared: [...this.cleared],
      dooms: this.dooms,
      laws: [...this.laws],
      opened: [...this.opened],
    }
  }

  load(data: CycleData): void {
    this.essence = { ...data.essence }
    this.training = { ...data.training }
    this.runTotal = data.runTotal
    this.rebirths = data.rebirths
    this.ash = data.ash
    this.stars = { ...data.stars }
    this.challenge = data.challenge
    this.cleared = new Set(data.cleared)
    this.dooms = data.dooms
    this.laws = [...data.laws]
    this.opened = new Set(data.opened)
  }
}

/** 저장된 순환 기록을 검사한다. 틀리거나 없으면 처음 상태 */
export function parseCycle(raw: unknown): CycleData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const n = (v: unknown, max = 1e12) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0)
  const rec = (v: unknown, int: boolean) => {
    const r = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
    const out = zero()
    for (const s of SOURCE_IDS) out[s] = int ? Math.floor(n(r[s], 10_000)) : n(r[s])
    return out
  }
  const isSource = (v: unknown): v is SourceId => (SOURCE_IDS as readonly unknown[]).includes(v)
  const starsRaw = (typeof o.stars === 'object' && o.stars !== null ? o.stars : {}) as Record<string, unknown>
  const stars: Partial<Record<StarId, number>> = {}
  for (const id of Object.keys(STARS) as StarId[]) if (starsRaw[id] !== undefined) stars[id] = Math.min(STARS[id].max, Math.floor(n(starsRaw[id])))
  return {
    essence: rec(o.essence, false),
    training: rec(o.training, true),
    runTotal: n(o.runTotal),
    rebirths: Math.floor(n(o.rebirths, 1e6)),
    ash: Math.floor(n(o.ash)),
    stars,
    challenge: isSource(o.challenge) ? o.challenge : null,
    cleared: (Array.isArray(o.cleared) ? o.cleared : []).filter(isSource),
    dooms: Math.floor(n(o.dooms, 1e6)),
    laws: (Array.isArray(o.laws) ? o.laws : []).filter((l): l is LawId => typeof l === 'string' && Object.hasOwn(LAWS, l)),
    opened: (Array.isArray(o.opened) ? o.opened : []).filter((v): v is Stage => (STAGES as readonly unknown[]).includes(v)),
  }
}

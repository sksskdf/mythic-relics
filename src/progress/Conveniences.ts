/**
 * 편의 자동화 (E14-05, DESIGN.md 9.4).
 * 같은 일을 여러 번 하면 손이 덜 가게 하나씩 열린다. 싸움 자체는 자동으로 만들지 않는다.
 * 자동 줍기 → 낮은 등급 장비 자동 분해 → 재료 자동 모음 → 고른 신화 빠르게 바꾸기 → 성소 워프
 * E21-06: 엔딩 뒤에만 열린다 (그 전에도 세기는 쌓인다). 자동 줍기도 처음부터 켜 두었다가 되돌렸다:
 * 떨어진 장비는 밟거나 눌러서 줍는다 (사용자 의견 2026-10-28 「그냥 장비칸으로 들어오는 것도 별로」).
 */
export type ConvenienceId = 'autoPickup' | 'autoSalvage' | 'autoMaterials' | 'quickChoose' | 'warp'
export type CounterId = 'pickups' | 'salvaged' | 'forged' | 'opened' | 'threat'

export const CONVENIENCES: readonly { id: ConvenienceId; name: string; text: string; counter: CounterId; need: number }[] = [
  { id: 'autoPickup', name: '자동 줍기', text: '둘레 5m 안의 장비를 걸어가지 않아도 줍는다', counter: 'pickups', need: 20 },
  { id: 'autoSalvage', name: '자동 분해', text: '흔함 등급 장비는 줍자마자 재료로 분해한다 (장비 탭에서 끄고 켠다)', counter: 'salvaged', need: 10 },
  { id: 'autoMaterials', name: '재료 자동 모음', text: '떨어진 재료 유물이 바로 주머니에 들어온다', counter: 'forged', need: 1 },
  { id: 'quickChoose', name: '신화 빠르게 바꾸기', text: '마을·성소가 아니어도 고른 신화를 바꿀 수 있다', counter: 'opened', need: 4 },
  { id: 'warp', name: '성소 워프', text: '지도에서 마을이나 찾은 성소를 눌러 바로 간다', counter: 'threat', need: 2 },
]

/** 자동 줍기 거리 (m) */
export const AUTO_PICKUP_RADIUS = 5

export interface ConvenienceData {
  counters: Partial<Record<CounterId, number>>
  open: ConvenienceId[]
  /** 자동 분해 켬 (열린 뒤 기본 켬) */
  autoSalvage: boolean
  /** 성소를 찾은 지역 (워프 목적지, E15-04) */
  visited: string[]
}

/** 처음부터 켜 있는 편의 (E21-06에는 자동 줍기, 지금은 없음) */
export const ALWAYS_ON: readonly ConvenienceId[] = []

export class Conveniences {
  readonly counters: Partial<Record<CounterId, number>> = {}
  readonly open = new Set<ConvenienceId>()
  autoSalvage = true
  readonly visited = new Set<string>()

  /** afterEnding: 엔딩을 보았나 (그 전에는 아무것도 열리지 않는다) */
  constructor(private readonly afterEnding: () => boolean = () => true) {}

  has(id: ConvenienceId): boolean {
    return ALWAYS_ON.includes(id) || (this.afterEnding() && this.open.has(id))
  }

  /** 세기를 더하거나(add) 맞춘다(set). 새로 열린 것을 돌려준다 (엔딩 전에는 세기만 하고 열지 않는다) */
  count(counter: CounterId, value: number, mode: 'add' | 'set' = 'add'): (typeof CONVENIENCES)[number][] {
    const now = mode === 'add' ? (this.counters[counter] ?? 0) + value : Math.max(this.counters[counter] ?? 0, value)
    this.counters[counter] = now
    if (!this.afterEnding()) return []
    const opened = CONVENIENCES.filter((c) => c.counter === counter && !ALWAYS_ON.includes(c.id) && !this.open.has(c.id) && now >= c.need)
    for (const c of opened) this.open.add(c.id)
    return opened
  }

  /** 자동 분해가 돌고 있는가 */
  get salvaging(): boolean {
    return this.has('autoSalvage') && this.autoSalvage
  }

  /** 엔딩을 보았을 때: 그동안 센 것으로 열 수 있는 것을 모두 연다 */
  catchUp(): (typeof CONVENIENCES)[number][] {
    const opened = CONVENIENCES.filter((c) => !ALWAYS_ON.includes(c.id) && !this.open.has(c.id) && (this.counters[c.counter] ?? 0) >= c.need)
    for (const c of opened) this.open.add(c.id)
    return opened
  }

  toData(): ConvenienceData {
    return { counters: { ...this.counters }, open: [...this.open], autoSalvage: this.autoSalvage, visited: [...this.visited] }
  }

  load(data: ConvenienceData): void {
    Object.assign(this.counters, data.counters)
    for (const id of data.open) this.open.add(id)
    this.autoSalvage = data.autoSalvage
    for (const id of data.visited) this.visited.add(id)
  }
}

export function parseConveniences(raw: unknown): ConvenienceData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const ids = CONVENIENCES.map((c) => c.id) as string[]
  const counters: ConvenienceData['counters'] = {}
  const c = (typeof o.counters === 'object' && o.counters !== null ? o.counters : {}) as Record<string, unknown>
  for (const id of ['pickups', 'salvaged', 'forged', 'opened', 'threat'] as CounterId[]) {
    const n = c[id]
    if (typeof n === 'number' && Number.isFinite(n) && n > 0) counters[id] = Math.min(1e6, Math.round(n))
  }
  return {
    counters,
    open: (Array.isArray(o.open) ? o.open : []).filter((id): id is ConvenienceId => typeof id === 'string' && ids.includes(id)),
    autoSalvage: o.autoSalvage !== false,
    visited: (Array.isArray(o.visited) ? o.visited : []).filter((id): id is string => typeof id === 'string' && id.length < 40),
  }
}

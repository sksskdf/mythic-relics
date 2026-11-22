import { AURA_SLOTS, auraSlots, emptySlots, godPowers, isComboId, isPowerId, offer, parseSource, power, type PowerId, type PowerSlots, slotted } from '../data/powers'
import { type God, GODS } from '../relics/data'

/** 저장 모양 (v18): 가진 힘·칸·이미 고른 출처·만난 신·내밀기의 씨앗 */
export interface PowerData {
  /** 가진 힘 (얻은 차례). 영구히 남는다 */
  owned: PowerId[]
  /** 칸에 끼운 힘: 무기 하나, 궁극기 하나, 도는 힘 (칸 수는 귀환이 늘린다) */
  slots: PowerSlots
  /** 이미 고른 출처 (`trace:thor` 등): 내미는 곳마다 한 번 */
  claimed: string[]
  /** 만난 신: 흔적에서 첫 힘을 고른 신 */
  met: God[]
  /** 내밀기의 씨앗: 같은 저장은 다시 불러와도 같은 셋을 내민다 */
  seed: number
  /** 켜 본 조합 (P3): 처음 켜질 때의 큰 카드는 한 번만. 하나도 없으면 키를 쓰지 않는다 */
  combos?: string[]
  /** 땅에서 기다리는 빛 (P5): 수호자·장 보스가 쓰러진 자리, 밟으면 카드. 하나도 없으면 키를 쓰지 않는다 */
  lights?: PowerLight[]
}

/** 땅에서 기다리는 빛 하나: 그 출처의 카드가 뜰 자리 (그 땅 좌표) */
export interface PowerLight {
  source: string
  region: string
  x: number
  z: number
}

const isGod = (v: unknown): v is God => typeof v === 'string' && Object.hasOwn(GODS, v)

/** 새 판의 씨앗 */
export const newSeed = (): number => Math.floor(Math.random() * 0x100000000) >>> 0

/**
 * 힘의 진행 (재미 재설계, `redesign.md` 1장): 내미는 곳에서 하나씩 골라 영구히 갖고, 가진 힘 가운데 칸에 둘 것을 고른다.
 * 칸은 무기 1 · 궁극기 1 · 도는 힘 3(귀환마다 +1, 여섯까지). 칸에 든 힘만 전투에서 돈다 (꽂는 일은 뒤 갈래).
 * 규칙(칸 수·내밀기)은 `src/data/powers.ts`의 순수 함수다
 */
export class PowerProgress {
  /** 가진 힘 (얻은 차례) */
  owned: PowerId[] = []
  slots: PowerSlots = emptySlots()
  /** 이미 고른 출처 */
  readonly claimed = new Set<string>()
  /** 만난 신 (만난 차례) */
  met: God[] = []
  seed: number
  /** 켜 본 조합: 처음 켜질 때만 큰 카드가 뜬다 */
  readonly combos = new Set<string>()
  /** 땅에서 기다리는 빛 (밟을 때까지 남고 저장된다) */
  lights: PowerLight[] = []

  /** @param returns 귀환 수 (원정 기록에서 읽는다): 도는 힘의 칸 수를 정한다 */
  constructor(
    private readonly returns: () => number = () => 0,
    seed: number = newSeed(),
  ) {
    this.seed = seed >>> 0
  }

  /** 점검용 실행(`?relics=`)과 개발 지름길이 끼우는 동안만 켠다: 도는 힘의 칸 상한을 푼다 (엔드게임 빌드처럼 칸을 넘는 점검 상태) */
  uncapped = false
  /** 점검용 실행(`?relics=`): 조합이 처음 켜져도 큰 카드를 띄우지 않는다 (재는 값에 카드가 섞이지 않게) */
  testRun = false

  /** 지금 도는 힘의 칸 수 */
  get auraSlots(): number {
    return this.uncapped ? UNCAPPED_SLOTS : auraSlots(this.returns())
  }

  has(id: PowerId): boolean {
    return this.owned.includes(id)
  }

  /** 칸에 끼워져 있나 */
  isSlotted(id: PowerId): boolean {
    return this.slots.weapon === id || this.slots.ultimate === id || this.slots.auras.includes(id)
  }

  /** 칸에 끼운 힘들 (무기 → 궁극기 → 도는 힘) */
  get slotted(): PowerId[] {
    return slotted(this.slots)
  }

  /** 그 신을 만났다. 처음이면 true */
  meet(god: God): boolean {
    if (!isGod(god) || this.met.includes(god)) return false
    this.met.push(god)
    return true
  }

  /** 그 출처에서 고를 것이 있나: 아직 고르지 않았고 내밀 힘이 남았다 */
  canClaim(source: string): boolean {
    return this.offer(source).length > 0
  }

  /** 그 출처가 내미는 힘 셋 (이미 골랐으면 빈 목록). 씨앗과 출처로 정해져 다시 불러와도 같다 */
  offer(source: string): PowerId[] {
    return parseSource(source) !== null && !this.claimed.has(source) ? offer(source, this, this.seed) : []
  }

  /** 빈 도는 힘 칸을 가진 도는 힘으로 채운다 (얻은 차례, 귀환으로 칸이 늘었을 때). 채운 것이 있으면 true */
  fill(): boolean {
    let filled = false
    for (const id of this.owned) {
      if (this.slots.auras.length >= this.auraSlots) break
      if (power(id)?.kind === 'aura' && this.slot(id)) filled = true
    }
    return filled
  }

  /**
   * 그 출처가 내민 힘 하나를 고른다: 가진 힘에 더하고 빈 칸이 있으면 끼운다. 출처는 한 번만.
   * 흔적·수호자에서 고르면 그 신을 만난 것이다. 내밀지 않은 힘·이미 고른 출처면 false
   */
  claim(source: string, id: PowerId): boolean {
    if (!this.offer(source).includes(id)) return false
    const at = parseSource(source)!
    this.claimed.add(source)
    if (at.kind === 'trace' || at.kind === 'guardian') this.meet(at.arg)
    this.gain(id)
    return true
  }

  /** 가진 힘에 더하고 빈 칸이 있으면 끼운다 (찬 칸은 건드리지 않는다). 새로 가졌으면 true */
  gain(id: PowerId): boolean {
    const p = power(id)
    if (!p || this.has(id)) return false
    this.owned.push(id)
    if (p.kind === 'aura' ? this.slots.auras.length < this.auraSlots : this.slots[p.kind] === null) this.slot(id)
    return true
  }

  /** 처음으로 (개발 지름길: 신화 성장을 되돌릴 때). 씨앗은 그대로 */
  clear(): void {
    this.owned = []
    this.slots = emptySlots()
    this.claimed.clear()
    this.met = []
    this.combos.clear()
    this.lights = []
  }

  /**
   * 가진 힘을 칸에 끼운다. 무기·궁극기는 끼워져 있던 것과 바뀌고, 도는 힘은 빈 칸이 있을 때만.
   * 안 가진 힘·이미 끼운 힘·칸이 다 찼으면 false
   */
  slot(id: PowerId): boolean {
    const p = power(id)
    if (!p || !this.has(id) || this.isSlotted(id)) return false
    if (p.kind === 'aura') {
      if (this.slots.auras.length >= this.auraSlots) return false
      this.slots.auras.push(id)
    } else {
      this.slots[p.kind] = id
    }
    return true
  }

  /** 칸에서 뺀다 (힘은 그대로 갖는다). 끼워져 있지 않았으면 false */
  unslot(id: PowerId): boolean {
    if (!this.isSlotted(id)) return false
    if (this.slots.weapon === id) this.slots.weapon = null
    else if (this.slots.ultimate === id) this.slots.ultimate = null
    else this.slots.auras = this.slots.auras.filter((a) => a !== id)
    return true
  }

  /**
   * 점검용 지름길: 그 신을 만나고, 그 신의 힘을 모두 갖고 칸에 끼운다.
   * 무기·궁극기는 그 신의 것으로 바꾸고, 도는 힘은 빈 칸이 남은 만큼 (자료의 차례)
   */
  grantAll(god: God): void {
    if (!isGod(god)) return
    this.own(god)
    for (const p of godPowers(god)) this.slot(p.id)
  }

  /** 점검용 지름길: 그 신을 만나고 그 신의 힘을 모두 갖는다 (칸은 건드리지 않는다) */
  own(god: God): void {
    if (!isGod(god)) return
    this.meet(god)
    for (const p of godPowers(god)) if (!this.has(p.id)) this.owned.push(p.id)
  }

  toData(): PowerData {
    const combos = this.combos.size ? { combos: [...this.combos] } : {}
    const lights = this.lights.length ? { lights: this.lights.map((l) => ({ ...l })) } : {}
    return { owned: [...this.owned], slots: { weapon: this.slots.weapon, ultimate: this.slots.ultimate, auras: [...this.slots.auras] }, claimed: [...this.claimed], met: [...this.met], seed: this.seed, ...combos, ...lights }
  }

  /** 불러온다. 지금 칸 수를 넘친 도는 힘은 뒤에서부터 칸에서 뺀다 (힘은 그대로 갖는다) */
  load(data: PowerData): void {
    this.owned = [...data.owned]
    this.slots = { weapon: data.slots.weapon, ultimate: data.slots.ultimate, auras: data.slots.auras.slice(0, this.auraSlots) }
    this.claimed.clear()
    for (const s of data.claimed) this.claimed.add(s)
    this.met = [...data.met]
    this.seed = data.seed >>> 0
    this.combos.clear()
    for (const id of data.combos ?? []) this.combos.add(id)
    this.lights = (data.lights ?? []).filter((l) => !this.claimed.has(l.source)).map((l) => ({ ...l }))
  }
}

/** 칸 상한을 푼 동안의 칸 수 (힘 전체보다 넉넉하게) */
const UNCAPPED_SLOTS = 999

/** 땅에서 기다리는 빛을 몇 개까지 읽나 */
const LIGHTS_CAP = 40

/** 출처 기록을 몇 개까지 읽나 (내미는 곳은 땅마다 열 남짓이다) */
const CLAIMED_CAP = 1000

/**
 * 저장에서 읽는다: 없는 힘·신·모르는 꼴의 출처는 버리고, 칸에는 가진 힘만 제 종류대로, 도는 힘은 겹치지 않게 여섯까지.
 * 씨앗이 없거나 어긋났으면 `fallbackSeed`
 */
export function parsePowers(raw: unknown, fallbackSeed = 0): PowerData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
  const owned = [...new Set(list(o.owned).filter(isPowerId))]
  const s = (typeof o.slots === 'object' && o.slots !== null ? o.slots : {}) as Record<string, unknown>
  const held = (v: unknown, kind: string): v is PowerId => isPowerId(v) && owned.includes(v) && power(v)!.kind === kind
  const slots: PowerSlots = {
    weapon: held(s.weapon, 'weapon') ? s.weapon : null,
    ultimate: held(s.ultimate, 'ultimate') ? s.ultimate : null,
    auras: [...new Set(list(s.auras).filter((v): v is PowerId => held(v, 'aura')))].slice(0, AURA_SLOTS.max),
  }
  const claimed = [...new Set(list(o.claimed).filter((v): v is string => typeof v === 'string' && v.length <= 60 && parseSource(v) !== null))].slice(0, CLAIMED_CAP)
  const met = [...new Set(list(o.met).filter(isGod))]
  const seed = typeof o.seed === 'number' && Number.isInteger(o.seed) && o.seed >= 0 && o.seed <= 0xffffffff ? o.seed : fallbackSeed >>> 0
  const combos = [...new Set(list(o.combos).filter(isComboId))]
  const lights = list(o.lights).flatMap((v): PowerLight[] => {
    const l = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
    const ok = typeof l.source === 'string' && parseSource(l.source) !== null && !claimed.includes(l.source) && typeof l.region === 'string' && l.region.length <= 40 && Number.isFinite(l.x) && Number.isFinite(l.z)
    return ok ? [{ source: l.source as string, region: l.region as string, x: l.x as number, z: l.z as number }] : []
  })
  const unique = lights.filter((l, i) => lights.findIndex((m) => m.source === l.source) === i).slice(0, LIGHTS_CAP)
  return { owned, slots, claimed, met, seed, ...(combos.length ? { combos } : {}), ...(unique.length ? { lights: unique } : {}) }
}

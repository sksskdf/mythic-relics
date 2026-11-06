import { WAKE, HUNT_KILLS, huntKills } from '../data/wake'
import type { God } from '../relics/data'

/** 저장 모양 (E238): 깨우는 중인 신과 모은 조각, 사냥한 수 */
export interface WakeData {
  waking: God | null
  fragments: number
  hunt: number
}

/**
 * 신을 깨우는 진행 (E238, `src/data/wake.ts`). 깨우는 신은 한 번에 하나:
 * 흔적의 무리를 물리치면 조각 1(깨우기 시작), 그 신의 땅에서 사냥하면 조각 2, 수호자를 쓰러뜨리면 깨어나 처음으로.
 * 깨어난 신은 신화 진행(ClassProgress)이 연 신으로 센다. 사냥 수는 깨운 차례마다 다르다 (E306 D12, `huntKills`).
 */
export class WakeProgress {
  waking: God | null = null
  /** 깨우는 신이 모은 조각 (1~2, 셋째는 깨어남) */
  fragments = 0
  /** 조각 2까지 사냥한 수 */
  hunt = 0

  /** order: 이미 깨운 신 수 (사냥 수를 정한다) */
  constructor(private readonly order: () => number = () => 0) {}

  /** 조각 2까지 잡아야 하는 수 (깨운 차례대로) */
  get need(): number {
    return huntKills(this.order())
  }

  /** 흔적의 무리를 물리쳤다: 그 신을 깨우기 시작한다 (조각 1). 다른 신을 깨우는 중이면 false */
  trace(god: God): boolean {
    if (this.waking && this.waking !== god) return false
    if (this.waking === god && this.fragments >= 1) return false
    this.waking = god
    this.fragments = 1
    this.hunt = 0
    return true
  }

  /** 그 신의 땅에서 하나 잡았다. 조각 2가 되면 true */
  addKill(): boolean {
    if (!this.waking || this.fragments !== 1) return false
    const need = this.need
    this.hunt = Math.min(need, this.hunt + 1)
    if (this.hunt < need) return false
    this.fragments = 2
    return true
  }

  /** 사냥 막대 0~1 */
  get huntRatio(): number {
    return this.fragments >= 2 ? 1 : Math.min(1, this.hunt / this.need)
  }

  /** 수호자를 쓰러뜨렸다: 깨어난 신을 돌려주고 처음으로 */
  awaken(): God | null {
    const god = this.fragments >= 2 ? this.waking : null
    if (!god) return null
    this.reset()
    return god
  }

  reset(): void {
    this.waking = null
    this.fragments = 0
    this.hunt = 0
  }

  toData(): WakeData {
    return { waking: this.waking, fragments: this.fragments, hunt: this.hunt }
  }

  load(data: WakeData): void {
    this.waking = data.waking
    this.fragments = data.fragments
    this.hunt = data.hunt
  }
}

/** 저장에서 읽는다: 길이 없는 신이나 어긋난 값은 처음으로. 사냥 수는 깨운 차례를 모르니 표의 가장 큰 값까지 받는다 */
export function parseWake(raw: unknown): WakeData {
  const most = Math.max(...HUNT_KILLS)
  const empty: WakeData = { waking: null, fragments: 0, hunt: 0 }
  if (typeof raw !== 'object' || raw === null) return empty
  const o = raw as Record<string, unknown>
  const god = typeof o.waking === 'string' && Object.hasOwn(WAKE, o.waking) ? (o.waking as God) : null
  if (!god) return empty
  const hunt = typeof o.hunt === 'number' && Number.isFinite(o.hunt) ? Math.max(0, Math.min(most, Math.round(o.hunt))) : 0
  // 표의 가장 큰 값을 넘게 잡은 저장은 조각 2로 (유물은 settle이 준다). 그 아래에서 차례의 수에 닿았으면 다음 처치에 조각 2가 된다
  const fragments = o.fragments === 2 || hunt >= most ? 2 : 1
  return { waking: god, fragments, hunt: fragments === 2 ? most : hunt }
}

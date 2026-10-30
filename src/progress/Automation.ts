import { AUTOMATION, atCount } from '../data/cycle'

/** 지금 켜진 자동화 (귀환 횟수·엔딩·주운 수에서 셈한다) */
export interface Automation {
  /** 수련 마디를 지난 원정 차례대로 저절로 다시 찍는다 */
  retake: boolean
  /** 가보 칸 수 */
  heirloomSlots: number
  /** 기세 출발점: 지난 원정 최고 경험치의 몫 */
  headShare: number
  /** 저절로 합치는 등급: 보통·좋음(귀환 2), 희귀(귀환 3) */
  autoMerge: { good: boolean; rare: boolean }
  /** 자동 줍기 (엔딩 뒤, 주운 수가 문턱을 넘으면) */
  autoPickup: boolean
  /** 귀환 카드 맨 앞에 지난번 갈래 그대로 (엔딩 뒤) */
  sameBranch: boolean
}

/**
 * 귀환 횟수가 여는 자동화 (E304-03, E305-03 `CYCLE.md` 3.5). 자동화는 엔딩 문이 아니라 귀환 횟수로 연다.
 * 엔딩을 봤으면 귀환 횟수를 3 이상으로 친다 (이 함수 안에서만: `expedition.count`는 고치지 않는다).
 * 자동 줍기와 「지난번 갈래 그대로」는 엔딩 뒤 (사용자 결정 그대로). 성소 워프는 웨이포인트라 처음부터 (`progress/Waypoints.ts`)
 */
export function automationAt(returns: number, ending: boolean, pickups: number): Automation {
  const n = ending ? Math.max(returns, AUTOMATION.endingReturns) : returns
  return {
    retake: n >= AUTOMATION.retake,
    heirloomSlots: atCount(AUTOMATION.heirloom, n),
    headShare: atCount(AUTOMATION.head, n),
    autoMerge: { good: n >= AUTOMATION.autoMerge.good, rare: n >= AUTOMATION.autoMerge.rare },
    autoPickup: ending && pickups >= AUTOMATION.pickup.need,
    sameBranch: ending,
  }
}

/** 정보 화면에 보일 「귀환이 여는 것」: 차례마다 무엇이 켜지는가 (`at`: 귀환 횟수, null이면 엔딩) */
export const AUTOMATION_STEPS: readonly { at: number | null; name: string; lines: readonly string[] }[] = [
  { at: AUTOMATION.retake, name: `귀환 ${AUTOMATION.retake}`, lines: ['수련 마디를 지난 원정 차례대로 저절로 다시 찍는다', `가보 칸 ${atCount(AUTOMATION.heirloom, AUTOMATION.retake)}`] },
  { at: AUTOMATION.autoMerge.good, name: `귀환 ${AUTOMATION.autoMerge.good}`, lines: ['보통·좋음 장비를 주우면 셋씩 저절로 합친다', `기세 출발점: 지난 원정 최고의 ${fraction(atCount(AUTOMATION.head, AUTOMATION.autoMerge.good))}`] },
  {
    at: AUTOMATION.autoMerge.rare,
    name: `귀환 ${AUTOMATION.autoMerge.rare}`,
    lines: ['희귀 장비도 저절로 합친다', `기세 출발점 ${fraction(atCount(AUTOMATION.head, AUTOMATION.autoMerge.rare))}, 가보 칸 ${atCount(AUTOMATION.heirloom, AUTOMATION.autoMerge.rare)}`],
  },
  { at: null, name: '엔딩', lines: [`자동 줍기 (${AUTOMATION.pickup.need}번 주운 뒤, 둘레 ${AUTOMATION.pickup.radius}m)`, '귀환 카드 맨 앞에 지난번 갈래 그대로', `귀환 횟수를 ${AUTOMATION.endingReturns} 이상으로 친다`] },
]

/** 몫을 글로 (3분의 1 → 1/3) */
function fraction(x: number): string {
  for (const d of [2, 3, 4]) if (Math.abs(x * d - Math.round(x * d)) < 1e-9) return `${Math.round(x * d)}/${d}`
  return `${Math.round(x * 100)}%`
}

/** 저장되는 자동화 세기 (저장 키는 옛 이름 그대로 `conveniences`) */
export interface AutomationData {
  counters: { pickups?: number }
}

/** 자동화 세기: 주운 장비·재료 수 (자동 줍기 문턱). 그 밖은 귀환 횟수·엔딩에서 셈한다 */
export class AutomationProgress {
  pickups = 0

  constructor(
    private readonly returns: () => number = () => 0,
    private readonly ending: () => boolean = () => false,
  ) {}

  /** 지금 켜진 자동화 */
  get now(): Automation {
    return automationAt(this.returns(), this.ending(), this.pickups)
  }

  /** 하나 주웠다. 자동 줍기가 이번에 켜졌으면 true */
  picked(): boolean {
    const before = this.now.autoPickup
    this.pickups = Math.min(1e6, this.pickups + 1)
    return !before && this.now.autoPickup
  }

  toData(): AutomationData {
    return { counters: { pickups: this.pickups } }
  }

  load(data: AutomationData): void {
    this.pickups = data.counters.pickups ?? 0
  }
}

/** 저장된 자동화 세기를 검사한다. 옛 편의(열린 것·자동 녹이기·다른 세기·켠 성소)는 버린다 (켠 성소는 웨이포인트가 읽는다) */
export function parseAutomation(raw: unknown): AutomationData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const c = (typeof o.counters === 'object' && o.counters !== null ? o.counters : {}) as Record<string, unknown>
  const n = c.pickups
  return { counters: typeof n === 'number' && Number.isFinite(n) && n > 0 ? { pickups: Math.min(1e6, Math.round(n)) } : {} }
}

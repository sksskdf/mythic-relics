import { WAKE } from '../data/wake'
import type { God } from '../relics/data'

/** 신마다의 단계: 흔적의 무리를 이겨 그 신의 수호자가 섰다 (옛 저장의 조각 2) */
export const WAKE_WON = 2

/**
 * 저장 모양 (E238 → 2026-11-22): 신마다 깨우는 단계. 깨어난 신은 신화 진행(ClassProgress)이 연 신으로 세니 여기서 빠진다.
 * 옛 저장의 깨우는 신 하나(waking)와 조각 수(fragments)는 읽을 때 이 꼴로 옮긴다 (`parseWake`). 옛 저장의 사냥한 수(hunt)는 읽지 않는다
 */
export interface WakeData {
  gods: Partial<Record<God, number>>
}

/**
 * 신을 깨우는 진행 (E238, `src/data/wake.ts`). 신마다 따로 간다 (2026-11-22: 「깨우는 신은 한 번에 하나」를 걷었다):
 * 흔적의 무리를 물리치면 그 신은 「무리를 이김」(`WAKE_WON`, 수호자가 선다), 수호자를 쓰러뜨리면 깨어나 진행에서 빠진다.
 * 여러 신이 한꺼번에 「무리를 이김」에 있을 수 있다
 */
export class WakeProgress {
  private readonly stages = new Map<God, number>()

  /** 그 신의 단계 (아직 아무것도 안 했으면 0) */
  stage(god: God): number {
    return this.stages.get(god) ?? 0
  }

  /** 흔적의 무리를 이겨 수호자가 선 신들 (이긴 차례) */
  get waking(): God[] {
    return [...this.stages].filter(([, n]) => n >= WAKE_WON).map(([god]) => god)
  }

  /** 흔적의 무리를 물리쳤다: 그 신의 수호자가 선다. 이미 이긴 신이면 false */
  trace(god: God): boolean {
    if (this.stage(god) >= WAKE_WON) return false
    this.stages.set(god, WAKE_WON)
    return true
  }

  /** 그 신의 수호자를 쓰러뜨렸다: 무리를 이긴 신이면 깨어나 진행에서 빠진다 (true) */
  awaken(god: God): boolean {
    if (this.stage(god) < WAKE_WON) return false
    this.stages.delete(god)
    return true
  }

  /** 그 신의 깨우는 길을 처음으로 (다른 길로 이미 열린 신) */
  forget(god: God): void {
    this.stages.delete(god)
  }

  reset(): void {
    this.stages.clear()
  }

  toData(): WakeData {
    return { gods: Object.fromEntries(this.stages) }
  }

  load(data: WakeData): void {
    this.stages.clear()
    for (const [god, n] of Object.entries(data.gods)) if (n) this.stages.set(god as God, n)
  }
}

/**
 * 저장에서 읽는다: 길이 없는 신이나 어긋난 값은 버린다. 신마다의 단계(gods)가 없는 옛 저장은 깨우던 신 하나(waking)를 「무리를 이김」으로 옮긴다.
 * 사냥하던 옛 저장(조각 1)도 「무리를 이김」으로 읽는다: 유물과 손은 불러온 뒤 `WakeSystem.settle`이 맞춘다
 */
export function parseWake(raw: unknown): WakeData {
  const out: WakeData = { gods: {} }
  if (typeof raw !== 'object' || raw === null) return out
  const o = raw as Record<string, unknown>
  const known = (god: unknown): god is God => typeof god === 'string' && Object.hasOwn(WAKE, god)
  if (typeof o.gods === 'object' && o.gods !== null && !Array.isArray(o.gods)) {
    for (const [god, n] of Object.entries(o.gods)) if (known(god) && typeof n === 'number' && n >= 1) out.gods[god] = WAKE_WON
    return out
  }
  if (known(o.waking)) out.gods[o.waking] = WAKE_WON
  return out
}

/** 깨우던 신들 (저장 모양에서): 무리를 이겨 수호자가 선 신 */
export const wakingOf = (data: WakeData): God[] => (Object.keys(data.gods) as God[]).filter((g) => (data.gods[g] ?? 0) >= WAKE_WON)

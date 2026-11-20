import { WAKE } from '../data/wake'
import type { God } from '../relics/data'

/** 저장 모양 (E238): 깨우는 중인 신과 모은 조각. 옛 저장의 사냥한 수(hunt)는 읽지 않는다 */
export interface WakeData {
  waking: God | null
  fragments: number
}

/**
 * 신을 깨우는 진행 (E238, `src/data/wake.ts`). 깨우는 신은 한 번에 하나:
 * 흔적의 무리를 물리치면 깨우기 시작하고(조각 2: 빌린 힘과 유물이 함께), 수호자를 쓰러뜨리면 깨어나 처음으로.
 * 그 땅에서 사냥해 조각 2를 얻던 단계는 걷었다 (2026-11-20): 조각 1에 머무는 때가 없다.
 * 깨어난 신은 신화 진행(ClassProgress)이 연 신으로 센다
 */
export class WakeProgress {
  waking: God | null = null
  /** 깨우는 신이 모은 조각 (깨우는 중이면 2, 셋째는 깨어남) */
  fragments = 0

  /** 흔적의 무리를 물리쳤다: 그 신을 깨우기 시작한다 (곧바로 조각 2, 다음은 수호자). 다른 신을 깨우는 중이거나 이미 깨우는 신이면 false */
  trace(god: God): boolean {
    if (this.waking) return false
    this.waking = god
    this.fragments = 2
    return true
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
  }

  toData(): WakeData {
    return { waking: this.waking, fragments: this.fragments }
  }

  load(data: WakeData): void {
    this.waking = data.waking
    this.fragments = data.fragments
  }
}

/**
 * 저장에서 읽는다: 길이 없는 신이나 어긋난 값은 처음으로.
 * 사냥하던 옛 저장(조각 1)은 조각 2로 읽는다: 유물과 손은 불러온 뒤 `WakeSystem.settle`이 맞춘다
 */
export function parseWake(raw: unknown): WakeData {
  const empty: WakeData = { waking: null, fragments: 0 }
  if (typeof raw !== 'object' || raw === null) return empty
  const o = raw as Record<string, unknown>
  const god = typeof o.waking === 'string' && Object.hasOwn(WAKE, o.waking) ? (o.waking as God) : null
  return god ? { waking: god, fragments: 2 } : empty
}

export interface EndlessData {
  /** 가장 깊이 내려간 층 */
  best: number
}

/**
 * 끝없는 원정 기록 (E17-04 균열 → E305-03). 원정 안의 층은 저장하지 않는다 (나가면 끝).
 * 성좌판의 별(옛 `stars`·`lit`)은 E305-03에서 걷었다: v16 이하 저장의 별은 불러올 때 명성으로 돌려준다(`legacyStarRenown`)
 */
export class EndlessProgress {
  best = 0

  /** 층에 닿았다: 더 깊으면 기록을 올리고 true */
  reach(depth: number): boolean {
    if (depth <= this.best) return false
    this.best = depth
    return true
  }

  toData(): EndlessData {
    return { best: this.best }
  }

  load(data: EndlessData): void {
    this.best = data.best
  }
}

/** 끝없는 원정 기록을 읽는다 (저장 키는 옛 이름 `rift`). 옛 저장의 별(`stars`·`lit`)은 여기서 버리고 `legacyStarRenown`이 명성으로 바꾼다 */
export function parseEndless(raw: unknown): EndlessData {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const best = typeof o.best === 'number' && Number.isFinite(o.best) ? Math.max(0, Math.min(9999, Math.round(o.best))) : 0
  return { best }
}

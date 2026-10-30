/**
 * 웨이포인트 (E239-05, E305-03에서 편의에서 뗌): 밟아 켠 성소의 땅. 지도에서 그 땅(과 마을)으로 바로 간다.
 * 처음부터 켜 있다 (자동화가 아니다). 저장 키 `waypoints`, 없으면 옛 편의의 `visited`에서 읽는다
 */
export class Waypoints {
  readonly lit = new Set<string>()

  has(id: string): boolean {
    return this.lit.has(id)
  }

  /** 성소를 켰다. 처음 켰으면 true */
  light(id: string): boolean {
    if (this.lit.has(id)) return false
    this.lit.add(id)
    return true
  }

  get size(): number {
    return this.lit.size
  }

  toData(): string[] {
    return [...this.lit]
  }

  load(ids: readonly string[]): void {
    for (const id of ids) this.lit.add(id)
  }
}

/** 저장된 웨이포인트: 땅 id 목록 (겹치지 않게) */
export function parseWaypoints(raw: unknown): string[] {
  return [...new Set((Array.isArray(raw) ? raw : []).filter((id): id is string => typeof id === 'string' && id.length < 40))]
}

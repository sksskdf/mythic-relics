import { type CircleCollider, type Point2, squareArea, type WalkArea } from './colliders'

/**
 * 길찾기용 격자. 충돌체를 캐릭터 반지름만큼 부풀려서 막힌 칸으로 표시하고,
 * A* 로 경로를 찾은 뒤 직선으로 갈 수 있는 구간은 하나로 합친다.
 */
export class NavGrid {
  size = 0
  /** 격자가 덮는 반 폭 (움직일 수 있는 곳의 reach) */
  halfExtent = 0
  /** 움직일 수 있는 곳 (E19: 땅의 네모 + 이웃 통로). 이 밖의 칸은 막힌다 */
  area: WalkArea = squareArea(0)
  private blocked = new Uint8Array(0)
  /**
   * A* 작업 배열: 부를 때마다 칸 수만큼 새로 잡지 않고 격자를 짤 때 한 번 잡아 되쓴다.
   * 칸의 gScore·cameFrom은 seen이 이번 차례 번호일 때만 쓸모 있고, closed도 차례 번호로 표시한다 (지우는 일 없이)
   */
  private gScore = new Float32Array(0)
  private cameFrom = new Int32Array(0)
  private seen = new Uint32Array(0)
  private closed = new Uint32Array(0)
  private turn = 0

  constructor(
    bounds: number | WalkArea,
    readonly cellSize: number,
    colliders: readonly CircleCollider[],
    private readonly agentRadius: number,
  ) {
    this.rebuild(bounds, colliders)
  }

  /** 다른 지역(또는 편집한 지역)의 충돌체로 다시 짠다. 같은 격자 객체를 쓰는 쪽은 그대로 둔다. 수 하나면 가운데가 원점인 네모 */
  rebuild(bounds: number | WalkArea, colliders: readonly CircleCollider[]): void {
    const area = typeof bounds === 'number' ? squareArea(bounds) : bounds
    this.area = area
    const halfExtent = area.reach
    this.halfExtent = halfExtent
    this.size = Math.ceil((halfExtent * 2) / this.cellSize)
    this.blocked = new Uint8Array(this.size * this.size)
    if (this.seen.length !== this.blocked.length) {
      this.gScore = new Float32Array(this.blocked.length)
      this.cameFrom = new Int32Array(this.blocked.length)
      this.seen = new Uint32Array(this.blocked.length)
      this.closed = new Uint32Array(this.blocked.length)
      this.turn = 0
    }
    // 움직일 수 있는 곳 밖(통로 사이의 숲 띠)은 막는다. 네모 하나뿐이면 격자 끝이 곧 경계다
    if (area.rects.length > 1) {
      // 모두 막은 뒤 네모마다 가운데가 그 안에 드는 칸을 연다 (칸마다 재는 것보다 빠르다: 넘어갈 때마다 다시 짠다)
      this.blocked.fill(1)
      const first = (v: number) => Math.max(0, Math.ceil((v + halfExtent) / this.cellSize - 0.5))
      const last = (v: number) => Math.min(this.size - 1, Math.floor((v + halfExtent) / this.cellSize - 0.5))
      for (const r of area.rects) {
        const x0 = first(r.minX)
        const x1 = last(r.maxX)
        if (x1 < x0) continue
        for (let cz = first(r.minZ); cz <= last(r.maxZ); cz++) this.blocked.fill(0, cz * this.size + x0, cz * this.size + x1 + 1)
      }
    }
    for (const c of colliders) {
      const r = c.radius + this.agentRadius
      const min = this.toCell({ x: c.x - r, z: c.z - r })
      const max = this.toCell({ x: c.x + r, z: c.z + r })
      for (let cz = min.cz; cz <= max.cz; cz++) {
        for (let cx = min.cx; cx <= max.cx; cx++) {
          const center = this.toWorld(cx, cz)
          if (Math.hypot(center.x - c.x, center.z - c.z) < r) this.blocked[cz * this.size + cx] = 1
        }
      }
    }
  }

  isBlockedCell(cx: number, cz: number): boolean {
    if (cx < 0 || cz < 0 || cx >= this.size || cz >= this.size) return true
    return this.blocked[cz * this.size + cx] === 1
  }

  isBlocked(point: Point2): boolean {
    return this.blockedAt(point.x, point.z)
  }

  /** isBlocked와 같되 객체를 만들지 않는다 (직선 검사가 걸음마다 부른다) */
  private blockedAt(x: number, z: number): boolean {
    const last = this.size - 1
    const cx = Math.max(0, Math.min(last, Math.floor((x + this.halfExtent) / this.cellSize)))
    const cz = Math.max(0, Math.min(last, Math.floor((z + this.halfExtent) / this.cellSize)))
    return this.isBlockedCell(cx, cz)
  }

  toCell(point: Point2): { cx: number; cz: number } {
    const clamp = (v: number) => Math.max(0, Math.min(this.size - 1, v))
    return {
      cx: clamp(Math.floor((point.x + this.halfExtent) / this.cellSize)),
      cz: clamp(Math.floor((point.z + this.halfExtent) / this.cellSize)),
    }
  }

  toWorld(cx: number, cz: number): Point2 {
    return {
      x: (cx + 0.5) * this.cellSize - this.halfExtent,
      z: (cz + 0.5) * this.cellSize - this.halfExtent,
    }
  }

  /** 두 점 사이를 막힘 없이 직선으로 갈 수 있는지 확인한다. */
  hasLineOfSight(a: Point2, b: Point2): boolean {
    const dist = Math.hypot(b.x - a.x, b.z - a.z)
    const steps = Math.max(1, Math.ceil(dist / (this.cellSize * 0.5)))
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      if (this.blockedAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false
    }
    return true
  }

  /** 막힌 칸이면 가장 가까운 빈칸을 찾는다. */
  nearestFree(point: Point2, maxRadius = 12): Point2 | null {
    const start = this.toCell(point)
    if (!this.isBlockedCell(start.cx, start.cz)) return point
    for (let r = 1; r <= maxRadius; r++) {
      let best: Point2 | null = null
      let bestDist = Infinity
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue
          const cx = start.cx + dx
          const cz = start.cz + dz
          if (this.isBlockedCell(cx, cz)) continue
          const w = this.toWorld(cx, cz)
          const d = Math.hypot(w.x - point.x, w.z - point.z)
          if (d < bestDist) {
            bestDist = d
            best = w
          }
        }
      }
      if (best) return best
    }
    return null
  }

  /**
   * start에서 goal까지의 경로(지나갈 점 목록, 시작점 제외)를 찾는다.
   * goal이 막혀 있으면 가장 가까운 빈칸으로 간다. 길이 없으면 빈 배열.
   */
  findPath(start: Point2, goal: Point2): Point2[] {
    const target = this.nearestFree(goal)
    if (!target) return []
    if (this.hasLineOfSight(start, target)) return [target]

    const from = this.toCell(start)
    const to = this.toCell(target)
    const n = this.size
    const startIndex = from.cz * n + from.cx
    const goalIndex = to.cz * n + to.cx

    const { gScore, cameFrom, seen, closed } = this
    // 차례 번호가 한 바퀴 돌면 표시를 지우고 다시 센다
    if (this.turn >= 0xffffffff) {
      seen.fill(0)
      closed.fill(0)
      this.turn = 0
    }
    const turn = ++this.turn
    const open = new MinHeap()
    seen[startIndex] = turn
    gScore[startIndex] = 0
    cameFrom[startIndex] = -1
    open.push(startIndex, this.heuristic(from.cx, from.cz, to.cx, to.cz))

    const neighbors = [
      [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
      [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
    ] as const

    let found = false
    while (open.size > 0) {
      const current = open.pop()
      if (current === goalIndex) {
        found = true
        break
      }
      if (closed[current] === turn) continue
      closed[current] = turn
      const cx = current % n
      const cz = (current - cx) / n
      for (const [dx, dz, cost] of neighbors) {
        const nx = cx + dx
        const nz = cz + dz
        if (this.isBlockedCell(nx, nz)) continue
        // 대각선으로 모서리를 파고들지 않게 한다.
        if (dx !== 0 && dz !== 0 && (this.isBlockedCell(cx + dx, cz) || this.isBlockedCell(cx, cz + dz))) continue
        const next = nz * n + nx
        if (closed[next] === turn) continue
        const tentative = gScore[current]! + cost
        if (seen[next] !== turn || tentative < gScore[next]!) {
          seen[next] = turn
          gScore[next] = tentative
          cameFrom[next] = current
          open.push(next, tentative + this.heuristic(nx, nz, to.cx, to.cz))
        }
      }
    }
    if (!found) return []

    const cells: Point2[] = []
    for (let i = goalIndex; i !== -1 && i !== startIndex; i = cameFrom[i]!) {
      const cx = i % n
      cells.push(this.toWorld(cx, (i - cx) / n))
    }
    cells.reverse()
    if (cells.length > 0) cells[cells.length - 1] = target
    return this.smooth(start, cells)
  }

  /** 직선으로 이을 수 있는 점들은 건너뛰어 경로를 단순하게 만든다. */
  private smooth(start: Point2, path: Point2[]): Point2[] {
    const result: Point2[] = []
    let anchor = start
    let i = 0
    while (i < path.length) {
      let furthest = i
      for (let j = path.length - 1; j > i; j--) {
        if (this.hasLineOfSight(anchor, path[j]!)) {
          furthest = j
          break
        }
      }
      const point = path[furthest]!
      result.push(point)
      anchor = point
      i = furthest + 1
    }
    return result
  }

  private heuristic(ax: number, az: number, bx: number, bz: number): number {
    const dx = Math.abs(ax - bx)
    const dz = Math.abs(az - bz)
    return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)
  }
}

/** A*용 최소 힙 */
class MinHeap {
  private readonly items: number[] = []
  private readonly priorities: number[] = []

  get size(): number {
    return this.items.length
  }

  push(item: number, priority: number): void {
    this.items.push(item)
    this.priorities.push(priority)
    let i = this.items.length - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (this.priorities[parent]! <= this.priorities[i]!) break
      this.swap(i, parent)
      i = parent
    }
  }

  pop(): number {
    const top = this.items[0]!
    const lastItem = this.items.pop()!
    const lastPriority = this.priorities.pop()!
    if (this.items.length > 0) {
      this.items[0] = lastItem
      this.priorities[0] = lastPriority
      let i = 0
      for (;;) {
        const left = i * 2 + 1
        const right = left + 1
        let smallest = i
        if (left < this.items.length && this.priorities[left]! < this.priorities[smallest]!) smallest = left
        if (right < this.items.length && this.priorities[right]! < this.priorities[smallest]!) smallest = right
        if (smallest === i) break
        this.swap(i, smallest)
        i = smallest
      }
    }
    return top
  }

  private swap(a: number, b: number): void {
    ;[this.items[a], this.items[b]] = [this.items[b]!, this.items[a]!]
    ;[this.priorities[a], this.priorities[b]] = [this.priorities[b]!, this.priorities[a]!]
  }
}

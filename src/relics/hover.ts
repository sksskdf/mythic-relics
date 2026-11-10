/** 화면 위의 점 (CSS 픽셀) */
export interface ScreenPoint {
  x: number
  y: number
}

/** 화면에 비친 땅의 유물 하나: 발밑(base)에서 떠 있는 모델 위(top)까지 */
export interface ScreenItem<T> {
  item: T
  base: ScreenPoint
  top: ScreenPoint
}

/** 점에서 선분까지의 거리 */
export function distanceToSegment(p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t))
}

/**
 * 커서 아래의 땅 유물 (설명 카드용). 땅 위의 한 점이 아니라 화면에 보이는 모양(발밑 ~ 떠 있는 모델)과
 * 커서의 화면 거리로 고른다. 지형 높이나 확대 정도와 상관없이 보이는 곳에 올리면 뜬다. 가장 가까운 것 하나.
 */
export function itemUnderPointer<T>(items: readonly ScreenItem<T>[], pointer: ScreenPoint, radius: number): T | null {
  let best: T | null = null
  let bestDistance = radius
  for (const it of items) {
    const d = distanceToSegment(pointer, it.base, it.top)
    if (d <= bestDistance) {
      bestDistance = d
      best = it.item
    }
  }
  return best
}

/**
 * 띠에 다 들어가지 않는 카드에서 아래쪽부터 접을 단락 수 (휴대폰의 다가가면 뜨는 카드, E307).
 * parts는 카드의 단락 수, first는 꼭 남기는 마지막 단락의 차례(머리·자리 줄·첫 단락까지), room은 카드가 머물 높이,
 * heightWith(n)은 아래쪽 n개를 접었을 때의 카드 높이 (n을 하나씩 늘려 가며 묻는다)
 */
export function foldCount(parts: number, first: number, room: number, heightWith: (folded: number) => number): number {
  let folded = 0
  while (folded < parts - 1 - first && heightWith(folded) > room) folded += 1
  return folded
}

/** 다가가면 카드가 뜨는 것의 종류 (휴대폰, E307) */
export interface NearKind {
  /** 주인공이 이 거리(m) 안으로 들어서면 카드가 뜬다 */
  readonly near: number
  /** 이 거리(m) 밖으로 나가야 떠난 것으로 친다 (곁을 서성이는 동안 되풀이해 뜨지 않게 near보다 넉넉히) */
  readonly far: number
  /** 카드가 떠 있는 시간 (초) */
  readonly hold: number
  /** 클수록 먼저 띄운다 (신의 흔적이 떨어진 장비보다 먼저) */
  readonly rank: number
  /**
   * 땅에 새로 생기는 것인가 (떨어진 장비·유물): 곁에서 생긴 것은 다가간 것이 아니라 띄우지 않고, 띄울 틈은 들어선 그때뿐이다.
   * 아니면 늘 서 있는 것(신의 흔적): 처음 본 자리가 곁이어도 띄우고, 띄우지 못한 동안(싸움·다른 카드·달려 지나감)은 곁에서 기다린다
   */
  readonly drops: boolean
}

/** 카드가 이만큼(초) 떠 있었으면 읽은 것으로 친다. 서 있는 것의 카드를 싸움이 그 전에 닫았으면 못 본 것이다 */
export const READ_SECONDS = 1
/**
 * 서 있는 것의 카드는 싸움이 끝나고 이만큼(초) 지나야 뜨고 (칼질 사이의 틈마다 번쩍이지 않게),
 * 이미 읽은 것이면 그 곁에 이만큼 가만히 서 있어야 뜬다 (싸우려고 잠깐 멈춘 걸음에 뜨지 않게)
 */
export const STAND_SECONDS = 0.5

/**
 * 다가가면 뜨는 카드의 규칙 (휴대폰, E307). 손가락에는 커서가 없으니, 주인공이 땅의 장비·유물·신의 흔적 곁에 들어서면 그 카드를 띄운다.
 * - 걷기 시작하거나 hold초가 지나면 닫는다 (걸어 들어온 걸음은 닫지 않는다: 멈췄다 다시 걸을 때)
 * - 싸움이 시작되면 닫는다 (카드가 싸움을 가리지 않게)
 * - 같은 것 곁에 머무는 동안에는 다시 띄우지 않고, far 밖으로 떠났다 돌아오면 다시 띄운다
 * - 떨어진 장비·유물: 싸우다 곁에 떨어진 것, 싸우는 동안 들어선 것, 다른 카드가 떠 있을 때 들어선 것은 건너뛴다 (떠났다 돌아오면 띄운다)
 * - 신의 흔적(서 있는 것): 싸움 때문에 못 띄웠거나 뜨자마자 닫혔으면 싸움이 끝난 때에, 다른 흔적 카드가 떠 있으면 그 카드가 닫힌 때에 띄운다.
 *   이미 읽은 흔적(`see`의 read)은 달려 지나갈 때는 띄우지 않고, 그 곁에 가만히 섰을 때만 띄운다 (큰길가 흔적이 오갈 때마다 뜨지 않게)
 * - 한 번에 하나: 순위가 높은 것(흔적)만 떠 있는 카드를 바꿔 띄운다
 * 프레임마다 begin → 땅에 있는 것마다 see → end 차례로 부른다 (프레임마다 새로 만드는 것이 없게)
 */
export class NearCard {
  /** 지금 카드를 띄운 것 (since는 띄운 때) */
  private current: { key: string; kind: NearKind; since: number; until: number } | null = null
  /** 지난 프레임에 땅에 있던 것 */
  private known = new Set<string>()
  /** 이번 프레임에 본 것 (끝나면 known과 바꾼다) */
  private present = new Set<string>()
  /** 곁에 있어 다시 띄우지 않는 것 (이미 띄웠거나, 떨어진 것이면 곁에서 생겼거나 띄울 틈을 놓친 것) */
  private readonly stayed = new Set<string>()
  /** 이번 프레임에 띄울 수 있는 것 가운데 고른 것 */
  private entered: { key: string; dist: number; kind: NearKind } | null = null
  private currentHere = false
  private now = 0
  private moving = false
  private fighting = false
  /** 이번 프레임에 걷기 시작했나 */
  private started = false
  /** 마지막으로 걸은 때와 싸운 때 */
  private movedAt = -Infinity
  private foughtAt = -Infinity

  /** 지금 카드를 띄운 것 (없으면 null) */
  get shown(): string | null {
    return this.current?.key ?? null
  }

  /** 지금 카드가 읽을 만큼 떠 있었나 */
  get read(): boolean {
    return this.current !== null && this.now - this.current.since >= READ_SECONDS
  }

  /** now는 지금 시각(초), moving은 주인공이 걷는 중인가, fighting은 싸우는 중인가 */
  begin(now: number, moving: boolean, fighting = false): void {
    this.now = now
    this.started = moving && !this.moving
    this.moving = moving
    this.fighting = fighting
    if (moving) this.movedAt = now
    if (fighting) this.foughtAt = now
    this.present.clear()
    this.entered = null
    this.currentHere = false
  }

  /**
   * 땅에 있는 것 하나: 같은 것이면 같은 key, dist는 주인공과의 거리 (m).
   * read는 그 카드를 이미 읽었나 (서 있는 것만 본다): 읽은 것은 걷는 동안 띄우지 않고 곁에 가만히 서면 띄운다
   */
  see(key: string, dist: number, kind: NearKind, read = false): void {
    this.present.add(key)
    if (!this.known.has(key)) {
      if (kind.drops && dist <= kind.far) this.stayed.add(key)
    } else if (dist > kind.far) this.stayed.delete(key)
    if (!this.stayed.has(key) && dist <= kind.near) {
      // 떨어진 것은 들어선 그때 띄우지 못하면 건너뛴다. 서 있는 것은 띄운 때(end)에야 머문 것으로 친다
      if (kind.drops) this.stayed.add(key)
      if (!this.fighting && (kind.drops || this.settled(read))) {
        const best = this.entered
        if (!best || kind.rank > best.kind.rank || (kind.rank === best.kind.rank && dist < best.dist)) this.entered = { key, dist, kind }
      }
    }
    if (this.current?.key === key && this.stayed.has(key)) this.currentHere = true
  }

  /** 서 있는 것의 카드를 띄워도 되게 잠잠한가: 싸움이 끝난 지 좀 됐고, 읽은 것이면 가만히 서 있은 지도 좀 됐다 */
  private settled(read: boolean): boolean {
    const since = this.now - STAND_SECONDS
    return this.foughtAt <= since && (!read || this.movedAt <= since)
  }

  /** 카드를 띄울 것의 key를 돌려준다 (없으면 null) */
  end(): string | null {
    // 땅에서 사라진 것(주웠거나 땅을 떠남)은 잊는다
    for (const key of this.known) if (!this.present.has(key)) this.stayed.delete(key)
    const swap = this.known
    this.known = this.present
    this.present = swap
    const { now, current } = this
    if (current && (!this.currentHere || this.started || this.fighting || now >= current.until)) {
      // 서 있는 것의 카드를 싸움이 뜨자마자 닫았으면 못 본 것이니, 곁에서 기다렸다 싸움이 끝난 때 다시 띄운다
      if (this.fighting && !current.kind.drops && now - current.since < READ_SECONDS) this.stayed.delete(current.key)
      this.current = null
    }
    const entered = this.entered
    if (entered && (!this.current || entered.kind.rank > this.current.kind.rank)) {
      this.current = { key: entered.key, kind: entered.kind, since: now, until: now + entered.kind.hold }
      this.stayed.add(entered.key)
    }
    return this.shown
  }

  /** 떠 있는 카드를 닫는다 (창·장면·고르는 카드가 열렸다). 곁에 머무는 동안에는 다시 띄우지 않는다 */
  close(): void {
    this.current = null
  }

  /** 방금 고른 카드를 띄울 수 없다 (고르는 카드가 화면에 있다): 떨어진 것은 건너뛰고, 서 있는 것은 곁에서 더 기다린다 */
  skip(): void {
    if (this.current && !this.current.kind.drops) this.stayed.delete(this.current.key)
    this.current = null
  }
}

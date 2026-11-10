import { exitColor, type RegionDef } from '../data/regions'
import { CELL, rectDistance, type Rect } from '../data/world'
import { THEMES } from '../world/themes'

/** 지도 한 변의 픽셀 수 (저해상도로 그려 두 배로 키운다) */
export const MINIMAP_SIZE = 64
const SIZE = MINIMAP_SIZE

const hex = (v: number) => `#${v.toString(16).padStart(6, '0')}`

/** 하나로 이어진 세계 (E19-05): 지금 땅 둘레에 함께 그릴 이웃 땅과 통로 (지금 땅 좌표) */
export interface MinimapWorld {
  neighbors: readonly { region: RegionDef; offset: { x: number; z: number } }[]
  passages: readonly Rect[]
}

/** 이어진 세계에서 작은 지도가 보여 주는 반 폭 (m): 지금 땅과 통로, 이웃 땅의 가장자리까지 */
const WORLD_VIEW = CELL * 0.7
/** 세로 화면(휴대폰)은 지금 땅에 당겨 그린다 (E307): 땅 가장자리에서 이만큼(m)만 더 보여, 통로 어귀와 이웃 땅의 가장자리만 걸친다 */
const NEAR_MARGIN = 6
/** 출구가 열린 통로 어귀에 있다고 보는 거리 (m): 문은 통로 안쪽 끝에서 1m쯤 떨어져 선다 */
const EXIT_REACH = 6

/**
 * 작은 지도가 보여 주는 반 폭 (m). 이어진 세계가 아니면(끝없는 원정의 층) 그 땅만,
 * 이어진 세계면 이웃 땅까지(가로 화면) 또는 지금 땅에 당겨서(세로 화면: 128px 그림에서 지금 땅이 14% → 36%)
 */
export function minimapView(halfExtent: number, connected: boolean, near: boolean): number {
  if (!connected) return halfExtent
  return near ? halfExtent + NEAR_MARGIN : WORLD_VIEW
}

/**
 * 월드 좌표 → 지도 픽셀: 반 폭 view의 땅을 카메라가 도는 각만큼 돌려 그림에 맞춘다. 화면 오른쪽·아래가 지도 오른쪽·아래
 */
export function minimapPoint(x: number, z: number, view: number, yawDegrees = 45): { u: number; v: number } {
  const yaw = (yawDegrees * Math.PI) / 180
  // 화면 오른쪽 = (cos, -sin), 화면 아래(카메라 쪽) = (sin, cos)
  const right = x * Math.cos(yaw) - z * Math.sin(yaw)
  const down = x * Math.sin(yaw) + z * Math.cos(yaw)
  // 마름모가 지도 안에 들어가게: 한 변 2·view를 돌리면 대각선이 2·view·√2
  const scale = (SIZE / 2 - 2) / (view * Math.SQRT2)
  return { u: SIZE / 2 + right * scale, v: SIZE / 2 + down * scale }
}

/**
 * 표시 색 (디자인 토큰과 같은 값, `tests/minimap.test.ts`): 밝은 속과 어두운 테두리.
 * 눈 땅처럼 밝은 바탕에서는 테두리가, 어두운 바탕에서는 속이 바탕과 갈린다 (어느 땅에서든 3:1을 넘는다)
 */
export const MINIMAP_INK = { rim: '#0d1118', me: '#e9eef5', relic: '#ffd27a', sanctuary: '#b9c3cf', ready: '#e3b341' } as const
const INK_TOKENS: Record<keyof typeof MINIMAP_INK, string> = { rim: '--c-bg-1', me: '--c-ink-1', relic: '--c-gold-soft', sanctuary: '--c-ink-2', ready: '--c-gold' }

type Dot = readonly [du: number, dv: number]

/** 표시 하나: 속(밝은 색)과 둘레 한 픽셀 테두리(어두운 색)의 픽셀 자리 (표시 가운데 기준) */
export interface Mark {
  ink: readonly Dot[]
  rim: readonly Dot[]
}

/** 속 픽셀들 → 표시. 테두리는 속에 닿은 빈 픽셀 (corners를 끄면 모서리로만 닿은 픽셀은 뺀다: 얇은 대각선 테) */
function outlined(ink: readonly Dot[], corners = true): Mark {
  const key = ([u, v]: Dot) => `${u},${v}`
  const filled = new Set(ink.map(key))
  const rim = new Map<string, Dot>()
  for (const [u, v] of ink) {
    for (let du = -1; du <= 1; du++) {
      for (let dv = -1; dv <= 1; dv++) {
        if (!corners && du !== 0 && dv !== 0) continue
        const at: Dot = [u + du, v + dv]
        if (!filled.has(key(at))) rim.set(key(at), at)
      }
    }
  }
  return { ink, rim: [...rim.values()] }
}

/** 글자 그림(# = 속) → 표시 */
function drawn(rows: readonly string[]): Mark {
  const half = Math.floor(rows.length / 2)
  const ink: Dot[] = []
  rows.forEach((row, v) => [...row].forEach((c, u) => c === '#' && ink.push([u - half, v - half])))
  return outlined(ink)
}

/**
 * 표시의 모양 (E307): 글이나 범례 없이 모양과 색으로만 구분한다.
 * 나 = 가장 큰 흰 둥근 점, 목표 = 속이 빈 금빛 마름모(깜빡임), 신의 흔적 = 그 신의 색 십자, 떨어진 것 = 작은 금빛 점,
 * 성소 = 고리(돌 고리, 원정이 무르익으면 금빛으로 깜빡임), 출구 = 갈 땅의 색 네모(결계로 막힌 출구는 속이 빈 네모)
 */
export const MARKS = {
  me: drawn(['  ###  ', ' ##### ', '#######', '#######', '#######', ' ##### ', '  ###  ']),
  relic: drawn(['##', '##']),
  trace: drawn(['  #  ', '  #  ', '#####', '  #  ', '  #  ']),
  sanctuary: drawn([' ### ', '#   #', '#   #', '#   #', ' ### ']),
  exit: drawn(['####', '####', '####', '####']),
  exitLocked: drawn(['####', '#  #', '#  #', '####']),
  /** 두 픽셀 굵기의 마름모 테 (가운데는 비워 그 자리의 출구·성소가 보인다) */
  goal: outlined(
    Array.from({ length: 11 * 11 }, (_, i): Dot => [(i % 11) - 5, Math.floor(i / 11) - 5]).filter(([u, v]) => Math.abs(u) + Math.abs(v) === 4 || Math.abs(u) + Math.abs(v) === 5),
    false,
  ),
} satisfies Record<string, Mark>

/** 표시가 가운데에서 뻗는 가장 먼 픽셀 (테두리까지) */
const reach = (mark: Mark) => Math.max(...mark.rim.map(([u, v]) => Math.max(Math.abs(u), Math.abs(v))))

/**
 * 표시를 찍는 픽셀 자리. keep이면 표시가 테두리까지 그림 안에 들게 가장자리로 당긴다: 지도 밖의 것은 방향만 보인다.
 * 목표와 「나」가 그렇다 (세로 화면은 지금 땅에 당겨 그려, 통로를 걸어 이웃 땅으로 넘어가기 직전의 자리가 그림 밖이다)
 */
export function stampAt(p: { u: number; v: number }, mark: Mark, keep: boolean): { u: number; v: number } {
  const pad = reach(mark)
  const pin = (n: number) => (keep ? Math.min(SIZE - 1 - pad, Math.max(pad, n)) : n)
  return { u: pin(Math.round(p.u)), v: pin(Math.round(p.v)) }
}

/** 지도 위에 그릴 움직이는 것들 */
export interface MinimapState {
  hero: { x: number; z: number }
  /** 땅에 떨어진 유물 (빛기둥) */
  relics: readonly { x: number; z: number }[]
  /** 성소가 열려 있다 (승급할 수 있다) */
  sanctuaryReady: boolean
  /** 다음 목표의 자리 (지금 땅 좌표, E22-04): 지금 땅의 성소·보스, 다른 땅이면 그쪽으로 가는 통로. 지도 밖이면 가장자리에 */
  goal?: { x: number; z: number } | null
  /** 응답하는 신의 흔적 (E238): 그 신의 색 십자 */
  traces?: readonly { x: number; z: number; color: string }[]
}

/**
 * 화면 구석의 작은 지도 (E7-08). 글 없이 모양과 색으로만: 길, 연못, 출구(갈 곳의 신화권 색), 성소, 떨어진 유물, 목표, 나.
 * 화면과 같은 방향으로 돌려 그린다(쿼터뷰라 마름모꼴). 위가 화면의 먼 쪽이다.
 * 이어진 세계(E19-05)에서는 지금 땅 둘레의 통로와 이웃 땅도 흐리게 함께 그린다. 세로 화면은 지금 땅에 당겨 그린다 (E307).
 * 표시마다 어두운 테두리를 둘러 밝은 땅(눈)에서도 묻히지 않는다 (`MARKS`).
 */
export class Minimap {
  readonly canvas = document.createElement('canvas')
  private readonly ctx: CanvasRenderingContext2D
  private readonly base = document.createElement('canvas')
  private region: RegionDef | null = null
  private world: MinimapWorld | null = null
  /** 지도가 보여 주는 반 폭 (m) */
  private view = 40
  private time = 0
  /** 세로 화면인가 (`portrait.css`와 같은 경계): 지금 땅에 당겨 그린다 */
  private readonly portrait: MediaQueryList | null
  /** 표시 색은 디자인 토큰에서 */
  private readonly ink: Record<keyof typeof MINIMAP_INK, string>

  constructor(
    parent: HTMLElement,
    /** 카메라가 도는 각 (도). 쿼터뷰 카메라와 같아야 화면과 같은 방향이 된다 */
    private readonly yawDegrees = 45,
  ) {
    this.canvas.className = 'minimap'
    this.canvas.width = this.base.width = SIZE
    this.canvas.height = this.base.height = SIZE
    this.ctx = this.canvas.getContext('2d')!
    parent.append(this.canvas)
    const css = getComputedStyle(document.documentElement)
    const token = (name: keyof typeof MINIMAP_INK) => css.getPropertyValue(INK_TOKENS[name]).trim() || MINIMAP_INK[name]
    this.ink = { rim: token('rim'), me: token('me'), relic: token('relic'), sanctuary: token('sanctuary'), ready: token('ready') }
    this.portrait = typeof matchMedia === 'function' ? matchMedia('(max-aspect-ratio: 4/5)') : null
    // 창을 세로·가로로 바꾸면 보이는 넓이가 달라진다: 바탕을 다시 그린다
    this.portrait?.addEventListener?.('change', () => this.region && this.setRegion(this.region, this.world))
  }

  /** 월드 좌표 → 지도 픽셀. 화면 오른쪽·아래가 지도 오른쪽·아래 */
  project(x: number, z: number): { u: number; v: number } {
    return minimapPoint(x, z, this.view, this.yawDegrees)
  }

  /** 지역에 들어갔다: 땅·길·연못·출구 같은 바뀌지 않는 것을 미리 그려 둔다 */
  setRegion(region: RegionDef, world: MinimapWorld | null = null): void {
    this.region = region
    this.world = world
    this.view = minimapView(region.halfExtent, world !== null, this.portrait?.matches ?? false)
    const g = this.base.getContext('2d')!
    const theme = THEMES[region.theme]
    g.clearRect(0, 0, SIZE, SIZE)
    // 이웃 땅과 통로는 흐리게 (지금 땅보다 먼저 그린다)
    if (world) {
      g.globalAlpha = 0.45
      for (const { region: near, offset } of world.neighbors) this.drawLand(g, near, offset)
      g.globalAlpha = 1
      g.fillStyle = hex(theme.ground.path)
      for (const r of world.passages) this.fillRect(g, r)
    }
    this.drawLand(g, region, { x: 0, z: 0 })
    // 연못: 둥글게 (네모는 표시로 쓴다. 무스펠의 용암 웅덩이가 출구 네모처럼 보였다)
    g.fillStyle = hex(theme.water.surface)
    for (const pond of region.ponds) {
      const p = this.project(pond.x, pond.z)
      g.beginPath()
      g.arc(p.u, p.v, Math.max(1.5, this.project(pond.radius, 0).u - SIZE / 2), 0, Math.PI * 2)
      g.fill()
    }
    // 출구: 갈 곳의 색 네모. 통로가 열리지 않은(결계) 출구는 속이 빈 네모
    for (const exit of region.exits) {
      const open = !world || world.passages.some((r) => rectDistance(r, exit.x, exit.z) < EXIT_REACH)
      this.stamp(g, exit, open ? MARKS.exit : MARKS.exitLocked, hex(exitColor(exit.to)))
    }
  }

  /** 땅 하나: 마름모(움직일 수 있는 네모)와 길. offset은 그 땅을 지금 땅 좌표로 옮길 만큼 */
  private drawLand(g: CanvasRenderingContext2D, region: RegionDef, offset: { x: number; z: number }): void {
    const theme = THEMES[region.theme]
    const h = region.halfExtent
    g.fillStyle = hex(theme.ground.shade)
    this.fillRect(g, { minX: offset.x - h, maxX: offset.x + h, minZ: offset.z - h, maxZ: offset.z + h })
    g.strokeStyle = hex(theme.ground.path)
    g.lineWidth = 2
    for (const path of region.paths) {
      g.beginPath()
      for (const pt of path.points) {
        const p = this.project(offset.x + Math.max(-h, Math.min(h, pt.x)), offset.z + Math.max(-h, Math.min(h, pt.z)))
        g.lineTo(p.u, p.v)
      }
      g.stroke()
    }
  }

  /** 땅 위의 네모 하나 (돌려 그리면 마름모) */
  private fillRect(g: CanvasRenderingContext2D, r: Rect): void {
    g.beginPath()
    for (const [x, z] of [[r.minX, r.minZ], [r.maxX, r.minZ], [r.maxX, r.maxZ], [r.minX, r.maxZ]] as const) {
      const p = this.project(x, z)
      g.lineTo(p.u, p.v)
    }
    g.closePath()
    g.fill()
  }

  /** 표시 하나를 그 자리에 찍는다: 어두운 테두리 먼저, 그 위에 속. edge를 주면 지도 밖의 것을 가장자리로 당긴다 (방향만) */
  private stamp(g: CanvasRenderingContext2D, at: { x: number; z: number }, mark: Mark, color: string, edge = false): void {
    const { u, v } = stampAt(this.project(at.x, at.z), mark, edge)
    g.fillStyle = this.ink.rim
    for (const [du, dv] of mark.rim) g.fillRect(u + du, v + dv, 1, 1)
    g.fillStyle = color
    for (const [du, dv] of mark.ink) g.fillRect(u + du, v + dv, 1, 1)
  }

  update(dt: number, state: MinimapState): void {
    this.time += dt
    const g = this.ctx
    g.clearRect(0, 0, SIZE, SIZE)
    g.drawImage(this.base, 0, 0)
    const region = this.region
    if (!region) return
    const blink = Math.sin(this.time * 6) > 0
    // 성소: 열리면 깜빡인다
    if (region.sanctuary) this.stamp(g, region.sanctuary, MARKS.sanctuary, state.sanctuaryReady && blink ? this.ink.ready : this.ink.sanctuary)
    // 떨어진 유물
    for (const r of state.relics) this.stamp(g, r, MARKS.relic, this.ink.relic)
    // 신의 흔적 (E238): 그 신의 색 십자
    for (const t of state.traces ?? []) this.stamp(g, t, MARKS.trace, t.color)
    // 다음 목표: 금빛 마름모 테가 그 자리를 두르고 깜빡인다 (출구 표시를 가리지 않게 속은 비움, 지도 밖이면 가장자리로 당겨 방향만)
    if (state.goal) this.stamp(g, state.goal, MARKS.goal, blink ? this.ink.relic : this.ink.ready, true)
    // 나: 맨 위에. 통로 끝처럼 그림 밖으로 나가는 자리에서도 잘리지 않게 가장자리에 붙인다
    this.stamp(g, state.hero, MARKS.me, this.ink.me, true)
  }
}

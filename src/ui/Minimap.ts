import { exitColor, type RegionDef } from '../data/regions'
import { CELL, type Rect } from '../data/world'
import { THEMES } from '../world/themes'

/** 지도 한 변의 픽셀 수 (저해상도로 그려 두 배로 키운다) */
const SIZE = 64

const hex = (v: number) => `#${v.toString(16).padStart(6, '0')}`

/** 하나로 이어진 세계 (E19-05): 지금 땅 둘레에 함께 그릴 이웃 땅과 통로 (지금 땅 좌표) */
export interface MinimapWorld {
  neighbors: readonly { region: RegionDef; offset: { x: number; z: number } }[]
  passages: readonly Rect[]
}

/** 이어진 세계에서 작은 지도가 보여 주는 반 폭 (m): 지금 땅과 통로, 이웃 땅의 가장자리까지 */
const WORLD_VIEW = CELL * 0.7

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
 * 화면 구석의 작은 지도 (E7-08). 글 없이 점과 색으로만: 길, 연못, 출구(갈 곳의 신화권 색), 성소, 떨어진 유물, 나.
 * 화면과 같은 방향으로 돌려 그린다(쿼터뷰라 마름모꼴). 위가 화면의 먼 쪽이다.
 * 이어진 세계(E19-05)에서는 지금 땅 둘레의 통로와 이웃 땅도 흐리게 함께 그린다.
 */
export class Minimap {
  readonly canvas = document.createElement('canvas')
  private readonly ctx: CanvasRenderingContext2D
  private readonly base = document.createElement('canvas')
  private region: RegionDef | null = null
  /** 지도가 보여 주는 반 폭 (m) */
  private view = 40
  private time = 0
  /** 표시 색은 디자인 토큰에서 (나·떨어진 유물·성소) */
  private readonly ink: { me: string; relic: string; sanctuary: string; ready: string }

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
    const token = (name: string, fallback: string) => css.getPropertyValue(name).trim() || fallback
    this.ink = { me: token('--c-ink-1', '#e9eef5'), relic: token('--c-gold-soft', '#ffd27a'), sanctuary: token('--c-ink-3', '#8d98a6'), ready: token('--c-gold', '#e3b341') }
  }

  /** 월드 좌표 → 지도 픽셀. 화면 오른쪽·아래가 지도 오른쪽·아래 */
  project(x: number, z: number): { u: number; v: number } {
    const half = this.view
    const yaw = (this.yawDegrees * Math.PI) / 180
    // 화면 오른쪽 = (cos, -sin), 화면 아래(카메라 쪽) = (sin, cos)
    const right = x * Math.cos(yaw) - z * Math.sin(yaw)
    const down = x * Math.sin(yaw) + z * Math.cos(yaw)
    // 마름모가 지도 안에 들어가게: 한 변 2·half를 돌리면 대각선이 2·half·√2
    const scale = (SIZE / 2 - 2) / (half * Math.SQRT2)
    return { u: SIZE / 2 + right * scale, v: SIZE / 2 + down * scale }
  }

  /** 지역에 들어갔다: 땅·길·연못·출구 같은 바뀌지 않는 것을 미리 그려 둔다 */
  setRegion(region: RegionDef, world: MinimapWorld | null = null): void {
    this.region = region
    this.view = world ? WORLD_VIEW : region.halfExtent
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
    // 연못
    g.fillStyle = hex(theme.water.surface)
    for (const pond of region.ponds) {
      const p = this.project(pond.x, pond.z)
      const r = Math.max(1.5, this.project(pond.radius, 0).u - SIZE / 2)
      g.fillRect(Math.round(p.u - r), Math.round(p.v - r), Math.round(r * 2), Math.round(r * 2))
    }
    // 출구: 갈 곳의 색
    for (const exit of region.exits) {
      const p = this.project(exit.x, exit.z)
      g.fillStyle = hex(exitColor(exit.to))
      g.fillRect(Math.round(p.u) - 2, Math.round(p.v) - 2, 4, 4)
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

  update(dt: number, state: MinimapState): void {
    this.time += dt
    const g = this.ctx
    g.clearRect(0, 0, SIZE, SIZE)
    g.drawImage(this.base, 0, 0)
    const region = this.region
    if (!region) return
    const blink = Math.sin(this.time * 6) > 0
    // 성소: 열리면 깜빡인다
    if (region.sanctuary) {
      const p = this.project(region.sanctuary.x, region.sanctuary.z)
      g.strokeStyle = state.sanctuaryReady && blink ? this.ink.ready : this.ink.sanctuary
      g.lineWidth = 1
      g.strokeRect(Math.round(p.u) - 2.5, Math.round(p.v) - 2.5, 5, 5)
    }
    // 떨어진 유물
    g.fillStyle = this.ink.relic
    for (const r of state.relics) {
      const p = this.project(r.x, r.z)
      g.fillRect(Math.round(p.u) - 1, Math.round(p.v) - 1, 2, 2)
    }
    // 신의 흔적 (E238): 그 신의 색 작은 십자
    for (const t of state.traces ?? []) {
      const p = this.project(t.x, t.z)
      const u = Math.round(p.u)
      const v = Math.round(p.v)
      g.fillStyle = t.color
      g.fillRect(u - 2, v, 5, 1)
      g.fillRect(u, v - 2, 1, 5)
    }
    // 다음 목표: 금빛 마름모 테가 그 자리를 두르고 깜빡인다 (출구 표시를 가리지 않게 속은 비움, 지도 밖이면 가장자리로 당겨 방향만)
    if (state.goal) {
      const p = this.project(state.goal.x, state.goal.z)
      const u = Math.round(Math.min(SIZE - 6, Math.max(5, p.u)))
      const v = Math.round(Math.min(SIZE - 6, Math.max(5, p.v)))
      g.fillStyle = blink ? this.ink.relic : this.ink.ready
      for (let i = 0; i <= 4; i++) {
        for (const [du, dv] of [[i, i - 4], [4 - i, i], [-i, 4 - i], [i - 4, -i]] as const) g.fillRect(u + du, v + dv, 1, 1)
      }
    }
    // 나
    const me = this.project(state.hero.x, state.hero.z)
    g.fillStyle = this.ink.me
    g.fillRect(Math.round(me.u) - 1, Math.round(me.v) - 1, 3, 3)
  }
}

import { arrivalSpot, REGIONS, type RegionDef } from '../data/regions'
import { CELL, crossingAt, type RegionLink, regionLinks, walkRects } from '../data/world'
import { walkArea, type WalkArea } from '../world/colliders'
import { realmInk } from '../art/palette'
import type { DropTable } from '../gear/DropTable'
import type { Pickups } from '../gear/Pickups'
import type { QuarterViewCamera } from '../render/QuarterViewCamera'
import type { Hud } from '../ui/Hud'
import type { Minimap } from '../ui/Minimap'
import { realmSigil } from '../ui/sigils'
import type { NavGrid } from '../world/navGrid'
import { THEMES } from '../world/themes'
import type { Encounter } from './Encounter'
import type { EventBus, GameEvents } from './events'
import type { HeroController } from './HeroController'
import type { HeroOrders } from './HeroOrders'
import type { UtgardLegend } from './Legend'
import type { PlayerCombat } from './PlayerCombat'
import type { Stage } from './Stage'
import type { Effects } from './systems/Effects'
import type { Villagers } from './Villagers'

const EXIT_RADIUS = 1.6
const TRAVEL_FADE = 0.35
/** 워프로 도착하는 자리: 성소 가운데에서 이만큼(m). 전설이 시작되는 거리(1.6m)보다 멀리 */
const WARP_OFFSET = 3

/** 성소 가운데에서 시작점 쪽으로 WARP_OFFSET만큼 떨어진 곳 */
function besideSanctuary(sanctuary: { x: number; z: number }, spawn: { x: number; z: number }): { x: number; z: number } {
  const dx = spawn.x - sanctuary.x
  const dz = spawn.z - sanctuary.z
  const len = Math.hypot(dx, dz)
  return len > 1e-3 ? { x: sanctuary.x + (dx / len) * WARP_OFFSET, z: sanctuary.z + (dz / len) * WARP_OFFSET } : { x: sanctuary.x, z: sanctuary.z + WARP_OFFSET }
}

/** 지역을 다시 지을 때 함께 바꾸는 것들 */
export interface WorldParts {
  bus: EventBus<GameEvents>
  stage: Stage
  nav: NavGrid
  encounter: Encounter
  legend: UtgardLegend
  villagers: Villagers
  minimap: Minimap
  fx: Effects
  hero: HeroController
  orders: HeroOrders
  combat: PlayerCombat
  view: QuarterViewCamera
  hud: Hud
  pickups: Pickups
  drops: DropTable
}

/**
 * 지역과 지역 사이 (E7, E11-03에서 Game.ts에서 뗌).
 * 지역에 들어가 맵·길찾기·적·성소를 다시 짓고, 출구를 밟으면 암전하며 다른 지역으로 넘어간다.
 */
export class World {
  /** 갈 수 있는 지역들 (지도 편집기가 고친 것이면 그것으로 바뀐다) */
  regions: Readonly<Record<string, RegionDef>> = REGIONS
  /** 점검용: 출구를 밟아도 넘어가지 않는다 (scripts/enemy-trial.mjs) */
  exitsLocked = false
  /** 출구를 밟으면 넘어가는가: 들어온 직후에는 출구에서 몇 걸음 떨어져야 다시 켜진다 */
  private exitArmed = false
  /** 지역을 넘어가는 중 (암전 → 다시 짓기 → 밝아짐) */
  private travel: { to: RegionDef; at: { x: number; z: number }; t: number; switched: boolean } | null = null
  private readonly fade: HTMLElement
  /** 지금 땅에서 이웃으로 가는 통로 (지금 땅의 지역 안 좌표) */
  private links: readonly RegionLink[] = []

  constructor(
    private readonly parts: WorldParts,
    container: HTMLElement,
  ) {
    this.fade = document.createElement('div')
    this.fade.className = 'region-fade'
    container.append(this.fade)
  }

  /** 지금 지역 */
  get region(): RegionDef {
    return this.parts.stage.map.region
  }

  /** 그 땅에서 움직일 수 있는 곳: 땅의 네모와 이웃으로 가는 통로 (E19) */
  areaOf(region: RegionDef): WalkArea {
    return walkArea(walkRects(region.halfExtent, regionLinks(this.regions, region.id)))
  }

  /** 다른 지역으로 넘어가는 중인가 (그동안은 입력을 받지 않는다) */
  get traveling(): boolean {
    return this.travel !== null
  }

  /** 땅의 날림(눈·꽃잎·낙엽)과 길찾기 밖의 것들을 그 지역 것으로 맞춘다. 처음 지역에도 쓴다 */
  dress(region: RegionDef): void {
    const { villagers, minimap, fx, drops } = this.parts
    this.links = regionLinks(this.regions, region.id)
    villagers.load(region.npcs)
    minimap.setRegion(region)
    const particles = THEMES[region.theme].particles
    fx.snow.setStyle(particles.kind, particles.color)
    if (region.realm) drops.realm = region.realm
  }

  /**
   * 지역에 들어간다: 맵·길찾기·적·성소를 그 지역 것으로 다시 짓고 시작점(또는 at)에 선다.
   * 지도 편집기가 고친 지역을 바로 보여 줄 때도 쓴다. 다른 지역으로 가면 땅에 떨어진 유물은 사라진다.
   */
  enter(region: RegionDef, at: { x: number; z: number } = region.spawn): void {
    const { stage, nav, encounter, legend, hero, orders, view, pickups, bus } = this.parts
    if (legend.active) return
    // 균열은 층마다 id가 같지만 새 땅이다 (앞 층의 물건을 치우고 「균열 N층」을 띄운다)
    const moved = region.id !== this.region.id || region.kind === 'rift'
    if (moved) pickups.clear()
    stage.load(region, this.regions)
    this.dress(region)
    const colliders = stage.map.colliders
    const area = this.areaOf(region)
    nav.rebuild(area, colliders)
    encounter.reset({ ...region, respawn: region.kind !== 'rift' }, colliders, area)
    legend.moveTo(region.sanctuary && (nav.nearestFree(region.sanctuary) ?? region.sanctuary), region.sanctuary?.radius)
    hero.area = area
    orders.clear()
    // 도착 자리가 바위·나무에 걸리면 가까운 빈 곳에 선다
    const spot = nav.nearestFree(at) ?? at
    hero.teleport(spot.x, spot.z)
    view.jumpTo(hero.object.position)
    this.exitArmed = false
    if (moved) this.announce(region)
    bus.emit('regionEntered', { id: region.id })
  }

  /** 그 땅의 문장과 색 띠로 이름을 알린다 (E9-05) */
  private announce(region: RegionDef): void {
    const realm = region.realm ?? 'hub'
    const ink = realmInk(realm)
    this.parts.hud.showTitleCard(region.name, `var(--c-realm-${realm})`, realmSigil(realm, ink.light, ink.dark))
  }

  /**
   * 통로를 반 넘게 걸어 이웃 땅으로 넘어간다 (E19, 암전 없음). 원점을 이웃 땅으로 옮기고 주인공·카메라·가던 곳을
   * 같은 만큼 옮겨 화면에서는 아무것도 움직이지 않은 것처럼 보이게 한다. 길찾기·적·성소·마을 사람은 넘어간 땅 것으로.
   */
  private cross(link: RegionLink): void {
    const to = this.regions[link.to]
    if (!to) return
    const { stage, nav, encounter, legend, hero, orders, view, pickups, bus } = this.parts
    const { x: dx, z: dz } = link.shift
    hero.shift(dx, dz)
    view.shift(dx, dz)
    // 떨어진 것은 제자리에 남는다 (되돌아가면 주울 수 있다). 이웃 칸보다 먼 것만 치운다
    pickups.shift(dx, dz, CELL)
    stage.cross(to)
    this.dress(to)
    const colliders = stage.map.colliders
    const area = this.areaOf(to)
    nav.rebuild(area, colliders)
    encounter.reset({ ...to, respawn: true }, colliders, area)
    legend.moveTo(to.sanctuary && (nav.nearestFree(to.sanctuary) ?? to.sanctuary), to.sanctuary?.radius)
    hero.area = area
    // 길찾기를 넘어간 땅 것으로 바꾼 뒤에 가던 곳까지 다시 길을 찾는다
    orders.shift(dx, dz)
    this.announce(to)
    bus.emit('regionEntered', { id: to.id })
  }

  /** 출구로 다른 지역에 간다: 잠깐 어두워졌다가 그 지역의 돌아오는 출구 앞에서 밝아진다 (E7-02) */
  travelTo(id: string): void {
    const to = this.regions[id]
    if (!to || this.travel || this.parts.legend.active) return
    this.parts.orders.clear()
    this.travel = { to, at: arrivalSpot(to, this.region.id), t: 0, switched: false }
  }

  /**
   * 성소 워프 (E14-05): 그 지역의 성소(마을이면 시작점)로 암전과 함께 바로 간다.
   * 성소 한가운데는 전설이 시작되는 자리라, 시작점 쪽으로 몇 걸음 떨어진 곳에 선다.
   */
  warpTo(id: string): boolean {
    const to = this.regions[id]
    if (!to || this.travel || this.parts.legend.active) return false
    this.parts.orders.clear()
    this.travel = { to, at: to.sanctuary ? besideSanctuary(to.sanctuary, to.spawn) : to.spawn, t: 0, switched: false }
    return true
  }

  /** 출구 밟기와 넘어가는 동안의 암전 (실제 시간으로 흐른다) */
  update(realDt: number): void {
    const travel = this.travel
    if (travel) {
      travel.t += realDt
      if (!travel.switched && travel.t >= TRAVEL_FADE) {
        travel.switched = true
        this.enter(travel.to, travel.at)
      }
      const t = travel.t / TRAVEL_FADE
      this.fade.style.opacity = String(t < 1 ? t : Math.max(0, 2 - t))
      if (travel.t >= TRAVEL_FADE * 2) {
        this.travel = null
        this.fade.style.opacity = '0'
      }
      return
    }
    const { combat, legend, hero, orders } = this.parts
    if (!combat.alive || legend.active || this.exitsLocked) return
    const p = hero.object.position
    // 하나로 이어진 세계 (E19): 통로를 반 넘게 지나면 이웃 땅으로 넘어간다. 문은 통로 입구의 표시일 뿐이다
    if (this.region.cell) {
      const link = crossingAt(this.links, p.x, p.z)
      if (link) this.cross(link)
      return
    }
    let nearest = Infinity
    // 균열의 나가는 문은 땅을 눌러 그 문으로 걸어가던 중일 때만 연다:
    // 밀려나거나, 문 곁의 적을 눌러 다가가다 밟아 축복을 잃지 않게
    const goal = this.region.kind === 'rift' && orders.order?.kind === 'move' ? hero.goal : null
    for (const exit of this.region.exits) {
      const d = Math.hypot(exit.x - p.x, exit.z - p.z)
      nearest = Math.min(nearest, d)
      if (this.region.kind === 'rift' && (!goal || Math.hypot(exit.x - goal.x, exit.z - goal.z) > EXIT_RADIUS * 1.5)) continue
      if (this.exitArmed && d < EXIT_RADIUS) return this.travelTo(exit.to)
    }
    if (nearest > EXIT_RADIUS * 2) this.exitArmed = true
  }
}

import { arrivalSpot, REGIONS, type RegionDef } from '../data/regions'
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

  /** 다른 지역으로 넘어가는 중인가 (그동안은 입력을 받지 않는다) */
  get traveling(): boolean {
    return this.travel !== null
  }

  /** 땅의 날림(눈·꽃잎·낙엽)과 길찾기 밖의 것들을 그 지역 것으로 맞춘다. 처음 지역에도 쓴다 */
  dress(region: RegionDef): void {
    const { villagers, minimap, fx, drops } = this.parts
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
    const { stage, nav, encounter, legend, hero, orders, view, hud, pickups, bus } = this.parts
    if (legend.active) return
    const moved = region.id !== this.region.id
    if (moved) pickups.clear()
    stage.load(region)
    this.dress(region)
    const colliders = stage.map.colliders
    nav.rebuild(region.halfExtent, colliders)
    encounter.reset(region, colliders, region.halfExtent)
    legend.moveTo(region.sanctuary && (nav.nearestFree(region.sanctuary) ?? region.sanctuary), region.sanctuary?.radius)
    hero.halfExtent = region.halfExtent
    orders.clear()
    hero.teleport(at.x, at.z)
    view.jumpTo(hero.object.position)
    this.exitArmed = false
    if (moved) {
      // 그 땅의 문장과 색 띠로 이름을 알린다 (E9-05)
      const realm = region.realm ?? 'hub'
      const ink = realmInk(realm)
      hud.showTitleCard(region.name, `var(--c-realm-${realm})`, realmSigil(realm, ink.light, ink.dark))
    }
    bus.emit('regionEntered', { id: region.id })
  }

  /** 출구로 다른 지역에 간다: 잠깐 어두워졌다가 그 지역의 돌아오는 출구 앞에서 밝아진다 (E7-02) */
  travelTo(id: string): void {
    const to = this.regions[id]
    if (!to || this.travel || this.parts.legend.active) return
    this.parts.orders.clear()
    this.travel = { to, at: arrivalSpot(to, this.region.id), t: 0, switched: false }
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
    const { combat, legend, hero } = this.parts
    if (!combat.alive || legend.active || this.exitsLocked) return
    const p = hero.object.position
    let nearest = Infinity
    for (const exit of this.region.exits) {
      const d = Math.hypot(exit.x - p.x, exit.z - p.z)
      nearest = Math.min(nearest, d)
      if (this.exitArmed && d < EXIT_RADIUS) return this.travelTo(exit.to)
    }
    if (nearest > EXIT_RADIUS * 2) this.exitArmed = true
  }
}

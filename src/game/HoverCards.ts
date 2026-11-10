import * as THREE from 'three'

import { gradeOf } from '../enemies/grade'
import { Giant } from '../enemies/Giant'
import { PICKUP_TOP } from '../gear/Pickups'
import { touchUi } from '../input/device'
import type { Input } from '../input/Input'
import { relicDef, type RelicId } from '../relics/data'
import { itemUnderPointer, NearCard, type NearKind, type ScreenItem, type ScreenPoint } from '../relics/hover'
import type { PixelRenderer } from '../render/PixelRenderer'
import { worldToScreen } from '../render/picking'
import type { QuarterViewCamera } from '../render/QuarterViewCamera'
import { gearCard } from '../ui/gearCard'
import { traceCard, type TraceCardContext } from '../ui/traceCard'
import { TRACE_RADIUS, type TraceState } from '../data/wake'
import type { God } from '../relics/data'
import type { Nameplates, PlateTarget } from '../ui/Nameplates'
import type { RelicCardContext } from '../ui/relicCard'
import { type CardBand, RelicTooltip } from '../ui/RelicTooltip'
import { heightAt } from '../world/terrain'
import type { GameContext } from './context'

/** 커서 아래 카드와 이름표가 게임에서 쓰는 것 */
export interface HoverCardsParts {
  readonly ctx: GameContext
  readonly container: HTMLElement
  readonly input: Input
  readonly pixel: PixelRenderer
  readonly view: QuarterViewCamera
  readonly nameplates: Nameplates
  /** 설명 카드에 넣을 지금 상태 */
  cardContext(id: RelicId): RelicCardContext
  /** 커서를 올린 몬스터 */
  hovered(): unknown
  /** 월드 좌표가 화면 어디에 보이는가 (CSS 픽셀) */
  screenPoint(x: number, y: number, z: number): { x: number; y: number }
  /** 지금 땅의 신의 흔적 (E238) */
  traces(): readonly { god: God; x: number; z: number; state: TraceState }[]
  /** 흔적 카드에 보일 깨우는 진행 */
  traceContext(god: God): Omit<TraceCardContext, 'state'>
  /** 보스 막대에 이름이 뜨는 수호자 (머리 위 이름표는 띄우지 않는다) */
  guardian(): unknown
}

/** 흔적 모형의 높이 (m): 커서가 이 기둥 곁이면 흔적 카드 */
const TRACE_TOP = 3.4

/** 땅의 것 하나: 떨어진 장비·유물이거나 신의 흔적 */
type GroundItem = { id: string; x: number; z: number } | { god: God; x: number; z: number; state: TraceState }

/**
 * 다가가면 뜨는 카드의 거리와 시간 (휴대폰, E307).
 * 떨어진 장비·유물은 밟아 줍는 거리(1.1m)보다 넉넉히 앞에서 뜨고, 싸우다 곁에 떨어진 것은 띄우지 않는다.
 * 신의 흔적은 지키는 것들이 깨어나는 거리(TRACE_RADIUS) 앞에서 떠, 무엇을 고르는지 알고 들어서게 한다 (읽을 글이 많아 더 오래 둔다).
 * 한 번 읽은 흔적은 형편이 바뀌기 전까지 달려 지나갈 때는 뜨지 않고, 곁에 가만히 서면 뜬다 (`NearCard`)
 */
const NEAR_PICKUP: NearKind = { near: 3, far: 4.5, hold: 3, rank: 0, drops: true }
const NEAR_TRACE: NearKind = { near: TRACE_RADIUS + 4, far: TRACE_RADIUS + 7, hold: 6, rank: 1, drops: false }
/** 다가가면 뜨는 카드와 아래 묶음 사이 (px, RelicTooltip이 그 점 위로 띄울 때 두는 틈과 같다) */
const CARD_GAP = 12
/** 다가가면 뜨는 카드와 주인공 발 사이 (px): 카드는 될 수 있으면 발 아래에 머문다 */
const FEET_GAP = 6

/**
 * 땅의 설명 카드와 몬스터 이름표 (E12-09):
 * 땅의 유물·장비·신의 흔적에 커서를 올리면 카드(장비는 지금 낀 것과 비교), HUD 유물 칸에 올리면 그 위에 카드,
 * 커서를 올렸거나 공격 중인 몬스터 머리 위에 이름표.
 * 휴대폰(E307)은 커서가 없으니 주인공이 땅의 것에 다가가면 카드가 뜨고, 걷기 시작하거나 싸움이 붙거나 몇 초 지나면 닫힌다 (`NearCard`).
 */
export class HoverCards {
  private readonly tooltip: RelicTooltip
  /** 지금 떠 있는 카드가 땅의 유물 카드인가 */
  private groundTooltip = false
  /** 커서를 올린 HUD 유물 칸 (카드를 그 위에 띄운다) */
  private hoveredSlot: { relic: RelicId; x: number; y: number } | null = null
  /** 다가가면 뜨는 카드의 규칙과, 그 카드가 머물 띠 (뜰 때 한 번 잰다) */
  private readonly near = new NearCard()
  private nearBand: CardBand | null = null
  private nearKey: string | null = null
  /** 휴대폰에서 카드를 띄워 보인 흔적의 형편 (`traceLook`): 형편이 그대로면 달려 지나갈 때 다시 띄우지 않는다 */
  private readonly readTraces = new Map<God, string>()
  /** 지금 떠 있는 흔적 카드를 읽은 것으로 적었나 */
  private nearRead = false
  /** 화면 자리를 잴 때 다시 쓰는 벡터와, 화면에 비친 떨어진 것·흔적을 담는 그릇 (프레임마다 새로 만들지 않게) */
  private readonly point = new THREE.Vector3()
  private readonly pickupSpots: ScreenItem<{ id: string; x: number; z: number }>[] = []
  private readonly traceSpots: ScreenItem<{ god: God; x: number; z: number; state: TraceState }>[] = []

  constructor(private readonly parts: HoverCardsParts) {
    this.tooltip = new RelicTooltip(parts.container)
  }

  /** HUD 유물 칸에 커서를 올렸다(장비 칸 번호와 칸 자리) 또는 뗐다(null) */
  slot(relic: RelicId | null, anchor: DOMRect | null): void {
    if (!relic || !anchor) {
      this.hoveredSlot = null
      this.tooltip.hide()
      return
    }
    this.hoveredSlot = { relic, x: anchor.left + anchor.width / 2, y: anchor.top }
  }

  /** 창·장면·두 갈래 카드가 열릴 때: 떠 있는 카드를 치운다 */
  reset(): void {
    this.tooltip.hide()
    this.hoveredSlot = null
    this.groundTooltip = false
    this.near.close()
  }

  /**
   * 땅의 유물·장비·흔적 카드를 띄우고 닫는다. HUD 칸에 올렸으면 그 카드를 (충전이 움직이므로) 계속 새로 그린다.
   * 커서가 게임 화면을 가리킬 때만 그 아래를 찾는다: 창 밖으로 나갔거나 카드·작은 지도 같은 DOM 위에 있을 때,
   * 손가락 사건을 받지 않아 (0,0)에 멈춰 있는 휴대폰에서는 찾지 않는다 (E307)
   */
  update(): void {
    const { input, cardContext } = this.parts
    if (this.hoveredSlot) {
      const id = this.hoveredSlot.relic
      this.tooltip.show(relicDef(id), cardContext(id), this.hoveredSlot.x, this.hoveredSlot.y, true)
      return
    }
    const { pointer } = input
    const approached = touchUi() ? this.nearItem() : null
    const under = pointer.inside ? (this.pickupUnder(pointer) ?? this.traceUnder(pointer)) : null
    if (under) this.showGround(under, pointer.x, pointer.y)
    // 휴대폰: 다가간 것의 카드는 아래 묶음 바로 위 가운데에 (위쪽의 초상·목표 한 줄·작은 지도를 가리지 않고, 될 수 있으면 주인공 아래에)
    else if (approached && this.nearBand) this.showGround(approached, innerWidth / 2, this.nearBand.bottom + CARD_GAP, true, this.nearBand)
    else if (this.groundTooltip) {
      this.tooltip.hide()
      this.groundTooltip = false
    }
  }

  /** 땅의 것 하나의 카드를 띄운다: 커서 곁, 또는 (above·band) 그 점 위 띠 안에 */
  private showGround(item: GroundItem, x: number, y: number, above = false, band?: CardBand): void {
    const { ctx, cardContext } = this.parts
    this.groundTooltip = true
    if ('god' in item) {
      // 신의 흔적 (E238): 무엇을 고르는지 알고 고르게 그 신의 무기·빌려주는 힘
      const now = { ...this.parts.traceContext(item.god), state: item.state }
      this.tooltip.showCard(`trace:${item.god}`, `${item.god}|${now.state}|${now.fragments}|${now.hunt}|${now.sealedText}`, () => traceCard(item.god, now), x, y, above, band)
      return
    }
    const gear = ctx.pickups.gearOf(item.id)
    if (gear) {
      // 땅의 일반 장비: 같은 부위에 지금 낀 장비와 비교한 카드
      const { loadout } = ctx.powers
      // 아직 줍지 않은 장비는 가방에 없어 fits로는 알 수 없으니 부위로 고른다
      const wornId = loadout.slots.find((id) => id && loadout.gear.has(id) && loadout.partOf(id) === gear.part)
      const worn = wornId ? loadout.gear.get(wornId) : null
      this.tooltip.showCard(item.id, `${item.id}|${wornId ?? ''}`, () => gearCard(gear, worn, ctx.build.state.sources), x, y, above, band)
    } else {
      const place = { kind: 'ground' } as const
      this.tooltip.show(relicDef(item.id), { ...cardContext(item.id), place }, x, y, above, band)
    }
  }

  /**
   * 휴대폰: 주인공이 다가가 카드를 띄울 땅의 것 (규칙은 `NearCard`). 없으면 null.
   * 카드가 머물 띠는 뜰 때 한 번만 잰다 (프레임마다 레이아웃을 읽지 않게)
   */
  private nearItem(): GroundItem | null {
    const { ctx } = this.parts
    const hero = ctx.hero.object.position
    const near = this.near
    const pickups = ctx.pickups.list
    const traces = this.parts.traces()
    // 싸우는 동안(휘두르는 중·칠 적이 있음·적을 쫓는 중)에는 띄우지 않는다
    near.begin(performance.now() / 1000, ctx.hero.isMoving, ctx.combat.engaged || ctx.orders.attackTarget !== null)
    for (const p of pickups) near.see(p.id, Math.hypot(p.x - hero.x, p.z - hero.z), NEAR_PICKUP)
    for (const t of traces) {
      // 깨어난 신의 흔적은 더 알릴 것이 없어 띄우지 않는다 (컴퓨터에서 커서를 올리면 보인다)
      if (t.state === 'awake') continue
      const dist = Math.hypot(t.x - hero.x, t.z - hero.z)
      // 이미 읽은 형편인가는 읽은 적이 있는 흔적 곁에 있을 때만 따진다
      const read = dist <= NEAR_TRACE.near ? this.readTraces.get(t.god) : undefined
      near.see(t.god, dist, NEAR_TRACE, read !== undefined && read === this.traceLook(t))
    }
    let key = near.end()
    // 고르는 카드(귀환·맹세 출발)가 떠 있으면 그 곁에 겹쳐 띄우지 않는다: 떠 있던 카드는 닫고, 막 뜨려던 것은 미룬다
    if (key !== null && ctx.hud.root.querySelector('.pick-card:not([hidden])')) {
      if (key === this.nearKey) near.close()
      else near.skip()
      key = null
    }
    const item = key === null ? null : (pickups.find((p) => p.id === key) ?? traces.find((t) => t.god === key) ?? null)
    if (key !== this.nearKey) {
      this.nearKey = key
      this.nearBand = item ? this.bandUnderHero() : null
      this.nearRead = false
    }
    // 흔적 카드가 읽을 만큼 떠 있었으면 그 형편은 읽은 것으로 적어 둔다 (뜨자마자 싸움에 닫힌 카드는 읽은 것이 아니다)
    if (item && 'god' in item && !this.nearRead && near.read) {
      this.nearRead = true
      this.readTraces.set(item.god, this.traceLook(item))
    }
    return item
  }

  /** 흔적의 형편: 카드의 「지금 할 일」 줄이 달라지는 것만 (사냥 수처럼 늘 움직이는 것은 뺀다). 바뀌면 다시 읽을 카드다 */
  private traceLook(t: { god: God; state: TraceState }): string {
    if (t.state !== 'waking' && t.state !== 'sealed' && t.state !== 'busy') return t.state
    const now = this.parts.traceContext(t.god)
    return `${t.state}|${t.state === 'waking' ? now.fragments : t.state === 'sealed' ? now.sealedText : now.waking}`
  }

  /**
   * 다가가면 뜨는 카드가 머물 띠: 위아래 HUD 묶음 사이, 될 수 있으면 주인공의 발 아래 (주인공과 그 둘레를 가리지 않게).
   * 발 아래에 다 들어가지 않는 키 큰 카드는 `RelicTooltip`이 아래쪽 단락부터 접는다.
   * 카메라가 주인공의 발을 화면 한가운데에 두니 (걷는 동안은 조금 앞서거나 처진다) 발의 자리는 화면 높이의 절반으로 친다
   */
  private bandUnderHero(): CardBand {
    const band: CardBand = this.parts.ctx.hud.clearBand()
    band.keep = this.parts.container.clientHeight / 2 + FEET_GAP
    return band
  }

  /**
   * 이름표: 커서를 올린 몬스터와 지금 공격 중인 몬스터. 창이 닫혀 있어도 프레임마다 불린다.
   * shown이 false면(정보 화면·일시 정지·두 갈래 카드가 열렸거나 대화 중) 이름표를 모두 숨기고 떠 있던 카드도 닫는다:
   * 그동안은 update가 돌지 않아, 닫지 않으면 카드가 얼어붙은 채 장면 내내 남는다 (E307)
   */
  plates(shown: boolean): void {
    if (!shown) this.reset()
    const { ctx, hovered, screenPoint, nameplates } = this.parts
    const { encounter, orders, combat } = ctx
    const plates: PlateTarget[] = []
    // 보스 막대가 떠 있는 보스는 막대에 이름이 있으니 머리 위에는 띄우지 않는다
    const barBoss = encounter.bossEngaged ? encounter.boss : this.parts.guardian()
    const add = (target: unknown) => {
      if (!(target instanceof Giant) || !target.alive || target === barBoss) return
      const top = heightAt(target.x, target.z) + Math.max(1.6, target.radius * 3.6) + 0.6
      plates.push({ key: target, name: target.spec.name, grade: gradeOf(target), life: target.health.ratio, screen: screenPoint(target.x, top, target.z) })
    }
    if (shown) {
      add(hovered())
      add(orders.attackTarget ?? combat.target)
    }
    nameplates.update(plates)
  }

  /** 화면 자리(px) 아래 땅에 떨어진 것의 자리 (누르면 그리로 걸어가 줍는다) */
  pickupAt(x: number, y: number): { x: number; z: number } | null {
    const item = this.pickupUnder({ x, y })
    return item ? { x: item.x, z: item.z } : null
  }

  /** 화면 자리 아래의 땅 유물·장비: 저해상도 픽셀 12칸쯤, 화면에서 적어도 28px 안 */
  private pickupUnder(at: ScreenPoint): { id: string; x: number; z: number } | null {
    return this.under(this.parts.ctx.pickups.list, this.pickupSpots, at, PICKUP_TOP, Math.max(28, this.parts.pixel.size.scale * 12))
  }

  /** 화면 자리 아래의 신의 흔적: 흔적 모형(발밑 ~ 꼭대기)에서 저해상도 픽셀 16칸쯤, 화면에서 적어도 36px 안 */
  private traceUnder(at: ScreenPoint): { god: God; x: number; z: number; state: TraceState } | null {
    return this.under(this.parts.traces(), this.traceSpots, at, TRACE_TOP, Math.max(36, this.parts.pixel.size.scale * 16))
  }

  /**
   * 화면 자리 아래의 땅의 것: 화면에 보이는 모양(발밑 ~ 위 끝 top m)과 그 자리 사이의 화면 거리가 radius(px) 안인 가장 가까운 것.
   * 화면에 비친 자리는 그릇(spots)에 다시 채워 쓴다 (프레임마다 떨어진 것 하나에 벡터와 배열을 새로 만들지 않게)
   */
  private under<T extends { x: number; z: number }>(items: readonly T[], spots: ScreenItem<T>[], at: ScreenPoint, top: number, radius: number): T | null {
    const { container, pixel, view } = this.parts
    const height = container.clientHeight
    const size = pixel.size
    const { camera, subpixel } = view
    for (let i = 0; i < items.length; i++) {
      const item = items[i]!
      const y = heightAt(item.x, item.z)
      const base = worldToScreen(this.point.set(item.x, y, item.z), height, size, camera, subpixel)
      const tip = worldToScreen(this.point.set(item.x, y + top, item.z), height, size, camera, subpixel)
      const spot = spots[i]
      if (spot) {
        spot.item = item
        spot.base = base
        spot.top = tip
      } else spots.push({ item, base, top: tip })
    }
    spots.length = items.length
    return itemUnderPointer(spots, at, radius)
  }
}

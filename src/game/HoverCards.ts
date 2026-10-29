import * as THREE from 'three'

import { gradeOf } from '../enemies/grade'
import { Giant } from '../enemies/Giant'
import { PICKUP_TOP } from '../gear/Pickups'
import type { Input } from '../input/Input'
import { relicDef, type RelicId } from '../relics/data'
import { itemUnderPointer } from '../relics/hover'
import type { PixelRenderer } from '../render/PixelRenderer'
import { worldToScreen } from '../render/picking'
import type { QuarterViewCamera } from '../render/QuarterViewCamera'
import { gearCard } from '../ui/gearCard'
import { traceCard, type TraceCardContext } from '../ui/traceCard'
import type { TraceState } from '../data/awaken'
import type { God } from '../relics/data'
import type { Nameplates, PlateTarget } from '../ui/Nameplates'
import type { RelicCardContext } from '../ui/relicCard'
import { RelicTooltip } from '../ui/RelicTooltip'
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
  cardContext(id: RelicId, preview?: RelicCardContext['preview']): RelicCardContext
  /** 커서를 올린 몬스터 */
  hovered(): unknown
  /** 월드 좌표가 화면 어디에 보이는가 (CSS 픽셀) */
  screenPoint(x: number, y: number, z: number): { x: number; y: number }
  /** 지금 땅의 신의 흔적 (E238) */
  traces(): readonly { god: God; x: number; z: number; state: TraceState }[]
  /** 흔적 카드에 보일 깨우는 진행 */
  traceContext(): Omit<TraceCardContext, 'state'>
  /** 보스 막대에 이름이 뜨는 수호자 (머리 위 이름표는 띄우지 않는다) */
  guardian(): unknown
}

/** 흔적 모형의 높이 (m): 커서가 이 기둥 안이면 흔적 카드 */
const TRACE_TOP = 3.4

/**
 * 커서 아래의 설명 카드와 몬스터 이름표 (E12-09):
 * 땅의 유물·장비에 커서를 올리면 카드(장비는 지금 낀 것과 비교), HUD 유물 칸에 올리면 그 위에 카드,
 * 커서를 올렸거나 공격 중인 몬스터 머리 위에 이름표.
 */
export class HoverCards {
  private readonly tooltip: RelicTooltip
  /** 지금 떠 있는 카드가 땅의 유물 카드인가 */
  private groundTooltip = false
  /** 커서를 올린 HUD 유물 칸 (카드를 그 위에 띄운다) */
  private hoveredSlot: { slot: number; x: number; y: number } | null = null

  constructor(private readonly parts: HoverCardsParts) {
    this.tooltip = new RelicTooltip(parts.container)
  }

  /** HUD 유물 칸에 커서를 올렸다(장비 칸 번호와 칸 자리) 또는 뗐다(null) */
  slot(slot: number | null, anchor: DOMRect | null): void {
    const id = slot === null ? null : this.parts.ctx.powers.loadout.slots[slot]
    if (slot === null || !id || !anchor) {
      this.hoveredSlot = null
      this.tooltip.hide()
      return
    }
    this.hoveredSlot = { slot, x: anchor.left + anchor.width / 2, y: anchor.top }
  }

  /** 창을 여닫을 때: 떠 있는 카드를 치운다 */
  reset(): void {
    this.tooltip.hide()
    this.hoveredSlot = null
  }

  /** 땅에 떨어진 유물에 커서를 올리면 설명 카드를 띄운다. HUD 칸에 올렸으면 그 카드를 (충전이 움직이므로) 계속 새로 그린다. */
  update(): void {
    const { ctx, input, cardContext } = this.parts
    const { powers, pickups } = ctx
    if (this.hoveredSlot) {
      const id = powers.loadout.slots[this.hoveredSlot.slot]
      if (id) this.tooltip.show(relicDef(id), cardContext(id), this.hoveredSlot.x, this.hoveredSlot.y, true)
      return
    }
    const { pointer } = input
    const near = this.pickupUnderPointer(pointer)
    let trace: { god: God; state: TraceState } | null = null
    const nearGear = near ? pickups.gearOf(near.id) : undefined
    if (near && nearGear) {
      // 땅의 일반 장비: 같은 부위에 지금 낀 장비와 비교한 카드
      const { loadout } = powers
      // 아직 줍지 않은 장비는 가방에 없어 fits로는 알 수 없으니 부위로 고른다
      const wornId = loadout.slots.find((id) => id && loadout.gear.has(id) && loadout.partOf(id) === nearGear.part)
      const worn = wornId ? loadout.gear.get(wornId) : null
      this.tooltip.showCard(near.id, `${near.id}|${wornId ?? ''}`, () => gearCard(nearGear, worn, ctx.build.state.sources), pointer.x, pointer.y)
      this.groundTooltip = true
    } else if (near) {
      const place = { kind: 'ground' } as const
      const free = powers.loadout.slots.indexOf(null)
      const preview = free >= 0 ? { before: powers.state, after: powers.loadout.preview(free, near.id) } : undefined
      this.tooltip.show(relicDef(near.id), { ...cardContext(near.id, preview), place }, pointer.x, pointer.y)
      this.groundTooltip = true
    } else if ((trace = this.traceUnderPointer(pointer))) {
      // 신의 흔적 (E238): 무엇을 고르는지 알고 고르게 그 신의 무기·빌려주는 힘
      const now = { ...this.parts.traceContext(), state: trace.state }
      const found = trace
      this.tooltip.showCard(`trace:${found.god}`, `${found.god}|${now.state}|${now.fragments}|${now.hunt}|${now.sealedUntil}`, () => traceCard(found.god, now), pointer.x, pointer.y)
      this.groundTooltip = true
    } else if (this.groundTooltip) {
      this.tooltip.hide()
      this.groundTooltip = false
    }
  }

  /** 이름표: 커서를 올린 몬스터와 지금 공격 중인 몬스터. shown이 false면(창이 열렸거나 대화 중) 모두 숨긴다 */
  plates(shown: boolean): void {
    const { ctx, hovered, screenPoint, nameplates } = this.parts
    const { legend, encounter, orders, combat } = ctx
    const plates: PlateTarget[] = []
    // 보스 막대가 떠 있는 보스는 막대에 이름이 있으니 머리 위에는 띄우지 않는다
    const barBoss = legend.boss?.alive ? legend.boss : encounter.bossEngaged ? encounter.boss : this.parts.guardian()
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

  /** 커서 아래의 신의 흔적: 흔적 모형(발밑 ~ 꼭대기)과 커서 사이의 화면 거리로 고른다 */
  private traceUnderPointer(pointer: { x: number; y: number }): { god: God; state: TraceState } | null {
    const { container, pixel, view } = this.parts
    const height = container.clientHeight
    const size = pixel.size
    const { camera, subpixel } = view
    const items = this.parts.traces().map((t) => {
      const y = heightAt(t.x, t.z)
      return {
        item: t,
        base: worldToScreen(new THREE.Vector3(t.x, y, t.z), height, size, camera, subpixel),
        top: worldToScreen(new THREE.Vector3(t.x, y + TRACE_TOP, t.z), height, size, camera, subpixel),
      }
    })
    return itemUnderPointer(items, pointer, Math.max(36, size.scale * 16))
  }

  /** 화면 자리(px) 아래 땅에 떨어진 것의 자리 (누르면 그리로 걸어가 줍는다) */
  pickupAt(x: number, y: number): { x: number; z: number } | null {
    const item = this.pickupUnderPointer({ x, y })
    return item ? { x: item.x, z: item.z } : null
  }

  /** 커서 아래의 땅 유물: 화면에 보이는 유물 모양(발밑 ~ 떠 있는 모델 위)과 커서 사이의 화면 거리로 고른다 */
  private pickupUnderPointer(pointer: { x: number; y: number }): { id: string; x: number; z: number } | null {
    const { container, pixel, view, ctx } = this.parts
    const height = container.clientHeight
    const size = pixel.size
    const { camera, subpixel } = view
    const items = ctx.pickups.list.map((p) => {
      const y = heightAt(p.x, p.z)
      return {
        item: p,
        base: worldToScreen(new THREE.Vector3(p.x, y, p.z), height, size, camera, subpixel),
        top: worldToScreen(new THREE.Vector3(p.x, y + PICKUP_TOP, p.z), height, size, camera, subpixel),
      }
    })
    // 저해상도 픽셀 12칸쯤, 화면에서 적어도 28px
    return itemUnderPointer(items, pointer, Math.max(28, size.scale * 12))
  }
}

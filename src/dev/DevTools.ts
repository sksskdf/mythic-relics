import type { QuarterViewCamera } from '../render/QuarterViewCamera'
import type { RelicId } from '../relics/data'
import { type ClassProgress, MASTERY_TO_OPEN } from '../myth/ClassProgress'
import type { EventBus, GameEvents } from '../game/events'
import type { HeroController } from '../game/HeroController'
import type { HeroOrders } from '../game/HeroOrders'
import type { RelicPowers } from '../game/RelicPowers'
import type { HeroLife } from '../game/systems/HeroLife'
import type { ProgressionSystem } from '../game/systems/Progression'
import type { RelicSystem } from '../game/systems/Relics'

/** 개발 도구가 손대는 게임의 부품 */
export interface DevParts {
  bus: EventBus<GameEvents>
  relics: RelicSystem
  powers: RelicPowers
  progress: ClassProgress
  growth: ProgressionSystem
  life: HeroLife
  hero: HeroController
  orders: HeroOrders
  view: QuarterViewCamera
  /** 지금 지역의 신화권 (마을은 없음) */
  region: () => string | undefined
}

/**
 * 개발 패널·봇·점검 스크립트가 쓰는 지름길 (E11-03에서 Game.ts에서 뗌).
 * 게임 안에서는 `game.dev.equip('mjolnir')`처럼 부른다.
 */
export class DevTools {
  constructor(private readonly parts: DevParts) {}

  /** 유물을 끼운다. 신화 개방 연출도 그대로 나온다. */
  equip(id: RelicId): void {
    const { powers, relics, bus } = this.parts
    if (powers.loadout.has(id) || !powers.hasFreeSlot) return
    relics.equip(id, true)
    bus.emit('progressChanged', {})
  }

  /** 유물 하나를 뺀다. (땅에 내려놓지 않고 없앤다) */
  unequip(id: RelicId): void {
    const slot = this.parts.powers.loadout.slots.indexOf(id)
    if (slot >= 0) this.parts.relics.unequip(slot, false)
  }

  /** 가방의 유물을 칸에 끼운다. (봇이 신화를 여는 조합으로 바꿔 낄 때) */
  wield(id: RelicId, slot: number): void {
    this.parts.relics.wield(id, slot)
  }

  /** 칸의 유물을 가방에 넣는다. (봇이 한 신만 쓸 때) */
  stow(slot: number): void {
    this.parts.relics.stow(slot)
  }

  /** 유물을 모두 뺀다. (땅에 내려놓지 않고 없앤다) */
  unequipAll(): void {
    const { powers, relics } = this.parts
    powers.loadout.slots.forEach((id, slot) => id && relics.unequip(slot, false))
  }

  /** 지금 신화의 경험치를 채우고 바로 다음 개방 단계로 올린다. */
  promote(): void {
    const { powers, progress, growth } = this.parts
    const god = powers.manifested
    if (!god) return
    progress.addXp(god, 1e9)
    growth.promote(god)
  }

  /** 이 지역 신화권의 신들에게 숙련을 준다 (신화 개방 시험). 신화권이 없는 마을이면 북유럽 */
  gainMastery(amount = MASTERY_TO_OPEN * 4): void {
    this.parts.growth.gainMastery(amount, this.parts.region() ?? 'norse')
  }

  /** 신화 성장(개방 단계·경험치)을 처음으로 되돌린다. */
  resetMyths(): void {
    this.parts.growth.reset()
  }

  teleport(x: number, z: number): void {
    const { orders, hero, view } = this.parts
    orders.clear()
    hero.teleport(x, z)
    view.jumpTo(hero.object.position)
  }

  revive(): void {
    this.parts.life.revive()
  }
}

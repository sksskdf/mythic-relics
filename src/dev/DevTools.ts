import type { QuarterViewCamera } from '../render/QuarterViewCamera'
import type { GearPart, Grade } from '../data/gearData'
import type { Pickups } from '../gear/Pickups'
import { nextRecipe } from '../gear/forge'
import { rollGear } from '../gear/roll'
import { GODS, type RelicId } from '../relics/data'
import { type ClassProgress, MASTERY_TO_OPEN } from '../myth/ClassProgress'
import type { EventBus, GameEvents } from '../game/events'
import type { HeroController } from '../game/HeroController'
import type { HeroOrders } from '../game/HeroOrders'
import type { RelicPowers } from '../game/RelicPowers'
import type { HeroLife } from '../game/systems/HeroLife'
import type { ProgressionSystem } from '../game/systems/Progression'
import type { RelicSystem } from '../game/systems/Relics'
import type { Encounter } from '../game/Encounter'
import { ENEMIES, GRUNT } from '../enemies/Giant'
import { insightsAt, SAMPLE_ORDER } from '../data/training'
import type { TrainingProgress } from '../progress/Training'
import type { SkillContext } from '../skills/Skill'

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
  pickups: Pickups
  /** 지금 지역의 신화권 (마을은 없음) */
  region: () => string | undefined
  /** 스킬이 세계와 주고받는 것 (유물 행동을 바로 터뜨릴 때) */
  skills: SkillContext
  encounter: Encounter
  /** 수련 (E236) */
  training: TrainingProgress
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

  /** 일반 장비 하나를 그 자리에 떨어뜨린다 (부위·등급·단계를 정할 수 있다). 장비 id를 돌려준다 */
  dropGear(part?: GearPart, grade?: Grade, x?: number, z?: number, tier = 1): string {
    const p = this.parts.hero.object.position
    const item = rollGear(Math.random, { ...(part ? { part } : {}), ...(grade ? { grade } : {}), tier })
    this.parts.pickups.drop(item.uid, x ?? p.x + 1.5, z ?? p.z, true, item)
    return item.uid
  }

  /** 일반 장비 하나를 바로 낀다 (체크리스트 QA·개발 패널). 장비 id를 돌려준다 */
  wear(part: GearPart, grade?: Grade, tier = 1): string {
    const { powers, bus } = this.parts
    const item = rollGear(Math.random, { part, ...(grade ? { grade } : {}), tier })
    powers.loadout.addGear(item)
    powers.loadout.equip(item.uid)
    bus.emit('progressChanged', {})
    return item.uid
  }

  /** 적을 그 자리에 세운다 (점검 스크립트). 없는 id면 졸개 */
  spawn(id: string, x: number, z: number): void {
    this.parts.encounter.spawn(ENEMIES[id] ?? GRUNT, { x, z }, true)
  }

  /** 낀 유물(없으면 고른 신화의 유물)의 행동을 충전 없이 바로 터뜨린다 (E18 연속 스크린숏, 개발 패널) */
  fireRelic(id?: RelicId): boolean {
    const { powers, skills } = this.parts
    const relic = id ?? (powers.manifested ? GODS[powers.manifested]?.relic : undefined)
    const slot = relic ? powers.loadout.slots.indexOf(relic) : -1
    const effect = slot >= 0 ? powers.effects[slot] : null
    if (!effect?.forceFire) return false
    effect.forceFire(skills)
    return true
  }

  /** 한계를 깬 무렵의 빌드 (균열 시험, E17-07): 영웅 장비 여섯을 끼고, 고른 신화를 최고 단계로, 같은 신화권 신화를 모두 연다. 수련은 엔딩 무렵만큼(깨달음 스물, E236) */
  endgame(): void {
    const { powers, progress, bus } = this.parts
    this.insight(Math.max(0, 20 - insightsAt(this.parts.training.xp)))
    for (const id of SAMPLE_ORDER) this.train(id)
    for (const part of ['head', 'body', 'hands', 'feet', 'trinket', 'trinket'] as const) {
      const item = rollGear(Math.random, { part, grade: 'hero' })
      powers.loadout.addGear(item)
      powers.loadout.equip(item.uid)
    }
    const god = powers.manifested ?? 'thor'
    const realm = GODS[god]?.realm
    for (const g of Object.values(GODS)) if (g.realm === realm && !g.hidden) progress.open(g.id)
    for (let i = 0; i < 4; i++) this.promote()
    bus.emit('progressChanged', {})
  }

  /** 그 신화(없으면 고른 신화)의 다음 제작 재료를 채운다 (대장간 시험) */
  fillForge(god?: string): void {
    const { powers } = this.parts
    const target = god ?? powers.manifested ?? 'thor'
    const recipe = nextRecipe(powers.loadout, target, powers.maxStage())
    if (!recipe) return
    for (const { id, count } of recipe.materials) powers.loadout.addMaterial(id, count)
    this.parts.bus.emit('progressChanged', {})
  }

  /** 대장간에서 벼린다 (마을이 아니어도) */
  forge(god: string): boolean {
    return this.parts.relics.forge(god)
  }

  /** 신화를 고른다 (마을·성소가 아니어도). 닫힌 신화면 먼저 연다 */
  choose(god: string): void {
    this.parts.progress.open(god)
    this.parts.relics.choose(god, true)
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

  /** 지금 신화의 경험치를 채우고 바로 다음 개방 단계로 올린다. 데모 끝 단계(3)도 넘긴다 */
  promote(): void {
    const { powers, progress, growth } = this.parts
    const god = powers.manifested
    if (!god) return
    if (progress.level(god) >= progress.levelCap) progress.uncapped = true
    progress.addXp(god, 1e9)
    growth.promote(god)
  }

  /** 이 지역 신화권의 신들에게 숙련을 준다 (신화 개방 시험). 신화권이 없는 마을이면 북유럽 */
  gainMastery(amount = MASTERY_TO_OPEN * 4): void {
    this.parts.growth.gainMastery(amount, this.parts.region() ?? 'norse')
  }

  /** 수련 경험치만 준다 (깨달음 시험). 신화 경험치는 그대로 */
  insight(count = 1): void {
    const { training, bus } = this.parts
    const target = insightsAt(training.xp) + count
    let need = 0
    while (insightsAt(training.xp + need) < target) need += 5
    const gained = training.gain(need)
    if (gained > 0) bus.emit('insightGained', { count: gained, unspent: training.unspent })
    bus.emit('progressChanged', {})
  }

  /** 수련 마디를 찍는다 (점검 스크립트·봇) */
  train(id: string): boolean {
    return this.parts.growth.train(id)
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

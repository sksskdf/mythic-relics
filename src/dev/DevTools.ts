import type { QuarterViewCamera } from '../render/QuarterViewCamera'
import type { GearPart, Grade } from '../data/gearData'
import type { Pickups } from '../gear/Pickups'
import { nextRecipe } from '../gear/forge'
import { type GearItem, rollGear } from '../gear/roll'
import { gearIcon } from '../ui/gearCard'
import { GODS, isRelicId, type RelicId } from '../relics/data'
import type { ClassProgress } from '../myth/ClassProgress'
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
import type { DepthProgress } from '../progress/Depth'
import type { TrainingProgress } from '../progress/Training'
import type { ChapterProgress } from '../progress/Chapters'
import type { ExpeditionProgress } from '../progress/Expedition'
import type { Build } from '../build/Build'
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
  /** 스킬이 세계와 주고받는 것 (유물 행동을 바로 터뜨릴 때) */
  skills: SkillContext
  encounter: Encounter
  /** 수련 (E236) */
  training: TrainingProgress
  /** 신을 깨우는 길 (E238): 다음 조각을 바로 얻는다. target은 그 신화권에서 깨울 신 */
  awakening: { skip(god?: string): boolean; target(prefer?: string): { god: string } | null }
  /** 깊이 (E305-03): 바로 정하고 배율을 다시 건다 */
  depth: DepthProgress
  applyDepth(): void
  /** 장 진행 (E22): 지금 목표를 한 것으로 할 때 (`skipGoal`) */
  chapters: ChapterProgress
  chapterSystem: { bossDown(region: string): void; check(): void }
  /** 들어설 땅으로 넘어간다 */
  world: { travelTo(id: string): void }
  /** 원정 (E304): 귀환 목표를 바로 채운다 */
  expedition: ExpeditionProgress
  expeditionSystem: { branches(): readonly { id: string }[]; returnNow(id: string): number }
  build: Build
}

/**
 * 개발 패널·봇·점검 스크립트가 쓰는 지름길 (E11-03에서 Game.ts에서 뗌).
 * 게임 안에서는 `game.dev.equip('mjolnir')`처럼 부른다.
 */
export class DevTools {
  constructor(private readonly parts: DevParts) {}

  /** 유물을 유물표에 켠다. 엔딩 뒤에는 그 신화가 열리는 연출도 그대로 나온다 (데모에서는 신을 깨워야 열린다: 신이 필요하면 `choose`) */
  equip(id: RelicId): void {
    const { powers, relics, bus } = this.parts
    // 유물은 유물표에 켜니 칸이 차 있어도 된다 (E303-04)
    if (powers.loadout.has(id)) return
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

  /** 일반 장비 하나를 바로 낀다 (체크리스트 QA·개발 패널·장비 모음). 바탕 이름을 주면 그 모양으로. 장비 id를 돌려준다 */
  wear(part: GearPart, grade?: Grade, tier = 1, base?: string): string {
    const { powers, relics, bus } = this.parts
    const item = rollGear(Math.random, { part, ...(grade ? { grade } : {}), tier })
    if (base) item.base = base
    powers.loadout.addGear(item)
    // 줍기와 같은 길로 껴야 모습이 바뀐다 (loadoutChanged)
    relics.equip(item.uid, false)
    bus.emit('progressChanged', {})
    return item.uid
  }

  /** 일반 장비의 그림 주소 (장비 모음 `scripts/gear-sheet.mjs`) */
  gearIcon(part: GearPart, base: string, grade: Grade): string {
    return gearIcon({ part, base, grade } as GearItem)
  }

  /** 적을 그 자리에 세운다 (점검 스크립트). 없는 id면 졸개 */
  spawn(id: string, x: number, z: number): void {
    this.parts.encounter.spawn(ENEMIES[id] ?? GRUNT, { x, z }, true)
  }

  /** 낀 유물(없으면 고른 신화의 유물)의 행동을 충전 없이 바로 터뜨린다 (E18 연속 스크린숏, 개발 패널) */
  fireRelic(id?: RelicId): boolean {
    const { powers, skills } = this.parts
    const relic = id ?? (powers.manifested ? GODS[powers.manifested]?.relic : undefined)
    const effect = relic ? powers.effectOf(relic) : null
    if (!effect?.forceFire) return false
    effect.forceFire(skills)
    return true
  }

  /** 한계를 깬 무렵의 빌드 (끝없는 원정 시험, E17-07): 영웅 장비 여섯을 끼고, 고른 신화를 최고 단계로, 같은 신화권 신화를 모두 연다. 수련은 엔딩 무렵만큼(깨달음 스물, E236) */
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

  /**
   * 깊이를 바로 정한다 (점검 스크립트 `--depth`, 개발 패널). 귀환 카드 없이, 가 본 곳도 함께 올리고 이미 세운 적도 새 배율로 다시 세운다.
   * 엔딩 뒤 장치라 부르는 쪽이 먼저 엔딩 뒤로 넘긴다 (`game.reachEnding()`)
   */
  depth(level: number): void {
    const { depth, encounter } = this.parts
    const to = Math.max(1, Math.min(depth.max, Math.round(level)))
    depth.reached = Math.max(depth.reached, to)
    depth.level = to
    this.parts.applyDepth()
    encounter.resetAll()
    this.parts.bus.emit('progressChanged', {})
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

  /**
   * 신의 자리 셋을 그대로 낀다 (E302, 점검·봇). 닫힌 신은 먼저 연다. 예: `pantheon({ hand: 'thor', heart: 'odin', breath: ['loki'] })`
   * 숨 칸 수는 장 진행을 따르지 않고 준 만큼 낀다 (넷까지)
   */
  pantheon(p: { hand?: string | null; heart?: string | null; breath?: readonly string[] }): void {
    const { progress, relics } = this.parts
    for (const g of [p.hand, p.heart, ...(p.breath ?? [])]) if (g) progress.open(g)
    relics.restore({ hand: p.hand ?? null, heart: p.heart ?? null, breath: [...(p.breath ?? [])] }, true)
  }

  /** 유물 하나를 유물표에서 끄거나 장비 하나를 뺀다. (땅에 내려놓지 않고 없앤다) */
  unequip(id: string): void {
    if (isRelicId(id)) {
      this.parts.relics.unlight(id)
      return
    }
    const slot = this.parts.powers.loadout.slots.indexOf(id)
    if (slot >= 0) this.parts.relics.unequip(slot, false)
  }

  /** 가방의 장비를 칸에 끼운다. (봇이 더 좋은 장비로 바꿔 낄 때) */
  wield(id: string, slot: number): void {
    this.parts.relics.wield(id, slot)
  }

  /** 가방의 셋을 합친다 (E303, 봇·점검) */
  merge(uids: readonly string[]): boolean {
    return this.parts.relics.merge(uids) !== null
  }

  /** 칸의 장비를 가방에 넣는다. */
  stow(slot: number): void {
    this.parts.relics.stow(slot)
  }

  /** 유물을 모두 뺀다. (땅에 내려놓지 않고 없앤다) */
  unequipAll(): void {
    const { powers, relics } = this.parts
    powers.loadout.slots.forEach((id, slot) => id && relics.unequip(slot, false))
  }

  /**
   * 신의 자리 셋 (E302): 신을 열고 빈 자리에 넣는다 (곳을 가리지 않는다). 자리가 비었으면 첫 신에 몰고, 나머지는 빈 숨 칸에.
   * 숨 칸 수는 장 진행 그대로라, 넣지 못한 신은 열리기만 한다
   */
  lend(...gods: string[]): void {
    const { progress, relics } = this.parts
    for (const god of gods) {
      progress.open(god)
      if (!progress.pantheon.hand) relics.choose(god, false)
      else relics.fill(god, ['breath'])
    }
  }

  /** 지금 신화를 바로 다음 개방 단계로 올린다 (승천과 같은 길). 데모 끝 단계(3)·장 정복 상한도 넘긴다 */
  promote(): void {
    const { powers, progress, growth } = this.parts
    const god = powers.manifested
    if (!god) return
    if (progress.level(god) >= progress.levelCap) progress.uncapped = true
    growth.promote(god)
  }

  /** 수련 경험치만 준다 (깨달음 시험) */
  insight(count = 1): void {
    const { training, bus } = this.parts
    const target = insightsAt(training.xp) + count
    let need = 0
    while (insightsAt(training.xp + need) < target) need += 5
    const gained = training.gain(need)
    if (gained > 0) bus.emit('insightGained', { count: gained, unspent: training.unspent })
    bus.emit('progressChanged', {})
  }

  /**
   * 지금 목표를 한 것으로 한다 (E22, 개발 패널·점검 스크립트). 들어설 땅이면 그리로 가고, 깨우기는 조각을 차례로,
   * 귀환은 승천으로, 보스는 이긴 것으로, 벼리기는 재료를 채워 벼린다
   */
  skipGoal(): void {
    const { chapters, world, awakening, progress, expedition, expeditionSystem, chapterSystem, build } = this.parts
    const goal = chapters.goal
    if (!goal) return
    switch (goal.kind) {
      case 'enter':
        // 걸어 넘어가는 동안 기다리지 않게 들어선 것으로 먼저 적는다
        chapters.enter(goal.region)
        world.travelTo(goal.region)
        break
      case 'awaken':
        // 조각을 하나씩 (흔적 → 사냥 → 수호자) 그 할 일을 마칠 때까지
        for (let i = 0; i < 12 && chapters.goal === goal; i++) if (!awakening.skip(awakening.target(goal.region)?.god)) break
        break
      case 'return': {
        // 귀환 (E304): 떠난 지 2분이 안 됐어도 손의 신 승천(없으면 불꽃 불씨)으로 바로
        const hand = progress.pantheon.hand
        while (expedition.returns < goal.n!) {
          const ids = expeditionSystem.branches().map((b) => b.id)
          expeditionSystem.returnNow(ids.find((id) => id === `ascend:${hand}`) ?? 'flame:flame')
        }
        break
      }
      case 'boss':
        chapterSystem.bossDown(goal.region)
        break
      case 'forge': {
        const god = build.chosen
        if (!god) break
        for (let i = 0; i < goal.n! && chapters.goal === goal; i++) {
          this.fillForge(god)
          this.forge(god)
        }
        break
      }
    }
    chapterSystem.check()
  }

  /** 신을 깨우는 다음 조각을 바로 얻는다 (E238): 깨우는 신이 없으면 god(없으면 응답하는 첫 흔적)부터. 얻었으면 true */
  awaken(god?: string): boolean {
    return this.parts.awakening.skip(god)
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

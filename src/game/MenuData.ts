import { activeLayers, LAYER_NAMES } from '../build/layers'
import { WAKE, WAKE_GODS } from '../data/wake'
import { awakeningLevel } from '../data/awakening'
import { REALM_COLORS, REGIONS } from '../data/regions'
import { CONQUESTS } from '../data/chapters'
import { ENEMIES } from '../enemies/Giant'
import { CELL, cellOrigin } from '../data/world'
import { SOURCE_IDS, type SourceId } from '../data/schema'
import { DEPTH_LIMIT } from '../data/depth'
import { OATHS } from '../data/oaths'
import { nextRecipe } from '../gear/forge'
import { materialName } from '../gear/materials'
import { MYTH_RELICS, mythRelic, relicMyth, stageName } from '../gear/mythRelic'
import { GEAR } from '../gear/roll'
import { TRAINING_UNIQUES } from '../skills/uniques'
import { levelGains } from '../myth/levelGains'
import { AUTOMATION_STEPS } from '../progress/Automation'
import { BRANCHES, insightProgress, TRAINING_NODES } from '../data/training'
import { statText } from '../myth/alwaysText'
import type { StatKind } from '../data/mythAlways'
import { godDef, GODS, relicDef, type RelicId } from '../relics/data'
import type { HeroStats, MenuHost, SourcesHost } from '../ui/menu/host'
import type { RelicCardContext } from '../ui/relicCard'
import type { GameContext } from './context'
import type { Game } from './Game'
import type { RelicSystem } from './systems/Relics'

/** 정보 화면 자료가 게임에서 쓰는 것 */
export interface MenuDataParts {
  /** 게임 (시스템들은 만들어진 뒤에 읽는다) */
  readonly game: Game
  readonly ctx: GameContext
  readonly relics: RelicSystem
}

/**
 * 정보 화면에 보일 것을 게임 상태에서 모은다: 탭마다 읽을 값과 누르면 할 일(`MenuHost`),
 * 상태 탭의 능력치, 설명 카드에 넣을 지금 상태, 원천 줄.
 */
export class MenuData {
  constructor(private readonly parts: MenuDataParts) {}

  /** 정보 화면이 읽고 부르는 것 */
  host(): MenuHost {
    const { game, ctx, relics } = this.parts
    const { powers, waypoints, appearance } = game
    return {
      get slots() {
        return powers.loadout.slots
      },
      get bag() {
        return powers.loadout.bag
      },
      gearOf: (id) => powers.loadout.gear.get(id),
      slotsFor: (id) => powers.loadout.slots.map((_, i) => i).filter((i) => powers.loadout.fits(id, i)),
      get materials() {
        return powers.loadout.materials
      },
      forge: {
        here: () => ctx.map.region.kind === 'hub',
        gods: () => {
          const { loadout } = powers
          const chosen = ctx.build.chosen
          return Object.keys(GODS).filter((god) => god === chosen || game.progress.isOpen(god) || loadout.has(mythRelic(god))).sort((a, b) => Number(b === chosen) - Number(a === chosen))
        },
        next: (god) => {
          const { loadout } = powers
          const recipe = nextRecipe(loadout, god, powers.maxStage())
          if (!recipe) return null
          return {
            name: stageName(recipe.relic, recipe.stage),
            stage: recipe.stage,
            materials: recipe.materials.map(({ id, count }) => ({ name: materialName(id), have: loadout.materials.get(id) ?? 0, need: count })),
          }
        },
        make: (god) => ctx.map.region.kind === 'hub' && relics.forge(god),
      },
      get loadout() {
        return powers.state
      },
      wield: (id, slot) => relics.wield(id, slot),
      stow: (slot) => relics.stow(slot),
      drop: (slot) => relics.unequip(slot, true),
      melt: (id) => relics.melt(id) && game.menu.refresh(),
      mergeable: () => game.powers.loadout.mergeable().map((g) => g.map((i) => i.uid)),
      merge: (uids) => relics.merge(uids) && game.menu.refresh(),
      progress: game.progress,
      gods: {
        // 신의 자리는 어디서나 바꾼다 (E302, 막던 전설 판은 E305-03에서 걷음)
        canSwap: () => true,
        choose: (god) => game.chooseMyth(god),
        pantheon: () => game.pantheonView(),
        place: (part, god) => game.placeMyth(part, god),
        unplace: (god) => game.unplaceMyth(god),
        waking: () => game.wakingMyth(),
        table: () => ({
          relics: MYTH_RELICS.filter((id) => !godDef(relicMyth(id)!).hidden || powers.loadout.lit.includes(id)).map((id) => ({ id, lit: powers.loadout.lit.includes(id), awake: powers.awake(id), stage: powers.loadout.stage(id) })),
          uniques: Object.entries(GEAR.uniques).map(([id, u]) => ({ id, name: u.name, text: u.text, lit: powers.loadout.uniquesSeen.has(id) })),
        }),
      },
      cardContext: (id) => this.cardContext(id),
      stats: () => this.heroStats(),
      afterEnding: (feature) => game.ending.has(feature),
      nextConquest: () => {
        const region = CONQUESTS.find((r) => !game.chapters.bosses.has(r))
        // 엔딩 뒤에는 신 단계가 4까지 열려 장 정복의 상한이 뜻이 없다
        return region && !game.ending.has('mythStage4') ? (ENEMIES[REGIONS[region]?.boss?.enemy ?? '']?.name ?? null) : null
      },
      tabOpen: (tab) => game.tabs.has(tab),
      toTitle: () => game.toTitle(),
      openSettings: () => {
        game.menu.toggle(false)
        game.pauseMenu.show(true)
      },
      sources: {
        rows: () => this.sourceRows(),
        depth: this.depthView(),
        // 귀환이 여는 것 (E305-03, `CYCLE.md` 3.5): 엔딩 전에도 보인다. 엔딩을 봤으면 귀환 3 이상으로 친다
        automation: () => {
          const returns = game.expedition.returns
          const ending = game.ending.has('autoPickup')
          return AUTOMATION_STEPS.map((s) => ({ name: s.name, lines: s.lines, on: s.at === null ? ending : ending || returns >= s.at }))
        },
        returns: () => game.expedition.returns,
        expedition: () => {
          const e = game.expedition
          return { count: e.count, renown: e.renown, multiplier: e.multiplier, times: [...e.best], heirloomSlots: e.heirloomSlots }
        },
      },
      oaths: {
        current: () => (game.expedition.oath ? OATHS[game.expedition.oath].name : null),
        list: () => game.oathSystem.view().oaths.map((o) => ({ ...o })),
        renownScale: () => game.oaths.renownScale(),
      },
      training: {
        insights: () => ({ total: ctx.training.insights, unspent: ctx.training.unspent, ...insightProgress(ctx.training.xp) }),
        nodes: () =>
          TRAINING_NODES.map((n) => ({
            id: n.id,
            name: n.name,
            branch: n.branch,
            color: BRANCHES[n.branch].color,
            col: n.col,
            row: n.row,
            after: n.after,
            lines: [...n.stats.map((s) => statText(s.kind, s.value)), ...(TRAINING_UNIQUES[n.id] ? [`${GEAR.uniques[TRAINING_UNIQUES[n.id]!]!.name}: ${GEAR.uniques[TRAINING_UNIQUES[n.id]!]!.text}`] : [])],
            big: !!n.big,
            taken: ctx.training.taken.has(n.id),
            can: ctx.training.canTake(n.id),
          })),
        branches: () => Object.values(BRANCHES).map((b) => ({ id: b.id, name: b.name, text: b.text, color: b.color })),
        totals: () => (Object.entries(ctx.training.stats()) as [StatKind, number][]).map(([kind, value]) => statText(kind, value)),
        take: (id) => game.growth.train(id),
        reset: () => game.growth.untrain(),
      },
      endless: {
        open: () => game.endlessSystem.open,
        depth: () => ({ reached: game.depth.reached, limit: DEPTH_LIMIT }),
        canEnter: () => game.endlessSystem.canEnter,
        enter: () => game.endlessSystem.enter(),
        run: () => {
          const run = game.endlessSystem.run
          return run ? { depth: run.depth } : null
        },
        best: () => game.endless.best,
      },
      world: {
        nodes: () => {
          // 세계 칸 자리 그대로 (E19-05): 칸 한 변이 1, 북쪽(다음 줄)이 위
          return Object.values(game.regions).map((r) => ({
            id: r.id,
            name: r.name,
            color: `#${(r.realm ? REALM_COLORS[r.realm] : REALM_COLORS.hub).toString(16).padStart(6, '0')}`,
            zone: r.zone,
            x: r.cell ? cellOrigin(r.cell).x / CELL : 0,
            y: r.cell ? cellOrigin(r.cell).z / CELL : 0,
            size: (r.halfExtent * 2) / CELL,
            links: r.exits.map((e) => e.to),
            here: r.id === ctx.map.region.id,
            found: r.kind === 'hub' || waypoints.has(r.id),
            beaten: ctx.chapters.bosses.has(r.id),
            locked: !ctx.chapters.isOpen(r.id),
          }))
        },
        goal: () => {
          const goal = ctx.chapters.goal
          if (!goal) return null
          // 신 깨우기 (E238): 깨우는 신의 다음 조각을 하는 땅(없으면 응답하는 흔적의 땅)과 그 조각의 한 줄
          if (goal.kind === 'awaken') {
            const target = game.awakening.target(goal.region)
            return { region: target?.region ?? goal.region, text: game.chapterSystem.goalView()?.text ?? goal.goal }
          }
          return { region: goal.region, text: goal.goal }
        },
        traces: () =>
          WAKE_GODS.filter((g) => game.awakening.traceState(g) !== 'awake').map((g) => ({
            region: WAKE[g]!.trace.region,
            name: WAKE[g]!.trace.name,
            color: godDef(g).color,
            // 응답하는 흔적은 채운 마름모, 깨우는 중·아직 잠잠한 흔적은 테만
            waking: game.awakening.traceState(g) !== 'open',
          })),
        me: () => {
          const cell = ctx.map.region.cell
          if (!cell) return null
          const o = cellOrigin(cell)
          const p = ctx.hero.object.position
          return { x: (o.x + p.x) / CELL, y: (o.z + p.z) / CELL }
        },
        warp: (id) => game.warpTo(id),
      },
      wardrobe: {
        wardrobe: game.wardrobe,
        get autoOutfit() {
          return appearance.auto
        },
        choose: (slot, choice) => appearance.choose(slot, choice),
      },
    }
  }

  /** 정보 화면 상태 탭에 넣을 지금의 능력치와 걸린 힘 */
  heroStats(): HeroStats {
    const { game, ctx } = this.parts
    const build = ctx.build.state
    const mods = build.modifiers
    const { manifested } = game.powers.state
    const powers: HeroStats['powers'] = []
    if (manifested) {
      const god = godDef(manifested)
      // 지금 레벨까지 열린 힘 (승급 카드와 같은 문구에서 고른다)
      const level = game.progress.level(manifested)
      const what = levelGains(manifested, 1)
        .filter((g) => g.kind !== 'hp')
        .map((g) => g.text)
      for (let lv = 2; lv <= level; lv++) for (const g of levelGains(manifested, lv)) if (g.kind === 'power') what.push(g.text)
      what.push(`궁극기 「${god.ultimate.name}」`)
      powers.push({ kind: 'god', name: god.name, color: god.color, label: game.progress.title(manifested), what: what.join(' · ') })
    }
    for (const id of game.powers.loadout.relics) {
      if (!id) continue
      const def = relicDef(id)
      // 잠든 유물은 기본 수치만 (E21-04)
      if (game.powers.awake(id)) powers.push({ kind: 'relic', name: id, color: godDef(def.god).color, label: def.name, what: def.passive.description })
    }
    return {
      hp: game.combat.health.hp,
      maxHp: game.combat.health.max,
      damage: build.damageScale,
      damageTaken: mods.damageTaken,
      moveSpeed: mods.moveSpeed,
      knockbackDealt: mods.knockbackDealt,
      knockbackTaken: mods.knockbackTaken,
      heartGauge: game.combat.heartGauge,
      promotions: game.progress.promotions,
      collected: build.collected,
      lit: build.lit,
      layers: activeLayers(build.layers).map((l) => ({ name: LAYER_NAMES[l.id], text: l.kind === 'mul' ? `×${l.value.toFixed(2)}` : `${l.value > 0 ? '+' : '−'}${Math.round(Math.abs(l.value) * 100)}%` })),
      powers,
    }
  }

  /** 설명 카드에 넣을 지금 상태: 자리, 충전, 세트, 신화 강화 조건 */
  cardContext(id: RelicId): RelicCardContext {
    const { game, ctx } = this.parts
    const { loadout } = game.powers
    const effect = game.powers.effectOf(id)
    const manifested = ctx.build.chosen
    return {
      place: loadout.lit.includes(id) ? { kind: 'lit' } : { kind: 'ground' },
      ...(effect ? { charge: effect.charge } : {}),
      equipped: loadout.relics,
      owned: new Set(loadout.ownedRelics),
      awake: game.powers.awake(id),
      manifested,
      level: manifested ? game.progress.level(manifested) : 0,
      stage: loadout.stage(id),
    }
  }

  /** 원천마다: 장비의 합과 각성 단계 (HUD·정보 화면) */
  sourceRows(): { id: SourceId; total: number; level: number; flames: number }[] {
    const { build, expedition } = this.parts.ctx
    const state = build.state
    // 원천 불씨 (E304): 귀환 갈래로 쌓은 영구 몫 (합에 이미 들어 있다)
    const flames = expedition.flamePoints()
    return SOURCE_IDS.map((id) => ({ id, total: state.sources[id], level: awakeningLevel(state.sources[id]), flames: flames[id] }))
  }

  /** 정보 화면에 보일 깊이 (읽을 때마다 지금 값) */
  private depthView(): SourcesHost['depth'] {
    const depth = this.parts.game.depth
    return {
      get level() {
        return depth.level
      },
      get reached() {
        return depth.reached
      },
      get limitBroken() {
        return depth.limitBroken
      },
    }
  }
}

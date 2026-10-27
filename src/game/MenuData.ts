import { alwaysStage } from '../build/BuildState'
import { awakeningLevel } from '../data/awakening'
import type { GearPart } from '../data/gearData'
import { blessingDef, STARS } from '../data/rift'
import { REALM_COLORS, worldLayout } from '../data/regions'
import { SOURCE_IDS, type SourceId } from '../data/schema'
import { LIMIT_REALMS, REALM_NAMES } from '../data/threat'
import { TRIAL_IDS, TRIAL_MILESTONES, type TrialId, TRIALS } from '../data/trials'
import { baseCandidates, nextRecipe } from '../gear/forge'
import { materialName, mythMaterial } from '../gear/materials'
import { mythRelic, stageName } from '../gear/mythRelic'
import { GEAR, gearName } from '../gear/roll'
import { levelGains } from '../myth/levelGains'
import { CONVENIENCES } from '../progress/Conveniences'
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
    const { powers, conveniences, bus, appearance } = game
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
          return Object.keys(GODS).filter((god) => god === chosen || game.progress.isOpen(god) || loadout.has(mythRelic(god)) || (loadout.materials.get(mythMaterial(god) ?? '') ?? 0) > 0).sort((a, b) => Number(b === chosen) - Number(a === chosen))
        },
        next: (god) => {
          const { loadout } = powers
          const recipe = nextRecipe(loadout, god)
          if (!recipe) return null
          return {
            name: stageName(recipe.relic, recipe.stage),
            stage: recipe.stage,
            materials: recipe.materials.map(({ id, count }) => ({ name: materialName(id), have: loadout.materials.get(id) ?? 0, need: count })),
            ...(recipe.base ? { base: this.forgeBase(recipe.base) } : {}),
          }
        },
        make: (god) => ctx.map.region.kind === 'hub' && relics.forge(god),
      },
      get loadout() {
        return powers.state
      },
      preview: (slot, id) => powers.loadout.preview(slot, id),
      wield: (id, slot) => relics.wield(id, slot),
      stow: (slot) => relics.stow(slot),
      drop: (slot) => relics.unequip(slot, true),
      salvage: (id) => relics.salvage(id) && game.menu.refresh(),
      progress: game.progress,
      myths: {
        canChoose: () => game.canChooseMyth,
        choose: (god) => game.chooseMyth(god),
        stage: (god) => alwaysStage(game.progress.level(god), powers.loadout.relics.some((id) => id !== null && relicDef(id).god === god), game.rift.lit.has(god)),
      },
      cardContext: (id, preview) => this.cardContext(id, preview),
      stats: () => this.heroStats(),
      toTitle: () => game.toTitle(),
      openSettings: () => {
        game.menu.toggle(false)
        game.pauseMenu.show(true)
      },
      sources: {
        rows: () => this.sourceRows(),
        threat: this.threatView(),
        here: () => game.threatSystem.here,
        choose: (level) => game.threatSystem.choose(level),
        advance: (source) => game.threatSystem.advance(source),
        conveniences: () => CONVENIENCES.map((c) => ({ id: c.id, name: c.name, text: c.text, open: conveniences.has(c.id), have: conveniences.counters[c.counter] ?? 0, need: c.need })),
        get autoSalvage() {
          return conveniences.autoSalvage
        },
        set autoSalvage(on: boolean) {
          conveniences.autoSalvage = on
          // 바꾼 설정도 저장한다
          bus.emit('progressChanged', {})
        },
        warps: () => {
          if (!conveniences.has('warp')) return []
          return Object.values(game.regions)
            .filter((r) => r.id !== ctx.map.region.id && (r.kind === 'hub' || conveniences.visited.has(r.id)))
            .map((r) => ({ id: r.id, name: r.name }))
        },
        warp: (id) => game.warpTo(id),
      },
      trials: {
        open: () => game.trialSystem.open,
        blocked: () => game.trialSystem.blocked(),
        list: () =>
          TRIAL_IDS.map((id) => {
            const def = TRIALS[id]
            const per = def.reward.per < 1 ? `+${Math.round(def.reward.per * 100)}%` : `+${def.reward.per}`
            return { id, name: def.name, rule: def.rule, reward: def.reward.text, per, cleared: game.trials.cleared[id] ?? 0, best: [1, 2, 3, 4, 5].map((n) => game.trials.best[`${id}:${n}`] ?? null) }
          }),
        total: () => game.trials.total,
        milestones: () => [...TRIAL_MILESTONES],
        riftScale: () => game.trials.riftScale(),
        start: (id, level) => game.trialSystem.start(id as TrialId, level),
      },
      rift: {
        open: () => game.riftSystem.open,
        progress: () => LIMIT_REALMS.map((realm) => ({ name: REALM_NAMES[realm] ?? realm, cleared: game.threat.cleared[realm] ?? 0 })),
        canEnter: () => game.riftSystem.canEnter,
        enter: () => game.riftSystem.enter(),
        run: () => {
          const run = game.riftSystem.run
          return run ? { depth: run.depth, blessings: run.blessings.map((id) => blessingDef(id)?.name ?? id) } : null
        },
        best: () => game.rift.best,
        stars: () => game.rift.stars,
        scale: () => game.trials.riftScale(),
        chart: () => {
          const isOpen = (god: string) => game.progress.isOpen(god)
          return Object.values(STARS).map((star) => ({
            god: star.god,
            name: godDef(star.god).name,
            color: godDef(star.god).color,
            x: star.x,
            y: star.y,
            neighbors: star.neighbors,
            lit: game.rift.lit.has(star.god),
            can: game.rift.canLight(star.god, isOpen),
          }))
        },
        light: (god) => {
          const ok = game.rift.light(god, (g) => game.progress.isOpen(g))
          if (ok) bus.emit('progressChanged', {})
          return ok
        },
      },
      world: {
        nodes: () => {
          const layout = worldLayout(game.regions)
          return Object.values(game.regions).map((r) => ({
            id: r.id,
            name: r.name,
            color: `#${(r.realm ? REALM_COLORS[r.realm] : REALM_COLORS.hub).toString(16).padStart(6, '0')}`,
            zone: r.zone,
            x: layout[r.id]?.x ?? 0,
            y: layout[r.id]?.y ?? 0,
            links: r.exits.map((e) => e.to),
            here: r.id === ctx.map.region.id,
            found: r.kind === 'hub' || conveniences.visited.has(r.id),
            cleared: r.realm ? (game.threat.cleared[r.realm] ?? 0) : 0,
          }))
        },
        canWarp: () => conveniences.has('warp'),
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
    const { manifested, blessings } = game.powers.state
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
    for (const g of blessings) {
      const god = godDef(g)
      powers.push({ kind: 'god', name: god.name, color: god.color, label: `${god.name}의 가호`, what: '유물의 힘만 쓴다' })
    }
    for (const id of game.powers.loadout.relics) {
      if (!id) continue
      const def = relicDef(id)
      powers.push({ kind: 'relic', name: id, color: godDef(def.god).color, label: def.name, what: def.passive.description })
    }
    return {
      hp: game.combat.health.hp,
      maxHp: game.combat.health.max,
      damage: build.damageScale,
      damageTaken: mods.damageTaken,
      moveSpeed: mods.moveSpeed,
      knockbackDealt: mods.knockbackDealt,
      knockbackTaken: mods.knockbackTaken,
      divine: game.combat.divine,
      promotions: game.progress.promotions,
      powers,
    }
  }

  /** 설명 카드에 넣을 지금 상태: 자리, 충전, 세트, 신화 강화 조건 */
  cardContext(id: RelicId, preview?: RelicCardContext['preview']): RelicCardContext {
    const { game, ctx } = this.parts
    const { loadout } = game.powers
    const slot = loadout.slots.indexOf(id)
    const manifested = ctx.build.chosen
    return {
      place: slot >= 0 ? { kind: 'slot', slot } : loadout.bag.includes(id) ? { kind: 'bag' } : { kind: 'ground' },
      ...(slot >= 0 ? { charge: game.powers.effects[slot]?.charge ?? 0 } : {}),
      equipped: loadout.relics,
      owned: new Set(loadout.ownedRelics),
      manifested,
      level: manifested ? game.progress.level(manifested) : 0,
      ...(preview ? { preview } : {}),
    }
  }

  /** 원천마다: 장비의 합, 원천 숙련, 합계, 각성 단계 (HUD·정보 화면) */
  sourceRows(): { id: SourceId; gear: number; mastery: number; total: number; level: number }[] {
    const { game, ctx } = this.parts
    const state = ctx.build.state
    return SOURCE_IDS.map((id) => {
      const mastery = game.threat.mastery[id]
      const total = state.sources[id]
      return { id, gear: total - mastery, mastery, total, level: awakeningLevel(total) }
    })
  }

  /** 정보 화면에 보일 위협 단계 (읽을 때마다 지금 값) */
  private threatView(): SourcesHost['threat'] {
    const { game } = this.parts
    const threat = game.threat
    return {
      get level() {
        return threat.level
      },
      get unlocked() {
        return threat.unlocked
      },
      get reached() {
        return threat.reached
      },
      get battle() {
        return threat.battle
      },
      get pour() {
        return threat.pour
      },
      get resonance() {
        return threat.resonance
      },
      get max() {
        return threat.max
      },
    }
  }

  /** 대장간 처음 제작의 바탕: 쓰일 장비 이름 (가방 것부터). 없으면 부위만 (E13-05) */
  private forgeBase(part: GearPart): { part: string; ok: boolean; item?: string } {
    const { game } = this.parts
    const { loadout } = game.powers
    const uid = baseCandidates(loadout, part)[0]
    const item = uid ? loadout.gear.get(uid) : undefined
    return { part: GEAR.parts[part].name, ok: !!item, ...(item ? { item: gearName(item) } : {}) }
  }
}

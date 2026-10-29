import { THREAT, threatGrades } from '../../data/threat'
import type { Giant } from '../../enemies/Giant'
import { ELITE_REWARD } from '../../enemies/elite'
import { isBossLike } from '../../enemies/grade'
import { MATERIALS, materialName, rollMaterials } from '../../gear/materials'
import { GEAR, landChances, landTier, rollGear } from '../../gear/roll'
import { masteryShares, PER_PROMOTION } from '../../myth/ClassProgress'
import { collectionText } from '../../myth/alwaysText'
import { levelGains } from '../../myth/levelGains'
import { classIcon } from '../../ui/classIcons'
import { realmSigil } from '../../ui/sigils'
import { realmInk } from '../../art/palette'
import { type God, godDef, GODS, isRelicId, type RelicId } from '../../relics/data'
import type { LegendKind } from '../../data/classKit'
import type { LegendHost } from '../Legend'
import { TRIAL_MILESTONES } from '../../data/trials'
import type { GameContext } from '../context'
import { godMoment } from './godMoments'

export { BASE_HP } from '../../build/BuildState'
/** 적을 쓰러뜨렸을 때 되찾는 생명력 */
const HEAL_PER_KILL = 4
const HEAL_PER_BOSS = 30

/**
 * 성장: 처치 경험치, 생명력 회복, 유물 드랍, 승급 전설과 승급, 승급 횟수에서 나오는 기본 능력치.
 */
export class ProgressionSystem {
  /** 지금 승급 전설에 도전하는 신 */
  private challenger: God | null = null

  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('giantKilled', ({ giant }) => this.onGiantKilled(giant))
    ctx.bus.on('mythOpened', ({ god, quiet }) => !quiet && this.announceOpened(god))
  }

  /** 지금 이 지역 성소에서 열 수 있는 승급 전설 (없으면 null) */
  readyKind(): LegendKind | null {
    const { build, progress } = this.ctx
    const god = build.chosen
    const legend = god ? godDef(god).legend : undefined
    if (!god || !legend || !progress.readyToPromote(god)) return null
    // 엔딩 뒤에는 지역 성소가 그 신화권 클래스의 전설만 연다 (E7-07). 시련 마일스톤 「열린 성소」면 어디서나 (E16).
    // 데모(엔딩 전)에서는 장 흐름이 정한 성소(요툰헤임·델포이)에서 고른 신화의 전설을 연다 (E22)
    const realm = this.ctx.map.region.realm
    if (this.ctx.ending.reached && realm && godDef(god).realm !== realm && !this.ctx.trials.has(TRIAL_MILESTONES[1].at)) return null
    return legend.kind
  }

  /** 성소가 열려 있다 (지도에 깜빡임) */
  get sanctuaryOpen(): boolean {
    return this.readyKind() !== null
  }

  /** 시련 (E16): 진행 중이면 전설의 시작·이김·짐을 시련이 받는다 */
  trial: { active: boolean; onStart(): void; onWin(): void; onFail(): void } | null = null

  /** 승급 전설: 성소에 들어서면 시작하고, 이기면 승급한다. */
  update(dt: number): void {
    const { legend, encounter } = this.ctx
    legend.update(dt, encounter, this.legendHost())
  }

  /** 전설이 게임에 알리는 일 (시련도 같은 것을 쓴다) */
  legendHost(): LegendHost {
    const { build, combat, hero, hud, view, bus } = this.ctx
    return {
      ready: () => {
        const god = build.chosen
        const kind = this.readyKind()
        // 도전하는 신화는 전설이 쉬는 동안에만 정한다 (진행 중에 바뀌어도 시작한 신화가 승급한다)
        if (god && kind && !this.ctx.legend.active) this.challenger = god
        return kind
      },
      heroAlive: () => combat.alive,
      heroPosition: () => hero.object.position,
      setArena: (arena) => {
        hero.arena = arena
      },
      onStart: () => {
        bus.emit('legendStarted', {})
        if (this.trial?.active) return this.trial.onStart()
        const def = godDef(this.challenger!)
        const ink = realmInk(def.realm)
        hud.showTitleCard(def.legend!.name, def.color, realmSigil(def.realm, ink.light, ink.dark), '전설')
        view.shake(0.3)
      },
      onWin: () => {
        if (this.trial?.active) this.trial.onWin()
        else if (this.challenger) this.promote(this.challenger)
      },
      onFail: () => {
        bus.emit('legendFailed', {})
        if (this.trial?.active) this.trial.onFail()
      },
    }
  }

  /** 신화 숙련과 유물 드랍. 숙련은 그 몬스터 신화권의 신들에게 나눠 쌓인다. (DESIGN.md 5.2, E12-02) */
  private onGiantKilled(giant: Giant): void {
    const { powers, combat, drops, pickups } = this.ctx
    this.gainMastery(giant.spec.xp * (giant.elite ? ELITE_REWARD.xp : 1), giant.spec.realm)
    // 적을 쓰러뜨리면 생명력을 조금 되찾는다. 몰려오는 무리를 쓸어 내며 버틸 수 있게 한다.
    if (combat.alive) combat.heal((isBossLike(giant.spec) || giant.spec.boss ? HEAL_PER_BOSS : HEAL_PER_KILL) + this.ctx.build.state.stats.healOnKill)
    const owned = new Set<RelicId>([
      ...powers.loadout.ownedRelics,
      // 재료가 된 유물만 (새 재료는 유물이 아니다)
      ...[...powers.loadout.materials.keys()].filter((id) => isRelicId(id)),
      ...pickups.list.map((p) => p.id).filter((id) => isRelicId(id)),
    ])
    // 유물은 엔딩 뒤에만 떨어진다 (E21-04: 데모의 유물은 장 보스 재료로 벼린다)
    // 정예는 유물을 한 번 더 굴린다. 수치(도깨비)는 그 확률만큼 한 번 더
    const rolls = !this.ctx.ending.has('relicDrops') ? 0 : (giant.elite ? ELITE_REWARD.dropRolls : 1) + (Math.random() < this.ctx.build.state.stats.dropChance ? 1 : 0)
    for (let i = 0; i < rolls; i++) {
      const relic = drops.roll(owned, giant.spec.boss)
      if (!relic) continue
      pickups.drop(relic, giant.x, giant.z)
      break
    }
    // 재료 (E13-04): 잡는 순간 주머니로. 신화 고유·보스 재료만 알린다
    const level = this.ctx.threat.level
    for (const { id, count } of rollMaterials(Math.random, { realm: giant.spec.realm, elite: !!giant.elite, boss: giant.spec.boss })) {
      // 위협 단계가 높을수록 하나 더 (E14-03)
      powers.loadout.addMaterial(id, count + (Math.random() < THREAT.material * (level - 1) ? 1 : 0))
      // 보스 재료만 알린다: 유물을 벼리는 열쇠
      if (MATERIALS[id]?.kind === 'boss') this.ctx.bus.emit('moment', { id: 'bossMaterial', text: `${materialName(id)} · 대장간에서 유물을 벼린다` })
    }
    // 일반 장비 (E13-02): 졸개 6%, 정예 25%, 지역 보스는 반드시 (희귀 이상).
    // 땅 자리마다 드랍 표가 다르고, 단계는 그 땅의 단계 (E21-03): 장 흐름의 땅은 장의 단계, 그 밖은 신화권 단계 (E22)
    const boss = giant.spec.boss !== undefined
    const { region } = this.ctx.map
    const land = region.zone ? GEAR.lands[region.zone] : null
    const chance = (boss ? GEAR.drop.boss : giant.elite ? GEAR.drop.elite : GEAR.drop.grunt) * (land?.rate ?? 1) * THREAT.gearDrop ** (level - 1)
    if (Math.random() < chance) {
      const chances = threatGrades(landChances(region.zone), level)
      const tier = this.ctx.chapters.tier(region.id) ?? landTier(region.realm ?? giant.spec.realm)
      const item = rollGear(Math.random, boss ? { minGrade: GEAR.drop.bossMinGrade, chances, tier } : { chances, tier })
      pickups.drop(item.uid, giant.x + 0.7, giant.z + 0.4, true, item)
    }
  }

  /**
   * 경험치를 쌓는다: 신화 경험치는 고른 신화만, 고른 신화가 없으면 그 신화권 신들에게 (첫 신화를 연다). 문턱을 넘은 신화는 열린다.
   * 같은 경험치가 수련에도 쌓여 문턱마다 깨달음 한 점 (E236)
   */
  gainMastery(amount: number, realm: string | undefined): void {
    const { build, progress, training, bus } = this.ctx
    // 경험치 얻는 양 (오딘, 수련 「배움」)
    amount *= 1 + build.state.stats.masteryGain
    for (const [god, share] of masteryShares(amount, realm, build.chosen, Object.values(GODS), build.borrowed)) {
      if (progress.addXp(god, share) === 'opened') bus.emit('mythOpened', { god })
    }
    const count = training.gain(amount)
    if (count > 0) bus.emit('insightGained', { count, unspent: training.unspent })
    bus.emit('progressChanged', {})
  }

  /** 신화가 처음 열렸다 (경험치 문턱 또는 유물): 칭호 카드 (고르지 않아도 수집 보너스가 붙는다) */
  private announceOpened(god: God): void {
    const { bus, progress } = this.ctx
    // 처음 연 신화를 바로 골랐거나 빌린 칸에 넣었으면 그쪽(고른 신화 장면·빌린 힘 카드)이 대신 알린다 (RelicSystem이 먼저 듣는다)
    if (progress.chosen.includes(god)) return
    const def = godDef(god)
    const lines = [`${def.name}의 힘이 깨어났다`, '마을이나 성소에서 신위 칸에 넣는다', `수집 보너스: ${collectionText()}`]
    bus.emit('moment', { id: 'mythOpened', card: { kind: '신화 개방', title: def.titles[0], color: def.color, icon: classIcon(def.name), lines } })
  }

  /** 승급: 칭호가 바뀌고, 스킬이 강해지고, 원천 숙련과 기본 능력치가 오른다. */
  promote(god: God): void {
    const { progress, combat, hero, fx, view, feel, bus } = this.ctx
    const hpBefore = this.ctx.build.state.maxHp
    const dmgBefore = PER_PROMOTION.damage ** progress.promotions
    if (!progress.promote(god)) return
    bus.emit('promoted', { god, title: progress.title(god) })
    bus.emit('progressChanged', {})
    this.applyStats()
    combat.health.reset()
    const p = hero.object.position
    // 무엇이 얼마나 강해졌는지: 기본 능력치는 전→후, 그 단계에서 새로 생긴 힘은 한 줄씩
    const hpAfter = this.ctx.build.state.maxHp
    const dmgAfter = PER_PROMOTION.damage ** progress.promotions
    const level = progress.level(god)
    const lines = [
      `최대 생명 ${hpBefore} → ${hpAfter}`,
      `모든 피해 ×${dmgBefore.toFixed(2)} → ×${dmgAfter.toFixed(2)}`,
      ...levelGains(god, level).filter((g) => g.kind !== 'hp' && g.kind !== 'damage').map((g) => g.text),
    ]
    // 큰 카드 (E23-03): 그 신의 색으로 번쩍임·하늘 기둥·북소리
    const def = godDef(god)
    bus.emit('moment', { id: 'mythLevel', card: { kind: `개방 단계 · ${level}단계`, title: progress.title(god), color: def.color, icon: classIcon(def.name), lines } })
    // 신마다 다른 승급 순간: 레벨이 오를수록 크고 많다
    godMoment(this.ctx, god, level)
    fx.puffs.burst(p, 40, 5)
    view.shake(0.6)
    feel.stop(0.2)
  }

  /** 수련 마디를 찍는다 (E236): 수치는 빌드 상태로 바로 붙고, 최대 생명도 다시 맞춘다 */
  train(id: string): boolean {
    if (!this.ctx.training.take(id)) return false
    this.applyStats()
    this.ctx.bus.emit('progressChanged', {})
    return true
  }

  /** 수련 마디를 모두 되돌린다 (언제든 무료) */
  untrain(): number {
    const n = this.ctx.training.reset()
    if (n === 0) return 0
    this.applyStats()
    this.ctx.bus.emit('progressChanged', {})
    return n
  }

  /** 총 승급 횟수에서 나오는 기본 능력치 (DESIGN.md 6.2) */
  applyStats(): void {
    this.ctx.combat.health.setMax(this.ctx.build.state.maxHp)
  }

  /** 클래스 성장(레벨·경험치)을 처음으로 되돌린다. */
  reset(): void {
    this.ctx.progress.records.clear()
    this.ctx.progress.chosen = []
    this.ctx.powers.choose(null)
    this.applyStats()
    this.ctx.combat.health.reset()
    this.ctx.bus.emit('progressChanged', {})
  }
}

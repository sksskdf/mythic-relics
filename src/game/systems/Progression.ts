import { NEW_FIRE } from '../../data/cycle'
import { THREAT, threatGrades } from '../../data/threat'
import type { Giant } from '../../enemies/Giant'
import { ELITE_REWARD } from '../../enemies/elite'
import { isBossLike } from '../../enemies/grade'
import { MATERIALS, materialName, rollMaterials } from '../../gear/materials'
import { GEAR, landChances, landTier, rollGear } from '../../gear/roll'
import { PER_PROMOTION } from '../../myth/ClassProgress'
import { emptyPantheon, inPantheon } from '../../myth/pantheon'
import { collectionText } from '../../myth/alwaysText'
import { levelGains } from '../../myth/levelGains'
import { classIcon } from '../../ui/classIcons'
import { type God, godDef, isRelicId, type RelicId } from '../../relics/data'
import type { GameContext } from '../context'
import { godMoment } from './godMoments'

export { BASE_HP } from '../../build/BuildState'
/** 적을 쓰러뜨렸을 때 되찾는 생명력 */
const HEAL_PER_KILL = 4
const HEAL_PER_BOSS = 30

/**
 * 성장: 처치 경험치(수련·기세), 생명력 회복, 유물 드랍, 승급(귀환의 승천), 승급 횟수에서 나오는 기본 능력치.
 * 신화 경험치와 성소 전설로 단계를 올리던 길은 E305-03에서 걷었다 (단계는 귀환 갈래 「승천」으로만).
 */
export class ProgressionSystem {
  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('giantKilled', ({ giant }) => this.onGiantKilled(giant))
    ctx.bus.on('mythOpened', ({ god, quiet }) => !quiet && this.announceOpened(god))
  }

  /** 처치 경험치(수련·기세)와 드랍 (DESIGN.md 5.2, E12-02 → E305-03: 신화 경험치는 없앰) */
  private onGiantKilled(giant: Giant): void {
    const { powers, combat, drops, pickups } = this.ctx
    this.gainXp(giant.spec.xp * (giant.elite ? ELITE_REWARD.xp : 1))
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
    // 새 불길 (E304): 다시 떠난 뒤 잠시 장비가 더 떨어진다
    const fire = this.ctx.expedition.fire > 0 ? NEW_FIRE.drop : 1
    const chance = (boss ? GEAR.drop.boss : giant.elite ? GEAR.drop.elite : GEAR.drop.grunt) * (land?.rate ?? 1) * THREAT.gearDrop ** (level - 1) * fire
    if (Math.random() < chance) {
      const chances = threatGrades(landChances(region.zone), level)
      const tier = this.ctx.chapters.tier(region.id) ?? landTier(region.realm ?? giant.spec.realm)
      const item = rollGear(Math.random, boss ? { minGrade: GEAR.drop.bossMinGrade, chances, tier } : { chances, tier })
      pickups.drop(item.uid, giant.x + 0.7, giant.z + 0.4, true, item)
    }
  }

  /**
   * 경험치를 쌓는다: 수련(기세)에 쌓여 문턱마다 깨달음 한 점 (E236). 신화 경험치는 E305-03에서 없앴다 (신은 조각 셋으로 열고 승천으로 올린다)
   */
  gainXp(amount: number): void {
    const { build, training, bus } = this.ctx
    // 경험치 얻는 양 (오딘, 수련 「배움」)
    amount *= 1 + build.state.stats.masteryGain
    const count = training.gain(amount)
    if (count > 0) bus.emit('insightGained', { count, unspent: training.unspent })
    bus.emit('progressChanged', {})
  }

  /** 신화가 처음 열렸다 (신이 깨어남·엔딩 뒤 유물): 칭호 카드 (고르지 않아도 최대 생명이 붙는다) */
  private announceOpened(god: God): void {
    const { bus, progress } = this.ctx
    // 처음 연 신화를 바로 골랐거나 빌린 칸에 넣었으면 그쪽(고른 신화 장면·빌린 힘 카드)이 대신 알린다 (RelicSystem이 먼저 듣는다)
    if (inPantheon(progress.pantheon, god)) return
    const def = godDef(god)
    const lines = [`${def.name}의 힘이 깨어났다`, '신 탭에서 손·심장·숨 자리에 낀다', `열린 신화: ${collectionText()}`]
    bus.emit('moment', { id: 'mythOpened', card: { kind: '신화 개방', title: def.titles[0], color: def.color, icon: classIcon(def.name), lines } })
  }

  /** 승급 (귀환의 승천·개발 지름길): 칭호가 바뀌고, 스킬이 강해지고, 기본 능력치가 오른다. 상한이면 그대로 */
  promote(god: God): void {
    const { progress, combat, hero, fx, view, feel, bus } = this.ctx
    const hpBefore = this.ctx.build.state.maxHp
    const dmgBefore = PER_PROMOTION.damage ** progress.promotions
    if (!progress.ascend(god)) return
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
    this.ctx.progress.pantheon = emptyPantheon()
    this.ctx.powers.setPantheon(emptyPantheon())
    this.applyStats()
    this.ctx.combat.health.reset()
    this.ctx.bus.emit('progressChanged', {})
  }
}

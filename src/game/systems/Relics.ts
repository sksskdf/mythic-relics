import { AUTO_PICKUP_RADIUS } from '../../progress/Conveniences'
import * as THREE from 'three'

import { type God, godDef, isRelicId, relicDef, type RelicId } from '../../relics/data'
import { effectScale, isMythRelic, relicMyth, relicStats, relicTier, stageName } from '../../gear/mythRelic'
import { statText } from '../../myth/alwaysText'
import { materialName } from '../../gear/materials'
import { type GearItem, gearName } from '../../gear/roll'
import { levelGains } from '../../myth/levelGains'
import { classIcon } from '../../ui/classIcons'
import type { GameContext } from '../context'
import type { LoadoutChange } from '../RelicPowers'
import { godMoment } from './godMoments'

/** 클래스가 발현되는 순간 주변 적을 밀어내는 범위와 피해 */
const MANIFEST_RADIUS = 4
const MANIFEST_DAMAGE = 20
/** 신화를 고를 때 터지는 충격의 대기 시간 (초): 번갈아 골라 공짜 피해를 쌓지 못하게 */
const MANIFEST_BURST_COOLDOWN = 10

/**
 * 유물: 땅의 유물 줍기, 장착·해제와 발현 연출, 유물 효과와 궁극기, 지속 효과 수치 적용.
 */
export class RelicSystem {
  /** 로키의 환영 분신. 거인은 가까이 있으면 주인공 대신 이것을 쫓는다. */
  decoy: { x: number; z: number; radius: number } | null = null
  private readonly lastWalk = new THREE.Vector2()
  /** 신화를 고를 때 터지는 충격을 다시 쓸 수 있을 때까지 (초) */
  private burstCooldown = 0

  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('targetKilled', ({ target }) => {
      ctx.powers.onKill(target, ctx.skills)
      ctx.powers.classPassives.onKill(target, ctx.skills)
    })
    ctx.bus.on('heroRevived', () => {
      this.decoy = null
    })
    // 처음 열린 신화: 고른 신화가 없으면 바로 고른다 (E12-04)
    ctx.bus.on('mythOpened', ({ god }) => {
      if (!ctx.progress.chosen.length) this.choose(god, true)
    })
  }

  /**
   * 신화를 고른다 (E12-04): 궁극기·패시브·표식·공격 모션이 이 신화를 따른다.
   * 열린 신화만 고를 수 있다. 마을·성소에서만 바꾸는 규칙은 부르는 쪽(정보 화면)이 지킨다.
   */
  choose(god: God, announce: boolean): boolean {
    const { progress, powers, bus } = this.ctx
    if (!progress.isOpen(god)) return false
    progress.chosen = [god]
    const change = powers.choose(god)
    bus.emit('progressChanged', {})
    this.changed(change, announce)
    return true
  }

  /**
   * 유물을 손에 넣었다: 그 신의 신화가 아직 닫혀 있으면 1단계로 연다 (E12-04, 첫 신화는 유물 하나로).
   * 히든 신화는 그 신 유물을 발현 수만큼 모아야 열린다.
   */
  private unlock(id: RelicId, announce: boolean): void {
    const { progress, bus } = this.ctx
    // 신화의 유물(E13-03)을 손에 넣으면 그 신화가 열린다. 히든 신화도 그 유물이 열쇠다
    const myth = relicMyth(id)
    if (!myth) return
    for (const god of [myth]) {
      if (!progress.open(god)) continue
      bus.emit('progressChanged', {})
      if (announce) bus.emit('mythOpened', { god })
      else if (!progress.chosen.length) this.choose(god, false)
    }
  }

  /**
   * 대장간 (E13-05): 그 신화의 유물을 만들거나 다음 단계로 올린다. 처음 만들면 그 신화가 열린다.
   * 마을에서만 하는 규칙은 부르는 쪽(정보 화면)이 지킨다.
   */
  forge(god: God): boolean {
    const { powers, hud, fx, hero, view, bus } = this.ctx
    const made = powers.forge(god)
    if (!made) return false
    const def = godDef(god)
    const name = stageName(made.relic, made.stage)
    bus.emit('forged', { relic: made.relic, stage: made.stage })
    if (made.stage === 1) this.unlock(made.relic, true)
    this.changed(made.change, true, made.relic)
    // 새 단계의 기본 수치와, 그 신화를 골랐을 때 효과 배율 (E21-04)
    const lines = [
      made.stage === 1 ? '대장간에서 처음 벼렸다' : `${made.stage}단계 · ${relicTier(made.relic, made.stage)}단계 장비만큼`,
      ...relicStats(made.relic, made.stage).map((s) => statText(s.kind, s.value)),
      `유물 효과 피해 ×${effectScale(made.relic, made.stage, null)} (${def.name}의 신화로 ×${effectScale(made.relic, made.stage, god)})`,
    ]
    hud.showGains('대장간', name, def.color, classIcon(def.name), lines)
    fx.power.burst(hero.object.position, def.color, 2 + made.stage)
    view.shake(0.2 + made.stage * 0.08)
    bus.emit('progressChanged', {})
    return true
  }

  /** 일반 장비를 분해해 그 땅(마을이면 고른 신화의 땅, 없으면 북유럽) 공통 재료로 바꾼다 (E13-07-3) */
  salvage(id: string): boolean {
    const { powers, hud, bus, map, build } = this.ctx
    const realm = map.region.realm ?? (build.chosen ? godDef(build.chosen).realm : 'norse')
    const item = powers.loadout.gear.get(id)
    const done = powers.salvage(id, realm === 'hidden' ? 'norse' : realm)
    if (!done || !item) return false
    bus.emit('gearSalvaged', { item })
    if (done.slot >= 0) this.changed(done.change, false)
    hud.showToast(`분해 · ${materialName(done.material)} ×${done.count}`)
    bus.emit('progressChanged', {})
    return true
  }

  /**
   * 땅에서 주웠다 (E13-02): 일반 장비는 그 부위의 빈 칸이나 가방으로, 신화의 유물은 칸에 끼며 신화를 연다,
   * 재료가 된 유물(E13-03)은 재료 주머니로.
   */
  take(id: string, gear?: GearItem): void {
    const { powers, hud, bus } = this.ctx
    if (gear) {
      powers.loadout.addGear(gear)
      bus.emit('gearPicked', { item: gear })
      // 자동 분해 (E14-05): 흔함 등급이고 그 부위 칸이 이미 차 있으면 바로 재료로
      const filled = powers.loadout.slots.every((s, i) => !powers.loadout.fits(id, i) || s !== null)
      if (this.ctx.conveniences.salvaging && gear.grade === 'common' && filled) {
        powers.loadout.bag.push(id)
        this.salvage(id)
        return
      }
      hud.showToast(gearName(gear))
      this.equip(id, true)
    } else if (!isMythRelic(id)) {
      powers.loadout.addMaterial(id)
      hud.showToast(`${relicDef(id).name} · 재료`)
      bus.emit('relicPicked', { id })
    } else {
      hud.showToast(relicDef(id).name)
      bus.emit('relicPicked', { id })
      this.equip(id, true)
    }
    bus.emit('progressChanged', {})
  }

  update(dt: number): void {
    this.burstCooldown = Math.max(0, this.burstCooldown - dt)
    const { hero, combat, powers, pickups, encounter, skills, feel } = this.ctx
    const position = hero.object.position
    skills.enemies = encounter.alive
    skills.manifested = this.ctx.build.chosen
    skills.level = this.ctx.build.level
    this.updateGlow()

    // 걸은 거리 (이동 연동 효과). 순간이동처럼 한 번에 크게 옮긴 것은 빼고, 밀려난 것은 걸음으로 치지 않는다.
    const step = Math.hypot(position.x - this.lastWalk.x, position.z - this.lastWalk.y)
    if (hero.isMoving && step < 1) powers.onWalk(step, skills)
    this.lastWalk.set(position.x, position.z)

    if (combat.alive) {
      const conv = this.ctx.conveniences
      const picked = pickups.update(
        dt,
        position.x,
        position.z,
        (id) => !powers.loadout.has(id),
        // 편의 자동화 (E14-05): 둘레 장비는 걸어가지 않아도, 재료 유물은 어디서나
        (id, gear) => (gear ? (conv.has('autoPickup') ? AUTO_PICKUP_RADIUS : 0) : !isMythRelic(id) && conv.has('autoMaterials') ? Infinity : 0),
      )
      for (const { id, gear } of picked) this.take(id, gear)
      powers.update(dt, skills)
    } else {
      pickups.update(dt, position.x, position.z, () => false)
      // 쓰러져 있는 동안에도 날아가던 망치·고리 같은 연출은 마저 움직인다. 적을 비워 새로 맞히지는 않는다
      skills.enemies = []
      powers.update(dt, skills)
    }

    // 궁극기: 발현 상태에서 신위 게이지가 가득 차고, 쓸 만한 때가 오면 저절로 나간다.
    const boss = encounter.boss
    const bossNear = !!boss && boss.alive && Math.hypot(boss.x - position.x, boss.z - position.z) < 10
    const ultimate = powers.ultimate
    if (combat.alive && ultimate && combat.divine >= 1 && !powers.ultimateActive && !this.ctx.build.state.noUltimate && ultimate.worthUsing(skills, bossNear)) {
      combat.divine = 0
      ultimate.start(skills)
      feel.stop(0.12)
    }

    // 유물 지속 효과
    const build = this.ctx.build.state
    combat.knockbackScale = build.modifiers.knockbackDealt
    combat.knockbackTakenScale = build.modifiers.knockbackTaken
    combat.damageTakenScale = build.damageTaken
    combat.attackSpeed = build.attackSpeed
    combat.setStyle(build.attack)
    hero.speedScale = build.moveSpeed
    // 상시 효과 수치 (E12-03)
    const stats = build.stats
    // 시련 「마른 샘」(E16): 생명이 차오르지 않는다
    combat.healScale = build.noHeal ? 0 : 1 + stats.healingTaken
    combat.bonusRegen = build.noHeal ? 0 : stats.regen
    combat.lowHpTakenScale = 1 + stats.lowHpGuard
    combat.divineScale = 1 + stats.ultCharge
    skills.area = 1 + stats.areaSize
    const awakening = this.ctx.powers.awakening
    awakening.levels = build.awakening
    awakening.resonance = build.resonance
    awakening.maxHp = build.maxHp
  }

  /** 유물을 끼운다. announce가 false면 발현 연출 없이 (불러오기·점검용) */
  equip(id: RelicId, announce: boolean): void {
    this.changed(this.ctx.powers.equip(id), announce, id)
    this.unlock(id, announce)
  }

  /** 발밑 빛: 가장 많이 낀 신의 색. 유물 하나에 1단계, 발현하면 3 + 레벨 */
  updateGlow(): void {
    const { powers, progress, fx } = this.ctx
    const counts = new Map<string, number>()
    for (const id of powers.loadout.relics) if (id) counts.set(relicDef(id).god, (counts.get(relicDef(id).god) ?? 0) + 1)
    const manifested = this.ctx.build.chosen
    if (manifested) {
      fx.power.setGlow(godDef(manifested).color, 2 + progress.level(manifested))
      fx.power.setAscension(godDef(manifested).color, progress.level(manifested))
      return
    }
    fx.power.setAscension(null, 0)
    let best: string | null = null
    for (const [god, n] of counts) if (!best || n > counts.get(best)!) best = god
    fx.power.setGlow(best ? godDef(best as never).color : null, best ? counts.get(best)! : 0)
  }

  /** 유물 하나를 뺀다. drop이면 발밑에 내려놓고, 아니면 없앤다(개발 패널). */
  unequip(slot: number, drop: boolean): void {
    const result = this.ctx.powers.unequip(slot)
    if (!result) return
    this.ctx.bus.emit('progressChanged', {})
    if (drop) {
      const p = this.ctx.hero.object.position
      // 일반 장비는 내용과 함께 내려놓는다
      this.ctx.pickups.drop(result.relic, p.x, p.z, false, this.ctx.powers.loadout.gear.get(result.relic))
    }
    this.changed(result.change, drop)
  }

  /** 유물 화면: 칸의 유물을 가방에 넣는다. */
  stow(slot: number): void {
    const change = this.ctx.powers.stow(slot)
    if (!change) return
    this.ctx.bus.emit('progressChanged', {})
    this.changed(change, true)
  }

  /** 유물 화면: 가방의 유물을 칸에 끼운다. */
  wield(id: RelicId, slot: number): void {
    const change = this.ctx.powers.wield(id, slot)
    if (!change) return
    this.ctx.bus.emit('progressChanged', {})
    this.changed(change, true, id)
  }

  /** 발현이 새로 일어나거나 풀렸을 때의 연출 */
  private changed(change: LoadoutChange | null, announce: boolean, worn?: RelicId): void {
    if (!change) return
    const { before, after } = change
    const { bus, hud, progress, hero, fx, view, feel, encounter, skills } = this.ctx
    bus.emit('loadoutChanged', { change, announce })
    // 유물을 낄 때마다: 그 신의 색 빛기둥. 같은 신 유물이 많을수록 크다.
    if (announce && worn && isRelicId(worn)) {
      const god = relicDef(worn).god
      const count = this.ctx.powers.loadout.relics.filter((id) => id && relicDef(id).god === god).length
      fx.power.burst(hero.object.position, godDef(god).color, count)
      view.shake(0.12 + count * 0.06)
    }
    if (before.manifested !== after.manifested && !after.manifested) this.decoy = null
    if (!after.manifested || before.manifested === after.manifested) return
    if (!announce) return
    bus.emit('manifested', { god: after.manifested })
    const god = godDef(after.manifested)
    hud.flash(god.color)
    fx.power.burst(hero.object.position, god.color, 4)
    // 신마다 다른 발현 순간: 번개 기둥, 흩어지는 그림자, 여섯 칼날
    godMoment(this.ctx, god.id, 1)
    // 발현하면 무엇이 생기는지: 그 신의 힘과 지금 레벨까지 열린 것
    const lines: string[] = []
    for (let lv = 1; lv <= progress.level(god.id); lv++) {
      for (const g of levelGains(god.id, lv)) if (lv === 1 || g.kind === 'power') lines.push(g.text)
    }
    lines.push(`궁극기 「${god.ultimate.name}」`)
    hud.showGains('고른 신화', progress.title(god.id), god.color, classIcon(god.name), lines)
    // 주변 적을 밀어낸다 (피해는 대기 시간마다 한 번, 멈춘 화면에서 번갈아 골라도 한 번)
    const p = hero.object.position
    fx.puffs.burst(p, 30, 4)
    view.shake(0.5)
    feel.stop(0.15)
    if (this.burstCooldown > 0) return
    this.burstCooldown = MANIFEST_BURST_COOLDOWN
    for (const enemy of encounter.alive) {
      const dx = enemy.x - p.x
      const dz = enemy.z - p.z
      const dist = Math.hypot(dx, dz)
      if (dist - enemy.radius > MANIFEST_RADIUS) continue
      skills.hit(enemy, MANIFEST_DAMAGE, dx / (dist || 1), dz / (dist || 1), 12, 'thunder')
    }
  }
}

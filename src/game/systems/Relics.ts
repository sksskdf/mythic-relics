import * as THREE from 'three'

import { godDef, relicDef, type RelicId } from '../../relics/data'
import { levelGains } from '../../progress/levelGains'
import { classIcon } from '../../ui/classIcons'
import type { GameContext } from '../context'
import type { LoadoutChange } from '../RelicPowers'

/** 클래스가 발현되는 순간 주변 적을 밀어내는 범위와 피해 */
const MANIFEST_RADIUS = 4
const MANIFEST_DAMAGE = 20

/**
 * 유물: 땅의 유물 줍기, 장착·해제와 발현 연출, 유물 효과와 궁극기, 지속 효과 수치 적용.
 */
export class RelicSystem {
  /** 로키의 환영 분신. 거인은 가까이 있으면 주인공 대신 이것을 쫓는다. */
  decoy: { x: number; z: number; radius: number } | null = null
  private readonly lastWalk = new THREE.Vector2()

  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('targetKilled', ({ target }) => ctx.powers.onKill(target, ctx.skills))
    ctx.bus.on('heroRevived', () => {
      this.decoy = null
    })
  }

  update(dt: number): void {
    const { hero, combat, powers, pickups, progress, encounter, skills, feel, bus } = this.ctx
    const position = hero.object.position
    skills.enemies = encounter.alive
    skills.manifested = powers.manifested
    skills.level = skills.manifested ? progress.level(skills.manifested) : 0
    this.updateGlow()

    // 걸은 거리 (이동 연동 효과). 순간이동처럼 한 번에 크게 옮긴 것은 빼고, 밀려난 것은 걸음으로 치지 않는다.
    const step = Math.hypot(position.x - this.lastWalk.x, position.z - this.lastWalk.y)
    if (hero.isMoving && step < 1) powers.onWalk(step, skills)
    this.lastWalk.set(position.x, position.z)

    if (combat.alive) {
      const picked = pickups.update(dt, position.x, position.z, (id) => !powers.loadout.has(id))
      for (const id of picked) {
        this.ctx.hud.showToast(relicDef(id).name)
        bus.emit('relicPicked', { id })
        bus.emit('progressChanged', {})
        this.changed(powers.equip(id), true, id)
      }
      powers.update(dt, skills)
    } else {
      pickups.update(dt, position.x, position.z, () => false)
    }

    // 궁극기: 발현 상태에서 신위 게이지가 가득 차고, 쓸 만한 때가 오면 저절로 나간다.
    const boss = encounter.boss
    const bossNear = !!boss && boss.alive && Math.hypot(boss.x - position.x, boss.z - position.z) < 10
    if (combat.alive && powers.manifested && combat.divine >= 1 && !powers.ultimate.active && powers.ultimate.worthUsing(skills, bossNear)) {
      combat.divine = 0
      powers.ultimate.start(skills)
      feel.stop(0.12)
    }

    // 유물 지속 효과
    const mods = powers.modifiers
    combat.knockbackScale = mods.knockbackDealt
    combat.knockbackTakenScale = mods.knockbackTaken
    combat.damageTakenScale = mods.damageTaken * this.ctx.cycle.damageTakenScale
    hero.speedScale = mods.moveSpeed * this.ctx.cycle.moveSpeedScale
  }

  /** 유물을 끼운다. announce가 false면 발현 연출 없이 (불러오기·점검용) */
  equip(id: RelicId, announce: boolean): void {
    this.changed(this.ctx.powers.equip(id), announce, id)
  }

  /** 발밑 빛: 가장 많이 낀 신의 색. 유물 하나에 1단계, 발현하면 3 + 레벨 */
  updateGlow(): void {
    const { powers, progress, fx } = this.ctx
    const counts = new Map<string, number>()
    for (const id of powers.loadout.slots) if (id) counts.set(relicDef(id).god, (counts.get(relicDef(id).god) ?? 0) + 1)
    const manifested = powers.manifested
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
      this.ctx.pickups.drop(result.relic, p.x, p.z, false)
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
    if (announce && worn) {
      const god = relicDef(worn).god
      const count = this.ctx.powers.loadout.slots.filter((id) => id && relicDef(id).god === god).length
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
    // 칼날 폭풍의 신(아수라왕)은 발현하는 순간 여섯 팔이 사방으로 칼을 휘두른다.
    if (god.passive.bladeStorm) {
      for (let i = 0; i < 6; i++) fx.slashes.spawn(hero.object.position, (i / 6) * Math.PI * 2, 2.6, 0.5, true, i % 2 ? 0xff4a5a : 0xb0101c)
    }
    // 발현하면 무엇이 생기는지: 그 신의 힘과 지금 레벨까지 열린 것
    const lines: string[] = []
    for (let lv = 1; lv <= progress.level(god.id); lv++) {
      for (const g of levelGains(god.id, lv)) if (lv === 1 || g.kind === 'power') lines.push(g.text)
    }
    lines.push('궁극기 사용 가능')
    hud.showGains('발현', progress.title(god.id), god.color, classIcon(god.name), lines)
    // 하늘에서 번개가 주인공에게 내리꽂히고, 주변 적을 밀어낸다.
    const p = hero.object.position
    fx.lightning.fromSky(p.clone(), 0.32)
    fx.puffs.burst(p, 30, 4)
    view.shake(0.5)
    feel.stop(0.15)
    for (const enemy of encounter.alive) {
      const dx = enemy.x - p.x
      const dz = enemy.z - p.z
      const dist = Math.hypot(dx, dz)
      if (dist - enemy.radius > MANIFEST_RADIUS) continue
      skills.hit(enemy, MANIFEST_DAMAGE, dx / (dist || 1), dz / (dist || 1), 12, 'thunder')
    }
  }
}

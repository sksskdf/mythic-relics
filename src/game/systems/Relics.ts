import * as THREE from 'three'

import { godDef, relicDef, type RelicId } from '../../relics/data'
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
    ctx.hud.onSlotClick = (slot) => this.dropFromSlot(slot)
  }

  update(dt: number): void {
    const { hero, combat, powers, pickups, progress, encounter, skills, feel, bus } = this.ctx
    const position = hero.object.position
    skills.enemies = encounter.alive
    skills.manifested = powers.manifested
    skills.level = skills.manifested ? progress.level(skills.manifested) : 0

    // 걸은 거리 (이동 연동 효과). 순간이동처럼 한 번에 크게 옮긴 것은 빼고, 밀려난 것은 걸음으로 치지 않는다.
    const step = Math.hypot(position.x - this.lastWalk.x, position.z - this.lastWalk.y)
    if (hero.isMoving && step < 1) powers.onWalk(step, skills)
    this.lastWalk.set(position.x, position.z)

    if (combat.alive) {
      const picked = pickups.update(dt, position.x, position.z, (id) => powers.hasFreeSlot && !powers.loadout.has(id))
      for (const id of picked) {
        this.ctx.hud.showToast(relicDef(id).name)
        bus.emit('relicPicked', { id })
        bus.emit('progressChanged', {})
        this.changed(powers.equip(id), true)
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
    combat.damageTakenScale = mods.damageTaken
    hero.speedScale = mods.moveSpeed
  }

  /** 유물을 끼운다. announce가 false면 발현 연출 없이 (불러오기·점검용) */
  equip(id: RelicId, announce: boolean): void {
    this.changed(this.ctx.powers.equip(id), announce)
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

  /** 유물 칸을 눌러 유물을 빼면 발밑에 내려놓는다. */
  private dropFromSlot(slot: number): void {
    this.unequip(slot, true)
  }

  /** 발현이 새로 일어나거나 풀렸을 때의 연출 */
  private changed(change: LoadoutChange | null, announce: boolean): void {
    if (!change) return
    const { before, after } = change
    const { bus, hud, progress, hero, fx, view, feel, encounter, skills } = this.ctx
    bus.emit('loadoutChanged', { change, announce })
    if (before.manifested !== after.manifested && !after.manifested) this.decoy = null
    if (!after.manifested || before.manifested === after.manifested) return
    if (!announce) return
    bus.emit('manifested', { god: after.manifested })
    const god = godDef(after.manifested)
    hud.showBanner(progress.title(god.id), god.color)
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

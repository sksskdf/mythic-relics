import * as THREE from 'three'

import type { Giant } from '../../enemies/Giant'
import { PER_PROMOTION } from '../../progress/ClassProgress'
import { levelGains } from '../../progress/levelGains'
import { classIcon } from '../../ui/classIcons'
import { type God, godDef, type RelicId } from '../../relics/data'
import type { GameContext } from '../context'

/** 주인공의 기본 생명력 */
export const BASE_HP = 100
/** 적을 쓰러뜨렸을 때 되찾는 생명력 */
const HEAL_PER_KILL = 4
const HEAL_PER_BOSS = 30

/**
 * 성장: 처치 경험치, 생명력 회복, 유물 드랍, 승급 전설과 승급, 승급 횟수에서 나오는 기본 능력치.
 */
export class ProgressionSystem {
  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('giantKilled', ({ giant }) => this.onGiantKilled(giant))
  }

  /** 승급 전설: 성소에 들어서면 시작하고, 이기면 승급한다. */
  update(dt: number): void {
    const { legend, encounter, powers, progress, combat, hero, hud, view, bus } = this.ctx
    legend.update(dt, encounter, {
      ready: () => powers.manifested === 'thor' && progress.readyToPromote('thor'),
      heroAlive: () => combat.alive,
      heroPosition: () => hero.object.position,
      setArena: (arena) => {
        hero.arena = arena
      },
      onStart: () => {
        bus.emit('legendStarted', {})
        hud.showBanner('우트가르드 원정', '#d8c2ff')
        view.shake(0.3)
      },
      onWin: () => this.promote('thor'),
      onFail: () => bus.emit('legendFailed', {}),
    })
  }

  /** 경험치와 유물 드랍. 경험치는 발현한 클래스에만 쌓인다. (DESIGN.md 5.2) */
  private onGiantKilled(giant: Giant): void {
    const { powers, progress, combat, drops, pickups, bus } = this.ctx
    const manifested = powers.manifested
    if (manifested) progress.addXp(manifested, giant.spec.xp)
    // 적을 쓰러뜨리면 생명력을 조금 되찾는다. 몰려오는 무리를 쓸어 내며 버틸 수 있게 한다.
    if (combat.alive) combat.health.heal(giant.spec.boss ? HEAL_PER_BOSS : HEAL_PER_KILL)
    bus.emit('progressChanged', {})
    const owned = new Set<RelicId>([
      ...powers.loadout.slots.filter((id): id is RelicId => id !== null),
      ...powers.loadout.bag,
      ...pickups.list.map((p) => p.id),
    ])
    const relic = drops.roll(owned, giant.spec.boss)
    if (relic) pickups.drop(relic, giant.x, giant.z)
  }

  /** 승급: 칭호가 바뀌고, 스킬이 강해지고, 친화도와 기본 능력치가 오른다. */
  promote(god: God): void {
    const { progress, combat, hero, hud, fx, view, feel, bus } = this.ctx
    const hpBefore = BASE_HP + progress.promotions * PER_PROMOTION.maxHp
    const dmgBefore = 1 + progress.promotions * PER_PROMOTION.damage
    if (!progress.promote(god)) return
    bus.emit('promoted', { god, title: progress.title(god) })
    bus.emit('progressChanged', {})
    this.applyStats()
    combat.health.reset()
    const p = hero.object.position
    // 무엇이 얼마나 강해졌는지: 기본 능력치는 전→후, 그 단계에서 새로 생긴 힘은 한 줄씩
    const hpAfter = BASE_HP + progress.promotions * PER_PROMOTION.maxHp
    const dmgAfter = 1 + progress.promotions * PER_PROMOTION.damage
    const level = progress.level(god)
    const lines = [
      `최대 생명 ${hpBefore} → ${hpAfter}`,
      `모든 피해 ×${dmgBefore.toFixed(2)} → ×${dmgAfter.toFixed(2)}`,
      ...levelGains(god, level).filter((g) => g.kind !== 'hp' && g.kind !== 'damage').map((g) => g.text),
    ]
    hud.showGains(`승급 · Lv${level}`, progress.title(god), godDef(god).color, classIcon(godDef(god).name), lines)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2
      fx.lightning.fromSky(new THREE.Vector3(p.x + Math.sin(a) * 2, p.y, p.z + Math.cos(a) * 2), 0.18)
    }
    fx.lightning.fromSky(p.clone(), 0.34)
    fx.puffs.burst(p, 40, 5)
    view.shake(0.6)
    feel.stop(0.2)
  }

  /** 총 승급 횟수에서 나오는 기본 능력치 (DESIGN.md 6.2) */
  applyStats(): void {
    this.ctx.combat.health.setMax(BASE_HP + this.ctx.progress.promotions * PER_PROMOTION.maxHp)
  }

  /** 클래스 성장(레벨·경험치)을 처음으로 되돌린다. */
  reset(): void {
    this.ctx.progress.records.clear()
    this.applyStats()
    this.ctx.combat.health.reset()
    this.ctx.bus.emit('progressChanged', {})
  }
}

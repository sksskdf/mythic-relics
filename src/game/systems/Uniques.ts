import * as THREE from 'three'

import { TRAINING_UNIQUES, UNIQUE } from '../../skills/uniques'
import { heightAt } from '../../world/terrain'
import type { GameContext } from '../context'
import type { CombatTarget } from '../PlayerCombat'
import type { DamageStyle } from '../../ui/DamageNumbers'

/**
 * 고유 효과 (E303-03): 낀 영웅·전설 장비의 고유 효과를 버스 사건에 붙여 돌린다. 상태와 규칙은 `skills/uniques.ts`의 `UniqueState`(ctx.uniques).
 * 받는 피해·이동 빠르기 배율과 달빛 방패는 RelicSystem·DamageSystem이 ctx.uniques에서 읽는다
 */
export class UniqueSystem {
  private readonly from = new THREE.Vector3()
  private readonly to = new THREE.Vector3()
  /** 마지막으로 고유 효과를 모은 빌드 판 번호와 익힌 마디 수 (바뀔 때만 다시 모은다) */
  private version = -1
  private taken = -1

  constructor(private readonly ctx: GameContext) {
    const { bus } = ctx
    const state = ctx.uniques
    bus.on('basicHits', ({ targets }) => {
      const first = targets[0]
      if (!first) return
      if (state.onBasicHit().thunder && first.alive) this.thunder(first)
      // 그림자 칼: 10% 확률로 한 번 더 친다
      if (state.has('shadowBlade') && first.alive && Math.random() < UNIQUE.shadowBlade.chance) this.hit(first, UNIQUE.shadowBlade.damage, 0, 'strong')
      // 서리: 맞힌 적이 잠시 느려진다
      if (state.has('frost')) for (const t of targets) (t as { chill?: (s: number, k: number) => void }).chill?.(UNIQUE.frost.duration, UNIQUE.frost.slow)
    })
    bus.on('targetKilled', ({ target }) => {
      const heal = state.onKill().heal
      if (heal > 0) ctx.combat.heal(heal)
      // 불씨: 쓰러진 자리에서 작은 폭발
      if (state.has('ember')) this.burst(target.x, target.z, UNIQUE.ember.radius, UNIQUE.ember.damage)
    })
    bus.on('heroHurt', () => {
      const { stone, shield } = state.onHurt(ctx.combat.health.ratio, ctx.combat.health.max)
      const p = ctx.hero.object.position
      if (stone) ctx.fx.puffs.burst(p, 10, 1.2)
      if (shield > 0) ctx.numbers.label(this.to.copy(p).setY(p.y + 2.2), '달빛 방패', '#cfe3ff')
    })
    bus.on('ultimateCast', () => {
      if (state.has('divineBreath')) ctx.combat.heal(ctx.combat.health.max * UNIQUE.divineBreath.heal)
    })
    bus.on('regionEntered', () => {
      state.onRegion()
    })
  }

  /** 낀 장비와 수련 큰 마디의 고유 효과를 맞추고 타이머를 돌린다. 걸은 거리로 회오리 걸음 */
  update(dt: number, walked: number): void {
    const { uniques, training, build } = this.ctx
    // 장비·자리·시련이 바뀌면 빌드 판 번호가 오른다. 수련 마디는 판 번호에 수치로만 들어가 따로 센다
    if (build.version !== this.version || training.taken.size !== this.taken) {
      this.version = build.version
      this.taken = training.taken.size
      uniques.setActive(this.collect())
    }
    uniques.update(dt)
    if (walked > 0 && uniques.onWalk(walked)) {
      const p = this.ctx.hero.object.position
      this.burst(p.x, p.z, UNIQUE.whirlStep.radius, UNIQUE.whirlStep.damage)
    }
  }

  /** 도는 고유 효과: 낀 장비와 익힌 큰 마디 */
  private collect(): Set<string> {
    const { powers, training } = this.ctx
    const out = new Set<string>()
    powers.loadout.slots.forEach((uid) => {
      const g = uid ? powers.loadout.gear.get(uid) : undefined
      if (g?.unique) out.add(g.unique)
      if (g?.unique2) out.add(g.unique2)
    })
    for (const [node, unique] of Object.entries(TRAINING_UNIQUES)) if (training.taken.has(node)) out.add(unique)
    return out
  }

  /** 천둥 부름: 하늘에서 그 적에게 번개 */
  private thunder(target: CombatTarget): void {
    const y = heightAt(target.x, target.z)
    this.ctx.fx.lightning.strike(this.from.set(target.x, y + 7, target.z), this.to.set(target.x, y + 0.8, target.z), 0.1, 0.16)
    this.ctx.bus.emit('sound', { cue: 'thunder', x: target.x, z: target.z })
    this.hit(target, UNIQUE.thunderCall.damage, 0, 'thunder')
  }

  /** 둘레의 적을 친다 (불씨·회오리 걸음) */
  private burst(x: number, z: number, radius: number, damage: number): void {
    const { encounter, fx } = this.ctx
    fx.puffs.burst(this.to.set(x, heightAt(x, z) + 0.3, z), 8, radius * 0.6)
    for (const e of encounter.alive) {
      const d = Math.hypot(e.x - x, e.z - z)
      if (d - e.radius > radius) continue
      this.hit(e, damage, 2, 'normal', (e.x - x) / (d || 1), (e.z - z) / (d || 1))
    }
  }

  private hit(target: CombatTarget, damage: number, knockback: number, style: DamageStyle, dx = 0, dz = 0): void {
    this.ctx.skills.hit(target, damage, dx, dz, knockback, style)
  }
}

import type { SkillContext } from '../skills/Skill'
import type { EventBus, GameEvents } from './events'
import type { HeroController } from './HeroController'
import type { PlayerCombat } from './PlayerCombat'
import type { Effects } from './systems/Effects'
import type { QuarterViewCamera } from '../render/QuarterViewCamera'

/** 유물 스킬이 닿는 게임의 부품. 피해와 미끼는 시스템이 만들어진 뒤에 부른다 */
export interface SkillParts {
  readonly hero: HeroController
  readonly combat: PlayerCombat
  readonly fx: Effects
  readonly view: QuarterViewCamera
  readonly bus: EventBus<GameEvents>
  hit: SkillContext['hit']
  setDecoy: SkillContext['setDecoy']
}

/**
 * 유물 스킬이 세계와 주고받는 것 (E305-04에서 Game.ts에서 뗌). 적 목록·고른 신화·단계·범위는
 * 비워 두고, 유물 시스템이 프레임마다 채운다
 */
export function heroSkills(parts: SkillParts): SkillContext {
  const { hero, combat, fx, view, bus } = parts
  return {
    hero,
    enemies: [],
    manifested: null,
    level: 0,
    area: 1,
    fx: fx.skills,
    lightning: fx.lightning,
    puffs: fx.puffs,
    slashes: fx.slashes,
    shots: fx.shots,
    flash: (at, color, strength) => fx.power.burst(at, color, strength),
    chips: (at, palette, count, height = 0.8, size = 0.12) => fx.debris.burst(at, count, palette, height, size),
    heal: (amount) => combat.heal(amount),
    heroHp: () => combat.health.ratio,
    hit: parts.hit,
    shake: (amount) => view.shake(amount),
    sound: (cue, x, z) => bus.emit('sound', { cue, x, z }),
    setDecoy: parts.setDecoy,
  }
}

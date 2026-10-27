import * as THREE from 'three'

import type { AudioEngine } from '../audio/AudioEngine'
import type { Build } from '../build/Build'
import type { SwingSpec } from '../combat/combo'
import { STYLES } from '../combat/styles'
import { godDef } from '../relics/data'
import { heightAt } from '../world/terrain'
import type { HeroController } from './HeroController'
import type { CombatTarget, PlayerCombat } from './PlayerCombat'
import type { Effects } from './systems/Effects'

/** 공격 연출이 게임에서 쓰는 것 */
export interface AttackFxParts {
  readonly fx: Effects
  readonly hero: HeroController
  readonly combat: PlayerCombat
  readonly build: Build
  readonly audio: AudioEngine
}

/** 기본 공격의 모습: 휘두른 궤적과 마지막 타의 조각, 원거리 공격이 날아가는 모양 (E6-10, E18) */
export class AttackFx {
  constructor(private readonly parts: AttackFxParts) {}

  /** 공격 모션의 궤적: 판정 모양대로 그리고, 발현했으면 그 신의 색 (E6-10) */
  swing(swing: SwingSpec, strong: boolean): void {
    const { fx, hero, combat, build, audio } = this.parts
    const p = hero.object.position
    const facing = hero.facing
    const god = build.chosen
    const tint = god && !strong ? new THREE.Color(godDef(god).color).lerp(new THREE.Color(0xffffff), 0.5).getHex() : undefined
    // 마지막 타는 공격 모션마다 정한 조각이 튄다 (물·꽃잎·돌 등, E18)
    const chips = strong ? STYLES[combat.style].chips : undefined
    switch (swing.shape ?? 'arc') {
      case 'arc':
        fx.slashes.spawn(p, facing, swing.range, swing.halfAngle, strong, tint)
        if (chips) fx.debris.burst(ahead(p, facing, swing.range * 0.6), 10, chips, 0.6, 0.1)
        break
      case 'ring':
        fx.slashes.spawn(p, facing, swing.range, Math.PI, strong, tint)
        if (chips) fx.debris.burst(p, 16, chips, 0.8, 0.1)
        break
      case 'line':
        fx.slashes.spawn(p, facing, swing.range, Math.atan2(swing.width ?? 0.6, swing.range), strong, tint)
        if (chips) fx.debris.burst(ahead(p, facing, swing.range * 0.8), 10, chips, 0.5, 0.1)
        break
      case 'burst': {
        const at = ahead(p, facing, swing.range * 0.75)
        fx.slashes.spawn(at, facing, swing.width ?? 1.5, Math.PI, strong, tint)
        fx.puffs.burst(at, 10, 2)
        if (chips) fx.debris.burst(at, 14, chips, 0.9, 0.1)
        break
      }
      case 'shot':
        break
    }
    audio.play('swing', undefined, strong ? 1 : 0.7)
  }

  /** 원거리 공격이 날아간다: 벼락은 번개 줄기, 고리는 도는 금고리, 바위는 포물선, 그 밖에는 화살·빛 조각 (E18) */
  shot(target: CombatTarget, strong: boolean): void {
    const { fx, hero, combat, build } = this.parts
    const p = hero.object.position
    const from = new THREE.Vector3(p.x, p.y + 1.3, p.z)
    const to = new THREE.Vector3(target.x, heightAt(target.x, target.z) + 0.9, target.z)
    const god = build.chosen
    const color = god ? new THREE.Color(godDef(god).color).getHex() : 0xf2f7ff
    const style = STYLES[combat.style]
    switch (style.shot ?? 'streak') {
      case 'lightning':
        fx.lightning.strike(from, to, strong ? 0.12 : 0.07, 0.12)
        break
      case 'ring':
        fx.shots.fire(from, to, 0xffd040, 0.16, { scale: [4.5, 0.8, 0.3], spin: 30 })
        break
      case 'stone': {
        const big = strong ? 1.6 : 1
        fx.shots.fire(from, to, 0xa89a80, strong ? 0.32 : 0.24, { scale: [3.4 * big, 3 * big, 0.26 * big], arc: strong ? 2.2 : 1.4, spin: 8 })
        break
      }
      default:
        fx.shots.fire(from, to, color)
    }
    if (strong && style.chips) fx.debris.burst(to, 10, style.chips, 0.7, 0.1)
  }
}

/** 주인공 앞 distance(m) 자리 */
function ahead(p: THREE.Vector3, facing: number, distance: number): THREE.Vector3 {
  return new THREE.Vector3(p.x + Math.sin(facing) * distance, p.y, p.z + Math.cos(facing) * distance)
}

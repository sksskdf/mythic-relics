import * as THREE from 'three'

import type { Giant } from '../../enemies/Giant'
import { Debris } from '../../fx/Debris'
import { Lightning } from '../../fx/Lightning'
import { Puffs } from '../../fx/Puffs'
import { ShadowAura } from '../../fx/ShadowAura'
import { Slashes } from '../../fx/Slashes'
import { Snowfall } from '../../fx/Snowfall'
import { Sparks } from '../../fx/Sparks'
import { EFFECT_LAYER } from '../../render/PixelRenderer'
import { MoveMarker, PathLine, TargetMarker } from '../../world/moveMarker'
import { heightAt } from '../../world/terrain'
import type { HeroController } from '../HeroController'
import type { HeroOrders } from '../HeroOrders'
import type { CombatTarget } from '../PlayerCombat'

const ICE_CHIPS = [0xa8e4f5, 0xe9f4fa, 0x6cbcd9]
const SNOW_CHIPS = [0xf4f8fc, 0xdfe8f1]

/** 연출 묶음: 먼지, 칼 궤적, 파편, 번개, 전기, 눈, 지시 표시. 게임 규칙에는 끼어들지 않는다. */
export class Effects {
  readonly puffs = new Puffs(96)
  readonly slashes = new Slashes()
  readonly debris = new Debris()
  readonly lightning = new Lightning()
  /** 천둥의 신 발현 중 몸 주변의 푸른 전기 */
  readonly sparks = new Sparks()
  /** 변신술사 발현 중 발밑의 그림자 */
  readonly shadow = new ShadowAura()
  /** 아수라 발현 중 검붉은 스산한 기운 */
  readonly asura = new ShadowAura(0x3a0408, 0xa3141c, 2.2)
  readonly snow = new Snowfall()
  /** 유물 스킬 연출을 붙이는 곳 */
  readonly skills = new THREE.Group()
  private readonly marker = new MoveMarker()
  /** 공격 대상 발밑의 붉은 고리 */
  private readonly targetMarker = new TargetMarker()
  /** 적을 무시하고 걷는 동안 목적지까지 긋는 점선 */
  private readonly pathLine = new PathLine()
  private readonly scratch = new THREE.Vector3()
  private footstepTimer = 0

  addTo(scene: THREE.Scene): void {
    for (const effect of [this.marker.object, this.snow.object, this.puffs.object, this.slashes.object, this.sparks.object]) {
      effect.traverse((o) => o.layers.set(EFFECT_LAYER))
      scene.add(effect)
    }
    scene.add(this.targetMarker.object, this.pathLine.object, this.skills, this.debris.object, this.lightning.object, this.shadow.object, this.asura.object)
  }

  /** 지시 표시: 누른 곳, 공격 대상, 적을 무시한 이동의 경로 */
  updateMarkers(dt: number, hero: HeroController, orders: HeroOrders, enemies: readonly CombatTarget[]): void {
    const moveTarget = orders.lastMoveTarget
    if (moveTarget) this.marker.show(moveTarget.x, moveTarget.z, moveTarget.forced)
    orders.lastMoveTarget = null
    this.marker.update(dt)
    const target = orders.attackTarget
    // 치워진 적(개발 패널의 모두 제거 등)에는 표시를 남기지 않는다.
    this.targetMarker.update(dt, target?.alive && enemies.includes(target) ? target : null)
    this.pathLine.update(hero.object.position, orders.plowing ? orders.destination : null)
  }

  update(dt: number, hero: HeroController, elapsed: number): void {
    const position = hero.object.position
    if (hero.isMoving) {
      this.footstepTimer -= dt
      if (this.footstepTimer <= 0) {
        this.puffs.burst(position, 2, 0.6)
        this.footstepTimer = 0.28
      }
    }
    this.puffs.update(dt)
    this.lightning.update(dt)
    this.sparks.update(dt, position)
    this.shadow.update(dt, position)
    this.asura.update(dt, position)
    this.slashes.update(dt)
    this.debris.update(dt)
    this.snow.update(dt, position, elapsed)
  }

  /** 거인 공격이 땅에 닿았다. 얼음 공격이면 얼음 조각이 튄다. */
  impact(x: number, z: number, strength: number, ice: boolean): void {
    this.scratch.set(x, heightAt(x, z), z)
    this.puffs.burst(this.scratch, Math.round(6 + strength * 30), 1 + strength * 4)
    if (ice) this.debris.burst(this.scratch, Math.round(strength * 30), ICE_CHIPS, 0.3, 0.16)
    else this.debris.burst(this.scratch, 4, SNOW_CHIPS, 0.1, 0.1)
  }

  /** 쓰러진 거인이 복셀 조각으로 부서진다. */
  shatter(giant: Giant): void {
    const king = giant.spec.king
    this.debris.burst(giant.object.position, king ? 90 : 30, giant.rig.palette, king ? 3 : 1.6, giant.spec.voxelSize * 2.2)
    this.puffs.burst(giant.object.position, king ? 30 : 12, king ? 4 : 2.2)
  }
}

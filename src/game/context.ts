import type * as THREE from 'three'

import type { DropTable } from '../relics/DropTable'
import type { Pickups } from '../relics/Pickups'
import type { ClassProgress } from '../progress/ClassProgress'
import type { QuarterViewCamera } from '../render/QuarterViewCamera'
import type { SkillContext } from '../skills/Skill'
import type { DamageNumbers } from '../ui/DamageNumbers'
import type { Hud } from '../ui/Hud'
import type { TestMap } from '../world/testMap'
import type { Encounter } from './Encounter'
import type { EventBus, GameEvents } from './events'
import type { HeroController } from './HeroController'
import type { HeroOrders } from './HeroOrders'
import type { UtgardLegend } from './Legend'
import type { PlayerCombat } from './PlayerCombat'
import type { RelicPowers } from './RelicPowers'
import type { Effects } from './systems/Effects'

/** 타격감: 맞는 순간 게임 시간을 잠깐 멈춘다. */
export class Feel {
  /** 남은 멈춤 시간 (초) */
  hitstop = 0

  /** seconds초 멈춘다. 이미 더 길게 멈춰 있으면 그대로 둔다. */
  stop(seconds: number): void {
    this.hitstop = Math.max(this.hitstop, seconds)
  }
}

/**
 * 시스템들이 함께 쓰는 게임 상태. 시스템끼리는 서로를 직접 부르지 않고
 * 여기 있는 공용 객체와 이벤트 버스(bus)로만 주고받는다.
 */
export interface GameContext {
  readonly bus: EventBus<GameEvents>
  readonly scene: THREE.Scene
  readonly view: QuarterViewCamera
  readonly hud: Hud
  readonly numbers: DamageNumbers
  readonly fx: Effects
  readonly feel: Feel
  readonly map: TestMap
  readonly hero: HeroController
  readonly combat: PlayerCombat
  readonly orders: HeroOrders
  readonly encounter: Encounter
  readonly legend: UtgardLegend
  readonly powers: RelicPowers
  readonly pickups: Pickups
  readonly progress: ClassProgress
  readonly drops: DropTable
  /** 유물 스킬이 세계와 주고받는 것 (프레임마다 적 목록 등을 채운다) */
  readonly skills: SkillContext
}

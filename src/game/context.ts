import type { Build } from '../build/Build'
import type { Conveniences } from '../progress/Conveniences'
import type { ThreatProgress } from '../progress/Threat'
import type { TrialProgress } from '../progress/Trials'
import type { RiftProgress } from '../progress/Rift'
import type * as THREE from 'three'

import type { Wardrobe } from '../looks/outfit'
import type { DropTable } from '../gear/DropTable'
import type { Pickups } from '../gear/Pickups'
import type { ClassProgress } from '../myth/ClassProgress'
import type { QuarterViewCamera } from '../render/QuarterViewCamera'
import type { SkillContext } from '../skills/Skill'
import type { DamageNumbers } from '../ui/DamageNumbers'
import type { Hud } from '../ui/Hud'
import type { RegionMap } from '../world/regionMap'
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
  /** 지금 지역의 맵 (지역 데이터는 map.region) */
  readonly map: RegionMap
  readonly hero: HeroController
  readonly combat: PlayerCombat
  readonly orders: HeroOrders
  readonly encounter: Encounter
  readonly legend: UtgardLegend
  readonly powers: RelicPowers
  readonly pickups: Pickups
  readonly progress: ClassProgress
  readonly drops: DropTable
  /** 세계 위협 단계와 원천 숙련 (E14-03·04) */
  readonly threat: ThreatProgress
  /** 균열 기록과 성좌판 (E17) */
  readonly rift: RiftProgress
  /** 시련 기록과 영구 보상 (E16) */
  readonly trials: TrialProgress
  /** 편의 자동화 (E14-05) */
  readonly conveniences: Conveniences
  /** 외형 보관함 (얻은 외형, 칸마다 고른 것) */
  readonly wardrobe: Wardrobe
  /** 빌드 상태: 열린 신화·고른 신화·장비·원천 → 능력치 (E11-04) */
  readonly build: Build
  /** 본 대화 장면 (E12-10, 저장) */
  readonly scenesSeen: Set<string>
  /** 유물 스킬이 세계와 주고받는 것 (프레임마다 적 목록 등을 채운다) */
  readonly skills: SkillContext
}

import type { Build } from '../build/Build'
import type { UniqueState } from '../skills/uniques'
import type { AutomationProgress } from '../progress/Automation'
import type { Waypoints } from '../progress/Waypoints'
import type { ChapterProgress } from '../progress/Chapters'
import type { ExpeditionProgress } from '../progress/Expedition'
import type { TrainingProgress } from '../progress/Training'
import type { AwakenProgress } from '../progress/Awakening'
import type { TabUnlocks } from '../progress/Tabs'
import type { Ending } from '../progress/Ending'
import type { DepthProgress } from '../progress/Depth'
import type { OathProgress } from '../progress/Oaths'
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
import type { Sanctuary } from './Sanctuary'
import type { PlayerCombat } from './PlayerCombat'
import type { RelicPowers } from './RelicPowers'
import type { Effects } from './systems/Effects'

/** 타격감: 맞는 순간 게임 시간을 잠깐 멈춘다. */
export class Feel {
  /** 남은 멈춤 시간 (초) */
  hitstop = 0

  /** 느린 동작 (E23): 남은 실제 시간(초)과 그동안의 빠르기 */
  slowLeft = 0
  slowScale = 1

  /** seconds초 멈춘다. 이미 더 길게 멈춰 있으면 그대로 둔다. */
  stop(seconds: number): void {
    this.hitstop = Math.max(this.hitstop, seconds)
  }

  /** 실제 시간 seconds초 동안 게임이 scale 빠르기로 흐른다 (장 보스를 쓰러뜨린 순간 등) */
  slow(seconds: number, scale: number): void {
    this.slowLeft = Math.max(this.slowLeft, seconds)
    this.slowScale = scale
  }

  /** 지금 게임 시간의 빠르기 */
  get timeScale(): number {
    return this.slowLeft > 0 ? this.slowScale : 1
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
  readonly sanctuary: Sanctuary
  readonly powers: RelicPowers
  readonly pickups: Pickups
  readonly progress: ClassProgress
  readonly drops: DropTable
  /** 깊이 (E305-03, 옛 위협 단계 E14-03) */
  readonly depth: DepthProgress
  /** 균열 기록 (E17) */
  readonly rift: RiftProgress
  /** 맹세 기록과 영구 보상 (E305-01) */
  readonly oaths: OathProgress
  /** 자동화 세기 (E305-03: 귀환 횟수·엔딩·주운 수로 켜진다) */
  readonly automation: AutomationProgress
  /** 웨이포인트: 밟아 켠 성소 (E239-05) */
  readonly waypoints: Waypoints
  /** 첫 엔딩을 보았나: 엔딩 뒤 장치를 연다 (E21-06) */
  readonly ending: Ending
  /** 장 진행: 지금 장·목표·열린 땅 (E22) */
  readonly chapters: ChapterProgress
  /** 수련: 경험치로 얻은 깨달음과 익힌 마디 (E236) */
  readonly training: TrainingProgress
  /** 원정 (E304) */
  readonly expedition: ExpeditionProgress
  /** 신을 깨우는 진행: 깨우는 신과 모은 조각 (E238) */
  readonly awaken: AwakenProgress
  /** 차례로 연 정보 화면 탭 (E236-05) */
  readonly tabs: TabUnlocks
  /** 외형 보관함 (얻은 외형, 칸마다 고른 것) */
  readonly wardrobe: Wardrobe
  /** 빌드 상태: 열린 신화·고른 신화·장비·원천 → 능력치 (E11-04) */
  readonly build: Build
  /** 본 대화 장면 (E12-10, 저장) */
  readonly scenesSeen: Set<string>
  /** 영웅·전설 장비의 고유 효과 상태 (E303-03): 타이머·셈·받는 피해·이동 배율·달빛 방패 */
  readonly uniques: UniqueState
  /** 유물 스킬이 세계와 주고받는 것 (프레임마다 적 목록 등을 채운다) */
  readonly skills: SkillContext
}

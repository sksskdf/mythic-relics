import type { RelicPowers } from '../game/RelicPowers'
import type { ClassProgress } from '../myth/ClassProgress'
import type { ThreatProgress } from '../progress/Threat'
import { type BuildInputs, type BuildState, computeBuild } from './BuildState'

/**
 * 게임 안의 빌드 상태: 지금의 장착·성장 기록에서 재료를 모아 `computeBuild`로 계산한다.
 * 피해·능력치를 쓰는 곳(Damage, Relics, 정보 화면)은 여기서 값을 읽는다.
 */
export class Build {
  constructor(private readonly from: { powers: RelicPowers; progress: ClassProgress; threat: ThreatProgress }) {}

  /** 지금의 재료 */
  inputs(): BuildInputs {
    const { powers, progress, threat } = this.from
    const open = new Map<string, number>()
    for (const [god, record] of progress.records) if (record.level >= 1) open.set(god, record.level)
    return {
      open,
      chosen: powers.manifested ? [powers.manifested] : [],
      gear: powers.loadout.relics,
      // 일반 장비와, 대장간 유물이 바탕 장비에서 물려받은 수치 (원천 없음)
      gearItems: [...powers.loadout.wornGear, ...powers.loadout.wornInherited.map((s) => ({ stats: [s], source: { id: 'flame' as const, value: 0 } }))],
      stage: (id) => powers.loadout.stage(id),
      sourceMastery: (s) => threat.mastery[s],
      promotions: progress.promotions,
    }
  }

  /** 지금 고른 신화 (state.chosen과 같다. 자주 읽는 곳을 위해 전체 계산 없이) */
  get chosen(): string | null {
    return this.from.powers.manifested
  }

  /** 고른 신화의 개방 단계 (없으면 0) */
  get level(): number {
    const god = this.chosen
    return god ? this.from.progress.level(god) : 0
  }

  /** 지금의 빌드 상태 (부를 때마다 새로 계산한다) */
  get state(): BuildState {
    return computeBuild(this.inputs())
  }
}

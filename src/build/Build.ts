import { blessingDef } from '../data/rift'
import type { StatKind } from '../data/mythAlways'
import type { SourceId } from '../data/schema'
import type { RiftProgress } from '../progress/Rift'
import type { RelicPowers } from '../game/RelicPowers'
import type { ClassProgress } from '../myth/ClassProgress'
import { type TrialId, trialRules } from '../data/trials'
import type { ThreatProgress } from '../progress/Threat'
import type { TrialProgress } from '../progress/Trials'
import type { TrainingProgress } from '../progress/Training'
import type { AwakenProgress } from '../progress/Awakening'
import { isMythRelic, relicStats } from '../gear/mythRelic'
import { isGearUid } from '../gear/roll'
import type { ClassPassive } from '../data/classKit'
import { lentPassive } from '../myth/slots'
import { type God, godDef, isRelicId } from '../relics/data'
import { type BuildInputs, type BuildState, computeBuild } from './BuildState'

/**
 * 게임 안의 빌드 상태: 지금의 장착·성장 기록에서 재료를 모아 `computeBuild`로 계산한다.
 * 피해·능력치를 쓰는 곳(Damage, Relics, 정보 화면)은 여기서 값을 읽는다.
 */
export class Build {
  constructor(private readonly from: { powers: RelicPowers; progress: ClassProgress; threat: ThreatProgress; trials?: TrialProgress; trial?: () => TrialId | null; rift?: RiftProgress; blessings?: () => readonly string[]; training?: TrainingProgress; awaken?: AwakenProgress }) {}

  /** 지금의 재료 */
  inputs(): BuildInputs {
    const { powers, progress } = this.from
    const open = new Map<string, number>()
    for (const [god, record] of progress.records) if (record.level >= 1) open.set(god, record.level)
    const rules = trialRules(this.from.trial?.() ?? null)
    const { loadout } = powers
    // 시련 「세 칸의 짐」: 쓸 수 있는 칸만 (E16)
    const slots = loadout.slots.map((id, i) => (rules.slots && !rules.slots.includes(i) ? null : id))
    const relics = slots.map((id) => (id && isRelicId(id) ? id : null))
    const gearItems = slots.flatMap((id) => (isGearUid(id) && loadout.gear.has(id) ? [loadout.gear.get(id)!] : []))
    // 신화의 유물은 기본 수치를 낸다 (같은 단계 영웅 장비보다 조금 못하다, E21-04). 원천은 computeBuild가 유물 단계로 따로 더한다
    const relicItems = relics.flatMap((id) => (id && isMythRelic(id) ? [{ stats: relicStats(id, loadout.stage(id)), source: { id: 'flame' as const, value: 0 } }] : []))
    return {
      open,
      // 신위 칸 (E237): 주신 다음에 빌린 신
      chosen: powers.manifested ? [powers.manifested, ...powers.loadout.borrowed] : [],
      // 깨우는 신 (E238): 조각 2부터 유물이 깨어난다
      waking: loadout.waking,
      gear: relics,
      gearItems: [...gearItems, ...relicItems],
      ...this.blessed(),
      starred: this.from.rift?.lit,
      rules,
      stage: (id) => powers.loadout.stage(id),
      promotions: progress.promotions,
    }
  }

  /** 시련 보상(E16)·균열의 축복(E17)·수련의 마디(E236): 더할 수치와 각성 단계 */
  private blessed(): { bonus: Partial<Record<StatKind, number>>; awakenBonus: Partial<Record<SourceId, number>> } {
    const bonus: Partial<Record<StatKind, number>> = { ...this.from.trials?.rewards() }
    for (const [kind, value] of Object.entries(this.from.training?.stats() ?? {}) as [StatKind, number][]) bonus[kind] = (bonus[kind] ?? 0) + value
    const awakenBonus: Partial<Record<SourceId, number>> = {}
    for (const id of this.from.blessings?.() ?? []) {
      const b = blessingDef(id)
      if (b?.stat) bonus[b.stat.kind] = (bonus[b.stat.kind] ?? 0) + b.stat.value
      if (b?.awaken) awakenBonus[b.awaken] = (awakenBonus[b.awaken] ?? 0) + 1
    }
    return { bonus, awakenBonus }
  }

  /** 지금 고른 신화 (state.chosen과 같다. 자주 읽는 곳을 위해 전체 계산 없이) */
  get chosen(): string | null {
    if (this.from.trial?.() === 'noMyth') return null
    return this.from.powers.manifested
  }

  /** 신위 칸의 빌린 신들 (E237, 시련 「신화 없이」에서는 없음) */
  get borrowed(): readonly God[] {
    if (this.from.trial?.() === 'noMyth' || !this.from.powers.manifested) return []
    return this.from.powers.loadout.borrowed
  }

  /**
   * 깨우는 중인 신 (E238): 조각 1(흔적)부터 그 신의 대표 힘을 빌린다. 칸이 없어도 켜지고, 깨어나면 칸으로 옮긴다.
   * 시련 「신화 없이」에서는 없음
   */
  get waking(): God | null {
    const awaken = this.from.awaken
    if (!awaken?.waking || awaken.fragments < 1 || this.from.trial?.() === 'noMyth') return null
    return this.from.progress.isOpen(awaken.waking) ? null : awaken.waking
  }

  /** 도는 패시브: 주신의 패시브 전부(주신 단계), 빌린 신마다 대표 패시브 하나(그 신 단계), 깨우는 신의 대표 패시브(1단계) */
  passives(): { god: God; passive: ClassPassive; level: number; main: boolean }[] {
    const { progress } = this.from
    const main = this.chosen
    const out = main ? [{ god: main, passive: godDef(main).passive, level: progress.level(main), main: true }, ...this.borrowed.map((god) => ({ god, passive: lentPassive(god), level: progress.level(god), main: false }))] : []
    const waking = this.waking
    if (waking) out.push({ god: waking, passive: lentPassive(waking), level: 1, main: false })
    return out
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

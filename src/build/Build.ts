import { blessingDef } from '../data/rift'
import type { StatKind } from '../data/mythAlways'
import type { SourceId } from '../data/schema'
import type { RiftProgress } from '../progress/Rift'
import type { RelicPowers } from '../game/RelicPowers'
import type { ClassProgress } from '../myth/ClassProgress'
import { TRIAL_IDS, type TrialId, trialRules } from '../data/trials'
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
      gearItems,
      relicItems,
      ...this.blessed(),
      starred: this.from.rift?.lit,
      rules,
      stage: (id) => powers.loadout.stage(id),
      promotions: progress.promotions,
    }
  }

  /** 시련 보상(E16)·균열의 축복(E17)·수련의 마디(E236): 출처마다 더할 수치와 각성 단계 */
  private blessed(): Pick<BuildInputs, 'bonus' | 'awakenBonus'> {
    const blessings: Partial<Record<StatKind, number>> = {}
    const bonus = { trials: { ...this.from.trials?.rewards() }, training: { ...this.from.training?.stats() }, blessings }
    const awakenBonus: Partial<Record<SourceId, number>> = {}
    for (const id of this.from.blessings?.() ?? []) {
      const b = blessingDef(id)
      if (b?.stat) blessings[b.stat.kind] = (blessings[b.stat.kind] ?? 0) + b.stat.value
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

  /**
   * 도는 패시브: 주신의 패시브 전부(주신 단계), 빌린 신마다 대표 패시브 하나(그 신 단계), 깨우는 신의 대표 패시브(1단계).
   * 피해마다 읽으므로 판이 그대로면 지난 목록을 돌려준다 (E301-02). 돌려준 목록은 고치지 않는다
   */
  passives(): readonly ActivePassive[] {
    const version = this.version
    if (this.passiveMemo && this.passiveVersion === version) return this.passiveMemo
    this.passiveVersion = version
    this.passiveMemo = this.listPassives()
    return this.passiveMemo
  }

  private passiveMemo: readonly ActivePassive[] | null = null
  private passiveVersion = -1

  private listPassives(): ActivePassive[] {
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

  /**
   * 지금의 빌드 상태. 피해마다 여러 번 읽으므로 재료가 그대로면 지난 계산을 돌려준다.
   * 재료가 바뀌었는지는 inputs()가 읽는 값을 모두 적은 지문(fingerprint)으로 본다. 돌려준 값은 고치지 않는다
   */
  get state(): BuildState {
    this.refresh()
    return this.memo!
  }

  /**
   * 판 번호 (E301-02): 빌드 재료가 바뀌어 다시 계산할 때마다 하나 오른다.
   * 빌드에서 나온 값을 캐시하는 곳(도는 패시브 등)은 이 번호가 같으면 지난 값을 쓴다
   */
  get version(): number {
    this.refresh()
    return this.versionNo
  }

  private versionNo = 0

  /** 재료가 바뀌었으면 다시 계산하고 판 번호를 올린다 */
  private refresh(): void {
    this.fingerprint(this.probe)
    if (this.memo && sameList(this.probe, this.seen)) return
    this.seen.length = 0
    for (const v of this.probe) this.seen.push(v)
    this.memo = computeBuild(this.inputs())
    this.versionNo++
  }

  private memo: BuildState | null = null
  /** 지난 계산의 지문 */
  private readonly seen: unknown[] = []
  /** 이번에 읽은 지문 (부를 때마다 새로 만들지 않게 같은 배열을 다시 쓴다) */
  private readonly probe: unknown[] = []

  /**
   * inputs()가 읽는 재료를 차례로 적는다: 시련, 고른 신화·빌린 신·깨우는 신, 칸마다 장비(일반 장비는 그 물건, 유물은 단계),
   * 열린 신화의 단계(승급 합도 여기서 나온다), 시련 보상(깬 난이도), 수련 수치(익히고 되돌릴 때만 바뀌는 객체), 균열의 축복, 성좌판의 별.
   * 길이가 바뀌는 묶음 사이에는 가름표를 둔다
   */
  private fingerprint(out: unknown[]): void {
    out.length = 0
    const { powers, progress, trials, training, rift } = this.from
    const { loadout } = powers
    // 깨우는 신은 장비 쪽(loadout.waking)과 조각 쪽(awaken: 도는 패시브가 읽음)을 함께 본다
    out.push(this.from.trial?.() ?? null, loadout, powers.state.manifested, loadout.waking, this.from.awaken?.waking ?? null, this.from.awaken?.fragments ?? 0, loadout.borrowed.length)
    for (const god of loadout.borrowed) out.push(god)
    for (const id of loadout.slots) out.push(id, id && isRelicId(id) ? loadout.stage(id) : id && isGearUid(id) ? loadout.gear.get(id) : null)
    out.push(progress.records.size)
    progress.records.forEach((record, god) => out.push(god, record.level))
    if (trials) for (const id of TRIAL_IDS) out.push(trials.cleared[id] ?? 0)
    out.push(training?.stats())
    const blessings = this.from.blessings?.() ?? []
    out.push(blessings.length)
    for (const id of blessings) out.push(id)
    out.push(rift?.lit.size ?? 0)
    rift?.lit.forEach((god) => out.push(god))
  }
}

/** 도는 패시브 하나: 그 신, 패시브, 단계, 주신인가 */
export interface ActivePassive {
  god: God
  passive: ClassPassive
  level: number
  main: boolean
}

/** 두 목록이 차례대로 같은가 (값은 ===로 견준다) */
function sameList(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

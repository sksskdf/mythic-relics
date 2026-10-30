import type { StatKind } from '../data/mythAlways'
import { SOURCE_IDS } from '../data/schema'
import type { RelicPowers } from '../game/RelicPowers'
import type { ClassProgress } from '../myth/ClassProgress'
import { OATH_IDS, type OathId, oathRules } from '../data/oaths'
import type { ThreatProgress } from '../progress/Threat'
import type { OathProgress } from '../progress/Oaths'
import type { TrainingProgress } from '../progress/Training'
import type { AwakenProgress } from '../progress/Awakening'
import type { ExpeditionProgress } from '../progress/Expedition'
import { isGearUid } from '../gear/roll'
import type { ClassPassive } from '../data/classKit'
import { breathPassive, focusGod, partLevel, pantheonGods } from '../myth/pantheon'
import type { God } from '../relics/data'
import { UNIQUE_STATS } from '../skills/uniques'
import { type BuildInputs, type BuildState, computeBuild } from './BuildState'

/**
 * 게임 안의 빌드 상태: 지금의 장착·성장 기록에서 재료를 모아 `computeBuild`로 계산한다.
 * 피해·능력치를 쓰는 곳(Damage, Relics, 정보 화면)은 여기서 값을 읽는다.
 */
export class Build {
  constructor(private readonly from: { powers: RelicPowers; progress: ClassProgress; threat: ThreatProgress; oaths?: OathProgress; oath?: () => OathId | null; training?: TrainingProgress; awaken?: AwakenProgress; expedition?: ExpeditionProgress }) {}

  /** 지금의 재료 */
  inputs(): BuildInputs {
    const { powers, progress } = this.from
    const open = new Map<string, number>()
    for (const [god, record] of progress.records) if (record.level >= 1) open.set(god, record.level)
    const rules = this.rules
    const { loadout } = powers
    // 고유 효과 가운데 수치인 것(깊은 울림·사냥꾼의 눈, E303)은 그 장비의 수치로 더한다
    const gearItems = loadout.slots.flatMap((id) => (isGearUid(id) && loadout.gear.has(id) ? [withUniqueStats(loadout.gear.get(id)!)] : []))
    return {
      open,
      // 신의 자리 셋 (E302): 손의 신과 자리에 든 신들
      hand: loadout.pantheon.hand,
      present: pantheonGods(loadout.pantheon),
      // 깨우는 신 (E238): 조각 2부터 유물이 깨어난다
      waking: loadout.waking,
      // 유물표 (E303-04): 유물은 칸을 떠나 기본 수치·원천 없이 지속·행동 효과만, 켠 칸마다 +1%
      gear: loadout.relics,
      lit: loadout.litCount,
      gearItems,
      // 원정 (E304): 명성과 원천 불씨
      renown: this.from.expedition?.renown ?? 0,
      conquered: this.from.expedition?.conquests() ?? 0,
      flames: this.from.expedition?.flames ?? {},
      bonus: { oaths: { ...this.from.oaths?.rewards() }, training: { ...this.from.training?.stats() } },
      rules,
      stage: (id) => powers.loadout.stage(id),
      promotions: progress.promotions,
    }
  }

  /** 지금 건 맹세의 제약 (없으면 제약 없음). 빈 손·홀로는 도는 자리(`oathPantheon`)가 맡는다 */
  get rules(): ReturnType<typeof oathRules> {
    return oathRules(this.from.oath?.() ?? null)
  }

  /** 손에 낀 신 (state.chosen과 같다. 자주 읽는 곳을 위해 전체 계산 없이) */
  get chosen(): string | null {
    return this.from.powers.loadout.pantheon.hand
  }

  /** 심장에 낀 신 (궁극기) */
  get heart(): God | null {
    return this.from.powers.loadout.pantheon.heart
  }

  /** 손 말고 자리에 든 신들 (심장·숨) */
  get borrowed(): readonly God[] {
    const { pantheon } = this.from.powers.loadout
    return pantheonGods(pantheon).filter((g) => g !== pantheon.hand)
  }

  /** 한 신에 몰았으면 그 신 (손·심장·숨 하나가 같은 신) */
  get focus(): God | null {
    return focusGod(this.from.powers.loadout.pantheon)
  }

  /**
   * 깨우는 중인 신 (E238): 조각 1(흔적)부터 그 신의 숨을 빌린다. 자리가 없어도 켜지고, 깨어나면 자리로 옮긴다.
   * 홀로의 맹세 동안은 칸 밖의 숨도 돌지 않는다
   */
  get waking(): God | null {
    const awaken = this.from.awaken
    if (!awaken?.waking || awaken.fragments < 1 || this.rules.breath !== null) return null
    // 숨 칸에 들었으면 그쪽이 돌린다 (조각 2에 손에 쥔 것만으로는 숨이 아니다)
    if (this.from.powers.loadout.pantheon.breath.includes(awaken.waking)) return null
    return this.from.progress.isOpen(awaken.waking) ? null : awaken.waking
  }

  /**
   * 도는 패시브: 숨 칸의 신마다 그 신의 패시브(대표 힘은 1단계부터, 나머지는 단계대로, 한 신에 몰면 하나 위), 깨우는 신의 숨(1단계).
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
    const { pantheon } = this.from.powers.loadout
    const focus = focusGod(pantheon)
    const out = pantheon.breath.map((god) => ({ god, passive: breathPassive(god), level: partLevel(pantheon, god, progress.level(god)), main: god === focus }))
    const waking = this.waking
    if (waking) out.push({ god: waking, passive: breathPassive(waking), level: 1, main: false })
    return out
  }

  /** 손에 낀 신의 단계 (없으면 0) */
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
   * inputs()가 읽는 재료를 차례로 적는다: 건 맹세, 고른 신화·빌린 신·깨우는 신, 칸마다 장비(일반 장비는 그 물건, 유물은 단계),
   * 열린 신화의 단계(승급 합도 여기서 나온다), 맹세 보상(지킨 맹세), 수련 수치(익히고 되돌릴 때만 바뀌는 객체), 원정(명성·정복·불씨).
   * 길이가 바뀌는 묶음 사이에는 가름표를 둔다
   */
  private fingerprint(out: unknown[]): void {
    out.length = 0
    const { powers, progress, oaths, training } = this.from
    const { loadout } = powers
    // 깨우는 신은 장비 쪽(loadout.waking)과 조각 쪽(awaken: 도는 패시브가 읽음)을 함께 본다
    const { pantheon } = loadout
    out.push(this.from.oath?.() ?? null, loadout, pantheon.hand, pantheon.heart, loadout.waking, this.from.awaken?.waking ?? null, this.from.awaken?.fragments ?? 0, pantheon.breath.length)
    for (const god of pantheon.breath) out.push(god)
    for (const id of loadout.slots) out.push(id, id && isGearUid(id) ? loadout.gear.get(id) : null)
    // 유물표: 켠 유물과 그 단계, 켠 고유 효과 수
    out.push(loadout.lit.length, loadout.uniquesSeen.size)
    for (const id of loadout.lit) out.push(id, loadout.stage(id))
    out.push(progress.records.size)
    progress.records.forEach((record, god) => out.push(god, record.level))
    if (oaths) for (const id of OATH_IDS) out.push(oaths.has(id))
    out.push(training?.stats())
    const expedition = this.from.expedition
    if (expedition) out.push(expedition.renown, expedition.conquests(), ...SOURCE_IDS.map((s) => expedition.flames[s] ?? 0))
  }
}

/** 고유 효과 가운데 수치인 것을 그 장비의 수치 줄에 더한 모습 (없으면 그대로) */
function withUniqueStats<T extends { stats: readonly { kind: StatKind; value: number }[]; unique?: string; unique2?: string }>(item: T): T {
  const extra = [item.unique, item.unique2].flatMap((u) => (u && UNIQUE_STATS[u] ? [UNIQUE_STATS[u]!] : []))
  return extra.length ? { ...item, stats: [...item.stats, ...extra] } : item
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

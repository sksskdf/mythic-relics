import { AUTOMATION, RENOWN, renownExponent } from '../../data/cycle'
import { OATH, type OathId, OATHS } from '../../data/oaths'
import { type AutomationData, parseAutomation } from '../../progress/Automation'
import type { OathData } from '../../progress/Oaths'
import { type ChapterData, ChapterProgress } from '../../progress/Chapters'
import { parseWaypoints } from '../../progress/Waypoints'
import { type God, GODS } from '../../relics/data'
import { oldStars } from './legacy'

/**
 * 저장 v17 옮기기 (E305, `CYCLE.md` 9장 v17): 맹세·깊이·자동화·끝없는 원정으로 바꾸며 한 번만 하는 일.
 * `parseSave`가 옛 키가 있는지(새 키가 없는지)로 부른다. 버전만 보지 않는 까닭: E305 도중의 v17 개발판도 옛 모양을 들고 있다.
 * 옮긴 저장은 새 키로만 쓰니, 두 번 불러와도 명성을 다시 주지 않는다
 */

/** 옛 시련 id → 맹세 (D2: 침묵한 신 → 침묵, 신 없는 싸움 → 빈 손, 세 칸의 짐 → 홀로. 나머지 다섯은 이름 그대로 엔딩 뒤) */
export const TRIAL_TO_OATH: Readonly<Record<string, OathId>> = {
  noUltimate: 'silence',
  noMyth: 'emptyHand',
  fewSlots: 'alone',
  noHeal: 'noHeal',
  crowd: 'crowd',
  timed: 'timed',
  glass: 'glass',
  slow: 'slow',
}

/** 옛 시련 기록(E16)에서 시련마다 깬 가장 높은 난이도 (1~5, 모르는 시련은 버린다) */
function trialLevels(raw: unknown): Record<string, number> {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const c = (typeof o.cleared === 'object' && o.cleared !== null ? o.cleared : {}) as Record<string, unknown>
  const out: Record<string, number> = {}
  for (const [trial, n] of Object.entries(c)) if (TRIAL_TO_OATH[trial] && typeof n === 'number' && Number.isFinite(n) && n >= 1) out[trial] = Math.min(5, Math.round(n))
  return out
}

/**
 * 옛 시련 기록 → 맹세: 한 단계라도 깬 시련은 짝인 맹세를 지킨 것으로.
 * 시련 기록(결계 싸움 초)은 원정 기록과 재는 것이 달라 기준 시간으로 둔다
 */
export function oathsFromTrials(raw: unknown): OathData {
  const kept: OathId[] = []
  const best: OathData['best'] = {}
  for (const trial of Object.keys(trialLevels(raw))) {
    const id = TRIAL_TO_OATH[trial]!
    if (kept.includes(id)) continue
    kept.push(id)
    best[id] = OATH.par
  }
  return { kept, best }
}

/**
 * 옛 시련 보상 가운데 모든 피해 몫 (E16 그대로): 세 칸의 짐을 깬 난이도마다 +2%, 깬 난이도의 합이 4부터 ×1.25 (「시련의 맛」).
 * 다른 시련 보상은 모든 피해가 아니라 짝인 맹세의 보상이 이어받는다
 */
export const LEGACY_TRIAL_DAMAGE = { trial: 'fewSlots', per: 0.02, milestone: 4, scale: 1.25 } as const

/** 명성 배율이 m이 되는 누적 명성 (`renownMultiplier`의 역함수) */
export function renownForMultiplier(m: number, conquered = 0): number {
  if (!(m > 1)) return 0
  return ((m ** (1 / renownExponent(conquered)) - 1) / RENOWN.per) ** 2
}

/**
 * 옛 시련의 난이도를 명성으로 돌려준다 (D10). 맹세에는 난이도가 없어 옛 시련 보상의 모든 피해 몫이 사라지니,
 * 그 몫에서 짝인 맹세가 주는 모든 피해를 뺀 만큼을 명성 배율로 메운다 (그 저장의 장 정복 수로 역함수, 반올림).
 * 「깬 단계 하나마다 같은 명성」은 쓰지 않는다: 명성 배율이 √라 명성 1만 줘도 정복 둘인 저장의 공격 지수가 ×1.12가 되어
 * 옮기기 전의 0.9~1.1배를 지키지 못한다 (`tests/save.test.ts`의 견본)
 */
export function legacyTrialRenown(raw: unknown, conquered: number): number {
  const levels = trialLevels(raw)
  const total = Object.values(levels).reduce((s, n) => s + n, 0)
  const d = LEGACY_TRIAL_DAMAGE
  const lost = (levels[d.trial] ?? 0) * d.per * (total >= d.milestone ? d.scale : 1)
  const kept = new Set(Object.keys(levels).map((t) => TRIAL_TO_OATH[t]!))
  const gained = [...kept].reduce((s, id) => s + (OATHS[id].reward.kind === 'damage' ? OATHS[id].reward.value : 0), 0)
  return Math.round(renownForMultiplier(1 + lost - gained, conquered))
}

/** 성좌판의 별 하나를 바꿔 주는 명성 (D10, E305-03) */
export const LEGACY_STAR_RENOWN = 20

/**
 * 성좌판(E17-05)을 걷었으니 밝힌 별과 남은 별 하나마다 명성 20을 준다.
 * 밝힌 별은 있는 신만 세고, v5 이하 별자리의 별(`oldStars`)은 남은 별로 친다
 */
export function legacyStarRenown(rift: unknown, cycle: unknown, version: number): number {
  const o = (typeof rift === 'object' && rift !== null ? rift : {}) as Record<string, unknown>
  const left = typeof o.stars === 'number' && Number.isFinite(o.stars) ? Math.max(0, Math.min(999, Math.round(o.stars))) : 0
  const lit = new Set((Array.isArray(o.lit) ? o.lit : []).filter((g): g is God => typeof g === 'string' && Object.hasOwn(GODS, g))).size
  return (left + lit + (version < 6 ? oldStars(cycle) : 0)) * LEGACY_STAR_RENOWN
}

/**
 * 웨이포인트 키가 없는 저장(v16 이하, 그리고 E305-03 전의 v17 개발판): 옛 편의(`conveniences`)의 켠 성소(`visited`).
 * 빠뜨리면 켠 성소가 모두 사라진다
 */
export function oldVisited(conveniences: unknown): string[] {
  const o = (typeof conveniences === 'object' && conveniences !== null ? conveniences : {}) as Record<string, unknown>
  return parseWaypoints(o.visited)
}

/**
 * 옛 편의(E14-05) → 자동화 세기: 주운 수만 남긴다. 나머지 자동화는 귀환 횟수·엔딩에서 다시 셈한다 (엔딩을 봤으면 귀환 3 이상으로 쳐서 유지된다).
 * 이미 열어 둔 자동 줍기는 주운 수를 문턱까지 채워 그대로 켜 둔다 (예전에는 문턱이 달랐던 때도 있다)
 */
export function oldAutomation(conveniences: unknown): AutomationData {
  const data = parseAutomation(conveniences)
  const o = (typeof conveniences === 'object' && conveniences !== null ? conveniences : {}) as Record<string, unknown>
  if (Array.isArray(o.open) && o.open.includes('autoPickup')) data.counters.pickups = Math.max(data.counters.pickups ?? 0, AUTOMATION.pickup.need)
  return data
}

/**
 * 원정 기록이 없던 저장(v15 이하)의 원정 번호를 짐작한다: 장 진행이 이미 지나온 할 일 「귀환」의 횟수 + 1.
 * 지나온 귀환 = 같은 장에서 그 뒤의 할 일(귀환 말고)을 이미 했다. 지나온 장의 귀환에 다시 막히지 않고, 지금 장의 귀환은 새 순환대로 한다.
 * `CYCLE.md` 9장의 「1 + 이긴 장 보스 + ⌊깨운 신 ÷ 2⌋」는 쓰지 않는다: 그리스 장 들머리 저장(거인 왕 + 신 둘 = 3)에서 델포이의 귀환 2까지 채워
 * 제우스를 깨우는 목표를 건너뛰게 한다. 명성·불씨는 주지 않는다 (신 단계가 그대로라 힘이 같다)
 */
export function estimateExpeditions(chapters: ChapterData, awakened: (realm: string) => number, forged: number): number {
  const progress = new ChapterProgress({ awakened, forged: () => forged, returns: () => 0 })
  progress.load(chapters)
  let returns = 0
  for (const chapter of progress.chapters) {
    chapter.steps.forEach((step, i) => {
      if (step.kind !== 'return') return
      if (chapter.steps.slice(i + 1).some((s) => s.kind !== 'return' && progress.done(s))) returns = Math.max(returns, step.n ?? 0)
    })
  }
  return 1 + returns
}

import type { ClassPassive } from '../data/classKit'
import { godPowers, power, type PowerSlots, relicPowerId, ultimateId, weaponId } from '../data/powers'
import { type God, godDef, type RelicId } from '../relics/data'

/**
 * 신의 자리 셋 (E302, `DESIGN.md` 4.2): 주신 하나가 무기·궁극기·패시브·모습을 통째로 정하던 고정 클래스를 풀었다.
 * 깨운 신마다 부품 셋을 내놓고, 신을 가리지 않고 끼워 섞는다.
 * - 손(1칸): 기본 공격 동작·사거리·리듬·기본 공격 배율, 쥔 무기와 표식
 * - 심장(1칸): 궁극기
 * - 숨(1 → 4칸): 그 신의 패시브. 대표 힘(`gods.json`의 lend)은 1단계부터, 나머지는 신 단계가 오르면 `minLevel`대로
 * 손·심장·숨 하나를 모두 한 신으로 채우면 「한 신에 몰기」: 그 신 부품의 효과 단계가 하나 위, 그 신의 모습을 입는다
 */
export interface Pantheon {
  hand: God | null
  heart: God | null
  breath: God[]
}

/** 부품 이름 */
export type PartKind = 'hand' | 'heart' | 'breath'

/** 숨 칸의 끝: 데모 넷, 엔딩 뒤 다섯 (`DESIGN.md` 4.2: 키마이라·홀로의 맹세를 다 받으면 엔딩 뒤 다섯째) */
export const MAX_BREATH = 5
export const DEMO_BREATH = 4

export const emptyPantheon = (): Pantheon => ({ hand: null, heart: null, breath: [] })

/** 숨 칸 수: 처음 신이 깨어나면 1, 둘째 신 2, 정복한 장(거인 왕·키마이라, E305-02)마다, 지킨 홀로의 맹세(E305-01)로 하나 더. 끝은 데모 4 */
export function breathCount(awakened: number, conquered: number, oath = 0, cap = DEMO_BREATH): number {
  if (awakened <= 0) return 0
  return Math.min(cap, 1 + (awakened >= 2 ? 1 : 0) + conquered + oath)
}

/** 지금 숨 칸의 끝: 엔딩 전 4, 엔딩 뒤(맹세 여덟이 열린 뒤) 5 */
export const breathCap = (afterEnding: boolean): number => (afterEnding ? MAX_BREATH : DEMO_BREATH)

/** 게임에서 숨 칸 수를 세는 데 읽는 것 */
export interface BreathState {
  readonly progress: { readonly opened: readonly unknown[] }
  readonly chapters: { readonly conquered: number }
  readonly oaths: { readonly breath: number }
  readonly ending: { has(feature: 'oaths'): boolean }
}

/** 지금 숨 칸 수 (자리·장 정복 카드·맹세 카드·신 탭이 함께 쓴다): 깨어난 신·정복한 장·지킨 홀로의 맹세, 끝은 엔딩 전 4·엔딩 뒤 5 */
export function breathSlots(s: BreathState): number {
  return breathCount(s.progress.opened.length, s.chapters.conquered, s.oaths.breath, breathCap(s.ending.has('oaths')))
}

/**
 * 맹세를 건 동안 도는 자리 (E305-01): 저장되는 자리는 그대로 두고, 빈 손이면 손을 비우고(낡은 검) 홀로면 숨을 앞에서 그만큼만.
 * 원본은 바꾸지 않는다
 */
export function oathPantheon(p: Pantheon, rules: { emptyHand: boolean; breath: number | null }): Pantheon {
  if (!rules.emptyHand && rules.breath === null) return p
  return { hand: rules.emptyHand ? null : p.hand, heart: p.heart, breath: rules.breath === null ? p.breath : p.breath.slice(0, rules.breath) }
}

/** 자리에 든 신들 (겹치지 않게, 손 → 심장 → 숨 차례) */
export function pantheonGods(p: Pantheon): God[] {
  return [...new Set([p.hand, p.heart, ...p.breath].filter((g): g is God => g !== null))]
}

/** 그 신이 어느 자리든 들어 있나 (그 신의 유물이 깨어난다) */
export function inPantheon(p: Pantheon, god: God): boolean {
  return p.hand === god || p.heart === god || p.breath.includes(god)
}

/** 한 신에 몰았나: 손·심장·숨 하나가 모두 같은 신이면 그 신 */
export function focusGod(p: Pantheon): God | null {
  return p.hand !== null && p.hand === p.heart && p.breath.includes(p.hand) ? p.hand : null
}

/**
 * 그 신의 힘이 도는 단계: 신 단계 그대로. 만나기만 한 신(단계 0)의 힘도 1단계 값으로 돈다.
 * 한 신에 모아도 덤은 없다 (재미 재설계: 한 신 덤을 걷었다)
 */
export function partLevel(level: number): number {
  return Math.min(4, Math.max(1, level))
}

/**
 * 칸에서 자리 셋을 읽는다 (재미 재설계 P2): 전투의 원천은 칸이고, 자리 셋은 칸을 신 단위로 본 모습일 뿐이다.
 * 손 = 칸 무기의 신, 심장 = 칸 궁극기의 신, 숨 = 칸의 패시브 힘의 신들 (칸의 차례, 겹치지 않게).
 * 자리 셋을 읽던 화면·규칙(초상, 승천 갈래, 신 탭)은 이 모습을 그대로 읽는다
 */
export function slotsPantheon(slots: PowerSlots): Pantheon {
  const god = (id: string | null) => (id ? (power(id)?.god ?? null) : null)
  const breath = slots.auras.flatMap((id) => (power(id)?.source.from === 'passive' ? [power(id)!.god] : []))
  return { hand: god(slots.weapon), heart: god(slots.ultimate), breath: [...new Set(breath)] }
}

/**
 * 자리 셋 → 칸 (점검용 지름길 `dev.pantheon`과 시험): 손 = 그 신의 무기, 심장 = 그 신의 궁극기,
 * 숨 = 그 신들의 패시브 힘 모두, 그리고 함께 끼울 유물(`relics`)의 힘. 칸 수는 보지 않는다
 */
export function seatedSlots(p: Pantheon, relics: readonly RelicId[] = []): PowerSlots {
  const passives = p.breath.flatMap((g) => godPowers(g).filter((x) => x.source.from === 'passive').map((x) => x.id))
  const lit = relics.map(relicPowerId)
  return { weapon: p.hand ? weaponId(p.hand) : null, ultimate: p.heart ? ultimateId(p.heart) : null, auras: [...new Set([...passives, ...lit])] }
}

/**
 * 맹세를 건 동안 도는 칸 (E305-01 → P2): 저장되는 칸은 그대로 두고, 빈 손이면 무기를 비우고(맨손),
 * 홀로면 패시브 힘을 앞의 신 그만큼만 남긴다 (유물 힘은 그대로 돈다). 원본은 바꾸지 않는다
 */
export function oathSlots(slots: PowerSlots, rules: { emptyHand: boolean; breath: number | null }): PowerSlots {
  if (!rules.emptyHand && rules.breath === null) return slots
  const keep = rules.breath === null ? null : new Set(slotsPantheon(slots).breath.slice(0, rules.breath))
  const auras = keep ? slots.auras.filter((id) => power(id)?.source.from !== 'passive' || keep.has(power(id)!.god)) : slots.auras
  return { weapon: rules.emptyHand ? null : slots.weapon, ultimate: slots.ultimate, auras }
}

const breathCache = new Map<God, ClassPassive>()

/**
 * 숨 칸의 패시브: 그 신의 패시브 부품 전부. 대표 힘은 1단계부터 켜지고, 나머지는 `minLevel`대로 풀린다.
 * 피해 배율·공격 빠르기는 손의 몫이라 여기서는 1이다
 */
export function breathPassive(god: God): ClassPassive {
  let out = breathCache.get(god)
  if (!out) {
    const def = godDef(god)
    const passive: ClassPassive = { ...def.passive, damageScale: 1, attackSpeed: 1 }
    const lend = def.passive[def.lend]
    if (lend && typeof lend === 'object' && 'minLevel' in lend) (passive as unknown as Record<string, unknown>)[def.lend] = { ...lend, minLevel: 1 }
    out = passive
    breathCache.set(god, out)
  }
  return out
}

/** 그 자리에 그 신을 넣는다. 숨은 칸이 남았으면 더하고, 이미 들었으면 그대로 */
export function withPart(p: Pantheon, part: PartKind, god: God, breathSlots: number): Pantheon {
  if (part === 'hand') return { ...p, hand: god }
  if (part === 'heart') return { ...p, heart: god }
  if (p.breath.includes(god) || p.breath.length >= breathSlots) return p
  return { ...p, breath: [...p.breath, god] }
}

/** 숨 칸에서 뺀다 */
export function withoutBreath(p: Pantheon, god: God): Pantheon {
  return p.breath.includes(god) ? { ...p, breath: p.breath.filter((g) => g !== god) } : p
}

/** 숨 칸이 줄었으면(옛 저장·칸 수 계산이 바뀜) 뒤에서 뺀다 */
export function fitBreath(p: Pantheon, breathSlots: number): Pantheon {
  return p.breath.length > breathSlots ? { ...p, breath: p.breath.slice(0, breathSlots) } : p
}

/**
 * 새로 얻은 부품을 빈 자리에 저절로 넣는다 (E302-03, 장비 줍기와 같은 규칙). 손이 비었으면(낡은 검) 쥐고,
 * 심장이 비었으면 그 궁극기를, 숨은 칸이 남았으면 넣는다. 들어간 자리를 돌려준다
 */
export function autoFill(p: Pantheon, god: God, parts: readonly PartKind[], breathSlots: number): { next: Pantheon; placed: PartKind[] } {
  let next = p
  const placed: PartKind[] = []
  for (const part of parts) {
    const empty = part === 'hand' ? next.hand === null : part === 'heart' ? next.heart === null : !next.breath.includes(god) && next.breath.length < breathSlots
    if (!empty) continue
    next = withPart(next, part, god, breathSlots)
    placed.push(part)
  }
  return { next, placed }
}

/** 옛 주신·빌린 신 칸(E237: 첫째가 주신, 뒤가 빌린 신) → 자리 셋. 옛 주신은 손·심장·숨 첫 칸으로 (한 신에 몰기라 힘이 거의 같다) */
export function fromChosen(chosen: readonly God[]): Pantheon {
  const main = chosen[0] ?? null
  return { hand: main, heart: main, breath: [...chosen].slice(0, MAX_BREATH) }
}

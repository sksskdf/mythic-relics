import { auraSlots, emptySlots, godPowers, guardianSource, hashText, power, type PowerId, relicPowerId, traceSource, ultimateId, weaponId } from '../../data/powers'
import type { Pantheon } from '../../myth/pantheon'
import type { PowerData } from '../../progress/Powers'
import type { God, RelicId } from '../../relics/data'

/**
 * 저장 v18 옮기기 (재미 재설계 2026-11-20, `docs/knowledge/review-e307/redesign.md` 2장): 신 단위로 열던 것을 힘 하나하나로.
 * `parseSave`가 `powers` 키가 없는 저장(v17 이하)에서 부른다. 옮긴 뒤에도 힘이 줄지 않게:
 * - 깨운 신(단계 1 이상)은 만난 신이고, 그 신의 힘을 모두 가진 것으로 친다. 흔적과 수호자는 이미 고른 출처다
 * - 깨우는 도중인 신(흔적의 무리를 이김)은 만난 신이고 무기를 가진 것으로. 수호자는 아직 고르지 않았다
 * - 지금 자리 셋에 든 신의 힘을 칸에 끼운다: 손 → 무기, 심장 → 궁극기,
 *   숨의 신마다 패시브 부품, 그다음 자리에 든 신의 켠 유물 (도는 힘의 칸 수까지, 넘친 것은 가진 힘으로 남는다)
 */
export function powersFromV17(o: {
  /** 신마다 단계 (1부터 깨어남) */
  classes: Readonly<Partial<Record<God, { level: number }>>>
  pantheon: Pantheon
  /** 깨우는 도중인 신 */
  waking: God | null
  /** 유물표에 켠 유물 */
  lit: readonly RelicId[]
  /** 귀환 수 (원정 번호 − 1) */
  returns: number
}): PowerData {
  const opened = (Object.keys(o.classes) as God[]).filter((god) => (o.classes[god]?.level ?? 0) >= 1)
  const met = [...opened]
  const owned: PowerId[] = opened.flatMap((god) => godPowers(god).map((p) => p.id))
  const claimed = opened.flatMap((god) => [traceSource(god), guardianSource(god)])
  if (o.waking && !met.includes(o.waking)) {
    met.push(o.waking)
    owned.push(weaponId(o.waking))
    claimed.push(traceSource(o.waking))
  }
  const has = (id: PowerId | null): id is PowerId => id !== null && owned.includes(id)
  const slots = emptySlots()
  const hand = o.pantheon.hand ? weaponId(o.pantheon.hand) : null
  const heart = o.pantheon.heart ? ultimateId(o.pantheon.heart) : null
  if (has(hand)) slots.weapon = hand
  if (has(heart)) slots.ultimate = heart
  const seated = new Set([o.pantheon.hand, o.pantheon.heart, ...o.pantheon.breath])
  const auras: PowerId[] = [
    ...o.pantheon.breath.flatMap((god) => godPowers(god).filter((p) => p.source.from === 'passive').map((p) => p.id)),
    ...o.lit.map(relicPowerId).filter((id) => seated.has(power(id)?.god ?? null)),
  ]
  slots.auras = [...new Set(auras.filter(has))].slice(0, auraSlots(o.returns))
  // 씨앗은 저장에서 정한다: 같은 옛 저장은 몇 번을 옮겨도 같은 셋을 내민다
  const seed = hashText(JSON.stringify([o.classes, o.pantheon, o.waking, o.lit, o.returns]))
  return { owned, slots, claimed, met, seed }
}

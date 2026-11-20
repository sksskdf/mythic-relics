import { auraSlots, emptySlots, godPowers, guardianSource, hashText, lendPower, power, type PowerId, relicPowerId, traceSource, ultimateId, weaponId } from '../../data/powers'
import type { Pantheon } from '../../myth/pantheon'
import type { PowerData } from '../../progress/Powers'
import type { God, RelicId } from '../../relics/data'

/**
 * 저장 v18 옮기기 (재미 재설계 2026-11-20, `docs/knowledge/review-e307/redesign.md` 2장): 신 단위로 열던 것을 힘 하나하나로.
 * `parseSave`가 `powers` 키가 없는 저장(v17 이하)에서 부른다. 옮긴 뒤에도 힘이 줄지 않게:
 * - 깨운 신(단계 1 이상)은 만난 신이고, 그 신의 힘을 모두 가진 것으로 친다. 흔적과 수호자는 이미 고른 출처다
 * - 깨우는 도중인 신(흔적의 무리를 이김)은 만난 신이고 무기와 대표 패시브(빌린 힘)를 가진 것으로. 수호자는 아직 고르지 않았다
 * - 켠 유물의 힘은 모두 가진 것으로 (깨우는 도중인 신의 유물도)
 * - 지금 자리 셋에 든 신의 힘을 칸에 끼운다: 손 → 무기, 심장 → 궁극기,
 *   도는 힘은 손의 신의 켠 유물 → 숨의 신마다 패시브 부품 → 깨우는 신의 대표 패시브 → 자리에 든 신·깨우는 신의 켠 유물
 *   (도는 힘의 칸 수까지, 넘친 것은 가진 힘으로 남는다)
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
  // 켠 유물의 힘은 그 신을 깨웠든 아니든 모두 가진 것이다 (조각 2는 유물이 함께 온다)
  const owned: PowerId[] = [...new Set([...opened.flatMap((god) => godPowers(god).map((p) => p.id)), ...o.lit.map(relicPowerId)])]
  const claimed = opened.flatMap((god) => [traceSource(god), guardianSource(god)])
  const borrowed = o.waking && !met.includes(o.waking) ? o.waking : null
  const lend = borrowed ? lendPower(borrowed) : undefined
  if (borrowed) {
    met.push(borrowed)
    owned.push(weaponId(borrowed))
    if (lend) owned.push(lend)
    claimed.push(traceSource(borrowed))
  }
  const has = (id: PowerId | null): id is PowerId => id !== null && owned.includes(id)
  const slots = emptySlots()
  const hand = o.pantheon.hand ? weaponId(o.pantheon.hand) : null
  const heart = o.pantheon.heart ? ultimateId(o.pantheon.heart) : null
  if (has(hand)) slots.weapon = hand
  if (has(heart)) slots.ultimate = heart
  const seated = new Set([o.pantheon.hand, o.pantheon.heart, ...o.pantheon.breath, borrowed])
  const litOf = (gods: ReadonlySet<God | null>) => o.lit.map(relicPowerId).filter((id) => gods.has(power(id)?.god ?? null))
  // 칸이 모자라면 뒤에서 잘린다: 손에 쥔 신의 켠 유물(기본 공격에 얽힌 행동)을 패시브보다 앞세워 밀려나지 않게 한다
  const auras: PowerId[] = [
    ...litOf(new Set([o.pantheon.hand])),
    ...o.pantheon.breath.flatMap((god) => godPowers(god).filter((p) => p.source.from === 'passive').map((p) => p.id)),
    ...(lend ? [lend] : []),
    ...litOf(seated),
  ]
  slots.auras = [...new Set(auras.filter(has))].slice(0, auraSlots(o.returns))
  // 씨앗은 저장에서 정한다: 같은 옛 저장은 몇 번을 옮겨도 같은 셋을 내민다
  const seed = hashText(JSON.stringify([o.classes, o.pantheon, o.waking, o.lit, o.returns]))
  return { owned, slots, claimed, met, seed }
}

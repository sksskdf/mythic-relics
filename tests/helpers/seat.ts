import type { RelicPowers } from '../../src/game/RelicPowers'
import { type Pantheon, pantheonGods, seatedSlots } from '../../src/myth/pantheon'
import { relicDef } from '../../src/relics/data'

/**
 * 시험용: 자리 셋 모양으로 칸을 채운다 (P2부터 전투의 원천은 칸이다).
 * 손 = 그 신의 무기, 심장 = 그 신의 궁극기, 숨 = 그 신들의 패시브 힘, 자리에 든 신의 켠 유물 힘
 */
export function seat(powers: RelicPowers, p: Pantheon) {
  const seated = pantheonGods(p)
  return powers.setSlots(seatedSlots(p, powers.loadout.lit.filter((id) => seated.includes(relicDef(id).god))))
}

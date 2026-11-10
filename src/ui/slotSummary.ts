import type { BodyLook } from '../looks/body'
import { REGIONS } from '../data/regions'
import { godDef } from '../relics/data'
import type { SaveData } from '../save/SaveData'

/** 처음 화면의 저장 슬롯 카드에 보일 것. 빈 슬롯이면 null */
export interface SlotSummary {
  /** 주인공의 기본 모습 (초상을 그린다) */
  body: BodyLook
  /** 큰 글: 지금 있는 땅 */
  title: string
  /** 작은 글: 깨운 신의 수와 유물표에 켠 유물 수 */
  meta: string
  /** 손에 쥔 신의 색 (초상 테의 빛). 손이 비었으면 빈 문자열 */
  color: string
}

/**
 * 저장 → 슬롯 카드 (E307). 주인공의 초상과 지금 있는 땅을 보이고, 신의 칭호·문장으로 나를 부르지 않는다 (사용자 의견 4).
 * 유물은 유물표(`lit`)에서 센다: 칸·가방에는 일반 장비만 있어 거기서 세면 늘 0이었다 (E303-04에서 유물이 칸을 떠났다)
 */
export function slotSummary(data: SaveData): SlotSummary {
  const awakened = Object.values(data.classes).filter((r) => (r?.level ?? 0) >= 1).length
  const hand = data.pantheon.hand
  return {
    body: data.body,
    title: REGIONS[data.region?.id ?? 'village']?.name ?? '모닥불 마을',
    meta: `깨운 신 ${awakened} · 유물 ${data.lit.length}개`,
    color: hand ? godDef(hand).color : '',
  }
}

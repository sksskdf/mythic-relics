import { type BodyLook, bodyKey } from '../looks/body'
import type { LookSlot } from '../looks/catalog'
import type { LookChoice, Outfit } from '../looks/outfit'

/** 고르지 않으면 비는 칸 (기본 모험가도 아무것도 걸치지 않고, 장비도 덮지 않는 칸): 「자동」이 곧 「비우기」다 */
export const OPTIONAL: ReadonlySet<LookSlot> = new Set(['face', 'waist', 'cape', 'mark'])

/** 보관함의 칩 하나 */
export interface WardrobeChip {
  /** 누르면 고르는 것 */
  choice: LookChoice
  /** 맨 앞 칩의 종류: 장착을 따른다(auto) / 비운다(none). 외형 칩은 없음 */
  kind: 'auto' | 'none' | null
  /** 이름을 보일 외형 (없으면 그림만) */
  look: string | null
  /** 지금 입은 것 */
  on: boolean
}

/**
 * 고른 칸의 칩 줄 (E307): 맨 앞은 「장착을 따른다」(비는 칸은 「비우기」), 그 뒤로 얻은 외형.
 * 칩의 차례와 개수는 무엇을 골랐는지와 상관없이 같다 (고른 칩은 표시 `on`만 바뀐다):
 * 전에는 자동을 고른 동안에만 자동과 같은 외형 칩을 숨겨, 다른 옷을 고르는 순간 칩이 하나 늘며 뒤가 한 칸씩 밀렸다.
 * 같은 자리를 한 번 더 누르면 다른 옷이 골라졌다.
 * 자동이 입히는 외형(auto)과 같은 칩은 늘 뺀다: 맨 앞 칩이 그 이름을 달고 있다. 그 외형을 직접 골라 둔 것(장비를 끼고 있을 때 고른 기본 옷이
 * 장비를 벗은 뒤 자동과 같아진 것)은 맨 앞 칩이 켜진 것으로 보인다
 */
export function wardrobeChips(slot: LookSlot, auto: string | null, options: readonly string[], current: LookChoice): WardrobeChip[] {
  const optional = OPTIONAL.has(slot)
  // 비는 칸의 옛 「비우기」(null)는 고르지 않은 것과 같다
  const first = current === 'auto' || (optional ? current === null : false) || (auto !== null && current === auto)
  return [
    { choice: 'auto', kind: optional ? 'none' : 'auto', look: optional ? null : auto, on: first },
    ...options.filter((id) => id !== auto).map((id): WardrobeChip => ({ choice: id, kind: null, look: id, on: !first && current === id })),
  ]
}

/** 직접 골라 둔 칸인가 (부위 칸의 금빛 점): 켜진 칩이 맨 앞 칩이 아닐 때 */
export function isPinned(slot: LookSlot, auto: string | null, current: LookChoice): boolean {
  return current !== 'auto' && !(current === null && OPTIONAL.has(slot)) && !(auto !== null && current === auto)
}

/** 미리 보기 인형이 받는 것 (`HeroPreview`·주인공 모델에서 쓰는 것만) */
export interface Doll {
  wear(outfit: Outfit): void
  setBody(body: BodyLook): void
}

/**
 * 미리 보기 인형을 게임 속 주인공과 같은 모습으로 맞춘다 (E307 손 QA): 캐릭터 만들기에서 고른 기본 모습(피부·머리카락·옷 색)을 칠하고
 * 지금 모습을 입힌다. 전에는 입히기만 해서, 붉은 머리를 고른 사람의 미리 보기가 기본 갈색 머리였다 (게임 속 주인공과 초상은 붉은 머리).
 * 기본 모습은 바뀌었을 때만 다시 칠한다 (칠하면 모든 칸의 모델을 다시 만든다).
 * painted는 인형에 칠해 둔 기본 모습의 열쇠(`bodyKey`)이고, 돌려주는 것은 이번에 칠한 것의 열쇠다: 다음에 다시 넘긴다
 */
export function dressDoll(doll: Doll, body: BodyLook, outfit: Outfit, painted: string): string {
  const key = bodyKey(body)
  if (key !== painted) doll.setBody(body)
  doll.wear(outfit)
  return key
}

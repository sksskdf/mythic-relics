/**
 * 외형 목록. (E3, DESIGN.md 4.2·8.4)
 * 주인공의 모습은 부위(칸)마다 외형 하나를 끼우는 방식으로 만든다.
 * 이 파일은 이름과 부위만 담고(데이터 검사에서도 쓴다), 복셀 모델은 src/voxel/models/looks.ts에 있다.
 */

/** 외형 칸. 위에서부터 그리는 순서와 상관없고, 보관함에 보이는 순서다. */
export const LOOK_SLOTS = ['head', 'face', 'torso', 'waist', 'arms', 'legs', 'weapon', 'cape', 'aura'] as const
export type LookSlot = (typeof LOOK_SLOTS)[number]

export const SLOT_NAMES: Readonly<Record<LookSlot, string>> = {
  head: '머리',
  face: '얼굴',
  torso: '몸',
  waist: '허리',
  arms: '팔',
  legs: '다리',
  weapon: '무기',
  cape: '망토',
  aura: '기운',
}

export interface LookDef {
  id: string
  slot: LookSlot
  /** 보관함에 보이는 이름 */
  name: string
}

const list: LookDef[] = [
  // 기본 모험가: 어느 신도 떠올리지 않는 수수한 모습
  { id: 'adventurerHood', slot: 'head', name: '모험가의 두건' },
  { id: 'adventurerTunic', slot: 'torso', name: '모험가의 웃옷' },
  { id: 'adventurerSleeves', slot: 'arms', name: '모험가의 소매' },
  { id: 'adventurerBoots', slot: 'legs', name: '모험가의 장화' },
  { id: 'shortSword', slot: 'weapon', name: '짧은 검' },
  // 유물 외형
  { id: 'mjolnirHammer', slot: 'weapon', name: '묠니르' },
  { id: 'megingjordBelt', slot: 'waist', name: '메긴교르드' },
  { id: 'ironGauntlets', slot: 'arms', name: '야른그레이프르' },
  { id: 'lokiMaskFace', slot: 'face', name: '변신의 가면' },
  // 발현 외형: 천둥의 신
  { id: 'thorHelm', slot: 'head', name: '천둥의 날개 투구' },
  { id: 'thorTunic', slot: 'torso', name: '털 어깨 전투복' },
  { id: 'thorCape', slot: 'cape', name: '붉은 망토' },
  { id: 'thorSparks', slot: 'aura', name: '푸른 전기' },
  // 발현 외형: 변신술사
  { id: 'lokiCrown', slot: 'head', name: '뿔 장식 관' },
  { id: 'lokiTunic', slot: 'torso', name: '초록 비단옷' },
  { id: 'lokiCape', slot: 'cape', name: '초록 망토' },
  { id: 'lokiShadow', slot: 'aura', name: '일렁이는 그림자' },
]

export const LOOKS: Readonly<Record<string, LookDef>> = Object.fromEntries(list.map((look) => [look.id, look]))
export const LOOK_IDS: readonly string[] = list.map((look) => look.id)

/** 처음 모습. 비어 있는 칸(null)은 아무것도 걸치지 않는다. */
export const BASE_OUTFIT: Readonly<Record<LookSlot, string | null>> = {
  head: 'adventurerHood',
  face: null,
  torso: 'adventurerTunic',
  waist: null,
  arms: 'adventurerSleeves',
  legs: 'adventurerBoots',
  weapon: 'shortSword',
  cape: null,
  aura: null,
}

/** 처음부터 가진 외형 (기본 모험가) */
export const STARTING_LOOKS: readonly string[] = Object.values(BASE_OUTFIT).filter((id): id is string => id !== null)

export function lookDef(id: string): LookDef {
  const def = LOOKS[id]
  if (!def) throw new Error(`없는 외형: ${id}`)
  return def
}

export function isLookId(value: unknown): value is string {
  return typeof value === 'string' && Object.hasOwn(LOOKS, value)
}

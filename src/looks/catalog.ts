import { CLASS_LOOKS } from './classLooks'
import { GEAR_LOOKS } from './gearLooks'

/**
 * 외형 목록. (E3, DESIGN.md 10.4)
 * 주인공의 모습은 부위(칸)마다 외형 하나를 끼우는 방식으로 만든다.
 * 이 파일은 이름과 부위만 담고(데이터 검사에서도 쓴다), 복셀 모델은 src/voxel/models/looks.ts에 있다.
 *
 * 유물·클래스·외형의 정합 (데이터 검사로 강제한다)
 * - 유물 하나는 부위 하나를 차지한다. 같은 신의 유물끼리는 부위가 겹치지 않는다.
 * - 발현 외형은 그 신의 유물이 차지하지 않은 부위만 채운다. (유물을 낀 흔적이 발현 뒤에도 보인다)
 * - 표식은 발현한 신의 정체성을 드러내는 고정 칸이다. 신마다 하나, 보관함에서 바꿀 수 없다.
 */

/** 외형 칸. 보관함과 설명 카드가 같은 이름을 쓴다. */
export const LOOK_SLOTS = ['head', 'face', 'torso', 'waist', 'arms', 'legs', 'weapon', 'cape', 'mark'] as const
export type LookSlot = (typeof LOOK_SLOTS)[number]
/** 보관함에서 골라 입을 수 있는 칸 (표식은 발현을 따라서만 바뀐다) */
export const WARDROBE_SLOTS = LOOK_SLOTS.filter((slot) => slot !== 'mark')

export const SLOT_NAMES: Readonly<Record<LookSlot, string>> = {
  head: '머리',
  face: '얼굴',
  torso: '몸',
  waist: '허리',
  arms: '손',
  legs: '다리',
  weapon: '무기',
  cape: '등',
  mark: '표식',
}

/** 표식에 딸린 기운 연출 */
export type MarkAura = 'sparks' | 'shadow' | 'asura' | 'tint'

export interface LookDef {
  id: string
  slot: LookSlot
  /** 보관함에 보이는 이름 */
  name: string
  /** 표식이면 함께 켜는 기운 연출 */
  aura?: MarkAura
}

const list: LookDef[] = [
  // 기본 모험가: 어느 신도 떠올리지 않는 수수한 모습. 머리는 쓰개 없이 머리카락이 보인다 (E24-06, 두건은 보관함에서 고를 수 있다)
  { id: 'adventurerHair', slot: 'head', name: '모험가의 머리' },
  { id: 'adventurerHood', slot: 'head', name: '모험가의 두건' },
  { id: 'adventurerTunic', slot: 'torso', name: '모험가의 웃옷' },
  { id: 'adventurerSleeves', slot: 'arms', name: '모험가의 장갑' },
  { id: 'adventurerBoots', slot: 'legs', name: '모험가의 장화' },
  { id: 'shortSword', slot: 'weapon', name: '짧은 검' },
  // 토르: 유물(무기·허리·손) / 발현(머리·몸·등) / 표식
  { id: 'mjolnirHammer', slot: 'weapon', name: '묠니르' },
  { id: 'megingjordBelt', slot: 'waist', name: '메긴교르드' },
  { id: 'ironGauntlets', slot: 'arms', name: '야른그레이프르' },
  { id: 'thorHelm', slot: 'head', name: '천둥의 날개 투구' },
  { id: 'thorTunic', slot: 'torso', name: '털 어깨 전투복' },
  { id: 'thorCape', slot: 'cape', name: '붉은 망토' },
  { id: 'thorStormHalo', slot: 'mark', name: '벼락 고리', aura: 'sparks' },
  // 로키: 유물(얼굴·무기·허리) / 발현(머리·몸·등) / 표식
  { id: 'lokiMaskFace', slot: 'face', name: '변신의 가면' },
  { id: 'laevateinnBlade', slot: 'weapon', name: '레바테인' },
  { id: 'mistletoeCharm', slot: 'waist', name: '겨우살이 가지' },
  { id: 'lokiCrown', slot: 'head', name: '뿔 장식 관' },
  { id: 'lokiTunic', slot: 'torso', name: '초록 비단옷' },
  { id: 'lokiCape', slot: 'cape', name: '초록 망토' },
  { id: 'lokiSerpents', slot: 'mark', name: '어깨의 두 뱀', aura: 'shadow' },
  // 아수라(히든): 유물(머리·무기·허리·손) / 발현(몸·다리) / 표식. 모든 부위가 검이다
  { id: 'ohabariCrown', slot: 'head', name: '아메노오하바리' },
  { id: 'kusanagiBlade', slot: 'weapon', name: '쿠사나기노츠루기' },
  { id: 'totsukaSash', slot: 'waist', name: '토츠카노츠루기' },
  { id: 'futsuGauntlets', slot: 'arms', name: '후츠노미타마' },
  { id: 'asuraBladeArmor', slot: 'torso', name: '칼날 갑주' },
  { id: 'asuraBladeGreaves', slot: 'legs', name: '칼날 정강이받이' },
  { id: 'asuraKatar', slot: 'weapon', name: '아수라의 주먹칼' },
  { id: 'asuraArms', slot: 'mark', name: '칼을 쥔 여섯 팔', aura: 'asura' },
  // E6 1차 클래스 (src/looks/classLooks.ts)
  ...CLASS_LOOKS,
]

/** 모든 외형 (장비 외형 포함). 보관함에 모으는 것은 LOOK_IDS (장비 외형은 끼고 있는 동안만 보인다) */
export const LOOKS: Readonly<Record<string, LookDef>> = Object.fromEntries([...list, ...GEAR_LOOKS].map((look) => [look.id, look]))
export const LOOK_IDS: readonly string[] = list.map((look) => look.id)

/** 처음 모습. 비어 있는 칸(null)은 아무것도 걸치지 않는다. */
export const BASE_OUTFIT: Readonly<Record<LookSlot, string | null>> = {
  head: 'adventurerHair',
  face: null,
  torso: 'adventurerTunic',
  waist: null,
  arms: 'adventurerSleeves',
  legs: 'adventurerBoots',
  weapon: 'shortSword',
  cape: null,
  mark: null,
}

/** 처음부터 가진 외형 (기본 모험가, 예전 처음 모습이던 두건도) */
export const STARTING_LOOKS: readonly string[] = [...Object.values(BASE_OUTFIT).filter((id): id is string => id !== null), 'adventurerHood']

export function lookDef(id: string): LookDef {
  const def = LOOKS[id]
  if (!def) throw new Error(`없는 외형: ${id}`)
  return def
}

export function isLookId(value: unknown): value is string {
  return typeof value === 'string' && Object.hasOwn(LOOKS, value)
}

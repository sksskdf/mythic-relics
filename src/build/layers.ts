/**
 * 빌드 층 목록 (E301-01, `CYCLE.md` 8.4): 주는 피해가 어디서 얼마나 오는지 층마다 한 줄.
 * 곱 층은 서로 곱하고, 덧셈 층은 한 주머니(1 + 합)로 더한 뒤 곱한다. `computeBuild`의 피해 배율은 이 목록을 곱한 값이고,
 * 상태 탭 「무엇으로 얼마나 강해졌나」도 같은 목록을 읽는다. 순환 재편에서는 층을 하나씩 갈아 끼운다
 */

/** 층 이름 (출처) */
export type LayerId = 'promotion' | 'collection' | 'gear' | 'oaths' | 'training' | 'myth' | 'renown' | 'conquest' | 'flames'

export interface DamageLayer {
  id: LayerId
  /** mul: 그대로 곱함, add: 덧셈 주머니에 더함 */
  kind: 'mul' | 'add'
  /** mul이면 배율(1이 그대로), add면 더하는 몫(0이 그대로) */
  value: number
}

/** 층마다 화면에 보일 이름 */
export const LAYER_NAMES: Readonly<Record<LayerId, string>> = {
  promotion: '승천',
  collection: '유물표',
  gear: '장비',
  oaths: '맹세',
  training: '수련',
  myth: '손의 신',
  renown: '명성',
  conquest: '장 정복',
  flames: '불꽃 불씨',
}

/** 층 목록의 피해 배율: 곱 층의 곱 × (1 + 덧셈 층의 합) */
export function layerProduct(layers: readonly DamageLayer[]): number {
  let mul = 1
  let add = 0
  for (const l of layers) {
    if (l.kind === 'mul') mul *= l.value
    else add += l.value
  }
  return mul * (1 + add)
}

/** 그대로인 층(곱 1, 덧셈 0)은 빼고 돌려준다 (상태 탭에 보일 것) */
export function activeLayers(layers: readonly DamageLayer[]): DamageLayer[] {
  return layers.filter((l) => (l.kind === 'mul' ? Math.abs(l.value - 1) > 1e-9 : Math.abs(l.value) > 1e-9))
}

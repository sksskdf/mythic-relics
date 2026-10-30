/**
 * 엔딩 (E21-06, TIMELINE.md 3장): 첫 엔딩을 보기 전(데모)에는 엔딩 뒤 장치를 숨긴다.
 * 코드는 그대로 두고, 여는 곳은 여기 한 곳이다. 모두 엔딩을 보면 함께 열린다.
 * 마지막 무대 「갈라진 하늘」의 우트가르드의 왕을 이기면 엔딩 장면 뒤에 열린다 (E22-05). 개발 패널과 옛 저장(위협 단계(지금 깊이)·시련·균열을 해 본 저장)도 엔딩 뒤가 된다.
 * 엔딩 뒤에 여는 것은 이 일곱이 전부다 (E305-03, `CYCLE.md` 7장). 값은 첫 엔딩 큰 카드의 글이다
 */
export const AFTER_ENDING = {
  /** 남은 신화권 셋: 결계가 풀리고, 땅에 떨어지는 신화 유물로 그 신을 연다 */
  realms: '남은 신화권 셋의 결계가 풀렸다',
  /** 깊이: 귀환 카드의 「그대로 / +1」, 깊이 10에서 한계를 깸 */
  depth: '깊이: 귀환할 때 한 걸음 더 깊이 고른다',
  /** 끝없는 원정: 한계를 깨면 마을에서 나선다 */
  endless: '깊이 10에서 한계를 깨면 끝없는 원정',
  /** 맹세 다섯 (숨 칸 상한도 데모 4 → 5) */
  oaths: '맹세 다섯',
  /** 자동 줍기·지난번 갈래 그대로 (자동화는 귀환 3 이상으로 친다) */
  autoPickup: '자동 줍기',
  mythStage4: '신 4단계',
  relicStages: '유물 3·4단계',
} as const

export type EndingFeature = keyof typeof AFTER_ENDING

/** 첫 엔딩 큰 카드의 줄: 긴 셋은 한 줄씩, 짧은 넷은 한 줄로 모은다 */
export function endingLines(): string[] {
  const { realms, depth, endless, oaths, autoPickup, mythStage4, relicStages } = AFTER_ENDING
  return [realms, depth, endless, [oaths, autoPickup, mythStage4, relicStages].join(' · ')]
}

export class Ending {
  /** 첫 엔딩을 보았다 */
  reached = false

  /** 그 장치가 열렸나 */
  has(_feature: EndingFeature): boolean {
    return this.reached
  }
}

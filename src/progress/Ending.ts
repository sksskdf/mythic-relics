/**
 * 엔딩 (E21-06, TIMELINE.md 3장): 첫 엔딩을 보기 전(데모)에는 엔딩 뒤 장치를 숨긴다.
 * 코드는 그대로 두고, 여는 곳은 여기 한 곳이다. 모두 엔딩을 보면 함께 열린다.
 * 마지막 무대 「갈라진 하늘」의 우트가르드의 왕을 이기면 엔딩 장면 뒤에 열린다 (E22-05). 개발 패널과 옛 저장(위협 단계(지금 깊이)·시련·균열을 해 본 저장)도 엔딩 뒤가 된다.
 */
export const AFTER_ENDING = {
  depth: '깊이 고르기(귀환 카드)와 한계를 깸',
  oaths: '맹세 다섯',
  rift: '균열',
  autoPickup: '자동 줍기·지난번 갈래 그대로 (자동화는 귀환 3 이상으로 친다)',
  mythStage4: '신화 4단계',
  relicStages: '유물 3·4단계',
  relicDrops: '땅에 떨어지는 유물',
} as const

export type EndingFeature = keyof typeof AFTER_ENDING

export class Ending {
  /** 첫 엔딩을 보았다 */
  reached = false

  /** 그 장치가 열렸나 */
  has(_feature: EndingFeature): boolean {
    return this.reached
  }
}

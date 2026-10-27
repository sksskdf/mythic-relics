/**
 * 엔딩 (E21-06, TIMELINE.md 3장): 첫 엔딩을 보기 전(데모)에는 엔딩 뒤 장치를 숨긴다.
 * 코드는 그대로 두고, 여는 곳은 여기 한 곳이다. 모두 엔딩을 보면 함께 열린다.
 * 마지막 보스와 엔딩 장면은 E22~E25에서 만든다. 그때까지는 개발 패널이나 옛 저장(위협 단계·시련·균열을 해 본 저장)으로만 엔딩 뒤가 된다.
 */
export const AFTER_ENDING = {
  threat: '위협 단계 고르기와 한계를 깸',
  trials: '시련',
  rift: '균열과 성좌판',
  conveniences: '편의 자동화 (자동 줍기는 처음부터)',
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

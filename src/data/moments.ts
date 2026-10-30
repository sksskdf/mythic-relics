/**
 * 순간의 크기 (E23-01, TIMELINE.md 6장): 강해지는 순간과 장의 고비를 네 등급으로 나눠, 큰 걸음일수록 크게 보인다.
 * - 1 작은 알림: 화면 아래 짧은 글. 싸움을 가리지 않는다
 * - 2 카드: 얻은 것 카드를 오른쪽 위(작은 지도 아래)에 작게, 차례로 하나씩
 * - 3 큰 카드: 화면이 그 신의 색으로 번쩍, 주인공 둘레 빛기둥, 가운데 큰 카드, 북소리
 * - 4 장면: 느린 동작 → 대화 장면 → 음악이 바뀜. 장면 뒤에 무엇을 얻었는지 카드
 * 일어난 차례대로 보이고, 장면 중에 온 카드는 장면이 끝난 뒤에 뜬다.
 */
export type MomentTier = 1 | 2 | 3 | 4

export const TIER_NAMES: Readonly<Record<MomentTier, string>> = { 1: '작은 알림', 2: '카드', 3: '큰 카드', 4: '장면' }

/** 사건 → 등급. 새 사건은 여기에 더하고 tests/moments.test.ts의 표도 고친다 */
export const MOMENTS = {
  // 1 작은 알림: 줍기와 작은 일
  gearPicked: 1,
  materialPicked: 1,
  bossMaterial: 1,
  salvaged: 1,
  // 합치기 (E303): 보통·좋음·희귀는 카드, 영웅·전설은 큰 카드
  merged: 2,
  returned: 3,
  bagFull: 1,
  mergedHigh: 3,
  shrineFound: 1,
  oathBroken: 1,
  riftEnded: 1,
  insight: 1,
  traceRoused: 1,
  traceBusy: 1,
  // 2 카드: 장비를 칸에 낌·가방에 더 좋은 장비, 신화가 열림·바뀜, 장치가 처음 열림
  gearWorn: 2,
  gearBetter: 2,
  mythOpened: 2,
  mythSwitched: 2,
  mythLent: 2,
  convenience: 2,
  depthUp: 2,
  oathSworn: 2,
  riftCleared: 2,
  tabOpened: 2,
  // 3 큰 카드: 신화 단계, 유물 벼리기, 신의 조각 2(유물)와 두 번째 신부터 깨어남 (엔딩 뒤에는 한계를 깸도)
  mythLevel: 3,
  forged: 3,
  limitBroken: 3,
  fragmentRelic: 3,
  oathKept: 3,
  godAwakened: 3,
  // 4 장면: 첫 신이 깨어남(주신), 신의 흔적(조각 1), 장 보스 처치, 장 넘어가기, 엔딩
  mythChosen: 4,
  fragment: 4,
  chapterBoss: 4,
  chapterChanged: 4,
  ending: 4,
} as const satisfies Record<string, MomentTier>

export type MomentId = keyof typeof MOMENTS

export const tierOf = (id: MomentId): MomentTier => MOMENTS[id]

/** 장면 앞 느린 동작: 이만큼(실제 초) 게임이 이 빠르기로 흐른다 */
export const SLOW_MOTION = { seconds: 1.2, scale: 0.25 }
/** 카드를 띄운 뒤 다음 장면·짧은 대화가 이만큼(실제 초) 기다린다 (장면이 HUD를 숨겨 카드가 가려지지 않게). HUD가 다음 카드에 자리를 내주는 시간과 같다 */
export const CARD_HOLD = { card: 3, big: 4.5, tab: 3.6 } as const
/** 장면 뒤 할 일(장 제목 띠 등)이 지나가는 동안 다음 장면·짧은 대화가 기다리는 시간 (실제 초) */
export const AFTER_HOLD = 5

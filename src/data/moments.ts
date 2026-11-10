/**
 * 순간의 크기 (E23-01, TIMELINE.md 6장): 강해지는 순간과 장의 고비를 네 등급으로 나눠, 큰 걸음일수록 크게 보인다.
 * - 1 작은 알림: 화면 아래 짧은 글. 싸움을 가리지 않는다 (같은 때 온 알림은 차례로, 같은 장비의 일은 한 줄로 묶는다, `TOAST_BUNDLES`·`src/ui/toastLine.ts`)
 * - 2 카드: 얻은 것 카드를 오른쪽 위(작은 지도 아래)에 작게, 차례로 하나씩 (같은 종류의 장비 카드가 밀리면 한 장으로 묶는다, `BUNDLED`·`src/ui/gainsLine.ts`)
 * - 3 큰 카드: 화면이 그 신의 색으로 번쩍, 주인공 둘레 빛기둥, 가운데 큰 카드, 북소리
 * - 4 장면: 느린 동작 → 대화 장면 → 음악이 바뀜. 장면 뒤에 무엇을 얻었는지 카드
 * 일어난 차례대로 보이고, 장면 중에 온 카드는 장면이 끝난 뒤에 뜬다.
 *
 * 카드 예산 (E307): 화면을 덮는 카드는 드문 일에만 쓴다. 날마다 있는 장비의 일(보통·좋음 장비를 끼거나, 가방에 더 좋은 것이 들어오거나,
 * 셋을 합쳐 좋음이 되는 것)은 작은 알림이고, 희귀부터 카드다. 줍기 자체는 머리 위 「+ 이름」 하나로만 알리고,
 * 깨달음은 순간이 아니라 메뉴 단추와 수련 탭의 작은 점으로 알린다 (`MenuWiring`).
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
  // 합치기 (E303 → E307): 합쳐서 좋음이 되면 작은 알림, 희귀는 카드, 영웅·전설은 큰 카드
  merged: 1,
  mergedRare: 2,
  mergedHigh: 3,
  returned: 3,
  bagFull: 1,
  shrineFound: 1,
  oathBroken: 1,
  endlessEnded: 1,
  traceRoused: 1,
  traceBusy: 1,
  // 보통·좋음 장비 (E307): 빈 칸에 낌, 가방에 지금 것보다 좋은 것이 들어옴
  gearWorn: 1,
  gearBetter: 1,
  // 2 카드: 희귀 이상 장비를 칸에 낌·가방에 더 좋은 희귀 이상 장비, 신화가 열림·바뀜, 장치가 처음 열림
  gearWornRare: 2,
  gearBetterRare: 2,
  mythOpened: 2,
  mythSwitched: 2,
  mythLent: 2,
  automation: 2,
  depthUp: 2,
  oathSworn: 2,
  endlessCleared: 2,
  tabOpened: 2,
  // 탈것 (E241): 고개지기의 산양을 얻음 (새 장치가 처음 열림)
  mountGained: 2,
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

/**
 * 줄에 서 있는 동안 같은 종류끼리 한 장으로 묶어도 되는 카드 (E307, 「장비 셋」): 장비의 일.
 * 묶이면 이름만 남으니, 줄마다 설명이 있는 카드(자동화·탈것·맹세 등)는 묶지 않는다
 */
export const BUNDLED: ReadonlySet<MomentId> = new Set<MomentId>(['gearWornRare', 'gearBetterRare', 'mergedRare'])

/**
 * 기다리는 동안 같은 종류가 또 오면 한 줄로 묶는 작은 알림과 묶인 글 (E307, 「장비 셋 · 낌」): 카드에서 내려온 장비의 일.
 * 알림 자리는 한 줄이라, 한자리의 장비 넷을 주우면 「낌」 넷이 서로 덮어 마지막 하나만 보였다. 수는 「둘」·「셋」으로 받는다
 */
export const TOAST_BUNDLES: Partial<Record<MomentId, (count: string) => string>> = {
  gearWorn: (count) => `장비 ${count} · 낌`,
  gearBetter: (count) => `더 좋은 장비 ${count}`,
  merged: (count) => `합치기 ${count}`,
}

/** 장면 앞 느린 동작: 이만큼(실제 초) 게임이 이 빠르기로 흐른다 */
export const SLOW_MOTION = { seconds: 1.2, scale: 0.25 }
/**
 * 카드를 띄운 뒤 다음 장면·짧은 대화가 이만큼(실제 초) 기다린다 (장면이 HUD를 숨겨 카드가 가려지지 않게).
 * HUD가 다음 카드에 자리를 내주는 시간과 같다 (`src/ui/gainsLine.ts`가 이 값을 쓴다. 장비 카드만, 뒤에 기다리는 카드가 있으면 더 빨리 내준다).
 * 작은 카드는 3초에서 줄였다 (E307)
 */
export const CARD_HOLD = { card: 2.2, big: 4.5, tab: 3.6 } as const
/** 장면 뒤 할 일(장 제목 띠 등)이 지나가는 동안 다음 장면·짧은 대화가 기다리는 시간 (실제 초) */
export const AFTER_HOLD = 5

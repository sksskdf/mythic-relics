import type { God } from '../relics/data'

/**
 * 신을 깨우는 길 (E238, DESIGN.md 4.2.2): 흔적 → 수호자.
 * - 흔적: 흔적의 고리 안에 걷지도 싸우지도 않고 1초 서 있으면 응답하고 지키는 무리가 깨어난다. 다 쓰러뜨리면 그 신을 만나고 그 신의 수호자가 선다
 * - 수호자: 그 신의 땅 깊은 곳에 수호자가 나타난다. 쓰러뜨리면 그 신이 깨어난다
 * 그 땅에서 정한 수만큼 잡아야 하던 사냥 단계와 흔적의 기세 문턱은 걷었다 (2026-11-20, 사용자: 「의미없는 뺑뺑이」「기세가 뭔데」).
 * 신의 차례도 걷었다 (2026-11-22, 재미 재설계 P4. 사용자: 「첫 신이 토르로 고정되어 있고 신의 순서가 고정되어 있는 게 맘에 안 든다」):
 * 북유럽 넷(토르·오딘은 미드가르드, 로키·프레이는 요툰헤임)의 흔적이 처음부터 함께 응답하고, 여러 신을 한꺼번에 깨우는 중일 수 있다.
 * 진행은 신마다 단계로 둔다 (`src/progress/Wake.ts`). 수호자는 E239에서 제 모습과 싸우는 방식(enemies.json의 역할 guardian)과 땅을 얻었다.
 * 그리스의 제우스(도도나의 참나무 → 티폰)는 올림포스가 열려야 닿고, 포세이돈·아르테미스·하데스(E241)의 흔적은 서 있되 엔딩 뒤에 응답한다(afterEnding).
 * 자리는 그 땅 안 좌표 (빈 곳이 아니면 가까운 빈 곳으로 옮긴다). 무리·출구·성소·보스·다른 흔적과 수호자에서 10m 넘게 떨어뜨린다 (gen-regions.mjs는 이 표를 모르니 손으로 정한다).
 */

/** 흔적 모양 (src/voxel/models/traces.ts) */
export const TRACE_MODELS = ['charredOak', 'runeRaven', 'boundRock', 'boarMound', 'dodonaOak', 'tridentRock', 'moonAltar', 'underworldCleft'] as const
export type TraceModel = (typeof TRACE_MODELS)[number]

export interface WakeDef {
  /** 흔적: 그 땅·자리·이름·모양 */
  trace: { region: string; x: number; z: number; name: string; model: TraceModel }
  /** 흔적을 지키는 무리 */
  pack: readonly { enemy: string; count: number }[]
  /** 그 신의 땅 (수호자가 기다리는 땅) */
  land: string
  /** 수호자: 그 땅·자리·이름과 적 (enemies.json, 생명은 그 땅 세기를 곱하기 전 값) */
  guardian: { region: string; x: number; z: number; name: string; enemy: string }
  /** 흔적 카드의 한 줄 이야기 */
  lore: string
  /** 데모(첫 엔딩 전)에는 흔적만 서 있고 응답하지 않는다 (E241 그리스 셋). 엔딩 뒤에는 다른 흔적처럼 깨운다 */
  afterEnding?: true
}

/** 흔적이 지금 어떤가: 깨어남(이미 연 신)·무리를 이겨 수호자가 섬·엔딩 뒤에 응답함(E241)·응답함 */
export type TraceState = 'awake' | 'waking' | 'later' | 'open'

/** 차례 없이 처음부터 응답하는 첫 판의 넷 (2026-11-22): 무리·수호자의 세기가 땅이 아니라 이긴 무리의 수를 따른다 */
export const FREE_GODS: readonly God[] = ['thor', 'odin', 'loki', 'freyr']

/**
 * 이미 이긴 흔적의 무리 수(그 신을 빼고)에 따른 흔적의 무리·수호자의 세기: 첫째 1 · 둘째 4 · 셋째 7 · 넷째 9.
 * 어느 신부터 가도 되게 땅이 아니라 차례가 세기를 정한다 (2026-11-20 손 QA: 둘째 흔적의 무리가 깨어나자마자 쓰러졌다)
 */
export const ORDER_POWER: readonly number[] = [1, 4, 7, 9]

/**
 * 흔적의 무리와 그 신의 수호자를 세울 때의 세기. 첫 판의 넷(`FREE_GODS`)은 이긴 무리 수에 따른 세기 그대로
 * (요툰헤임의 흔적을 첫 신으로 골라도 첫 무리는 1), 그 밖의 신(그리스)은 그 땅의 세기와 견줘 큰 쪽.
 * 엔딩 뒤에는 그 땅의 세기 그대로다 (깊이가 세기를 맡는다)
 */
export function wakePower(land: number, beaten: number, afterEnding: boolean, free = true): number {
  if (afterEnding) return land
  const order = ORDER_POWER[Math.min(ORDER_POWER.length - 1, Math.max(0, beaten))]!
  return free ? order : Math.max(land, order)
}

/** 무리가 깨어난 뒤 이 초 안에는 이긴 것으로 치지 않는다 (「깨어났다」 알림과 흔적의 장면·카드가 한 화면에 겹치지 않게) */
export const TRACE_WIN_DELAY = 1

/** 흔적의 고리 안에서 걷지도 싸우지도 않고 이 초를 서 있어야 흔적이 응답한다 (달려 지나가면 응답하지 않는다) */
export const TRACE_DWELL = 1

/** 데모에서 그리스 셋의 흔적에 다가가거나 흔적 카드를 볼 때의 한 줄 (E241) */
export const LATER_TEXT = '엔딩 뒤에 응답한다'

/** 흔적의 형편을 정하는 지금 값 */
export interface TraceNow {
  /** 그 신이 이미 열렸다 */
  open: boolean
  /** 그 신의 흔적의 무리를 이겼다 (수호자가 서 있다) */
  waking: boolean
  /** 첫 엔딩을 보았다 */
  ending: boolean
}

/** 흔적이 지금 어떤가 (E241에서 순수 계산으로 뺌): 깨어남 → 엔딩 뒤의 셋은 엔딩 뒤에 응답 → 수호자가 섬 → 응답함. 다른 신을 깨우는 중이어도 응답한다 */
export function traceStateOf(god: God, now: TraceNow): TraceState {
  if (now.open) return 'awake'
  if (WAKE[god]?.afterEnding && !now.ending) return 'later'
  if (now.waking) return 'waking'
  return 'open'
}

/**
 * 다음에 할 깨우는 일 하나 (목표 표시의 맨 앞·봇이 가는 곳): first가 할 일 가운데 있으면 그 신의 것(봇의 `--first`),
 * 아니면 서 있는 수호자가 먼저, 그다음 지금 땅의 가장 가까운 흔적, prefer 땅(장 할 일의 땅)의 흔적, 남은 흔적 차례.
 * distance는 지금 땅의 것까지의 거리 (m)
 */
export function pickAwaken<T extends { god: God; kind: 'trace' | 'guardian'; region: string }>(
  all: readonly T[],
  now: { here: string; prefer?: string; first?: God | null; distance: (t: T) => number },
): T | null {
  const mine = now.first ? all.find((t) => t.god === now.first) : undefined
  if (mine) return mine
  const rank = (t: T): number => (t.kind === 'guardian' ? 0 : 10000) + (t.region === now.here ? Math.min(1000, now.distance(t)) : t.region === now.prefer ? 2000 : 4000)
  return all.reduce<T | null>((best, t) => (best === null || rank(t) < rank(best) ? t : best), null)
}

/** 흔적의 고리: 이만큼(m) 안에 `TRACE_DWELL`초 서 있으면 흔적이 응답하고 지키는 무리가 깨어난다 */
export const TRACE_RADIUS = 3
/** 지키는 무리가 깨어난 뒤 이만큼(m) 넘게 멀어지면 무리가 흩어지고 처음부터 */
export const TRACE_LEASH = 26
/** 수호자 자리에 이만큼(m) 다가가면 수호자가 나타난다 */
export const GUARDIAN_RADIUS = 8
/** 수호자가 나타난 뒤 이만큼(m) 넘게 멀어지면 수호자가 물러난다 (다시 다가가면 다시 나타난다) */
export const GUARDIAN_LEASH = 30
/** 물러난 수호자의 상처가 아무는 빠르기 (초당 최대 생명의 몫, E239): 물러났다 와도 깎아 둔 생명이 한 번에 차지 않는다 */
export const GUARDIAN_MEND = 0.01

export const WAKE: Readonly<Partial<Record<God, WakeDef>>> = {
  thor: {
    trace: { region: 'midgard', x: 14, z: 18, name: '벼락 맞은 참나무', model: 'charredOak' },
    pack: [
      { enemy: 'grunt', count: 3 },
      { enemy: 'stoneThrower', count: 1 },
    ],
    land: 'serpentshore',
    guardian: { region: 'serpentshore', x: 22, z: -20, name: '요르문간드', enemy: 'jormungandr' },
    lore: '천둥이 내리친 자리. 아직 나무 속에서 번개가 운다.',
  },
  odin: {
    trace: { region: 'midgard', x: -20, z: 16, name: '룬 돌과 까마귀', model: 'runeRaven' },
    pack: [{ enemy: 'wolf', count: 5 }],
    land: 'ironwood',
    guardian: { region: 'ironwood', x: -24, z: -20, name: '펜리르', enemy: 'fenrir' },
    lore: '외눈의 신이 새긴 룬. 까마귀 한 마리가 아직 떠나지 않았다.',
  },
  loki: {
    trace: { region: 'jotunheim', x: -26, z: 10, name: '묶인 바위', model: 'boundRock' },
    pack: [
      { enemy: 'draugr', count: 2 },
      { enemy: 'frostWitch', count: 1 },
    ],
    land: 'jotunheim',
    guardian: { region: 'jotunheim', x: -24, z: -22, name: '스카디', enemy: 'skadi' },
    lore: '사슬로 묶였던 바위. 그릇에 독이 아직 고여 있다.',
  },
  // 프레이의 흔적은 요툰헤임에 (2026-11-22: 흔적은 미드가르드에 둘, 요툰헤임에 둘). 수호자 수르트는 무스펠 경계에서 기다린다
  freyr: {
    trace: { region: 'jotunheim', x: 18, z: -8, name: '황금 멧돼지 무덤', model: 'boarMound' },
    pack: [
      { enemy: 'grunt', count: 2 },
      { enemy: 'draugr', count: 1 },
      { enemy: 'stoneThrower', count: 1 },
    ],
    land: 'muspel',
    guardian: { region: 'muspel', x: 24, z: -16, name: '수르트', enemy: 'surtr' },
    lore: '풍요의 신이 아끼던 멧돼지가 잠든 무덤. 흙이 아직 따뜻하다.',
  },
  // 그리스 (E241): 제우스는 흔적·수호자가 모두 올림포스 안 (델포이는 그 앞 할 일을 마쳐야 열린다)
  zeus: {
    trace: { region: 'olympus', x: 8, z: 24, name: '도도나의 참나무', model: 'dodonaOak' },
    pack: [
      { enemy: 'harpy', count: 2 },
      { enemy: 'spartoi', count: 1 },
      { enemy: 'cyclops', count: 1 },
    ],
    land: 'olympus',
    guardian: { region: 'olympus', x: 6, z: -24, name: '티폰', enemy: 'typhon' },
    lore: '신탁을 속삭이던 참나무. 잎마다 아직 번개 냄새가 난다.',
  },
  // 그리스 셋 (E241): 흔적은 데모에도 서 있고 엔딩 뒤에 응답한다. 지키는 무리에 하르피이아는 많아야 하나 (거리 두는 적이 싸움을 끈다)
  poseidon: {
    trace: { region: 'olympus', x: 30, z: 18, name: '바위에 박힌 삼지창', model: 'tridentRock' },
    pack: [
      { enemy: 'spartoi', count: 2 },
      { enemy: 'cyclops', count: 1 },
      { enemy: 'harpy', count: 1 },
    ],
    land: 'delphi',
    guardian: { region: 'delphi', x: 24, z: 8, name: '케토스', enemy: 'ketos' },
    lore: '바다의 신이 땅을 내리친 자리. 바위틈에서 아직 바닷물이 솟는다.',
    afterEnding: true,
  },
  artemis: {
    trace: { region: 'delphi', x: -20, z: 22, name: '초승달 제단', model: 'moonAltar' },
    pack: [
      { enemy: 'cyclops', count: 1 },
      { enemy: 'spartoi', count: 2 },
      { enemy: 'harpy', count: 1 },
    ],
    land: 'delphi',
    guardian: { region: 'delphi', x: -22, z: -20, name: '칼리돈의 멧돼지', enemy: 'calydonianBoar' },
    lore: '사냥의 여신에게 바친 제단. 은빛 달이 아직 지지 않았다.',
    afterEnding: true,
  },
  hades: {
    trace: { region: 'lycia', x: 26, z: 24, name: '저승의 틈', model: 'underworldCleft' },
    pack: [
      { enemy: 'spartoi', count: 3 },
      { enemy: 'cyclops', count: 1 },
    ],
    land: 'lycia',
    guardian: { region: 'lycia', x: 24, z: -22, name: '케르베로스', enemy: 'cerberus' },
    lore: '땅이 갈라져 저승이 들여다보이는 틈. 석류 한 알이 아직 붉다.',
    afterEnding: true,
  },
}

/** 깨울 수 있는 신들 (데이터에 길이 있는 신) */
export const WAKE_GODS = Object.keys(WAKE) as God[]

export const wakeDef = (god: God): WakeDef | undefined => WAKE[god]

import type { God } from '../relics/data'

/**
 * 신을 깨우는 길 (E238, DESIGN.md 4.2.2): 흔적 → 사냥 → 수호자, 조각 셋.
 * - 조각 1 흔적: 흔적에 다가가면 지키는 무리가 깨어난다. 다 쓰러뜨리면 그 신의 대표 힘을 바로 빌린다
 * - 조각 2 사냥: 그 신의 땅에서 HUNT_KILLS만큼 잡으면 그 신의 유물이 손에 들어온다
 * - 조각 3 수호자: 그 땅 깊은 곳에 수호자가 나타난다. 쓰러뜨리면 그 신이 깨어난다
 * 깨우는 신은 한 번에 하나. 수호자는 E239에서 제 모습과 싸우는 방식(enemies.json의 역할 guardian)과 땅을 얻었다.
 * 데모에서 깨우는 신은 셋 (E306 D7): 토르·오딘(흔적은 미드가르드)과 제우스(도도나의 참나무 → 올림포스 사냥 → 티폰). 흔적은 깨운 차례마다 정한 기세에 응답한다(`TRACE_LEVELS`).
 * 로키·프레이(E306)와 포세이돈·아르테미스·하데스(E241)의 흔적은 서 있되 엔딩 뒤에 응답한다(afterEnding).
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
  /** 사냥하는 땅 (조각 2) */
  land: string
  /** 수호자 (조각 3): 그 땅·자리·이름과 적 (enemies.json, 생명은 그 땅 세기를 곱하기 전 값) */
  guardian: { region: string; x: number; z: number; name: string; enemy: string }
  /** 흔적 카드의 한 줄 이야기 */
  lore: string
  /** 데모(첫 엔딩 전)에는 흔적만 서 있고 응답하지 않는다 (E241 그리스 셋, E306 로키·프레이). 엔딩 뒤에는 다른 흔적처럼 깨운다 */
  afterEnding?: true
}

/** 흔적이 지금 어떤가: 깨어남(이미 연 신)·깨우는 중·엔딩 뒤에 응답함(E241)·다른 신을 깨우는 중·귀환이나 장 정복을 더 해야 함·응답함 */
export type TraceState = 'awake' | 'waking' | 'later' | 'busy' | 'sealed' | 'open'

/**
 * 신을 하나 더 깨울 수 있나 (E305-03): 깨운 신이 1 + 귀환한 수 + 정복한 장보다 적어야 한다 (첫 신은 언제나).
 * 첫 귀환을 해야 두 번째 신이, 거인 왕을 이기면 제우스가 응답한다. 큰 체크포인트(신 깨우기)가 귀환·장 정복 사이에 하나씩 놓여 몰리지 않게.
 * 엔딩 뒤에는 막지 않는다
 */
export function mayWake(awakened: number, returns: number, conquered: number, afterEnding = false): boolean {
  return afterEnding || awakened < 1 + returns + conquered
}

/** 데모에서 그리스 셋의 흔적에 다가가거나 흔적 카드를 볼 때의 한 줄 (E241) */
export const LATER_TEXT = '엔딩 뒤에 응답한다'

/** 기세가 모자라 잠잠한 흔적의 한 줄 (E306 D11) */
export const levelText = (level: number): string => `기세 ${level}에 응답한다`

/** 흔적의 형편을 정하는 지금 값 */
export interface TraceNow {
  /** 그 신이 이미 열렸다 */
  open: boolean
  /** 지금 깨우는 신 (이미 연 신이면 없음) */
  waking: God | null
  awakened: number
  returns: number
  conquered: number
  /** 첫 엔딩을 보았다 */
  ending: boolean
  /** 이번 원정의 기세 레벨 (수련 깨달음, E306) */
  level: number
}

/**
 * 흔적이 응답하는 기세 레벨 (이번 원정의 수련 깨달음): 깨운 차례(이미 깨운 신 수)마다, 표 끝을 넘으면 마지막 값. 0이면 문턱 없음.
 * - 첫 신 3 (E306 D11): 마을을 나서자마자 흔적·장비·수련·신 탭이 몰려 열리지 않게 (`TIMELINE.md` 4장의 2·4·6분)
 * - 둘째 신 10 (E306-02, 첫 바퀴 8 → 둘째 바퀴 10): 첫 귀환 뒤 흔적이 바로 응답하면 오딘의 길(흔적·사냥·펜리르)이 3분에 끝난다. 6장 19~26분처럼 원정이 한 번 무르익은 뒤에
 * - 셋째 신 12 (E306-02, 제우스): 원정 4는 출발점 ½(기세 10쯤)에서 시작하니 두 레벨 더
 * 엔딩 뒤에는 보지 않는다
 */
export const TRACE_LEVELS: readonly number[] = [3, 10, 12, 0]

/** 이미 깨운 신이 order일 때 다음 흔적이 응답하는 기세 레벨 (0이면 문턱 없음) */
export const traceLevel = (order: number): number => TRACE_LEVELS[Math.min(TRACE_LEVELS.length - 1, Math.max(0, order))]!

/** 다음 흔적이 기세가 모자라 잠잠한가 (E306 D11): 깨운 차례의 문턱이 있고 이번 원정의 기세가 그 아래다. 엔딩 뒤에는 막지 않는다 */
export function levelSealed(order: number, level: number, ending = false): boolean {
  const need = traceLevel(order)
  return !ending && need > 0 && level < need
}

/**
 * 흔적이 지금 어떤가 (E241에서 순수 계산으로 뺌): 깨어남 → 데모의 다섯은 엔딩 뒤에 응답 → 깨우는 중 → 다른 신을 깨우는 중 →
 * 기세가 모자라면 잠잠함(E306) → 응답함·잠잠함(귀환·장 정복을 더 해야 함)
 */
export function traceStateOf(god: God, now: TraceNow): TraceState {
  if (now.open) return 'awake'
  if (WAKE[god]?.afterEnding && !now.ending) return 'later'
  if (now.waking === god) return 'waking'
  if (now.waking) return 'busy'
  if (levelSealed(now.awakened, now.level, now.ending)) return 'sealed'
  return mayWake(now.awakened, now.returns, now.conquered, now.ending) ? 'open' : 'sealed'
}

/**
 * 조각 2까지 잡아야 하는 적 수 (그 신의 땅에서): 깨운 차례(이미 깨운 신 수)마다, 표 끝을 넘으면 마지막 값 (E306 D12).
 * 첫 신(바닷가·철의 숲, 세기 1.25)은 E239에서 40 → 30. 둘째 신은 한 번 승천한 몸으로 같은 세기 1.25의 땅에서 분당 30쯤 잡으니
 * 70(E306-02, 봇 2.3분 = 사람 3분). 제우스(올림포스)는 분당 15쯤이라 45로 `TIMELINE.md` 4장의 2~3분 막대
 */
export const HUNT_KILLS: readonly number[] = [30, 70, 45]

/** 이미 깨운 신이 order일 때 다음 신의 사냥 수 */
export const huntKills = (order: number): number => HUNT_KILLS[Math.min(HUNT_KILLS.length - 1, Math.max(0, order))]!
/** 흔적에 이만큼(m) 다가가면 지키는 무리가 깨어난다 */
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
    afterEnding: true,
  },
  freyr: {
    trace: { region: 'muspel', x: 16, z: 22, name: '황금 멧돼지 무덤', model: 'boarMound' },
    pack: [
      { enemy: 'grunt', count: 2 },
      { enemy: 'draugr', count: 1 },
      { enemy: 'stoneThrower', count: 1 },
    ],
    land: 'muspel',
    guardian: { region: 'muspel', x: 24, z: -16, name: '수르트', enemy: 'surtr' },
    lore: '풍요의 신이 아끼던 멧돼지가 잠든 무덤. 흙이 아직 따뜻하다.',
    afterEnding: true,
  },
  // 그리스 (E241): 제우스는 흔적·사냥·수호자가 모두 올림포스 안 (델포이는 그 앞 할 일을 마쳐야 열린다)
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

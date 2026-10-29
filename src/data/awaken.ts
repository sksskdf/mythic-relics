import type { God } from '../relics/data'

/**
 * 신을 깨우는 길 (E238, MYTHBUILD.md 3.2): 흔적 → 사냥 → 수호자, 조각 셋.
 * - 조각 1 흔적: 흔적에 다가가면 지키는 무리가 깨어난다. 다 쓰러뜨리면 그 신의 대표 힘을 바로 빌린다
 * - 조각 2 사냥: 그 신의 땅에서 HUNT_KILLS만큼 잡으면 그 신의 유물이 손에 들어온다
 * - 조각 3 수호자: 그 땅 깊은 곳에 수호자가 나타난다. 쓰러뜨리면 그 신이 깨어난다
 * 깨우는 신은 한 번에 하나. 북유럽 넷 먼저 (E238). 수호자는 E239에서 제 모습과 싸우는 방식(enemies.json의 역할 guardian)과 땅을 얻었다.
 * 자리는 그 땅 안 좌표 (빈 곳이 아니면 가까운 빈 곳으로 옮긴다).
 */

/** 흔적 모양 (src/voxel/models/traces.ts) */
export const TRACE_MODELS = ['charredOak', 'runeRaven', 'boundRock', 'boarMound'] as const
export type TraceModel = (typeof TRACE_MODELS)[number]

export interface AwakenDef {
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
}

/** 흔적이 지금 어떤가: 깨어남(이미 연 신)·깨우는 중·다른 신을 깨우는 중·주신이 더 자라야 함·응답함 */
export type TraceState = 'awake' | 'waking' | 'busy' | 'sealed' | 'open'

/**
 * 신을 하나 더 깨울 수 있나: 깨운 신이 주신 단계보다 적어야 한다 (첫 신은 언제나). 주신 2단계 전설을 깨야 두 번째 신이 응답한다.
 * 큰 체크포인트(신 깨우기)가 신 단계(전설) 사이에 하나씩 놓여 몰리지 않게 (MYTHBUILD.md 2장). 엔딩 뒤에는 막지 않는다
 */
export function canWakeMore(awakened: number, mainLevel: number, afterEnding = false): boolean {
  return afterEnding || awakened < Math.max(1, mainLevel)
}

/** 조각 2까지 잡아야 하는 적 수 (그 신의 땅에서) */
export const HUNT_KILLS = 40
/** 흔적에 이만큼(m) 다가가면 지키는 무리가 깨어난다 */
export const TRACE_RADIUS = 3
/** 지키는 무리가 깨어난 뒤 이만큼(m) 넘게 멀어지면 무리가 흩어지고 처음부터 */
export const TRACE_LEASH = 26
/** 수호자 자리에 이만큼(m) 다가가면 수호자가 나타난다 */
export const GUARDIAN_RADIUS = 8
/** 수호자가 나타난 뒤 이만큼(m) 넘게 멀어지면 수호자가 물러난다 (다시 다가가면 처음부터) */
export const GUARDIAN_LEASH = 30

export const AWAKEN: Readonly<Partial<Record<God, AwakenDef>>> = {
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
  },
}

/** 깨울 수 있는 신들 (데이터에 길이 있는 신) */
export const AWAKEN_GODS = Object.keys(AWAKEN) as God[]

export const awakenDef = (god: God): AwakenDef | undefined => AWAKEN[god]

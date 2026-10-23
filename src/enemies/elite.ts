/**
 * 정예 (E8-05). 무리 가운데 한 마리가 가끔 정예로 나온다. 몸이 크고 발밑에 빛 고리가 있어 글 없이도 알아본다.
 * 종류마다 하나가 두드러진다: 단단함(생명력), 사나움(피해), 날램(걸음·재사용).
 * 쓰러뜨리면 경험치를 더 주고 유물을 한 번 더 굴린다.
 */

export const ELITE_KINDS = ['tough', 'fierce', 'swift'] as const
export type EliteKind = (typeof ELITE_KINDS)[number]

export interface EliteDef {
  /** 이름표에 보이는 종류 이름 (정예·사나움) */
  name: string
  /** 발밑 고리와 몸 빛 */
  color: number
  /** 몸 크기 배율 */
  size: number
  hp: number
  damage: number
  speed: number
  /** 재사용 대기 배율 */
  cooldown: number
}

export const ELITES: Readonly<Record<EliteKind, EliteDef>> = {
  tough: { name: '단단함', color: 0x7ab8ff, size: 1.3, hp: 2.5, damage: 1.1, speed: 0.9, cooldown: 1 },
  fierce: { name: '사나움', color: 0xff3a9a, size: 1.2, hp: 2, damage: 1.5, speed: 1, cooldown: 0.9 },
  swift: { name: '날램', color: 0xffd84a, size: 1.15, hp: 2, damage: 1.15, speed: 1.4, cooldown: 0.65 },
}

/** 정예 보상: 경험치 배율, 유물 굴리기 횟수 */
export const ELITE_REWARD = { xp: 3, dropRolls: 2 }
/** 무리를 채울 때 한 마리가 정예일 확률 */
export const ELITE_CHANCE = 0.2

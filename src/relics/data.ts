/** 유물이 속한 신. 프로토타입에서는 토르와 로키만 있다. */
export type God = 'thor' | 'loki'

export type RelicId = 'mjolnir' | 'megingjord' | 'jarngreipr' | 'lokiMask'

export interface RelicDef {
  id: RelicId
  name: string
  god: God
  /** 이 유물이 주는 자동 스킬 이름 */
  skill: string
  /** HUD 칸에 그릴 12×12 픽셀 그림. 글자 하나가 한 칸이고 '.'은 빈칸 */
  icon: readonly string[]
  /** 그림 글자별 색 */
  colors: Readonly<Record<string, string>>
}

/** 원형 (DESIGN.md 6장). 프로토타입에 쓰는 것만 */
export type Archetype = 'thunder' | 'trickster'

export interface GodDef {
  id: God
  /** 발현했을 때의 클래스 이름 (Lv1 칭호) */
  title: string
  /** Lv1~Lv4 칭호 */
  titles: readonly [string, string, string, string]
  archetype: Archetype
  /** 발현 연출과 HUD에 쓰는 대표 색 */
  color: string
}

export const GODS: Readonly<Record<God, GodDef>> = {
  thor: {
    id: 'thor',
    title: '천둥의 신',
    titles: ['천둥의 신', '천둥군주', '폭풍왕', '거인의 재앙'],
    archetype: 'thunder',
    color: '#7fd4ff',
  },
  loki: {
    id: 'loki',
    title: '변신술사',
    titles: ['변신술사', '거짓의 혀', '신들의 배신자', '라그나로크의 불씨'],
    archetype: 'trickster',
    color: '#8fe07a',
  },
}

const IRON = { a: '#d7dee5', b: '#8e98a3', c: '#5b636c', w: '#7a5636', l: '#4f3524', y: '#e6bd4e', o: '#ff9a3c', r: '#ffd27a' }

export const RELICS: Readonly<Record<RelicId, RelicDef>> = {
  mjolnir: {
    id: 'mjolnir',
    name: '묠니르',
    god: 'thor',
    skill: '망치 투척',
    icon: [
      '............',
      '.aaaaaaaaaa.',
      '.abbbbbbbbc.',
      '.abbyybbbbc.',
      '.abbbbbbbbc.',
      '.cccccccccc.',
      '.....ww.....',
      '.....wl.....',
      '.....wl.....',
      '.....wl.....',
      '.....yy.....',
      '............',
    ],
    colors: IRON,
  },
  megingjord: {
    id: 'megingjord',
    name: '메긴교르드',
    god: 'thor',
    skill: '힘의 해방',
    icon: [
      '............',
      '............',
      '............',
      '.ll......ll.',
      '.wwwwyywwww.',
      '.wllyaayllw.',
      '.wllyaayllw.',
      '.wwwwyywwww.',
      '.ll......ll.',
      '............',
      '............',
      '............',
    ],
    colors: IRON,
  },
  jarngreipr: {
    id: 'jarngreipr',
    name: '야른그레이프르',
    god: 'thor',
    skill: '쇳덩이 되던지기',
    icon: [
      '............',
      '...a.a.a....',
      '...b.b.b.a..',
      '..abababab..',
      '..bbbbbbbb..',
      '..bbbbbbbb.a',
      '..bbbbbbbbbc',
      '..bbbbbbbbc.',
      '...bbbbbbc..',
      '...cccccc...',
      '...oooooo...',
      '............',
    ],
    colors: IRON,
  },
  lokiMask: {
    id: 'lokiMask',
    name: '변신의 가면',
    god: 'loki',
    skill: '환영 분신',
    icon: [
      '............',
      '..g......g..',
      '..gg....gg..',
      '..gggggggg..',
      '.gggggggggg.',
      '.gkkggggkkg.',
      '.gkyggggykg.',
      '.gggggggggg.',
      '..gggddggg..',
      '...gddddg...',
      '....gggg....',
      '............',
    ],
    colors: { g: '#5fae4e', d: '#2f6b2a', k: '#1c2a1a', y: '#e6bd4e' },
  },
}

export const RELIC_IDS = Object.keys(RELICS) as RelicId[]

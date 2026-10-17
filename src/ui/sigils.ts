import { pixelIcon } from './pixelIcon'

/** 12×12 픽셀 문장. 글자 하나가 한 칸, '.'은 빈칸, 'a' 밝은 색, 'b' 어두운 색 */
const ARCHETYPE_SIGILS: Record<string, readonly string[]> = {
  // 천둥·폭풍: 번개
  thunder: ['......aa....', '.....aa.....', '....aa......', '...aab......', '..aaaaaa....', '.....aab....', '....aab.....', '...aab......', '..aab.......', '..ab........', '............', '............'],
  // 바다·물: 겹친 물결
  sea: ['............', '............', '..aa....aa..', '.a..a..a..a.', 'a....aa....a', '............', '..bb....bb..', '.b..b..b..b.', 'b....bb....b', '............', '............', '............'],
  // 죽음·저승: 해골
  death: ['............', '...aaaaaa...', '..aaaaaaaa..', '..abbaabba..', '..abbaabba..', '..aaaaaaaa..', '...aaabaa...', '....aaaa....', '....a.a.a...', '............', '............', '............'],
  // 태양·빛: 해
  sun: ['.....a......', '..a..a..a...', '...a...a....', '.....aa.....', '....aaaa....', 'aa.aaaaaa.aa', '....aaaa....', '.....aa.....', '...a...a....', '..a..a..a...', '.....a......', '............'],
  // 달·밤: 초승달
  moon: ['............', '....aaa.....', '...aa.......', '..aa........', '..aa........', '..aa........', '..aa........', '...aa.......', '....aaa.....', '......b.....', '............', '............'],
  // 트릭스터: 가면
  trickster: ['............', '.a........a.', '.aa......aa.', '.aaaaaaaaaa.', '.abbaaaabba.', '.abbaaaabba.', '.aaaaaaaaaa.', '..aaabbaaa..', '...aaaaaa...', '....aaaa....', '............', '............'],
  // 전쟁: 엇갈린 칼
  war: ['a..........a', '.a........a.', '..a......a..', '...a....a...', '....a..a....', '.....aa.....', '.....aa.....', '....b..b....', '...b....b...', '..bb....bb..', '.bb......bb.', '............'],
  // 지혜·마법: 눈
  wisdom: ['............', '............', '...aaaaaa...', '..a......a..', '.a..bbbb..a.', 'a..bbaabb..a', '.a..bbbb..a.', '..a......a..', '...aaaaaa...', '............', '............', '............'],
  // 대지·풍요: 나무
  earth: ['.....aa.....', '...aaaaaa...', '..aaaaaaaa..', '.aaaaaaaaaa.', '..aaaaaaaa..', '...aaaaaa...', '.....bb.....', '.....bb.....', '....bbbb....', '...b.bb.b...', '............', '............'],
  // 혼돈·파괴: 소용돌이
  chaos: ['............', '...aaaaa....', '..a.....a...', '.a..aaa..a..', '.a.a...a.a..', '.a.a.a.a.a..', '.a.a..aa.a..', '.a..a....a..', '..a..aaaa...', '...a........', '....aaaa....', '............'],
}

/** 잠긴 것·모르는 곳 */
const UNKNOWN = ['............', '....aaaa....', '...a....a...', '........a...', '.......a....', '......a.....', '.....a......', '.....a......', '............', '.....a......', '............', '............']

/** 작은 그림 단추들 */
const GLYPHS: Record<string, readonly string[]> = {
  // 가방에 넣기
  bag: ['....aaaa....', '...a....a...', '..aaaaaaaa..', '.abbbbbbbba.', '.abbbaabbba.', '.abbbaabbba.', '.abbbbbbbba.', '.abbbbbbbba.', '.abbbbbbbba.', '..aaaaaaaa..', '............', '............'],
  // 발밑에 내려놓기
  drop: ['.....aa.....', '.....aa.....', '.....aa.....', '.....aa.....', '..a..aa..a..', '...a.aa.a...', '....aaaa....', '.....aa.....', '............', '.bbbbbbbbbb.', '............', '............'],
  // 자동 (장착을 따름)
  auto: ['............', '....aaaa....', '...a....a...', '..a......a..', '..a.....aaa.', '..a......a..', '..aaa.....a.', '..a......a..', '...a....a...', '....aaaa....', '............', '............'],
  // 비우기
  none: ['............', '............', '..a......a..', '...a....a...', '....a..a....', '.....aa.....', '.....aa.....', '....a..a....', '...a....a...', '..a......a..', '............', '............'],
  // 잠금 (표식처럼 고를 수 없는 것)
  lock: ['............', '....aaaa....', '...a....a...', '...a....a...', '..aaaaaaaa..', '..abbbbbba..', '..abbaabba..', '..abbaabba..', '..abbbbbba..', '..aaaaaaaa..', '............', '............'],
  // 승급 전설 두루마리
  scroll: ['............', '.aaaaaaaaa..', 'a.bbbbbbbba.', '.abbbbbbbba.', '.ab.....ba..', '.abbbbbbbba.', '.ab.....ba..', '.abbbbbbbba.', '.ab....bba..', '.aaaaaaaaaa.', '..........a.', '............'],
  // 유물 탭: 보석
  relics: ['............', '...aaaaaa...', '..abbbbbba..', '.abbaabbbba.', 'aaaaaaaaaaaa', '.abbbbbbbba.', '..abbbbbba..', '...abbbba...', '....abba....', '.....aa.....', '............', '............'],
  // 클래스 탭: 별
  classes: ['.....aa.....', '.....aa.....', '....abba....', 'aaaaabbaaaaa', '.abbbbbbbba.', '..abbbbbba..', '...abbbba...', '..abba.abba.', '..aa.....aa.', '.a.........a', '............', '............'],
  // 외형 탭: 옷걸이
  looks: ['............', '.....aa.....', '....a..a....', '.......a....', '......a.....', '.....aa.....', '....abba....', '...abbbba...', '..abbbbbba..', '.abbbbbbbba.', '.aaaaaaaaaa.', '............'],
  // 상태 탭: 사람
  status: ['....aaaa....', '...abbbba...', '...abbbba...', '...abbbba...', '....abba....', '.....aa.....', '..aaaaaaaa..', '.abbbbbbbba.', 'abbbbbbbbbba', 'abbbbbbbbbba', 'abbbbbbbbbba', '............'],
  // 생명
  heart: ['............', '..aa....aa..', '.abba..abba.', 'abbbbaabbbba', 'abbbbbbbbbba', 'abbbbbbbbbba', '.abbbbbbbba.', '..abbbbbba..', '...abbbba...', '....abba....', '.....aa.....', '............'],
  // 주는 피해
  sword: ['..........aa', '.........aba', '........aba.', '.......aba..', '......aba...', '.....aba....', '.a..aba.....', '..aaba......', '...ba.......', '..a.a.......', '.a...a......', '............'],
  // 받는 피해
  shield: ['.aaaaaaaaaa.', 'abbbbbbbbbba', 'abbbbaabbbba', 'abbbbaabbbba', 'abaaaaaaaaba', 'abbbbaabbbba', 'abbbbaabbbba', '.abbbaabbba.', '.abbbbbbbba.', '..abbbbbba..', '...abbbba...', '....aaaa....'],
  // 이동 속도
  boot: ['............', '...aaaaa....', '...abbba....', '...abbba....', '...abbba....', '...abbba....', '...abbbaaa..', '..abbbbbbba.', '.abbbbbbbbba', '.aaaaaaaaaaa', '............', '............'],
  // 밀쳐 내기
  push: ['............', '.aa......aa.', '.aaa....aaa.', '..aaa..aaa..', '...a....a...', '.....bb.....', '.....bb.....', '...a....a...', '..aaa..aaa..', '.aaa....aaa.', '.aa......aa.', '............'],
  // 버티기
  stand: ['.....aa.....', '....a..a....', '.....aa.....', '.....aa.....', '..aaaaaaaa..', '.....aa.....', '.....aa.....', 'a....aa....a', 'aa...aa...aa', '.aa..aa..aa.', '..aaaaaaaa..', '............'],
  // 신위
  divine: ['.....a......', '.....a......', '....aba.....', '....aba.....', '..aabbbaa...', 'aabbbbbbbaa.', '..aabbbaa...', '....aba.....', '....aba.....', '.....a......', '.....a......', '............'],
  // 승급
  promote: ['............', '.....aa.....', '....abba....', '...abbbba...', '..abbaabba..', '.abba..abba.', '.aa..aa..aa.', '....abba....', '...abbbba...', '..abbaabba..', '.abba..abba.', '.aa......aa.'],
}

const cache = new Map<string, string>()

function draw(key: string, rows: readonly string[], light: string, dark: string): string {
  const id = `${key}|${light}|${dark}`
  let url = cache.get(id)
  if (!url) {
    url = pixelIcon(rows, { a: light, b: dark })
    cache.set(id, url)
  }
  return url
}

/** 원형 문장 그림 주소 */
export function archetypeSigil(id: string | null, light = '#e9eef5', dark = '#8d98a6'): string {
  return draw(`a:${id}`, (id && ARCHETYPE_SIGILS[id]) || UNKNOWN, light, dark)
}

/** 모르는 것(?) 그림 주소 */
export function unknownSigil(light = '#5d6876'): string {
  return draw('unknown', UNKNOWN, light, light)
}

/** 작은 그림 주소 */
export function glyph(name: keyof typeof GLYPHS, light = '#e9eef5', dark = '#5b7fb8'): string {
  return draw(`g:${name}`, GLYPHS[name]!, light, dark)
}

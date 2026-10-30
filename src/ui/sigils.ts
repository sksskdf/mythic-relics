import { SOURCE_COLORS } from '../art/palette'
import { pixelIcon } from './pixelIcon'

export { SOURCE_COLORS }

/** 원천 넷의 문장 (12×12)과 색: 불꽃 불씨, 사냥 핏방울, 바람 소용돌이, 바위 돌 조각 */
const SOURCE_SIGILS: Record<string, readonly string[]> = {
  flame: ['.....a......', '....aa......', '....aba.....', '...abba..a..', '...abbba.a..', '..abbbbbaa..', '..abbcbbba..', '.abbcccbbba.', '.abccccbba..', '..abcccba...', '...abbba....', '....aaa.....'],
  hunt: ['.....a......', '.....a......', '....aba.....', '....aba.....', '...abbba....', '...abbba....', '..abbbbba...', '..abbcbbba..', '..abcccbba..', '..abbcbbba..', '...abbbba...', '....aaaa....'],
  wind: ['............', '..aaaaaa....', '.a......a...', '........a...', '..aaaa..a...', '.a....a.a...', '.a..a.a.a...', '.a...a..a...', '..aaa..a....', '......a.....', '.aaaaa......', '............'],
  stone: ['............', '....aaaa....', '...abbbba...', '..abbcbbba..', '.abbcbbbbba.', '.abbbbbcbba.', 'abbbbbbbbbba', 'abcbbbbbbbba', 'abbbbbcbbbba', '.abbbbbbbba.', '..aaaaaaaa..', '............'],
}

/** 원천 문장 그림 주소. 모르는 원천은 어둡게 */
export function sourceSigil(id: string, known = true): string {
  const [a, b, c] = known ? SOURCE_COLORS[id]! : ['#3a4558', '#222a36', '#2a3240']
  return draw(`s:${id}:${known}`, SOURCE_SIGILS[id]!, a, b, c)
}

/** 신화권 문장 (12×12, E9-05): 지역에 들어설 때와 승급 전설을 열 때 띠 가운데에 둔다 */
const REALM_SIGILS: Record<string, readonly string[]> = {
  // 북유럽: 룬 ᛉ
  norse: ['............', '.a...a...a..', '.a...a...a..', '..a..a..a...', '...a.a.a....', '....aaa.....', '.....a......', '.....a......', '.....a......', '.....a......', '....aaa.....', '............'],
  // 그리스: 기둥
  greek: ['............', '..aaaaaaaa..', '...abbbba...', '....a..a....', '....a..a....', '....a..a....', '....a..a....', '....a..a....', '....a..a....', '...abbbba...', '..aaaaaaaa..', '............'],
  // 중국: 구름
  china: ['............', '....aaaa....', '...a....a...', '..a..aa..a..', '..a.a..a.a..', '..a.a.aa.a..', '..a..a...a..', '...a....a...', '.aaaa..aaaa.', 'a....aa....a', '.aaaaaaaaaa.', '............'],
  // 일본: 도리이
  japan: ['............', 'aaaaaaaaaaaa', '.abbbbbbbba.', '..a......a..', '.aaaaaaaaaa.', '..a......a..', '..a......a..', '..a......a..', '..a......a..', '..a......a..', '.aa......aa.', '............'],
  // 한국: 돌탑
  korea: ['.....aa.....', '....abba....', '.....aa.....', '...aabbaa...', '....aaaa....', '..aabbbbaa..', '...aaaaaa...', '.aabbbbbbaa.', '..aaaaaaaa..', 'aabbbbbbbbaa', '.aaaaaaaaaa.', '............'],
  // 마을: 모닥불
  hub: ['.....a......', '....aa......', '....aba.....', '...abba..a..', '...abbba.a..', '..abbbbbaa..', '..abbcbbba..', '.abbcccbbba.', '..abcccbba..', '...abbba....', '.a.aaaa.a...', 'aaaaaaaaaaaa'],
}

/** 신화권 문장 그림 주소 (밝은 색, 어두운 색) */
export function realmSigil(realm: string, light: string, dark: string): string {
  return draw(`r:${realm}`, REALM_SIGILS[realm] ?? REALM_SIGILS.hub!, light, dark, '#fff0c8')
}

/** 잠긴 것·모르는 곳 */
const UNKNOWN = ['............', '....aaaa....', '...a....a...', '........a...', '.......a....', '......a.....', '.....a......', '.....a......', '............', '.....a......', '............', '............']

/** 작은 그림 단추들 */
const GLYPHS: Record<string, readonly string[]> = {
  // 수련 (E236): 뿌리에서 세 갈래로 뻗은 나무
  tree: ['.a...aa...a.', 'aba..aa..aba', '.ab..aa..ba.', '..ab.aa.ba..', '...abaaba...', '....abba....', '.....aa.....', '.....aa.....', '.....aa.....', '....abba....', '...aaaaaa...', '............'],
  // 녹이기 (E13-07-3 → E303-04): 망치
  salvage: ['............', '..aaaaaaa...', '..abbbbba...', '..aaaaaaa...', '.....ab.....', '.....ab.....', '.....ab.....', '.....ab.....', '.....ab.....', '.....ab.....', '....aaaa....', '............'],
  // 가방에 넣기
  bag: ['....aaaa....', '...a....a...', '..aaaaaaaa..', '.abbbbbbbba.', '.abbbaabbba.', '.abbbaabbba.', '.abbbbbbbba.', '.abbbbbbbba.', '.abbbbbbbba.', '..aaaaaaaa..', '............', '............'],
  // 발밑에 내려놓기
  drop: ['.....aa.....', '.....aa.....', '.....aa.....', '.....aa.....', '..a..aa..a..', '...a.aa.a...', '....aaaa....', '.....aa.....', '............', '.bbbbbbbbbb.', '............', '............'],
  // 자동 (장착을 따름)
  auto: ['............', '....aaaa....', '...a....a...', '..a......a..', '..a.....aaa.', '..a......a..', '..aaa.....a.', '..a......a..', '...a....a...', '....aaaa....', '............', '............'],
  // 비우기
  none: ['............', '............', '..a......a..', '...a....a...', '....a..a....', '.....aa.....', '.....aa.....', '....a..a....', '...a....a...', '..a......a..', '............', '............'],
  // 설정 (톱니바퀴)
  gear: ['............', '.....aa.....', '..a.aaaa.a..', '...aabbaa...', '..aab..baa..', '.aab....baa.', '.aab....baa.', '..aab..baa..', '...aabbaa...', '..a.aaaa.a..', '.....aa.....', '............'],
  // 잠금 (표식처럼 고를 수 없는 것)
  lock: ['............', '....aaaa....', '...a....a...', '...a....a...', '..aaaaaaaa..', '..abbbbbba..', '..abbaabba..', '..abbaabba..', '..abbbbbba..', '..aaaaaaaa..', '............', '............'],
  // 승급 전설 두루마리
  scroll: ['............', '.aaaaaaaaa..', 'a.bbbbbbbba.', '.abbbbbbbba.', '.ab.....ba..', '.abbbbbbbba.', '.ab.....ba..', '.abbbbbbbba.', '.ab....bba..', '.aaaaaaaaaa.', '..........a.', '............'],
  // 유물 탭: 보석
  relics: ['............', '...aaaaaa...', '..abbbbbba..', '.abbaabbbba.', 'aaaaaaaaaaaa', '.abbbbbbbba.', '..abbbbbba..', '...abbbba...', '....abba....', '.....aa.....', '............', '............'],
  // 클래스 탭: 별
  classes: ['.....aa.....', '.....aa.....', '....abba....', 'aaaaabbaaaaa', '.abbbbbbbba.', '..abbbbbba..', '...abbbba...', '..abba.abba.', '..aa.....aa.', '.a.........a', '............', '............'],
  // 외형: 옷걸이
  looks: ['............', '.....aa.....', '....a..a....', '.......a....', '......a.....', '.....aa.....', '....abba....', '...abbbba...', '..abbbbbba..', '.abbbbbbbba.', '.aaaaaaaaaa.', '............'],
  // 순환 탭: 맞물려 도는 두 화살표
  cycle: ['....aaaa....', '..aa....a...', '.a.......a..', '.a......aaa.', 'a........a..', 'a...........', '...........a', '..a........a', '.aaa......a.', '..a.......a.', '...a....aa..', '....aaaa....'],
  // 지도 탭: 접힌 지도와 길 (E15-04)
  map: ['............', '.aaaaaaaaaa.', '.abbbabbbba.', '.abbbabbaba.', '.abaaaaaaba.', '.abbbabbbba.', '.abbbabbbba.', '.abbaaaabba.', '.abbbabbbba.', '.abbbabbbba.', '.aaaaaaaaaa.', '............'],
  // 별자리
  star: ['.....a......', '.....a......', '....aba.....', 'aaaabbbaaaa.', '.abbbbbbba..', '..abbbbba...', '..abbabba...', '.abba.abba..', '.aa.....aa..', '............', '............', '............'],
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

function draw(key: string, rows: readonly string[], light: string, dark: string, inner = light): string {
  const id = `${key}|${light}|${dark}|${inner}`
  let url = cache.get(id)
  if (!url) {
    url = pixelIcon(rows, { a: light, b: dark, c: inner })
    cache.set(id, url)
  }
  return url
}

/** 모르는 것(?) 그림 주소 */
export function unknownSigil(light = '#5d6876'): string {
  return draw('unknown', UNKNOWN, light, light)
}

/** 작은 그림 주소 */
export function glyph(name: keyof typeof GLYPHS, light = '#e9eef5', dark = '#5b7fb8'): string {
  return draw(`g:${name}`, GLYPHS[name]!, light, dark)
}

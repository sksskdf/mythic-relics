import { pixelIcon } from './pixelIcon'

/**
 * 게임의 얼굴인 문장 고리: 열 원형의 작은 문장이 유물 보석을 둘러싼다. (DESIGN.md 10.5)
 * 시작·로딩 화면과 메뉴 단추에 쓴다. 64×64 픽셀로 그려 CSS로 정수배 확대한다.
 */

/** 고리에 새긴 열 원형의 작은 문장 (4×4). 순서: 천둥, 바다, 죽음, 태양, 달, 트릭스터, 전쟁, 지혜, 대지, 혼돈 */
const RING_SIGILS = [
  ['..a.', '.a..', 'aaa.', '.a..'],
  ['....', 'a.a.', '.a.a', '....'],
  ['aaa.', 'a.a.', 'aaa.', '.a..'],
  ['.a..', 'aaa.', '.a..', '....'],
  ['.aa.', 'a...', 'a...', '.aa.'],
  ['a..a', 'aaaa', 'a..a', '.aa.'],
  ['a..a', '.aa.', '.aa.', 'a..a'],
  ['.aa.', 'a..a', '.aa.', '....'],
  ['.a..', 'aaa.', '.a..', '.a..'],
  ['aaa.', 'a.a.', 'a.aa', 'aa..'],
]

const GILT = '#c9a24a'
let cached: string | null = null

/** 문장 고리 그림 주소 */
export function sigilRing(): string {
  if (cached) return cached
  const size = 64
  const c = size / 2
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const dot = (x: number, y: number, color: string) => {
    ctx.fillStyle = color
    ctx.fillRect(x, y, 1, 1)
  }
  // 새긴 돌 고리 두 줄
  for (let i = 0; i < 360; i += 2) {
    const t = (i * Math.PI) / 180
    dot(Math.round(c + Math.cos(t) * 29), Math.round(c + Math.sin(t) * 29), '#4a4d56')
    dot(Math.round(c + Math.cos(t) * 27), Math.round(c + Math.sin(t) * 27), '#2b2d33')
  }
  // 원형 문장 열 개
  RING_SIGILS.forEach((rows, i) => {
    const t = (i / RING_SIGILS.length) * Math.PI * 2 - Math.PI / 2
    const ox = Math.round(c + Math.cos(t) * 21) - 2
    const oy = Math.round(c + Math.sin(t) * 21) - 2
    rows.forEach((row, y) => [...row].forEach((ch, x) => ch === 'a' && dot(ox + x, oy + y, GILT)))
  })
  // 가운데 유물 보석 (금 테두리 마름모, 왼쪽 위가 밝다)
  for (let y = -9; y <= 9; y++) {
    for (let x = -9; x <= 9; x++) {
      const d = Math.abs(x) + Math.abs(y)
      if (d > 9) continue
      dot(c + x, c + y, d >= 8 ? GILT : d >= 7 ? '#6b4e1c' : x + y < -3 ? '#f4f8ff' : x < 0 ? '#c9d6ea' : '#8fa0bd')
    }
  }
  cached = canvas.toDataURL()
  return cached
}

const SMALL_RING = [
  '.....aaaaaa.....',
  '...aa......aa...',
  '..a....g.....a..',
  '.a.....g......a.',
  '.a....ggg.....a.',
  'a....gwwbg.....a',
  'a...gwwwbbg....a',
  'a..ggwwbbbgg...a',
  'a...gwbbbbg....a',
  'a....gbbbg.....a',
  '.a....ggg.....a.',
  '.a.....g......a.',
  '..a....g.....a..',
  '...aa......aa...',
  '.....aaaaaa.....',
  '................',
]

/** 작은 문장 고리 (16×16): 정보 화면 단추 */
export function smallSigilRing(): string {
  return pixelIcon(SMALL_RING, { a: '#6a6e78', g: GILT, w: '#f4f8ff', b: '#8fa0bd' })
}

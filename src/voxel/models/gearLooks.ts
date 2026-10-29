import { GRADES, type Grade } from '../../data/gearData'
import { GRADE_COLORS } from '../../art/palette'
import { VoxelGrid } from '../VoxelGrid'
import { HERO_COLORS } from './hero'

/**
 * 일반 장비의 외형 (E18-04-5, E24-06에서 다시 그림): 부위마다 바탕(gear.json의 bases) 3~4가지.
 * 바탕마다 실루엣이 먼저 다르고(칼·도끼·창·철퇴, 두건·투구·깃털 관…), 등급 색은 바탕마다 눈에 띄는 한 곳에 칠한다.
 * 등급이 오르면 모양을 바꾸지 않고 장식만 더한다: 좋음 = 등급 색 띠, 희귀 = 장식 하나(보석·징·볏), 영웅 = 금빛 테와 큰 장식.
 * 땅에 떨어진 모습과 끼었을 때 몸에 보이는 모습이 같다. 칸 규격은 looks.ts와 같다
 * (머리 12×12×9 원점 [6, 2, 4], 몸 가로 10~12×9×7 가운데 원점, 손 5×8×5, 다리 3×9×4, 무기는 손잡이가 z=0·쥐는 곳 y=5).
 * 장신구는 몸에 보이지 않고 땅에서만 보인다.
 */

const C = HERO_COLORS
const HAIR = 0x4a3222
const HAIR_SHADE = 0x35231a
const WOOD = 0x7a5636
const WOOD_DARK = 0x56391f
const IRON = 0x9aa4ae
const IRON_DARK = 0x646d77
const IRON_LIGHT = 0xdbe2e8
const LEATHER = 0x8a5f37
const LEATHER_DARK = 0x56381f
const LINEN = 0xcdb791
const LINEN_SHADE = 0xa99470
const GOLD = 0xf0c64a
const GOLD_DARK = 0xb8892a
const BONE = 0xf0e8d2
const SKIN = C.skin

const hex = (color: string): number => parseInt(color.slice(1), 16)
const mix = (a: number, b: number, t: number): number => {
  const ch = (v: number, s: number) => (v >> s) & 0xff
  const one = (s: number) => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t) << s
  return one(16) | one(8) | one(0)
}

/** 등급 → 장식 세기와 색 */
interface Trim {
  /** 0 보통 · 1 좋음 · 2 희귀 · 3 영웅 */
  lv: number
  accent: number
  dark: number
  light: number
}
function trimOf(grade: Grade): Trim {
  const accent = hex(GRADE_COLORS[grade])
  return { lv: GRADES.indexOf(grade), accent, dark: mix(accent, 0x000000, 0.35), light: mix(accent, 0xffffff, 0.45) }
}

/** 얼굴: 모든 머리 외형이 같은 자리에 둔다 (y2~7, 앞면 z6, 코 z7) */
function faceOf(g: VoxelGrid): void {
  g.box(3, 2, 1, 8, 7, 6, C.skin)
  g.box(3, 2, 1, 8, 7, 1, C.skinShade)
  g.set(4, 5, 6, C.eye)
  g.set(7, 5, 6, C.eye)
  g.box(5, 4, 7, 6, 4, 7, C.skinShade)
}

/** 짧게 흐트러진 머리카락 (기본 모습·깃털 관이 쓴다). 색은 캐릭터 만들기의 머리카락 색으로 바꿔 칠한다 */
export function hairOf(g: VoxelGrid): void {
  // 정수리와 옆·뒤
  g.box(2, 8, 0, 9, 9, 6, HAIR)
  g.box(2, 4, 0, 2, 8, 5, HAIR)
  g.box(9, 4, 0, 9, 8, 5, HAIR)
  g.box(3, 3, 0, 8, 8, 0, HAIR)
  g.box(2, 4, 0, 9, 4, 0, HAIR_SHADE)
  // 앞머리: 이마를 덮고 끝이 들쭉날쭉하다
  g.box(3, 7, 6, 8, 8, 6, HAIR)
  for (const x of [3, 5, 8]) g.set(x, 6, 6, HAIR)
  g.box(2, 7, 6, 2, 8, 6, HAIR_SHADE)
  g.box(9, 7, 6, 9, 8, 6, HAIR_SHADE)
  // 정수리는 둥글게 (키를 넘지 않게 두건과 같은 높이까지), 앞쪽에 살짝 뻗친 머리
  for (const [x, z] of [[2, 0], [9, 0], [2, 6], [9, 6], [3, 0], [8, 0]] as const) g.set(x, 9, z, null)
  g.box(4, 9, 6, 5, 9, 7, HAIR)
}

// ───────────────────────────── 무기 ─────────────────────────────
// 손잡이가 z=0, 쥐는 곳이 y=5. 두께는 x(가운데 두 칸), 날의 폭은 y로 낸다 (쿼터뷰에서 넓은 면이 보이게)

function weaponGrid(base: number, t: Trim): VoxelGrid {
  switch (base) {
    case 1: {
      // 도끼: 긴 자루 끝에 위로 넓게 펼친 반달 날, 뒤에 작은 가시
      const g = new VoxelGrid(4, 15, 13)
      g.box(1, 5, 0, 2, 5, 11, WOOD)
      g.box(1, 5, 0, 2, 5, 1, LEATHER_DARK)
      g.box(1, 5, 12, 2, 5, 12, IRON_DARK)
      // 날: 자루에서 위로 솟아 끝으로 갈수록 넓어진다
      g.box(1, 6, 7, 2, 9, 10, IRON)
      g.box(1, 9, 6, 2, 12, 11, IRON)
      g.box(1, 13, 7, 2, 13, 11, IRON)
      g.box(1, 6, 11, 2, 13, 11, IRON_LIGHT)
      g.box(1, 14, 8, 2, 14, 10, IRON_LIGHT)
      g.box(1, 9, 6, 2, 9, 6, IRON_DARK)
      // 뒤 가시
      g.box(1, 3, 8, 2, 4, 9, IRON_DARK)
      g.box(1, 2, 9, 2, 2, 9, IRON)
      // 등급 색: 날과 자루를 묶은 띠
      g.box(0, 4, 8, 3, 6, 9, t.accent)
      if (t.lv >= 1) g.box(1, 5, 2, 2, 5, 2, t.accent)
      if (t.lv >= 2) g.box(1, 10, 8, 2, 11, 9, t.light)
      if (t.lv >= 3) {
        // 금빛 날끝, 뒤 가시가 길어진다
        g.box(1, 6, 11, 2, 13, 11, GOLD)
        g.box(1, 14, 8, 2, 14, 10, GOLD)
        g.box(1, 1, 9, 2, 1, 10, GOLD)
      }
      return g
    }
    case 2: {
      // 창: 아주 긴 자루, 나뭇잎 모양 창끝, 그 아래 등급 색 깃 장식
      const g = new VoxelGrid(4, 11, 23)
      g.box(1, 5, 0, 2, 5, 16, WOOD)
      g.box(1, 5, 0, 2, 5, 0, WOOD_DARK)
      // 마름모 창끝: 목에서 넓어졌다가 끝으로 뾰족하게
      g.box(1, 4, 17, 2, 6, 17, IRON_DARK)
      g.box(1, 4, 18, 2, 6, 18, IRON)
      g.box(1, 3, 19, 2, 7, 20, IRON)
      g.box(1, 7, 19, 2, 7, 20, IRON_LIGHT)
      g.box(1, 4, 21, 2, 6, 21, IRON)
      g.box(1, 6, 21, 2, 6, 21, IRON_LIGHT)
      g.box(1, 5, 22, 2, 5, 22, IRON_LIGHT)
      // 깃 장식: 창끝 아래로 늘어진 술
      g.box(0, 4, 16, 3, 6, 16, t.accent)
      g.box(1, 2, 15, 2, 3, 16, t.accent)
      if (t.lv >= 1) g.box(1, 1, 14, 2, 1, 15, t.dark)
      if (t.lv >= 2) g.box(1, 5, 8, 2, 5, 9, t.accent)
      if (t.lv >= 3) {
        // 날개 달린 창: 창끝 아래 양옆 금빛 가지
        g.box(1, 8, 17, 2, 9, 17, GOLD)
        g.box(1, 1, 17, 2, 2, 17, GOLD)
        g.box(1, 10, 18, 2, 10, 18, GOLD)
        g.box(1, 0, 18, 2, 0, 18, GOLD)
      }
      return g
    }
    case 3: {
      // 철퇴: 짧은 자루 끝에 날개 달린 쇠머리
      const g = new VoxelGrid(6, 11, 13)
      g.box(2, 5, 0, 3, 5, 7, WOOD)
      g.box(2, 5, 0, 3, 5, 1, LEATHER_DARK)
      g.box(1, 3, 8, 4, 7, 11, IRON)
      g.box(1, 3, 8, 4, 3, 11, IRON_DARK)
      g.box(1, 7, 8, 4, 7, 11, IRON_LIGHT)
      // 날개: 네 방향으로 솟은 쇠판
      g.box(2, 8, 8, 3, 9, 11, IRON)
      g.box(2, 1, 8, 3, 2, 11, IRON_DARK)
      g.box(0, 4, 8, 0, 6, 11, IRON)
      g.box(5, 4, 8, 5, 6, 11, IRON)
      g.box(2, 5, 12, 3, 5, 12, IRON_LIGHT)
      // 등급 색: 머리 아래 고리
      g.box(1, 4, 7, 4, 6, 7, t.accent)
      if (t.lv >= 1) g.box(2, 5, 3, 3, 5, 3, t.accent)
      if (t.lv >= 2) {
        g.set(2, 10, 9, t.light)
        g.set(3, 10, 10, t.light)
        g.set(2, 0, 10, t.light)
      }
      if (t.lv >= 3) {
        g.box(2, 8, 8, 3, 9, 11, GOLD)
        g.box(1, 4, 7, 4, 6, 7, GOLD)
        g.box(2, 5, 12, 3, 5, 12, t.light)
      }
      return g
    }
    default: {
      // 짧은 검: 넓은 칼날, 등급 색 코등이, 둥근 칼자루 끝
      const g = new VoxelGrid(4, 11, 14)
      g.box(1, 5, 0, 2, 5, 2, LEATHER_DARK)
      g.box(1, 4, 0, 2, 6, 0, IRON_DARK)
      g.box(0, 3, 3, 3, 7, 3, t.accent)
      g.box(1, 4, 4, 2, 6, 11, IRON)
      g.box(1, 6, 4, 2, 6, 11, IRON_LIGHT)
      g.box(1, 4, 4, 2, 4, 11, IRON_DARK)
      g.box(1, 5, 12, 2, 6, 12, IRON_LIGHT)
      g.box(1, 5, 13, 2, 5, 13, IRON_LIGHT)
      if (t.lv >= 1) g.box(1, 5, 1, 2, 5, 1, t.accent)
      if (t.lv >= 2) g.box(1, 5, 5, 2, 5, 10, t.light)
      if (t.lv >= 3) {
        g.box(0, 2, 3, 3, 2, 3, GOLD)
        g.box(0, 8, 3, 3, 8, 3, GOLD)
        g.box(1, 4, 0, 2, 6, 0, GOLD)
      }
      return g
    }
  }
}

// ───────────────────────────── 머리 ─────────────────────────────

function headGrid(base: number, t: Trim, worn: boolean): VoxelGrid {
  const g = new VoxelGrid(12, 12, 9)
  switch (base) {
    case 1: {
      // 철 투구: 정수리를 덮는 둥근 쇠 투구, 코 가리개·뺨 가리개, 위에 등급 색 볏
      if (worn) faceOf(g)
      g.box(2, 7, 0, 9, 9, 7, IRON)
      g.box(3, 10, 1, 8, 10, 6, IRON_LIGHT)
      // 둥글게: 위 두 층의 모서리를 깎는다
      for (const [x, z] of [[2, 0], [9, 0], [2, 7], [9, 7]] as const) g.set(x, 9, z, null)
      for (const [x, z] of [[3, 1], [8, 1], [3, 6], [8, 6]] as const) g.set(x, 10, z, null)
      g.box(2, 7, 0, 9, 7, 7, IRON_DARK)
      // 뺨 가리개와 뒷목 가리개
      g.box(2, 3, 2, 2, 6, 6, IRON)
      g.box(9, 3, 2, 9, 6, 6, IRON)
      g.box(3, 3, 0, 8, 6, 0, IRON_DARK)
      // 코 가리개
      g.box(5, 4, 8, 6, 7, 8, IRON)
      g.box(5, 7, 8, 6, 7, 8, IRON_LIGHT)
      // 볏
      g.box(5, 11, 1, 6, 11, 6, t.accent)
      if (t.lv >= 1) g.box(5, 10, 0, 6, 10, 0, t.dark)
      if (t.lv >= 2) for (const x of [3, 8]) g.set(x, 7, 8, t.light)
      if (t.lv >= 3) {
        // 금빛 테와 짧은 뿔
        g.box(2, 7, 0, 9, 7, 7, GOLD_DARK)
        g.box(2, 7, 8, 9, 7, 8, GOLD)
        g.box(1, 8, 4, 1, 9, 4, BONE)
        g.box(0, 10, 4, 0, 11, 4, BONE)
        g.box(10, 8, 4, 10, 9, 4, BONE)
        g.box(11, 10, 4, 11, 11, 4, BONE)
      }
      return g
    }
    case 2: {
      // 깃털 관: 머리카락이 보이고, 이마 띠 위로 흰 깃털이 부채처럼 선다
      if (worn) {
        faceOf(g)
        hairOf(g)
      }
      g.box(2, 7, 0, 9, 7, 6, LEATHER)
      g.box(3, 7, 7, 8, 7, 7, LEATHER)
      g.box(5, 7, 7, 6, 7, 7, t.accent)
      // 깃털: 가운데 하나는 높게, 양옆은 비스듬히 (끝은 등급 색)
      g.box(5, 8, 6, 6, 11, 6, BONE)
      g.box(5, 11, 6, 6, 11, 6, t.accent)
      g.box(3, 8, 6, 3, 10, 6, BONE)
      g.set(2, 10, 6, t.accent)
      g.box(8, 8, 6, 8, 10, 6, BONE)
      g.set(9, 10, 6, t.accent)
      if (t.lv >= 1) {
        g.set(4, 7, 7, t.dark)
        g.set(7, 7, 7, t.dark)
      }
      if (t.lv >= 2) {
        // 깃털이 둘 더
        g.box(1, 7, 4, 1, 9, 4, BONE)
        g.set(1, 10, 4, t.accent)
        g.box(10, 7, 4, 10, 9, 4, BONE)
        g.set(10, 10, 4, t.accent)
      }
      if (t.lv >= 3) {
        g.box(2, 7, 0, 9, 7, 6, GOLD_DARK)
        g.box(3, 7, 7, 8, 7, 7, GOLD)
        g.box(5, 7, 7, 6, 7, 7, t.light)
      }
      return g
    }
    default: {
      // 가죽 두건: 얼굴만 내놓고 머리를 감싼다. 뒤로 뾰족하게 늘어진 끝, 얼굴 둘레 등급 색 테
      g.box(2, 3, 0, 9, 9, 6, LEATHER)
      g.box(3, 10, 0, 8, 10, 4, LEATHER)
      g.box(2, 3, 0, 9, 3, 6, LEATHER_DARK)
      if (worn) faceOf(g)
      for (const [x, z] of [[2, 0], [9, 0], [2, 6], [9, 6]] as const) g.set(x, 9, z, null)
      // 뒤로 늘어진 끝
      g.box(4, 11, 0, 7, 11, 1, LEATHER)
      g.box(5, 9, 0, 6, 11, 0, LEATHER_DARK)
      g.box(5, 6, 0, 6, 8, 0, LEATHER_DARK)
      // 얼굴 둘레 테 (이마 위와 양옆)
      g.box(2, 8, 7, 9, 8, 7, t.accent)
      g.box(2, 3, 7, 2, 7, 7, t.accent)
      g.box(9, 3, 7, 9, 7, 7, t.accent)
      if (worn) g.box(3, 7, 6, 8, 7, 6, HAIR)
      if (t.lv >= 1) g.box(3, 2, 6, 8, 2, 6, LEATHER_DARK)
      if (t.lv >= 2) g.box(5, 2, 7, 6, 2, 7, t.light)
      if (t.lv >= 3) {
        g.box(2, 8, 7, 9, 8, 7, GOLD)
        g.box(5, 2, 7, 6, 2, 7, GOLD)
      }
      return g
    }
  }
}

// ───────────────────────────── 몸 ─────────────────────────────
// 몸은 가로 10(기본)·12(어깨 판), 원점은 가운데. 몸통은 x1~10(12칸) / x0~9(10칸)

function bodyGrid(base: number, t: Trim): VoxelGrid {
  switch (base) {
    case 1: {
      // 사슬 갑옷: 사슬 무늬 몸통에 앞뒤로 늘어진 등급 색 겉옷(타바드), 사슬 목가리개
      const g = new VoxelGrid(10, 9, 7)
      g.box(0, 0, 0, 9, 1, 6, IRON_DARK)
      g.box(1, 2, 1, 8, 7, 5, IRON)
      g.box(0, 6, 1, 9, 7, 5, IRON)
      g.forEach((x, y, z, c) => c === IRON && (x + y + z) % 2 === 0 && g.set(x, y, z, IRON_DARK))
      g.box(3, 8, 1, 6, 8, 5, IRON)
      g.box(2, 8, 2, 7, 8, 4, IRON_DARK)
      // 겉옷: 가슴부터 아랫단까지 앞뒤
      g.box(3, 0, 6, 6, 7, 6, t.accent)
      g.box(3, 0, 0, 6, 7, 0, t.accent)
      g.box(3, 0, 6, 6, 0, 6, t.dark)
      g.box(1, 2, 1, 8, 2, 5, LEATHER_DARK)
      g.box(3, 2, 6, 6, 2, 6, LEATHER_DARK)
      if (t.lv >= 1) g.box(4, 2, 6, 5, 2, 6, IRON_LIGHT)
      if (t.lv >= 2) g.box(4, 4, 6, 5, 5, 6, t.light)
      if (t.lv >= 3) {
        g.box(3, 3, 6, 3, 7, 6, GOLD)
        g.box(6, 3, 6, 6, 7, 6, GOLD)
        g.box(4, 4, 6, 5, 5, 6, GOLD)
        // 어깨의 금빛 징
        g.box(0, 8, 2, 1, 8, 4, GOLD)
        g.box(8, 8, 2, 9, 8, 4, GOLD)
      }
      return g
    }
    case 2: {
      // 비늘 갑옷: 줄마다 어긋난 비늘, 양 어깨에 등급 색 큰 어깨판
      const g = new VoxelGrid(12, 10, 7)
      const scale = 0x5f8597
      const scaleDark = 0x41606f
      g.box(1, 0, 0, 10, 1, 6, scaleDark)
      g.box(2, 2, 1, 9, 7, 5, scale)
      g.box(1, 6, 1, 10, 7, 5, scale)
      for (let y = 1; y <= 7; y++) for (let x = 2 + (y % 2); x <= 9; x += 2) g.set(x, y, 6, IRON_LIGHT)
      g.box(2, 1, 6, 9, 1, 6, scaleDark)
      g.box(4, 8, 2, 7, 8, 4, LINEN)
      g.box(2, 2, 1, 9, 2, 5, LEATHER_DARK)
      // 어깨판: 몸통보다 바깥으로, 위로 솟는다
      g.box(0, 6, 1, 2, 8, 5, t.accent)
      g.box(9, 6, 1, 11, 8, 5, t.accent)
      g.box(0, 6, 1, 2, 6, 5, t.dark)
      g.box(9, 6, 1, 11, 6, 5, t.dark)
      if (t.lv >= 1) {
        g.set(1, 8, 3, t.light)
        g.set(10, 8, 3, t.light)
      }
      if (t.lv >= 2) g.box(5, 3, 6, 6, 5, 6, t.accent)
      if (t.lv >= 3) {
        g.box(0, 8, 1, 2, 8, 5, GOLD)
        g.box(9, 8, 1, 11, 8, 5, GOLD)
        g.box(1, 9, 3, 1, 9, 3, GOLD)
        g.box(10, 9, 3, 10, 9, 3, GOLD)
        g.box(5, 3, 6, 6, 5, 6, GOLD)
      }
      return g
    }
    default: {
      // 누빈 웃옷: 누빈 자국 줄무늬, 높이 선 깃, 허리띠 버클이 등급 색
      const g = new VoxelGrid(10, 9, 7)
      const cloth = 0x9a7650
      const seam = 0x74573a
      g.box(0, 0, 0, 9, 1, 6, cloth)
      g.box(1, 2, 1, 8, 7, 5, cloth)
      g.box(0, 6, 0, 9, 7, 6, cloth)
      for (let x = 1; x <= 8; x += 2) g.box(x, 3, 6, x, 7, 6, seam)
      g.box(0, 0, 0, 9, 0, 6, seam)
      // 높이 선 깃
      g.box(2, 8, 1, 7, 8, 5, LINEN)
      g.box(3, 8, 2, 6, 8, 4, LINEN_SHADE)
      g.box(1, 2, 1, 8, 2, 5, LEATHER_DARK)
      g.box(4, 2, 6, 5, 2, 6, t.accent)
      if (t.lv >= 1) g.box(0, 1, 6, 9, 1, 6, t.dark)
      if (t.lv >= 2) {
        // 비스듬한 띠
        for (let i = 0; i <= 4; i++) g.set(2 + i, 7 - i, 6, t.accent)
      }
      if (t.lv >= 3) {
        g.box(4, 2, 6, 5, 2, 6, GOLD)
        g.box(2, 8, 5, 7, 8, 5, GOLD)
      }
      return g
    }
  }
}

// ───────────────────────────── 손 ─────────────────────────────
// 5×8×5, 원점은 가운데 위. 소매는 x1~3·z1~3 (기본 소매와 같은 굵기), 장비는 손목에서 바깥으로 넓어진다

function handsGrid(base: number, t: Trim): VoxelGrid {
  const g = new VoxelGrid(5, 8, 5)
  switch (base) {
    case 1:
      // 철 손목대: 팔뚝 전체를 감싼 쇠, 앞뒤로 등급 색 징
      g.box(1, 6, 1, 3, 7, 3, LINEN)
      g.box(1, 0, 1, 3, 1, 3, LEATHER)
      g.box(0, 2, 0, 4, 5, 4, IRON)
      g.box(0, 5, 0, 4, 5, 4, IRON_LIGHT)
      g.box(0, 2, 0, 4, 2, 4, IRON_DARK)
      for (const [x, z] of [[0, 0], [4, 0], [0, 4], [4, 4]] as const) g.box(x, 2, z, x, 5, z, null)
      g.set(2, 3, 4, t.accent)
      g.set(2, 4, 4, t.accent)
      g.set(2, 3, 0, t.accent)
      g.set(2, 4, 0, t.accent)
      if (t.lv >= 1) g.box(1, 1, 1, 3, 1, 3, t.dark)
      if (t.lv >= 2) {
        g.set(0, 3, 2, t.light)
        g.set(4, 3, 2, t.light)
      }
      if (t.lv >= 3) {
        g.box(1, 5, 0, 3, 5, 0, GOLD)
        g.box(1, 5, 4, 3, 5, 4, GOLD)
        g.box(0, 5, 1, 0, 5, 3, GOLD)
        g.box(4, 5, 1, 4, 5, 3, GOLD)
        // 팔꿈치의 금빛 가시
        g.set(2, 6, 4, GOLD)
        g.set(2, 6, 0, GOLD)
      }
      return g
    case 2:
      // 주술 팔찌: 걷어 올린 소매, 맨팔에 구슬 팔찌 두 줄과 늘어진 부적
      g.box(1, 5, 1, 3, 7, 3, LINEN)
      g.box(0, 5, 0, 4, 5, 4, LINEN_SHADE)
      for (const [x, z] of [[0, 0], [4, 0], [0, 4], [4, 4]] as const) g.set(x, 5, z, null)
      g.box(1, 0, 1, 3, 4, 3, SKIN)
      g.box(1, 0, 1, 3, 0, 3, C.skinShade)
      for (const y of [2, 4]) {
        g.box(0, y, 1, 4, y, 3, BONE)
        g.box(1, y, 0, 3, y, 4, BONE)
        g.set(2, y, 4, t.accent)
        g.set(2, y, 0, t.accent)
        g.set(0, y, 2, t.accent)
        g.set(4, y, 2, t.accent)
      }
      g.set(2, 1, 4, t.dark)
      if (t.lv >= 1) g.set(2, 3, 4, t.accent)
      if (t.lv >= 2) {
        g.set(2, 1, 4, t.light)
        g.set(2, 0, 4, t.accent)
      }
      if (t.lv >= 3) {
        g.box(1, 4, 4, 3, 4, 4, GOLD)
        g.box(1, 2, 4, 3, 2, 4, GOLD)
      }
      return g
    default:
      // 가죽 장갑: 손목에서 넓게 벌어진 장갑 목, 등급 색 바느질 띠
      g.box(1, 5, 1, 3, 7, 3, LINEN)
      g.box(1, 5, 1, 3, 5, 3, LINEN_SHADE)
      g.box(1, 0, 1, 3, 2, 3, LEATHER)
      g.box(1, 0, 1, 3, 0, 3, LEATHER_DARK)
      g.box(0, 3, 0, 4, 4, 4, LEATHER)
      g.box(0, 4, 0, 4, 4, 4, LEATHER_DARK)
      for (const [x, z] of [[0, 0], [4, 0], [0, 4], [4, 4]] as const) g.box(x, 3, z, x, 4, z, null)
      g.box(1, 3, 4, 3, 3, 4, t.accent)
      g.box(1, 3, 0, 3, 3, 0, t.accent)
      if (t.lv >= 1) {
        g.box(0, 3, 1, 0, 3, 3, t.accent)
        g.box(4, 3, 1, 4, 3, 3, t.accent)
      }
      if (t.lv >= 2) g.box(1, 1, 3, 3, 1, 3, t.light)
      if (t.lv >= 3) {
        g.box(1, 4, 4, 3, 4, 4, GOLD)
        g.box(1, 4, 0, 3, 4, 0, GOLD)
        // 손등을 덮는 금빛 판
        g.box(1, 1, 4, 3, 2, 4, GOLD)
      }
      return g
  }
}

// ───────────────────────────── 발 ─────────────────────────────
// 3×9×4, z3이 발끝 앞. 다리(바지)는 y4~8

function feetGrid(base: number, t: Trim): VoxelGrid {
  const g = new VoxelGrid(3, 9, 4)
  const trousers = 0x5d4c3b
  switch (base) {
    case 1:
      // 철 정강이받이: 쇠 덧신 위로 정강이 앞을 덮는 판과 무릎 덮개
      g.box(0, 4, 0, 2, 8, 2, trousers)
      g.box(0, 0, 0, 2, 1, 3, IRON_DARK)
      g.box(0, 2, 0, 2, 3, 2, LEATHER_DARK)
      g.box(0, 2, 3, 2, 6, 3, IRON)
      g.box(0, 2, 3, 0, 6, 3, IRON_LIGHT)
      g.box(0, 6, 2, 2, 7, 3, IRON_LIGHT)
      g.set(1, 4, 3, t.accent)
      g.set(1, 6, 3, t.accent)
      if (t.lv >= 1) g.box(0, 1, 3, 2, 1, 3, t.dark)
      if (t.lv >= 2) g.set(1, 7, 3, t.light)
      if (t.lv >= 3) {
        g.box(0, 6, 3, 2, 7, 3, GOLD)
        g.box(0, 2, 3, 2, 2, 3, GOLD_DARK)
        g.set(1, 8, 3, GOLD)
      }
      return g
    case 2:
      // 바람 신발: 흰 가죽의 낮은 신, 발목에 감긴 등급 색 끈, 뒤꿈치에 솟은 작은 날개
      g.box(0, 3, 0, 2, 8, 2, trousers)
      g.box(0, 0, 0, 2, 1, 3, 0xefe6cc)
      g.box(0, 0, 0, 2, 0, 3, 0xb7aa8a)
      g.box(0, 2, 0, 2, 2, 2, t.accent)
      g.box(0, 3, 1, 2, 3, 1, t.accent)
      // 날개: 뒤꿈치 양옆에서 위·뒤로
      g.box(0, 2, 0, 0, 4, 0, BONE)
      g.box(2, 2, 0, 2, 4, 0, BONE)
      g.set(0, 5, 0, t.light)
      g.set(2, 5, 0, t.light)
      if (t.lv >= 1) g.box(0, 4, 2, 2, 4, 2, t.accent)
      if (t.lv >= 2) {
        g.set(0, 6, 0, BONE)
        g.set(2, 6, 0, BONE)
      }
      if (t.lv >= 3) {
        g.box(0, 2, 1, 2, 2, 3, GOLD)
        g.set(0, 6, 0, GOLD)
        g.set(2, 6, 0, GOLD)
      }
      return g
    default:
      // 가죽 장화: 무릎 아래까지 오는 장화, 위를 접어 내린 단, 앞의 등급 색 끈
      g.box(0, 6, 0, 2, 8, 2, trousers)
      g.box(0, 0, 0, 2, 5, 2, LEATHER)
      g.box(0, 0, 3, 2, 1, 3, LEATHER)
      g.box(0, 0, 0, 2, 0, 3, LEATHER_DARK)
      g.box(0, 5, 0, 2, 5, 3, LEATHER_DARK)
      g.set(1, 2, 3, t.accent)
      g.set(1, 4, 3, t.accent)
      g.set(1, 3, 3, LEATHER)
      if (t.lv >= 1) g.box(0, 5, 3, 2, 5, 3, t.dark)
      if (t.lv >= 2) g.set(1, 3, 3, t.light)
      if (t.lv >= 3) {
        // 털 단이 위로 부풀고 금빛 버클
        g.box(0, 5, 0, 2, 5, 3, BONE)
        g.box(0, 6, 3, 2, 6, 3, BONE)
        g.set(1, 3, 3, GOLD)
      }
      return g
  }
}

// ───────────────────────────── 장신구 (땅에서만) ─────────────────────────────

function trinketGrid(base: number, t: Trim): VoxelGrid {
  const g = new VoxelGrid(7, 8, 3)
  switch (base) {
    case 1:
      // 돌 반지: 세운 돌 고리 위에 등급 색 보석
      g.box(2, 0, 1, 4, 0, 1, 0x8a8278)
      g.box(2, 4, 1, 4, 4, 1, 0x8a8278)
      g.box(1, 1, 1, 1, 3, 1, 0x8a8278)
      g.box(5, 1, 1, 5, 3, 1, 0x8a8278)
      g.box(2, 5, 1, 4, 6, 1, t.accent)
      g.set(3, 7, 1, t.light)
      if (t.lv >= 3) g.box(2, 4, 1, 4, 4, 1, GOLD)
      return g
    case 2:
      // 부적: 누런 종이에 등급 색 글자, 위에 매단 끈
      g.box(2, 0, 1, 4, 6, 1, 0xe8d8a0)
      g.box(3, 1, 1, 3, 5, 1, t.accent)
      g.box(2, 4, 1, 4, 4, 1, t.accent)
      g.box(3, 7, 1, 3, 7, 1, LEATHER_DARK)
      if (t.lv >= 3) g.box(2, 0, 1, 4, 0, 1, GOLD)
      return g
    default:
      // 뼈 목걸이: 끈에 꿴 송곳니와 등급 색 구슬
      g.box(0, 6, 1, 6, 6, 1, LEATHER_DARK)
      g.box(0, 4, 1, 0, 5, 1, LEATHER_DARK)
      g.box(6, 4, 1, 6, 5, 1, LEATHER_DARK)
      g.box(3, 1, 1, 3, 4, 1, BONE)
      g.box(1, 2, 1, 1, 3, 1, BONE)
      g.box(5, 2, 1, 5, 3, 1, BONE)
      g.set(2, 4, 1, t.accent)
      g.set(4, 4, 1, t.accent)
      if (t.lv >= 3) g.set(3, 5, 1, GOLD)
      return g
  }
}

/** 장비 부위 → 몸의 외형 칸 (장신구는 몸에 보이지 않는다) */
export const GEAR_LOOK_SLOT = { weapon: 'weapon', head: 'head', body: 'torso', hands: 'arms', feet: 'legs' } as const

/** 부위·바탕 번호·등급으로 모델을 만든다. worn이 false면 땅에 놓을 모습(얼굴·머리카락 없음) */
export function gearGrid(part: string, base: number, grade: Grade, worn = true): VoxelGrid {
  const t = trimOf(grade)
  switch (part) {
    case 'weapon':
      return weaponGrid(base, t)
    case 'head':
      return headGrid(base, t, worn)
    case 'body':
      return bodyGrid(base, t)
    case 'hands':
      return handsGrid(base, t)
    case 'feet':
      return feetGrid(base, t)
    default:
      return trinketGrid(base, t)
  }
}

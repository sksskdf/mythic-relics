import { VoxelGrid } from '../VoxelGrid'
import { HERO_COLORS } from './hero'

/**
 * 일반 장비의 외형 (E18-04-5): 부위마다 바탕(gear.json의 bases) 3~4가지 모양에 등급 색 장식.
 * 땅에 떨어진 모습과 끼었을 때 몸에 보이는 모습이 같다. 칸 규격은 looks.ts와 같다
 * (머리 12×12×9, 몸 10×9×7, 팔 3×8×3, 다리 3×9×4, 무기는 손잡이가 z=0·쥐는 곳 y=5).
 * 장신구는 몸에 보이지 않고 땅에서만 보인다.
 */

const C = HERO_COLORS
const HAIR = 0x4a3222
const WOOD = 0x7a5636
const IRON = 0x9aa4ae
const IRON_DARK = 0x6a737c
const IRON_LIGHT = 0xd7dee5
const LEATHER = 0x7a5636
const LEATHER_DARK = 0x4f3524
const LINEN = 0xcdb791
const GOLD = 0xe6bd4e

const hex = (color: string): number => parseInt(color.slice(1), 16)

function faceOf(g: VoxelGrid): void {
  g.box(3, 2, 1, 8, 7, 6, C.skin)
  g.box(3, 2, 1, 8, 7, 1, C.skinShade)
  g.set(4, 5, 6, C.eye)
  g.set(7, 5, 6, C.eye)
  g.box(5, 4, 7, 6, 4, 7, C.skinShade)
}

// ───────────────────────────── 무기 ─────────────────────────────

function weaponGrid(base: number, accent: number, rich: boolean): VoxelGrid {
  const edge = rich ? 0xf2f4f7 : IRON_LIGHT
  switch (base) {
    case 1: {
      // 도끼: 긴 자루 끝 한쪽에 넓은 날
      const g = new VoxelGrid(2, 10, 12)
      g.box(0, 5, 0, 1, 5, 10, WOOD)
      g.box(0, 5, 0, 1, 5, 1, LEATHER_DARK)
      g.box(0, 5, 11, 1, 5, 11, accent)
      g.box(0, 6, 8, 1, 9, 10, IRON)
      g.box(0, 9, 7, 1, 9, 11, edge)
      g.box(0, 5, 9, 1, 5, 9, accent)
      return g
    }
    case 2: {
      // 창: 길고 가는 자루, 마름모 창끝, 등급 색 술
      const g = new VoxelGrid(2, 8, 19)
      g.box(0, 5, 0, 1, 5, 14, WOOD)
      g.box(0, 3, 14, 1, 4, 14, accent)
      g.box(0, 4, 15, 1, 6, 16, IRON)
      g.box(0, 5, 17, 1, 5, 18, edge)
      return g
    }
    case 3: {
      // 철퇴: 짧은 자루에 가시 박힌 쇠공
      const g = new VoxelGrid(5, 10, 11)
      g.box(2, 5, 0, 2, 5, 6, WOOD)
      g.box(2, 5, 0, 2, 5, 1, LEATHER_DARK)
      g.box(1, 4, 7, 3, 6, 9, IRON_DARK)
      for (const [x, y, z] of [[0, 5, 8], [4, 5, 8], [2, 3, 8], [2, 7, 8], [2, 5, 10]] as const) g.set(x, y, z, accent)
      return g
    }
    default: {
      // 짧은 검: 등급 색 코등이
      const g = new VoxelGrid(2, 7, 11)
      g.box(0, 5, 0, 1, 5, 2, LEATHER_DARK)
      g.box(0, 4, 3, 1, 6, 3, accent)
      g.box(0, 5, 4, 1, 5, 9, IRON)
      g.box(0, 6, 4, 1, 6, 8, edge)
      g.box(0, 5, 10, 1, 5, 10, edge)
      return g
    }
  }
}

// ───────────────────────────── 머리 ─────────────────────────────

function headGrid(base: number, accent: number, rich: boolean, worn: boolean): VoxelGrid {
  const g = new VoxelGrid(12, 12, 9)
  // 땅에 떨어진 것은 얼굴·머리카락 없이 쓰개만
  const face = worn ? faceOf : () => {}
  const hair = worn ? HAIR : null
  switch (base) {
    case 1: {
      // 철 투구: 정수리를 덮는 둥근 투구, 코 가리개, 등급 색 볏
      face(g)
      g.box(2, 6, 0, 9, 9, 6, IRON)
      g.box(2, 6, 0, 9, 6, 6, IRON_DARK)
      g.box(3, 10, 1, 8, 10, 5, IRON_LIGHT)
      g.box(5, 4, 7, 6, 7, 7, IRON)
      g.box(5, 11, 1, 6, 11, 6, accent)
      if (rich) g.box(5, 11, 0, 6, 11, 0, GOLD)
      return g
    }
    case 2: {
      // 깃털 관: 머리가 보이고 이마 띠 위로 깃털이 선다
      face(g)
      if (hair) g.box(2, 7, 0, 9, 9, 6, hair)
      g.box(2, 7, 6, 9, 7, 6, accent)
      g.box(2, 7, 0, 2, 7, 6, accent)
      g.box(9, 7, 0, 9, 7, 6, accent)
      g.box(5, 8, 0, 6, 11, 1, 0xf2f4f7)
      g.box(4, 9, 0, 4, 10, 0, accent)
      g.box(7, 9, 0, 7, 10, 0, accent)
      return g
    }
    default: {
      // 가죽 두건: 얼굴만 내놓고 이마 단에 등급 색 테
      g.box(2, 3, 0, 9, 9, 6, LEATHER)
      g.box(2, 3, 0, 9, 3, 6, LEATHER_DARK)
      face(g)
      g.box(2, 8, 6, 9, 8, 7, accent)
      if (hair) g.box(3, 7, 6, 8, 7, 6, hair)
      for (const [x, z] of [[2, 0], [9, 0], [2, 6], [9, 6]] as const) g.set(x, 9, z, null)
      return g
    }
  }
}

// ───────────────────────────── 몸 ─────────────────────────────

function bodyGrid(base: number, accent: number, rich: boolean): VoxelGrid {
  const g = new VoxelGrid(10, 9, 7)
  switch (base) {
    case 1: {
      // 사슬 갑옷: 회색 사슬 무늬(바둑판), 아랫단에 등급 색
      g.box(0, 0, 0, 9, 1, 6, IRON_DARK)
      g.box(1, 2, 1, 8, 7, 5, IRON)
      for (let x = 1; x <= 8; x++) for (let y = 2; y <= 7; y++) if ((x + y) % 2 === 0) g.set(x, y, 5, IRON_DARK)
      g.box(0, 6, 1, 9, 7, 5, IRON)
      g.box(0, 0, 6, 9, 0, 6, accent)
      g.box(3, 8, 2, 6, 8, 4, LINEN)
      if (rich) g.box(4, 4, 6, 5, 5, 6, GOLD)
      return g
    }
    case 2: {
      // 비늘 갑옷: 줄마다 어긋난 비늘, 어깨에 등급 색
      const scale = 0x5a7a8a
      g.box(0, 0, 0, 9, 1, 6, scale)
      g.box(1, 2, 1, 8, 7, 5, scale)
      for (let y = 1; y <= 7; y += 2) for (let x = 1 + (y % 4 === 1 ? 0 : 1); x <= 8; x += 2) g.set(x, y, 6, IRON_LIGHT)
      g.box(0, 6, 1, 1, 7, 5, accent)
      g.box(8, 6, 1, 9, 7, 5, accent)
      g.box(3, 8, 2, 6, 8, 4, LINEN)
      return g
    }
    default: {
      // 누빈 웃옷: 누빈 자국(점), 허리띠 버클이 등급 색
      const cloth = 0x8a6a4a
      g.box(0, 0, 0, 9, 1, 6, cloth)
      g.box(1, 2, 1, 8, 7, 5, cloth)
      for (let x = 2; x <= 7; x += 2) for (let y = 3; y <= 7; y += 2) g.set(x, y, 6, 0x6a4f34)
      g.box(1, 2, 1, 8, 2, 5, LEATHER_DARK)
      g.set(5, 2, 6, accent)
      g.set(4, 2, 6, accent)
      g.box(0, 6, 1, 9, 7, 5, cloth)
      g.box(3, 8, 2, 6, 8, 4, LINEN)
      return g
    }
  }
}

// ───────────────────────────── 손 ─────────────────────────────

function handsGrid(base: number, accent: number): VoxelGrid {
  const g = new VoxelGrid(3, 8, 3)
  g.box(0, 3, 0, 2, 7, 2, LINEN)
  switch (base) {
    case 1:
      // 철 손목대: 팔뚝을 감싼 쇠, 등급 색 징. 위 소매는 걷어 올려 가늘다
      g.box(0, 0, 0, 2, 2, 2, LEATHER)
      g.box(0, 2, 0, 2, 5, 2, IRON)
      g.box(0, 5, 0, 2, 5, 2, IRON_DARK)
      g.set(1, 4, 2, accent)
      g.set(1, 3, 2, accent)
      for (const [x, z] of [[0, 0], [2, 0], [0, 2], [2, 2]] as const) g.box(x, 6, z, x, 7, z, null)
      return g
    case 2:
      // 주술 팔찌: 가는 맨손에 구슬 팔찌 두 줄
      g.box(0, 0, 0, 2, 2, 2, C.skin)
      for (const [x, z] of [[0, 0], [2, 0], [0, 2], [2, 2]] as const) g.box(x, 0, z, x, 1, z, null)
      g.box(0, 3, 0, 2, 3, 2, accent)
      g.box(0, 5, 0, 2, 5, 2, accent)
      g.set(1, 3, 2, GOLD)
      return g
    default:
      // 가죽 장갑: 손목 단에 등급 색
      g.box(0, 0, 0, 2, 3, 2, LEATHER)
      g.box(0, 0, 0, 2, 0, 2, LEATHER_DARK)
      g.box(0, 3, 0, 2, 3, 2, accent)
      return g
  }
}

// ───────────────────────────── 발 ─────────────────────────────

function feetGrid(base: number, accent: number): VoxelGrid {
  const g = new VoxelGrid(3, 9, 4)
  g.box(0, 4, 0, 2, 8, 2, 0x5d4c3b)
  switch (base) {
    case 1:
      // 철 정강이받이: 장화 위 정강이 앞을 쇠로
      g.box(0, 0, 0, 2, 2, 2, LEATHER_DARK)
      g.box(0, 0, 3, 2, 1, 3, LEATHER_DARK)
      g.box(0, 2, 2, 2, 6, 3, IRON)
      g.box(0, 6, 3, 2, 6, 3, IRON_LIGHT)
      g.set(1, 4, 3, accent)
      return g
    case 2:
      // 바람 신발: 가벼운 신에 발목 깃이 등급 색으로 솟는다
      g.box(0, 0, 0, 2, 1, 2, 0xe8e0c8)
      g.box(0, 0, 3, 2, 0, 3, 0xe8e0c8)
      g.box(0, 2, 0, 0, 3, 0, accent)
      g.box(2, 2, 0, 2, 3, 0, accent)
      g.box(0, 2, 1, 2, 2, 2, accent)
      return g
    default:
      // 가죽 장화: 등급 색 끈
      g.box(0, 0, 0, 2, 3, 2, LEATHER)
      g.box(0, 0, 3, 2, 1, 3, LEATHER)
      g.box(0, 3, 0, 2, 3, 2, LEATHER_DARK)
      g.set(1, 2, 3, accent)
      g.set(1, 1, 3, accent)
      return g
  }
}

// ───────────────────────────── 장신구 (땅에서만) ─────────────────────────────

function trinketGrid(base: number, accent: number): VoxelGrid {
  const g = new VoxelGrid(5, 6, 3)
  switch (base) {
    case 1:
      // 돌 반지: 세운 고리에 등급 색 보석
      g.box(1, 0, 1, 3, 0, 1, 0x8a8278)
      g.box(1, 4, 1, 3, 4, 1, 0x8a8278)
      g.box(0, 1, 1, 0, 3, 1, 0x8a8278)
      g.box(4, 1, 1, 4, 3, 1, 0x8a8278)
      g.box(2, 5, 1, 2, 5, 1, accent)
      return g
    case 2:
      // 부적: 누런 종이에 등급 색 글자
      g.box(1, 0, 1, 3, 5, 1, 0xe8d8a0)
      g.box(2, 1, 1, 2, 4, 1, accent)
      g.box(1, 3, 1, 3, 3, 1, accent)
      return g
    default:
      // 뼈 목걸이: 끈에 꿴 송곳니와 등급 색 구슬
      g.box(0, 5, 1, 4, 5, 1, LEATHER_DARK)
      g.box(0, 3, 1, 0, 4, 1, LEATHER_DARK)
      g.box(4, 3, 1, 4, 4, 1, LEATHER_DARK)
      g.box(2, 1, 1, 2, 3, 1, 0xf2ecd8)
      g.set(1, 3, 1, accent)
      g.set(3, 3, 1, accent)
      return g
  }
}

/** 장비 부위 → 몸의 외형 칸 (장신구는 몸에 보이지 않는다) */
export const GEAR_LOOK_SLOT = { weapon: 'weapon', head: 'head', body: 'torso', hands: 'arms', feet: 'legs' } as const

/** 부위·바탕 번호·등급 색으로 모델을 만든다. rich면 장식이 하나 더 붙는다 (영웅 등급). worn이 false면 땅에 놓을 모습(얼굴 없음) */
export function gearGrid(part: string, base: number, gradeColor: string, rich = false, worn = true): VoxelGrid {
  const accent = hex(gradeColor)
  switch (part) {
    case 'weapon':
      return weaponGrid(base, accent, rich)
    case 'head':
      return headGrid(base, accent, rich, worn)
    case 'body':
      return bodyGrid(base, accent, rich)
    case 'hands':
      return handsGrid(base, accent)
    case 'feet':
      return feetGrid(base, accent)
    default:
      return trinketGrid(base, accent)
  }
}

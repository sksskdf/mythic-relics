import { PROP_COLORS } from '../voxel/models/props'

/**
 * 지형 테마 (E7-05). 지역마다 땅 색·물·흩뿌림·테두리 숲·하늘빛이 다르다.
 * 소품은 같은 모델을 쓰고 색만 바꿔 칠한다(recolor). 눈 테마의 눈 색이 다른 테마에서는 풀·이끼·꽃이 된다.
 * 그 땅에만 있는 소품(올리브 나무·기둥·벚나무 등)은 src/voxel/models/landmarks.ts에 있다.
 */

export interface ThemeDef {
  /** 땅: 기본, 그늘, 다른 결, 다져진 길, 드러난 흙, 드러난 돌 */
  ground: { base: number; shade: number; alt: number; path: number; earth: number; stone: number }
  /** 물: 얼음이면 금이 가 있고, 아니면 잔물결 */
  water: { surface: number; deep: number; frozen: boolean }
  /** 흩뿌림: 풀 포기 세 색, 자갈 두 색 */
  scatter: { tuft: [number, number, number]; pebble: [number, number] }
  /** 테두리 숲에 섞는 소품 (가장자리 밖, 충돌 없음) */
  border: readonly string[]
  /** 하늘·반구광·해 */
  light: { sky: number; hemiSky: number; hemiGround: number; hemi: number; sun: number; sunIntensity: number }
  /** 공기 중에 떠다니는 것: 눈, 꽃잎, 불티, 없음 */
  particles: { kind: 'snow' | 'petals' | 'embers' | 'none'; color: number }
  /** 소품 색 바꾸기 (원래 색 → 이 테마의 색) */
  recolor: Readonly<Record<number, number>>
}

const C = PROP_COLORS

export const THEMES = {
  /** 미드가르드 설원: 눈 덮인 침엽수림 */
  snow: {
    ground: { base: 0xe6edf4, shade: 0xc9d5e1, alt: 0xb7c8da, path: 0xb9b7b3, earth: 0x6f5f50, stone: 0x868d98 },
    water: { surface: 0x86c3dc, deep: 0x5d9fbf, frozen: true },
    scatter: { tuft: [0x7a7448, 0x8c8452, 0x6a6440], pebble: [0x8a909a, 0x6f7681] },
    border: ['pine', 'pine', 'pine', 'pine', 'rock', 'deadTree', 'mound'],
    light: { sky: 0x9fb4c8, hemiSky: 0xc4d8ff, hemiGround: 0x4a5566, hemi: 0.85, sun: 0xffe4bd, sunIntensity: 2.7 },
    particles: { kind: 'snow', color: 0xffffff },
    recolor: {},
  },
  /** 올림포스 기슭: 햇볕에 바랜 풀밭, 올리브 나무와 대리석 */
  olympus: {
    ground: { base: 0xb8c27a, shade: 0xa3ad68, alt: 0xc9c98a, path: 0xd8cba4, earth: 0x9a7a54, stone: 0xd4d0c4 },
    water: { surface: 0x5fb8d0, deep: 0x3a8fb2, frozen: false },
    scatter: { tuft: [0x6f8a3a, 0x86a046, 0x5a7230], pebble: [0xd8d2c4, 0xb8b2a4] },
    border: ['olive', 'olive', 'cypress', 'cypress', 'rock', 'bush'],
    light: { sky: 0xb4d6ec, hemiSky: 0xe0f0ff, hemiGround: 0x6a6040, hemi: 0.9, sun: 0xfff0cf, sunIntensity: 3 },
    particles: { kind: 'none', color: 0xffffff },
    recolor: {
      [C.snow]: 0x9ab25a,
      [C.snowShade]: 0x86a04c,
      [C.snowBlue]: 0x7a9444,
      [C.pine]: 0x3f6a3a,
      [C.pineDark]: 0x2f522c,
      [C.pineLight]: 0x56844a,
      [C.rock]: 0xc8c2b4,
      [C.rockDark]: 0xa8a294,
      [C.rockLight]: 0xe0dccf,
      [C.ruin]: 0xefe9dc,
      [C.ruinDark]: 0xcfc8b8,
      [C.ruinMoss]: 0xb0b88a,
      [C.bush]: 0x5a7a3a,
      [C.bushDark]: 0x46622c,
      [C.berry]: 0x6a3a7a,
    },
  },
  /** 화과산: 짙은 풀과 기암, 복숭아꽃 */
  hwagwasan: {
    ground: { base: 0x76a056, shade: 0x628a48, alt: 0x86b062, path: 0xb8a070, earth: 0x7a5a3a, stone: 0x8a8a7a },
    water: { surface: 0x4ab0a0, deep: 0x2a8a80, frozen: false },
    scatter: { tuft: [0x4a7a2a, 0x5c9036, 0x3e6824], pebble: [0x8a8a7a, 0x6e6e60] },
    border: ['spire', 'spire', 'peach', 'pine', 'rock', 'bamboo'],
    light: { sky: 0xa8d8c8, hemiSky: 0xd8fff0, hemiGround: 0x3a5030, hemi: 0.95, sun: 0xfff2d8, sunIntensity: 2.7 },
    particles: { kind: 'petals', color: 0xffb0c8 },
    recolor: {
      [C.snow]: 0x5c9a3a,
      [C.snowShade]: 0x4c8430,
      [C.snowBlue]: 0x3e7028,
      [C.pine]: 0x2f6a3a,
      [C.pineDark]: 0x225030,
      [C.pineLight]: 0x3f8248,
      [C.rock]: 0x8a8678,
      [C.rockDark]: 0x6a675c,
      [C.rockLight]: 0xa8a494,
      [C.ruin]: 0x9a9480,
      [C.ruinDark]: 0x7a7464,
      [C.bush]: 0x3e7a34,
      [C.bushDark]: 0x2e6028,
      [C.berry]: 0xff9ab0,
    },
  },
  /** 다카마가하라: 연둣빛 높은 들판, 벚꽃과 붉은 문 */
  takamagahara: {
    ground: { base: 0xa8cc8a, shade: 0x96ba78, alt: 0xbad89a, path: 0xd8d0b8, earth: 0x8a6a4a, stone: 0xa8a8a0 },
    water: { surface: 0x7ac8e0, deep: 0x4aa0c8, frozen: false },
    scatter: { tuft: [0x6a9a4a, 0x7cae58, 0x5a8a3e], pebble: [0xb8b8b0, 0x98988e] },
    border: ['cherry', 'cherry', 'pine', 'pine', 'rock', 'bamboo'],
    light: { sky: 0xc8dcf0, hemiSky: 0xfff0f8, hemiGround: 0x506048, hemi: 0.95, sun: 0xfff4e8, sunIntensity: 2.8 },
    particles: { kind: 'petals', color: 0xffc8d8 },
    recolor: {
      [C.snow]: 0xffc8d8,
      [C.snowShade]: 0xf0a8c0,
      [C.snowBlue]: 0x8ab070,
      [C.pine]: 0x2f5a3a,
      [C.pineDark]: 0x234830,
      [C.pineLight]: 0x3c6e48,
      [C.rock]: 0x9a9a92,
      [C.rockDark]: 0x7a7a72,
      [C.rockLight]: 0xb8b8b0,
      [C.ruin]: 0xc8c0b0,
      [C.ruinDark]: 0xa8a090,
      [C.bush]: 0x5a8a44,
      [C.bushDark]: 0x46703a,
      [C.berry]: 0xffc8d8,
    },
  },
  /** 신시: 가을빛 솔숲과 돌탑 */
  sinsi: {
    ground: { base: 0xc0a868, shade: 0xa8925a, alt: 0xd0b878, path: 0xc8b898, earth: 0x8a5a3a, stone: 0x9a968a },
    water: { surface: 0x6aa8c0, deep: 0x4a88a8, frozen: false },
    scatter: { tuft: [0xb07a3a, 0xc89040, 0x8a6a30], pebble: [0x9a968a, 0x7a766a] },
    border: ['pine', 'pine', 'pine', 'maple', 'rock', 'cairn'],
    light: { sky: 0xd0c8b0, hemiSky: 0xfff0d8, hemiGround: 0x5a4a30, hemi: 0.9, sun: 0xffe0b0, sunIntensity: 2.8 },
    particles: { kind: 'petals', color: 0xe0782a },
    recolor: {
      [C.snow]: 0xc87a30,
      [C.snowShade]: 0xb06428,
      [C.snowBlue]: 0x9a7a40,
      [C.pine]: 0x3a5a34,
      [C.pineDark]: 0x2a4628,
      [C.pineLight]: 0x4a6e40,
      [C.trunk]: 0x8a4a30,
      [C.trunkDark]: 0x6a3624,
      [C.rock]: 0x9a968a,
      [C.rockDark]: 0x7a766a,
      [C.rockLight]: 0xb8b4a8,
      [C.bush]: 0xa85a2a,
      [C.bushDark]: 0x8a4a22,
      [C.berry]: 0xd83a2a,
    },
  },
  /** 모닥불 마을: 눈이 녹은 늦봄 풀밭 */
  village: {
    ground: { base: 0x9ab872, shade: 0x88a462, alt: 0xa8c47e, path: 0xc8b48a, earth: 0x8a6a4a, stone: 0x9a968a },
    water: { surface: 0x6ab4cc, deep: 0x4890b0, frozen: false },
    scatter: { tuft: [0x5a8a3a, 0x6c9c44, 0x4a7830], pebble: [0x9a968a, 0x7a766a] },
    border: ['pine', 'pine', 'pine', 'rock', 'bush'],
    light: { sky: 0xb8d0e0, hemiSky: 0xfff4e0, hemiGround: 0x4a5040, hemi: 0.9, sun: 0xffe8c8, sunIntensity: 2.7 },
    particles: { kind: 'embers', color: 0xffb060 },
    recolor: {
      [C.snow]: 0x7aa04a,
      [C.snowShade]: 0x6a9040,
      [C.snowBlue]: 0x5a7c38,
      [C.bush]: 0x4a7a34,
      [C.bushDark]: 0x3a6428,
    },
  },
} satisfies Record<string, ThemeDef>

export type ThemeId = keyof typeof THEMES
export const THEME_IDS = Object.keys(THEMES) as ThemeId[]

/** 테마의 소품 색 바꾸기 */
export function recolorHex(theme: ThemeDef, hex: number): number {
  return theme.recolor[hex] ?? hex
}

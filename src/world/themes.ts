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

const BASE_THEMES = {
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

/** 같은 신화권 땅의 다른 얼굴 (E15): 그 신화권 테마를 바탕으로 땅·물·빛·날림만 바꾼다. 소품 색 바꾸기는 그대로 */
function variant(
  base: ThemeDef,
  patch: { ground?: Partial<ThemeDef['ground']>; water?: Partial<ThemeDef['water']>; scatter?: ThemeDef['scatter']; light?: Partial<ThemeDef['light']>; particles?: ThemeDef['particles']; border?: readonly string[]; recolor?: ThemeDef['recolor'] },
): ThemeDef {
  return {
    ...base,
    ground: { ...base.ground, ...patch.ground },
    water: { ...base.water, ...patch.water },
    scatter: patch.scatter ?? base.scatter,
    light: { ...base.light, ...patch.light },
    particles: patch.particles ?? base.particles,
    border: patch.border ?? base.border,
    recolor: { ...base.recolor, ...patch.recolor },
  }
}

/** 깊은 땅과 보스의 땅 (E15-02·03) */
const DEEP_THEMES = {
  /** 요툰헤임 빙하: 푸른 얼음, 차가운 빛 */
  glacier: variant(BASE_THEMES.snow, {
    ground: { base: 0xcfe2ef, shade: 0xa9c4da, alt: 0x93b4cf, path: 0x9fb0bf },
    light: { sky: 0x7f9ab4, hemiSky: 0xa8c8ff, hemiGround: 0x3a4a60, sun: 0xd8e8ff, sunIntensity: 2.7 },
  }),
  /** 철의 숲 (E239): 쇳빛 잎의 빽빽한 숲, 녹슨 흙과 낮은 빛 (펜리르의 숲) */
  ironwood: variant(BASE_THEMES.snow, {
    ground: { base: 0xa6aab0, shade: 0x8c9098, alt: 0x9a9890, path: 0x8a7a68, earth: 0x6a4a36, stone: 0x5e6268 },
    water: { surface: 0x5a6e7a, deep: 0x3e4e5a },
    scatter: { tuft: [0x5a5e52, 0x6a6c5a, 0x4a4e46], pebble: [0x6e7278, 0x55595f] },
    light: { sky: 0x6e7680, hemiSky: 0xa8b0c0, hemiGround: 0x2a2e34, hemi: 0.75, sun: 0xe8d8c0, sunIntensity: 2.7 },
    particles: { kind: 'snow', color: 0xb8bcc4 },
    border: ['pine', 'pine', 'pine', 'pine', 'deadTree', 'deadTree', 'rock'],
    recolor: { [C.pine]: 0x3c4a48, [C.pineDark]: 0x2a3436, [C.pineLight]: 0x4e5c58, [C.snow]: 0x8a9096, [C.snowShade]: 0x737a82, [C.snowBlue]: 0x646c76 },
  }),
  /** 세계 뱀의 바닷가 (E239): 잿빛 자갈 해변과 검푸른 물웅덩이, 바다 안개 (요르문간드가 잠든 바다) */
  shore: variant(BASE_THEMES.snow, {
    ground: { base: 0xc2c4bc, shade: 0xa6a9a2, alt: 0xb2aa98, path: 0xd2c8ae, earth: 0x7a6a54, stone: 0x6e747a },
    water: { surface: 0x3e6e86, deep: 0x24485e, frozen: false },
    scatter: { tuft: [0x7a8a6a, 0x8a9a72, 0x66765a], pebble: [0x8a8e94, 0x6a6e74] },
    light: { sky: 0x8aa0b0, hemiSky: 0xc8dcec, hemiGround: 0x3a4650, hemi: 0.85, sun: 0xf0e4d0, sunIntensity: 2.7 },
    particles: { kind: 'snow', color: 0xdce8f0 },
    border: ['rock', 'rock', 'rock', 'pine', 'deadTree', 'mound'],
    recolor: { [C.snow]: 0xb8bcb2, [C.snowShade]: 0x9ea398, [C.snowBlue]: 0x8a9488 },
  }),
  /** 무스펠 경계 (E239): 불의 땅과 맞닿은 그을린 돌밭, 용암 웅덩이와 불티 (수르트의 불) */
  muspel: variant(BASE_THEMES.snow, {
    ground: { base: 0x9c9490, shade: 0x847c78, alt: 0xa48e84, path: 0x6e5448, earth: 0x8a3a20, stone: 0x3e3836 },
    water: { surface: 0xe8702a, deep: 0xb0401a, frozen: false },
    scatter: { tuft: [0x6a5a4a, 0x7a6450, 0x5a4a3e], pebble: [0x4a4440, 0x3a3432] },
    light: { sky: 0x5a4038, hemiSky: 0xf0c8b0, hemiGround: 0x2a1610, hemi: 0.8, sun: 0xffd0a8, sunIntensity: 2.7 },
    particles: { kind: 'embers', color: 0xff7a30 },
    border: ['rock', 'rock', 'deadTree', 'deadTree', 'mound', 'ruin'],
    recolor: { [C.snow]: 0x5a4a44, [C.snowShade]: 0x4a3c38, [C.snowBlue]: 0x6a3a2a, [C.pine]: 0x3a3430, [C.pineDark]: 0x2a2624, [C.pineLight]: 0x4a423c },
  }),
  /** 우트가르드: 거인의 성터, 어두운 돌과 흐린 빛 */
  utgard: variant(BASE_THEMES.snow, {
    ground: { base: 0x9aa0a8, shade: 0x80868f, alt: 0x8d9299, path: 0x6f6a66, stone: 0x5d636c },
    water: { surface: 0x4f6f86, deep: 0x3a5468 },
    light: { sky: 0x5f6a7a, hemiSky: 0x9aa8c8, hemiGround: 0x2a3040, hemi: 0.75, sun: 0xffd8b0, sunIntensity: 2.7 },
    particles: { kind: 'snow', color: 0xc8d0dc },
  }),
  /** 델포이 골짜기: 그늘진 녹음 */
  delphi: variant(BASE_THEMES.olympus, {
    ground: { base: 0x94ad62, shade: 0x7f9852, alt: 0xa6b86e },
    light: { sky: 0x9cc4dc, hemiSky: 0xd0e8f0, sunIntensity: 2.7 },
  }),
  /** 리키아 화산: 검은 현무암과 붉은 흙, 불티 */
  volcano: variant(BASE_THEMES.olympus, {
    ground: { base: 0x9c8a7c, shade: 0x847264, alt: 0xa8927e, path: 0x9a7a5a, earth: 0x8a3a24, stone: 0x4a4440 },
    water: { surface: 0xd8682a, deep: 0xa83a1a },
    light: { sky: 0x8a6a5a, hemiSky: 0xffc8a0, hemiGround: 0x3a2018, hemi: 0.8, sun: 0xffb070, sunIntensity: 2.7 },
    particles: { kind: 'embers', color: 0xff8040 },
  }),
  /** 곤륜산 기슭: 안개 낀 높은 땅 */
  kunlun: variant(BASE_THEMES.hwagwasan, {
    ground: { base: 0xa8bc90, shade: 0x92a87c, alt: 0xb8c8a0 },
    light: { sky: 0xc0d0d8, hemiSky: 0xe8f0f0, hemi: 0.95, sunIntensity: 2.7 },
  }),
  /** 화염산: 붉게 탄 땅과 불티 */
  flame: variant(BASE_THEMES.hwagwasan, {
    ground: { base: 0xb89070, shade: 0x9e785c, alt: 0xc49c78, path: 0xd0a070, earth: 0x9a3a1a, stone: 0x7a5a48 },
    water: { surface: 0xe07a30, deep: 0xb04a1a },
    light: { sky: 0xd09070, hemiSky: 0xffd0a0, hemiGround: 0x4a2818, sun: 0xffc080, sunIntensity: 2.8 },
    particles: { kind: 'embers', color: 0xffa040 },
  }),
  /** 이즈모 숲: 짙은 숲 그늘 */
  izumo: variant(BASE_THEMES.takamagahara, {
    ground: { base: 0x7e9c5e, shade: 0x6a874e, alt: 0x8eaa68 },
    light: { sky: 0x98b4c4, hemiSky: 0xd8ecdc, hemiGround: 0x2e3a28, sunIntensity: 2.7 },
  }),
  /** 히이카와 강변: 물빛 도는 저녁 */
  river: variant(BASE_THEMES.takamagahara, {
    ground: { base: 0x9cb08c, shade: 0x86997a, alt: 0xadc09a, path: 0xd4c8a8 },
    water: { surface: 0x5a8ac0, deep: 0x3a6a9a },
    light: { sky: 0xb09ab8, hemiSky: 0xf0d8e8, hemiGround: 0x3a3048, sun: 0xffc8a8, sunIntensity: 2.7 },
  }),
  /** 태백산 숲: 깊은 솔숲 */
  taebaek: variant(BASE_THEMES.sinsi, {
    ground: { base: 0x8a9a5e, shade: 0x76864e, alt: 0x9aa868 },
    light: { sky: 0xa0b4c0, hemiSky: 0xe0e8d8, hemiGround: 0x303828, sunIntensity: 2.7 },
  }),
  /** 갈라진 하늘 (E22-05, 마지막 무대): 하늘이 갈라져 보랏빛이 새는 거인의 돌밭 */
  sky: variant(BASE_THEMES.snow, {
    ground: { base: 0x8c8aa0, shade: 0x74728a, alt: 0x9a96ac, path: 0x6a6478, earth: 0x4a3e5a, stone: 0x585468 },
    water: { surface: 0x9a7ad8, deep: 0x6a4aa8, frozen: false },
    light: { sky: 0x4a3a6a, hemiSky: 0xd8c2ff, hemiGround: 0x241a34, hemi: 0.8, sun: 0xf0d8ff, sunIntensity: 2.7 },
    particles: { kind: 'embers', color: 0xd8c2ff },
  }),
  /** 송도 옛터: 무너진 도읍, 잿빛 흙 */
  ruins: variant(BASE_THEMES.sinsi, {
    ground: { base: 0xa8a08c, shade: 0x928a78, alt: 0xb4ac98, path: 0x8a8274, earth: 0x6a5a4a },
    light: { sky: 0x9a9488, hemiSky: 0xe0d8c8, hemiGround: 0x3a3428, hemi: 0.8, sun: 0xffd8a8, sunIntensity: 2.7 },
    particles: { kind: 'embers', color: 0xd0a070 },
  }),
}

export const THEMES = { ...BASE_THEMES, ...DEEP_THEMES }

export type ThemeId = keyof typeof THEMES
export const THEME_IDS = Object.keys(THEMES) as ThemeId[]

/** 테마의 소품 색 바꾸기 */
export function recolorHex(theme: ThemeDef, hex: number): number {
  return theme.recolor[hex] ?? hex
}

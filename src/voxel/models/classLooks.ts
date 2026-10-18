import type { VoxelGrid } from '../VoxelGrid'
import { cape, gear, head, mark, torso, weapon } from './gen'

/**
 * E6 1차 클래스(북유럽·그리스·중국·일본·한국)의 외형 모델. 생성기(gen.ts)로 부품을 골라 색을 입힌다.
 * 이름과 칸은 src/looks/classLooks.ts에 있다. 토르·로키·아수라왕은 looks.ts에서 손으로 찍었다.
 * 대표 부위는 E9에서 손으로 다듬는다.
 */

const GOLD = 0xe6bd4e
const WOOD = 0x6b5434
const BLACK = 0x1c1820
const WHITE = 0xf2f4f7

type Build = (level?: number) => VoxelGrid

export const CLASS_LOOK_MODELS: Readonly<Record<string, Build>> = {
  // ── 오딘: 유물(무기·손·허리) / 발현(머리·몸·등)
  odinGungnir: () => weapon({ kind: 'spear', shaft: 0x5a4632, head: 0xd7dee5, accent: GOLD }),
  odinDraupnir: () => gear({ kind: 'rings', main: GOLD, accent: 0xfff0a0 }),
  odinFeatherSash: () => gear({ kind: 'sash', main: 0x2a2f3a, accent: 0x9fb4d8 }),
  odinHat: () => head({ hair: 0xd8d8d0, style: 'long', beard: 0xe8e8e0, gear: 'hat', gearColor: 0x3a4458, eyepatch: true }),
  odinRobe: () => torso({ kind: 'robe', main: 0x4a5878, trim: 0x9fb4d8, pattern: 'belt', accent: GOLD }),
  odinCape: () => cape({ kind: 'feathers', main: 0x2a2f3a, dark: 0x1c1f26 }),
  odinRavens: (level) => mark({ kind: 'arc', main: 0x2a2f3a, light: 0x9fb4d8, stamp: 'raven' }, level),

  // ── 프레이: 유물(허리·손·무기) / 발현(머리·몸·등)
  freyrBristleBelt: () => gear({ kind: 'belt', main: 0xe6c34e, accent: 0xfff0a0 }),
  freyrShipBracers: () => gear({ kind: 'bracers', main: 0x8a6a3a, accent: 0xe6c34e }),
  freyrSword: () => weapon({ kind: 'sword', shaft: 0x8a6a3a, head: 0xf2f4d0, accent: 0xe6c34e }),
  freyrCirclet: () => head({ hair: 0xe0b060, style: 'short', beard: 0xd0a050, gear: 'circlet', gearColor: 0xe6c34e }),
  freyrTunic: () => torso({ kind: 'tunic', main: 0x5f8a3a, pattern: 'sash', accent: 0xe6c34e }),
  freyrCape: () => cape({ kind: 'cape', main: 0x3f6a2a, trim: 0xe6c34e }),
  freyrSun: (level) => mark({ kind: 'rays', main: 0xe6c34e, light: 0xfff0a0, accent: 0x8ab04a }, level),

  // ── 제우스: 유물(무기·손·허리) / 발현(머리·몸·등)
  zeusKeraunos: () => weapon({ kind: 'bolt', head: 0xfff0a0, accent: 0x7fd4ff }),
  zeusAegis: () => gear({ kind: 'bracers', main: 0xd7dee5, accent: GOLD }),
  zeusEagleBelt: () => gear({ kind: 'belt', main: 0x8a6a3a, accent: GOLD }),
  zeusLaurel: () => head({ hair: 0xf0f0f0, style: 'long', beard: 0xf4f4f4, gear: 'laurel', gearColor: 0x8ab04a }),
  zeusRobe: () => torso({ kind: 'robe', main: WHITE, trim: GOLD, pattern: 'sash', accent: 0x4a78c8 }),
  zeusCape: () => cape({ kind: 'cape', main: 0x4a78c8, trim: GOLD }),
  zeusWings: (level) => mark({ kind: 'wings', main: WHITE, light: 0xfff0a0, accent: GOLD }, level),

  // ── 포세이돈: 유물(무기·다리·손) / 발현(머리·몸·등)
  poseidonTrident: () => weapon({ kind: 'trident', shaft: 0x8a6a3a, head: 0x3fa8c8, accent: GOLD }),
  poseidonSpurs: () => gear({ kind: 'boots', main: 0x2a7a8a, accent: GOLD }),
  poseidonCoral: () => gear({ kind: 'rings', main: 0xff7a6a, accent: 0xffd0c0 }),
  poseidonCrown: () => head({ hair: 0x2a4a5a, style: 'wild', beard: 0x2a4a5a, gear: 'crown', gearColor: GOLD }),
  poseidonArmor: () => torso({ kind: 'armor', main: 0x2a7a8a, pattern: 'scales', accent: 0x8ae0f0 }),
  poseidonCape: () => cape({ kind: 'tattered', main: 0x1f5a6a, trim: 0x8ae0f0 }),
  poseidonWaves: (level) => mark({ kind: 'waves', main: 0x3fa8c8, light: 0xbff0ff }, level),

  // ── 하데스: 유물(얼굴·허리·무기) / 발현(머리·몸·등)
  hadesHelm: () => gear({ kind: 'mask', main: 0x2a2438, accent: 0x8a5fd0 }),
  hadesChain: () => gear({ kind: 'belt', main: 0x3a3448, accent: 0xff6a3a }),
  hadesBident: () => weapon({ kind: 'bident', shaft: 0x2a2438, head: 0x8a5fd0, accent: 0xd0b0ff }),
  hadesCrown: () => head({ hair: BLACK, style: 'long', beard: BLACK, gear: 'crown', gearColor: 0x3a3448, gearAccent: 0x8a5fd0 }),
  hadesRobe: () => torso({ kind: 'robe', main: 0x2a2438, trim: 0x8a5fd0, pattern: 'emblem', accent: 0xd0b0ff }),
  hadesCape: () => cape({ kind: 'tattered', main: BLACK, trim: 0x8a5fd0 }),
  hadesFlames: (level) => mark({ kind: 'arc', main: 0x5a3a90, light: 0xd0b0ff, stamp: 'flame' }, level),

  // ── 아르테미스: 유물(무기·허리·손) / 발현(머리·몸·등)
  artemisBow: () => weapon({ kind: 'bow', shaft: 0xc9d6f0, head: WHITE, accent: GOLD }),
  artemisAntlerSash: () => gear({ kind: 'sash', main: 0x5a7a4a, accent: GOLD }),
  artemisLeash: () => gear({ kind: 'bracers', main: 0x7a5636, accent: 0xc9d6f0 }),
  artemisCirclet: () => head({ hair: 0x3a2a1a, style: 'bun', gear: 'circlet', gearColor: 0xe0e6f0 }),
  artemisTunic: () => torso({ kind: 'tunic', main: 0xe8e6d8, trim: 0xc9d6f0, pattern: 'belt', accent: 0x7a5636 }),
  artemisCape: () => cape({ kind: 'short', main: 0x5a7a4a }),
  artemisMoon: (level) => mark({ kind: 'crescent', main: 0xc9d6f0, light: 0xffffff }, level),

  // ── 손오공: 유물(무기·다리·머리) / 발현(몸·등·손)
  wukongStaff: () => weapon({ kind: 'pole', shaft: 0xc0302a, head: GOLD }),
  wukongCloud: () => gear({ kind: 'boots', main: WHITE, accent: 0xe0e6f0 }),
  wukongBand: () => head({ hair: 0xb07a3a, style: 'wild', skin: 0xd8a070, gear: 'band', gearColor: GOLD, horns: 'ears', hornColor: 0xb07a3a }),
  wukongArmor: () => torso({ kind: 'armor', main: 0xe6a03a, pattern: 'scales', accent: 0xc0302a }),
  wukongCape: () => cape({ kind: 'cape', main: 0xc0302a, trim: GOLD }),
  wukongBracers: () => gear({ kind: 'bracers', main: 0xc0302a, accent: GOLD }),
  wukongTail: (level) => mark({ kind: 'tail', main: 0xb07a3a, light: GOLD }, level),

  // ── 항아: 유물(허리·손·무기) / 발현(머리·몸·등)
  changeGourd: () => gear({ kind: 'gourd', main: 0xf0e6ff, accent: GOLD }),
  changeRabbit: () => gear({ kind: 'bracers', main: WHITE, accent: 0x9fe0c0 }),
  changeBranch: () => weapon({ kind: 'flower', shaft: 0x8a6a3a, head: 0xfff0a0, accent: 0x8ab04a }),
  changeBun: () => head({ hair: BLACK, style: 'bun', gear: 'veil', gearColor: 0xf0e6ff }),
  changeDress: () => torso({ kind: 'dress', main: 0xf0e6ff, trim: 0xc9b6f0, pattern: 'sash', accent: 0xff9ab0 }),
  changeRibbons: () => cape({ kind: 'ribbons', main: 0xffc0d0, trim: 0xf0e6ff }),
  changeHalo: (level) => mark({ kind: 'halo', main: 0xf0e6ff, light: 0xffffff }, level),

  // ── 동해 용왕: 유물(손·허리·다리) / 발현(머리·몸·등·무기)
  longwangPearl: () => gear({ kind: 'rings', main: 0x8ae0f0, accent: 0xfff0a0 }),
  longwangKey: () => gear({ kind: 'belt', main: 0x2a7a6a, accent: 0x8ae0f0 }),
  longwangGreaves: () => gear({ kind: 'boots', main: 0x2a8a7a, accent: 0x8ae0f0 }),
  longwangHead: () => head({ hair: 0x2a5a4a, style: 'long', beard: 0x8ae0c0, skin: 0x9fd0b8, gear: 'crown', gearColor: GOLD, horns: 'dragon', hornColor: GOLD }),
  longwangRobe: () => torso({ kind: 'robe', main: 0x2a8a7a, trim: GOLD, pattern: 'scales', accent: 0x8ae0f0 }),
  longwangCape: () => cape({ kind: 'cape', main: 0x1f6a5a, trim: 0x8ae0f0 }),
  longwangStaff: () => weapon({ kind: 'staff', shaft: 0x2a5a4a, head: 0x8ae0f0, accent: GOLD }),
  longwangWaves: (level) => mark({ kind: 'waves', main: 0x3fc8b0, light: 0xbff0e0, stamp: 'orb' }, level),

  // ── 나타: 유물(다리·허리·손) / 발현(머리·몸·등·무기)
  nezhaWheels: () => gear({ kind: 'wheels', main: 0xff6a3a, accent: 0xffd040 }),
  nezhaSash: () => gear({ kind: 'sash', main: 0xe0303a, accent: 0xff9a3c }),
  nezhaRing: () => gear({ kind: 'rings', main: GOLD, accent: 0xfff0a0 }),
  nezhaHead: () => head({ hair: BLACK, style: 'topknot', gear: 'band', gearColor: 0xe0303a }),
  nezhaTunic: () => torso({ kind: 'tunic', main: 0xe0303a, trim: GOLD, pattern: 'emblem', accent: 0xffd040 }),
  nezhaRibbons: () => cape({ kind: 'ribbons', main: 0xff6a4a, trim: 0xffd040 }),
  nezhaSpear: () => weapon({ kind: 'spear', shaft: 0xc0302a, head: GOLD, accent: 0xff6a3a }),
  nezhaHalo: (level) => mark({ kind: 'halo', main: 0xff6a4a, light: 0xffd040, stamp: 'flame' }, level),

  // ── 아마테라스: 유물(무기·허리·손) / 발현(머리·몸·등)
  amaterasuMirror: () => weapon({ kind: 'mirror', head: 0xfff0c0, accent: GOLD }),
  amaterasuSash: () => gear({ kind: 'sash', main: WHITE, accent: 0xe0303a }),
  amaterasuBells: () => gear({ kind: 'bracers', main: WHITE, accent: GOLD }),
  amaterasuHead: () => head({ hair: BLACK, style: 'long', gear: 'crown', gearColor: GOLD }),
  amaterasuRobe: () => torso({ kind: 'robe', main: WHITE, trim: 0xe0303a, pattern: 'sash', accent: 0xffa040 }),
  amaterasuCape: () => cape({ kind: 'cape', main: 0xe0303a, trim: 0xffa040 }),
  amaterasuRays: (level) => mark({ kind: 'rays', main: 0xffa040, light: 0xfff0c0, stamp: 'orb' }, level),

  // ── 츠쿠요미: 유물(손·얼굴·무기) / 발현(머리·몸·등)
  tsukuyomiBeads: () => gear({ kind: 'rings', main: 0x4ab07a, accent: 0x6a7ae0 }),
  tsukuyomiMask: () => gear({ kind: 'mask', main: 0xe0e6f0, accent: 0x6a7ae0 }),
  tsukuyomiScepter: () => weapon({ kind: 'scepter', shaft: 0x2a2a48, head: 0xc9d6f0, accent: 0x6a7ae0 }),
  tsukuyomiHead: () => head({ hair: 0x2a2a48, style: 'long', gear: 'hat', gearColor: 0x1c1c2a }),
  tsukuyomiRobe: () => torso({ kind: 'robe', main: 0x2a2a58, trim: 0xc9d6f0, pattern: 'dots', accent: WHITE }),
  tsukuyomiCape: () => cape({ kind: 'stars', main: 0x1c1c3a, trim: 0xc9d6f0 }),
  tsukuyomiMoon: (level) => mark({ kind: 'arc', main: 0x6a7ae0, light: 0xc9d6f0, stamp: 'orb' }, level),

  // ── 라이진: 유물(허리·얼굴·손) / 발현(머리·몸·등·무기)
  raijinDrumBelt: () => gear({ kind: 'belt', main: 0x8a3a2a, accent: 0xf0d040 }),
  raijinMask: () => gear({ kind: 'mask', main: 0x5a8a3a, accent: 0xf0d040 }),
  raijinBracers: () => gear({ kind: 'bracers', main: 0x4a4a5a, accent: 0xf0d040 }),
  raijinHead: () => head({ hair: 0xf0f0f0, style: 'wild', skin: 0x7ab05a, horns: 'curved', hornColor: 0xf2f4e8 }),
  raijinFur: () => torso({ kind: 'fur', main: 0xd8b040, pattern: 'dots', accent: 0x2a2a2a }),
  raijinCape: () => cape({ kind: 'ribbons', main: WHITE, trim: 0xf0d040 }),
  raijinMallet: () => weapon({ kind: 'mallet', shaft: WOOD, head: 0x8a3a2a, accent: 0xf0d040 }),
  raijinDrums: (level) => mark({ kind: 'arc', main: 0x8a3a2a, light: 0xf0d040, stamp: 'drum' }, level),

  // ── 스사노오: 유물(무기·허리는 아수라왕과 함께 쓰는 칼 / 손) / 발현(머리·몸·등)
  susanooScales: () => gear({ kind: 'bracers', main: 0x6a2a3a, accent: 0x4a7ad0 }),
  susanooHead: () => head({ hair: BLACK, style: 'wild', beard: BLACK, gear: 'band', gearColor: 0x4a7ad0 }),
  susanooArmor: () => torso({ kind: 'armor', main: 0x2a3a6a, trim: 0x4a7ad0, pattern: 'cross', accent: 0xd7dee5 }),
  susanooCape: () => cape({ kind: 'tattered', main: 0x2a3a6a, trim: 0x8ab0f0 }),
  susanooBlades: (level) => mark({ kind: 'arc', main: 0x2a3a6a, light: 0x8ab0f0, stamp: 'blade' }, level),

  // ── 해모수: 유물(손·머리·무기) / 발현(몸·등·다리)
  haemosuReins: () => gear({ kind: 'bracers', main: 0xc0302a, accent: GOLD }),
  haemosuCrown: () => head({ hair: BLACK, style: 'topknot', beard: BLACK, gear: 'crown', gearColor: GOLD, horns: 'feathers', hornColor: 0x1c1c1c }),
  haemosuSword: () => weapon({ kind: 'sword', shaft: 0xc0302a, head: 0xfff0c0, accent: GOLD }),
  haemosuRobe: () => torso({ kind: 'robe', main: 0xe0302a, trim: GOLD, pattern: 'emblem', accent: 0xffcf40 }),
  haemosuCape: () => cape({ kind: 'cape', main: GOLD, trim: 0xffcf40 }),
  haemosuBoots: () => gear({ kind: 'boots', main: 0x2a2a2a, accent: GOLD }),
  haemosuCrow: (level) => mark({ kind: 'wings', main: 0x1c1c1c, light: 0xffcf40, accent: 0xe0302a }, level),

  // ── 바리공주: 유물(허리·다리·무기) / 발현(머리·몸·등)
  bariGourd: () => gear({ kind: 'gourd', main: 0x9fe0c0, accent: WHITE }),
  bariIronShoes: () => gear({ kind: 'boots', main: 0x5b636c, accent: 0x8e98a3 }),
  bariFlower: () => weapon({ kind: 'flower', shaft: 0x4a8a3a, head: 0xff8ab0, accent: 0xfff0a0 }),
  bariHead: () => head({ hair: BLACK, style: 'long', gear: 'veil', gearColor: WHITE, gearAccent: 0xe0303a }),
  bariDress: () => torso({ kind: 'dress', main: WHITE, trim: 0xe0303a, pattern: 'sash', accent: 0x4a78c8 }),
  bariCape: () => cape({ kind: 'ribbons', main: 0xe0303a, trim: 0xf0d040 }),
  bariPetals: (level) => mark({ kind: 'arc', main: 0xff8ab0, light: 0xfff0f4, stamp: 'petal' }, level),

  // ── 도깨비: 유물(무기·머리·손) / 발현(몸·등·다리)
  dokkaebiClub: () => weapon({ kind: 'club', shaft: WOOD, head: 0x8a6a3a, accent: GOLD }),
  dokkaebiHat: () => head({ hair: BLACK, style: 'wild', skin: 0xd05a4a, gear: 'hat', gearColor: 0x2a2a2a, horns: 'single', hornColor: 0xf2f4e8 }),
  dokkaebiFlames: () => gear({ kind: 'rings', main: 0x5fa8ff, accent: 0xbfe0ff }),
  dokkaebiTunic: () => torso({ kind: 'tunic', main: 0x3a5a8a, pattern: 'belt', accent: GOLD }),
  dokkaebiCape: () => cape({ kind: 'short', main: 0x2a3a5a }),
  dokkaebiLegs: () => gear({ kind: 'boots', main: 0xd05a4a, accent: 0x2a2a2a }),
  dokkaebiFire: (level) => mark({ kind: 'arc', main: 0x2a5ab0, light: 0x9fd0ff, stamp: 'flame' }, level),

  // ── 마고할미: 유물(허리·무기·손) / 발현(머리·몸·등)
  magoSkirt: () => gear({ kind: 'sash', main: 0x8a6a4a, accent: 0xc8a070 }),
  magoMallet: () => weapon({ kind: 'mallet', shaft: WOOD, head: 0x8a8278, accent: 0xc8c0b0 }),
  magoBasket: () => gear({ kind: 'bracers', main: 0x8a6a3a, accent: 0xc8a070 }),
  magoHead: () => head({ hair: 0xe8e8e0, style: 'bun', gear: 'band', gearColor: 0x8a6a4a }),
  magoDress: () => torso({ kind: 'dress', main: 0xa08060, trim: 0xe8e0c8, pattern: 'belt', accent: 0x6a5a3a }),
  magoCape: () => cape({ kind: 'short', main: 0x6a5a3a }),
  magoStones: (level) => mark({ kind: 'arc', main: 0x8a7a6a, light: 0xc8c0b0, stamp: 'stone' }, level),
}

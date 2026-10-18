import { createRng } from '../../world/rng'
import { VoxelGrid } from '../VoxelGrid'

/**
 * 지역마다 그 땅에만 있는 소품 (E7-05). 바닥 가운데가 원점, 칸 크기는 regionMap.ts의 BUILDERS가 정한다.
 * 그리스(올리브·사이프러스·기둥), 중국(복숭아·기암·대나무), 일본(벚나무·도리이·석등), 한국(단풍·돌탑·장승), 마을(집·모닥불·우물·울타리·표지)
 */

const pick = <T,>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!

const L = {
  olive: 0x6f8a4a,
  oliveDark: 0x566e38,
  oliveSilver: 0x9aac7a,
  bark: 0x6a5a48,
  barkDark: 0x4e4234,
  cypress: 0x2f4e30,
  cypressDark: 0x223a24,
  marble: 0xefeae0,
  marbleShade: 0xd2cbbd,
  marbleDark: 0xb0a898,
  peachLeaf: 0x4a8a3a,
  peachBloom: 0xffa8c0,
  peach: 0xff8a6a,
  karst: 0x8a8a7a,
  karstDark: 0x6a6a5c,
  moss: 0x5a8a3a,
  bamboo: 0x7ab04a,
  bambooDark: 0x5a8a34,
  bambooLeaf: 0x5c9a3a,
  cherry: 0xffc0d4,
  cherryDeep: 0xf09ab8,
  cherryBark: 0x5a3a34,
  vermilion: 0xd8432a,
  vermilionDark: 0xa83020,
  black: 0x2a2424,
  lanternStone: 0xa8a8a0,
  lanternDark: 0x86867e,
  glow: 0xfff0a0,
  maple: 0xd8562a,
  mapleDeep: 0xb8401f,
  mapleGold: 0xe8a030,
  cairn: 0x9a968a,
  cairnDark: 0x7a766a,
  wood: 0x8a6a48,
  woodDark: 0x6a4e34,
  thatch: 0xc8a860,
  thatchDark: 0xa8883e,
  plaster: 0xe8dcc0,
  roof: 0x7a4a34,
  roofDark: 0x5a3424,
  ember: 0xd2552a,
  log: 0x6a4a30,
  water: 0x5aa8c8,
  cloth: 0xe8e0c8,
}

/** 올리브 나무 (칸 0.15m): 비틀린 줄기, 은빛 섞인 둥근 잎 */
export function oliveTree(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(15, 16, 15)
  // 비틀린 줄기: 두 갈래
  g.line(7, 0, 7, 6, 5, 8, L.bark, 1)
  g.line(6, 5, 8, 4, 8, 6, L.barkDark, 0)
  g.line(6, 5, 8, 9, 8, 9, L.bark, 0)
  const leaf = () => pick(rng, [L.olive, L.olive, L.oliveDark, L.oliveSilver])
  g.ellipsoid(4.5, 10, 6, 3.5, 2.6, 3.5, leaf)
  g.ellipsoid(9.5, 10.5, 9, 3.8, 2.8, 3.6, leaf)
  g.ellipsoid(7, 12.5, 7.5, 3.2, 2.2, 3.2, leaf)
  return g
}

/** 사이프러스 (칸 0.15m): 촛불처럼 가늘고 높은 나무 */
export function cypress(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(9, 30, 9)
  g.column(4.5, 4.5, 0, 3, 1, 1, L.barkDark)
  g.column(4.5, 4.5, 3, 27, 3.6, 0.6, () => pick(rng, [L.cypress, L.cypress, L.cypressDark]))
  return g
}

/** 대리석 기둥 (칸 0.15m): 홈 파인 기둥, 무너진 것도 섞인다 */
export function column(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(9, 26, 9)
  const height = rng() < 0.4 ? 10 + Math.floor(rng() * 6) : 22
  g.box(0, 0, 0, 8, 1, 8, L.marbleShade)
  g.column(4.5, 4.5, 2, height, 3, 3, (x, _y, z) => ((x + z) % 2 ? L.marble : L.marbleShade))
  if (height === 22) g.box(0, 23, 0, 8, 24, 8, L.marble)
  else g.box(5, 0, 6, 8, 2, 8, L.marbleDark)
  return g
}

/** 복숭아나무 (칸 0.12m): 분홍 꽃과 열매 */
export function peachTree(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(17, 18, 17)
  g.column(8.5, 8.5, 0, 7, 1.2, 0.9, L.cherryBark)
  g.line(8, 6, 8, 4, 10, 6, L.cherryBark, 0)
  g.line(8, 6, 8, 12, 10, 11, L.cherryBark, 0)
  const leaf = () => pick(rng, [L.peachLeaf, L.peachLeaf, L.peachBloom, L.peachBloom, L.peach])
  g.ellipsoid(8.5, 12, 8.5, 6.5, 4.2, 6.5, leaf)
  return g
}

/** 기암 (칸 0.2m): 화과산의 우뚝 선 돌기둥, 꼭대기에 이끼 */
export function spire(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(12, 30, 12)
  const h = 18 + Math.floor(rng() * 10)
  g.column(6, 6, 0, h, 5.5, 2.2, () => (rng() < 0.3 ? L.karstDark : L.karst))
  g.paintTops(() => (rng() < 0.8 ? L.moss : null))
  return g
}

/** 대숲 (칸 0.1m): 마디 있는 줄기 몇 대 */
export function bamboo(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(12, 40, 12)
  for (let i = 0; i < 5; i++) {
    const x = 1 + Math.floor(rng() * 10)
    const z = 1 + Math.floor(rng() * 10)
    const h = 24 + Math.floor(rng() * 14)
    for (let y = 0; y < h; y++) g.set(x, y, z, y % 6 === 5 ? L.bambooDark : L.bamboo)
    g.ellipsoid(x + 0.5, h, z + 0.5, 2.5, 1.5, 2.5, () => (rng() < 0.6 ? L.bambooLeaf : null))
  }
  return g
}

/** 벚나무 (칸 0.15m): 넓게 퍼진 연분홍 꽃구름 */
export function cherryTree(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(19, 17, 19)
  g.column(9.5, 9.5, 0, 6, 1.3, 1, L.cherryBark)
  g.line(9, 6, 9, 4, 9, 7, L.cherryBark, 0)
  g.line(9, 6, 9, 15, 9, 12, L.cherryBark, 0)
  const bloom = () => pick(rng, [L.cherry, L.cherry, L.cherry, L.cherryDeep])
  g.ellipsoid(5, 11, 8, 4.5, 3, 4.5, bloom)
  g.ellipsoid(14, 11, 11, 4.5, 3, 4.5, bloom)
  g.ellipsoid(9.5, 13, 9.5, 5.5, 3.2, 5.5, bloom)
  return g
}

/** 도리이 (칸 0.15m): 붉은 두 기둥과 검은 가로대 */
export function torii(): VoxelGrid {
  const g = new VoxelGrid(26, 26, 4)
  for (const x of [5, 19]) g.box(x, 0, 1, x + 1, 20, 2, L.vermilion)
  g.box(3, 16, 1, 22, 17, 2, L.vermilion)
  g.box(0, 21, 0, 25, 22, 3, L.vermilion)
  g.box(0, 23, 0, 25, 24, 3, L.black)
  g.box(0, 25, 0, 2, 25, 3, L.black)
  g.box(23, 25, 0, 25, 25, 3, L.black)
  g.box(12, 18, 1, 13, 20, 2, L.vermilionDark)
  return g
}

/** 석등 (칸 0.1m): 불빛 칸은 따로 빛나게 그린다 (lanternGlow) */
export function stoneLantern(): VoxelGrid {
  const g = new VoxelGrid(9, 16, 9)
  g.box(1, 0, 1, 7, 1, 7, L.lanternDark)
  g.box(3, 2, 3, 5, 7, 5, L.lanternStone)
  g.box(1, 8, 1, 7, 8, 7, L.lanternDark)
  g.box(2, 9, 2, 6, 11, 6, L.lanternStone)
  g.box(3, 9, 2, 5, 11, 2, null)
  g.box(0, 12, 0, 8, 12, 8, L.lanternDark)
  g.box(2, 13, 2, 6, 13, 6, L.lanternStone)
  g.set(4, 14, 4, L.lanternStone)
  return g
}

/** 석등의 불빛 (석등과 같은 격자) */
export function lanternGlow(): VoxelGrid {
  const g = new VoxelGrid(9, 16, 9)
  g.box(3, 9, 3, 5, 11, 5, L.glow)
  return g
}

/** 단풍나무 (칸 0.15m): 붉고 노란 잎 */
export function mapleTree(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(15, 17, 15)
  g.column(7.5, 7.5, 0, 7, 1, 0.8, L.barkDark)
  const leaf = () => pick(rng, [L.maple, L.maple, L.mapleDeep, L.mapleGold])
  g.ellipsoid(7.5, 11, 7.5, 5.5, 4.5, 5.5, leaf)
  g.ellipsoid(5, 8, 9, 3, 2, 3, leaf)
  return g
}

/** 돌탑 (칸 0.12m): 납작한 돌을 쌓아 올린 소원 탑 */
export function cairn(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(11, 20, 11)
  let y = 0
  let r = 5
  while (r > 1 && y < 19) {
    const h = 1 + Math.floor(rng() * 2)
    const ox = rng() - 0.5
    g.column(5.5 + ox, 5.5 - ox, y, y + h - 1, r, r, () => (rng() < 0.3 ? L.cairnDark : L.cairn))
    y += h
    r -= 0.6 + rng() * 0.4
  }
  return g
}

/** 장승 (칸 0.1m): 마을 어귀를 지키는 나무 기둥, 붉은 얼굴과 검은 관 */
export function jangseung(seed: number): VoxelGrid {
  const g = new VoxelGrid(7, 26, 7)
  const female = seed % 2 === 1
  g.box(1, 0, 1, 5, 17, 5, L.wood)
  g.box(1, 18, 1, 5, 23, 5, female ? L.wood : L.vermilion)
  // 눈과 입
  g.set(2, 21, 6, L.black)
  g.set(4, 21, 6, L.black)
  g.box(2, 19, 6, 4, 19, 6, L.cloth)
  g.box(1, 18, 6, 5, 23, 6, null)
  g.box(1, 18, 5, 5, 23, 5, female ? L.wood : L.vermilion)
  g.set(2, 21, 5, L.black)
  g.set(4, 21, 5, L.black)
  g.box(2, 19, 5, 4, 19, 5, L.cloth)
  // 관
  g.box(0, 24, 0, 6, 25, 6, L.black)
  // 몸통 글자 자리 (글은 쓰지 않는다)
  g.box(2, 4, 5, 4, 14, 5, L.woodDark)
  return g
}

/** 마을 집 (칸 0.2m): 초가 지붕, 흰 벽, 나무 문 */
export function house(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(22, 16, 16)
  // 벽
  g.box(1, 0, 2, 20, 7, 13, L.plaster)
  g.box(1, 0, 2, 20, 0, 13, L.woodDark)
  for (const x of [1, 20]) g.box(x, 0, 2, x, 7, 13, L.wood)
  for (const z of [2, 13]) g.box(1, 7, z, 20, 7, z, L.wood)
  // 문과 창
  g.box(9, 1, 13, 12, 5, 13, L.woodDark)
  g.box(4, 3, 13, 6, 5, 13, L.black)
  g.box(15, 3, 13, 17, 5, 13, L.black)
  // 초가 지붕: 앞뒤로 기운 짚단
  for (let i = 0; i <= 8; i++) {
    const y = 8 + i
    g.box(0, y, i, 21, y, 15 - i, rng() < 0.5 ? L.thatch : L.thatchDark)
    g.box(1, y, i + 1, 20, y, 14 - i, null)
  }
  g.box(0, 15, 7, 21, 15, 8, L.roofDark)
  return g
}

/** 모닥불 (칸 0.1m): 둥글게 놓은 돌과 장작. 불꽃은 화로의 불꽃을 쓴다 */
export function campfire(): VoxelGrid {
  const g = new VoxelGrid(13, 4, 13)
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    const x = Math.round(6 + Math.sin(a) * 5)
    const z = Math.round(6 + Math.cos(a) * 5)
    g.box(x, 0, z, x, 1, z, i % 2 ? L.cairn : L.cairnDark)
  }
  g.line(3, 0, 6, 9, 1, 6, L.log, 0)
  g.line(6, 0, 3, 6, 1, 9, L.log, 0)
  g.box(5, 0, 5, 7, 0, 7, L.ember)
  return g
}

/** 우물 (칸 0.15m): 돌 둘레, 나무 지붕 */
export function well(): VoxelGrid {
  const g = new VoxelGrid(12, 16, 12)
  g.column(6, 6, 0, 3, 5.5, 5.5, (x, _y, z) => ((x + z) % 3 ? L.cairn : L.cairnDark))
  g.column(6, 6, 1, 3, 4, 4, null as unknown as number)
  g.column(6, 6, 2, 2, 4, 4, L.water)
  for (const x of [1, 10]) g.box(x, 4, 5, x, 11, 6, L.wood)
  g.box(1, 9, 5, 10, 9, 6, L.woodDark)
  for (let i = 0; i < 4; i++) g.box(0 + i, 12 + i, 2, 11 - i, 12 + i, 9, i % 2 ? L.roof : L.roofDark)
  return g
}

/** 울타리 한 칸 (칸 0.12m) */
export function fence(): VoxelGrid {
  const g = new VoxelGrid(20, 8, 2)
  for (const x of [0, 9, 19]) g.box(x, 0, 0, x, 7, 1, L.woodDark)
  g.box(0, 5, 0, 19, 5, 0, L.wood)
  g.box(0, 2, 0, 19, 2, 0, L.wood)
  return g
}

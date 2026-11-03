import type { TraceModel } from '../../data/wake'
import { createRng } from '../../world/rng'
import { VoxelGrid } from '../VoxelGrid'

/**
 * 신의 흔적 (E238, `src/data/wake.ts`): 잠든 신이 남긴 자리. 바닥 가운데가 원점, 칸 0.16m (둘레 소품보다 한 뼘 크게).
 * 벼락 맞은 참나무(토르)·룬 돌과 까마귀(오딘)·묶인 바위(로키)·황금 멧돼지 무덤(프레이),
 * 그리스(E241): 도도나의 참나무(제우스)·바위에 박힌 삼지창(포세이돈)·초승달 제단(아르테미스)·저승의 틈(하데스).
 * 신의 색은 빛 한 군데에만 두고 나머지는 그 땅의 흙·돌·나무 색이라, 주변 소품보다 크고 빛나는 곳으로 알아본다.
 * 그 빛 색은 TRACE_GLOW에 적는다 (tests/wake.test.ts가 한 군데인지 본다).
 */

/** 흔적 한 칸의 크기 (m) */
export const TRACE_VOXEL = 0.16

const pick = <T,>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!

const C = {
  char: 0x4a3c34,
  charLight: 0x6a584a,
  ember: 0x7a5a44,
  bolt: 0xbfe6ff,
  boltDeep: 0x6fb4ff,
  stone: 0x8a8c90,
  stoneDark: 0x66686e,
  stoneLight: 0xa6a8ac,
  rune: 0x9fd8ff,
  raven: 0x1e1c26,
  ravenSheen: 0x34324a,
  beak: 0x3a3a3a,
  rock: 0x7a7468,
  rockDark: 0x5c574e,
  chain: 0x4a4e56,
  chainLight: 0x6c727c,
  bowl: 0x8a6a48,
  venom: 0x7cd860,
  earth: 0x6a5440,
  earthDark: 0x544232,
  grass: 0x7a9a5a,
  gold: 0xf0c050,
  goldDeep: 0xc89230,
  bone: 0xe8dcc0,
  snow: 0xf2f4f8,
  // 그리스 (E241)
  bark: 0x6a5038,
  barkDark: 0x4e3a2a,
  leaf: 0x5e8a48,
  leafDark: 0x4a723a,
  leafLight: 0x78a05a,
  zeus: 0xffe27a,
  zeusDeep: 0xf0c050,
  bronze: 0xa87a3e,
  bronzeLight: 0xc89a52,
  seaRock: 0x6e7a80,
  seaRockDark: 0x525c62,
  barnacle: 0x9a9a8c,
  weed: 0x3e5a3a,
  sea: 0x4cb0d0,
  seaLight: 0x9edcee,
  marble: 0xdcd6c8,
  marbleShade: 0xbab2a2,
  moon: 0xe8eefa,
  moonShade: 0xc4d0e8,
  antler: 0xb49a76,
  ash: 0x4c4652,
  ashDark: 0x34303a,
  basalt: 0x5c5662,
  under: 0xa77ae6,
  underDeep: 0x7a50c0,
  pomegranate: 0xb8333e,
  pomegranateDark: 0x6e4a2a,
}

/** 벼락 맞은 참나무: 반쯤 타 쪼개진 굵은 줄기, 갈라진 틈에 아직 번개가 운다 */
function charredOak(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(17, 26, 17)
  const bark = () => pick(rng, [C.char, C.char, C.charLight, C.ember])
  // 뿌리와 굵은 줄기
  g.column(8.5, 8.5, 0, 2, 5, 3.5, bark)
  g.column(8.5, 8.5, 2, 16, 3.4, 2.6, bark)
  // 벼락이 쪼갠 틈 (가운데를 비우고 빛을 넣는다)
  g.box(8, 3, 6, 9, 17, 11, null)
  g.box(8, 4, 8, 8, 15, 9, C.boltDeep)
  for (let y = 4; y <= 15; y += 3) g.set(9, y, 8 + (y % 2), C.bolt)
  // 꺾인 두 갈래 가지 (잎은 다 타고 없다)
  g.line(7, 15, 8, 2, 22, 6, C.charLight, 1)
  g.line(10, 15, 9, 15, 24, 11, C.char, 1)
  g.line(4, 20, 7, 3, 25, 9, C.char, 0)
  g.line(13, 21, 10, 15, 25, 8, C.charLight, 0)
  // 줄기 끝의 번개 자국
  g.line(8, 17, 8, 10, 21, 9, C.bolt, 0)
  // 둘레의 눈과 그을린 흙
  g.ellipsoid(8.5, 0, 8.5, 7.5, 0.6, 7.5, () => (rng() < 0.6 ? C.snow : C.charLight))
  return g
}

/** 룬 돌과 까마귀: 키 큰 선돌에 새긴 룬이 빛나고, 꼭대기에 까마귀 한 마리 */
function runeRaven(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(15, 30, 13)
  const stone = () => pick(rng, [C.stone, C.stone, C.stoneDark, C.stoneLight])
  // 받침 돌
  g.ellipsoid(7.5, 1, 6.5, 6, 1.5, 5, stone)
  // 선돌 (위로 갈수록 좁다)
  g.column(7.5, 6.5, 2, 22, 3.4, 2.4, stone)
  // 앞면의 룬: 세로 줄 하나에 가지 셋
  g.line(7, 6, 9, 7, 19, 9, C.rune, 0)
  g.line(7, 16, 9, 9, 19, 9, C.rune, 0)
  g.line(7, 12, 9, 5, 15, 9, C.rune, 0)
  g.line(7, 8, 9, 9, 10, 9, C.rune, 0)
  // 까마귀: 몸·머리·부리·꼬리
  g.ellipsoid(7.5, 24.5, 6.5, 2, 1.6, 1.4, () => (rng() < 0.25 ? C.ravenSheen : C.raven))
  g.ellipsoid(9.5, 26.5, 6.5, 1.2, 1.2, 1.1, C.raven)
  g.set(11, 26, 6, C.beak)
  g.set(11, 26, 7, C.beak)
  g.line(5, 24, 6, 3, 23, 7, C.raven, 0)
  g.set(10, 27, 7, C.rune)
  // 둘레의 작은 돌 셋
  for (const [x, z] of [[1, 2], [13, 3], [2, 11]] as const) g.ellipsoid(x, 0.5, z, 1.2, 1, 1.2, stone)
  return g
}

/** 묶인 바위: 사슬이 감긴 넓적한 바위, 그 위 그릇에 독이 아직 고여 있다 */
function boundRock(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(19, 16, 15)
  const rock = () => pick(rng, [C.rock, C.rock, C.rockDark])
  g.ellipsoid(9.5, 4, 7.5, 8.5, 4.5, 6.5, rock)
  g.box(0, 0, 0, 18, 0, 14, null)
  // 바위를 두 번 감은 사슬 (고리마다 밝고 어둡게)
  for (const x of [5, 13]) {
    for (let z = 0; z <= 14; z++) {
      const top = Math.round(4 + Math.sqrt(Math.max(0, 1 - ((z - 7.5) / 7) ** 2)) * 4.6)
      g.set(x, top, z, z % 2 ? C.chain : C.chainLight)
    }
  }
  // 끊어진 사슬 끝이 땅에 늘어진다
  g.line(13, 1, 14, 16, 0, 14, C.chain, 0)
  // 그릇과 독
  g.column(9.5, 7.5, 9, 10, 2.6, 3, C.bowl)
  g.column(9.5, 7.5, 11, 11, 2.6, 2.6, C.bowl)
  g.column(9.5, 7.5, 11, 11, 1.8, 1.8, C.venom)
  g.set(9, 12, 7, C.venom)
  return g
}

/** 황금 멧돼지 무덤: 풀 덮인 흙 둔덕, 앞에 황금 털 멧돼지 머리 돌과 엄니 */
function boarMound(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(19, 16, 17)
  g.ellipsoid(9.5, 2, 8.5, 8.5, 5, 7.5, () => (rng() < 0.45 ? C.grass : pick(rng, [C.earth, C.earthDark])))
  g.box(0, 0, 0, 18, 1, 16, null)
  g.ellipsoid(9.5, 1, 8.5, 8.5, 1.4, 7.5, () => pick(rng, [C.earth, C.earthDark]))
  // 멧돼지 머리 돌 (앞쪽)
  g.ellipsoid(9.5, 7, 14.5, 3, 2.6, 2.2, () => (rng() < 0.3 ? C.goldDeep : C.gold))
  g.box(8, 5, 16, 11, 7, 16, C.goldDeep)
  // 엄니 둘과 눈
  g.line(7, 5, 16, 6, 8, 16, C.bone, 0)
  g.line(12, 5, 16, 13, 8, 16, C.bone, 0)
  g.set(8, 9, 16, C.char)
  g.set(11, 9, 16, C.char)
  // 등줄기의 황금 털
  for (let z = 4; z <= 12; z += 2) g.line(9, 7, z, 9 + (z % 4 ? 1 : 0), 10, z, C.gold, 0)
  return g
}

/** 도도나의 참나무 (제우스, E241): 신탁을 속삭이던 푸른 참나무. 줄기에 금빛 번개 한 줄기가 박혀 있고 뿌리 곁에 청동 그릇 */
function dodonaOak(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(23, 30, 23)
  const bark = () => pick(rng, [C.bark, C.bark, C.barkDark])
  const leaf = () => pick(rng, [C.leaf, C.leaf, C.leafDark, C.leafLight])
  // 땅을 움켜쥔 뿌리와 굵은 줄기
  g.column(11.5, 11.5, 0, 1, 4.4, 3.2, bark)
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) g.line(11 + dx * 3, 1, 11 + dz * 3, 11 + dx * 7, 0, 11 + dz * 7, C.barkDark, 0)
  g.column(11.5, 11.5, 1, 16, 3, 2.2, bark)
  // 갈라지는 가지 셋
  g.line(10, 13, 11, 5, 19, 9, C.bark, 1)
  g.line(13, 14, 12, 18, 20, 14, C.bark, 1)
  g.line(11, 15, 10, 12, 21, 5, C.barkDark, 1)
  // 넓은 잎 덩이 (아래는 비워 줄기와 번개가 보인다)
  g.ellipsoid(11.5, 22, 11.5, 9.5, 4.6, 9.5, leaf)
  g.ellipsoid(5.5, 19.5, 9, 4.6, 3.2, 4.6, leaf)
  g.ellipsoid(17.5, 20.5, 14, 4.6, 3.2, 4.6, leaf)
  g.ellipsoid(11.5, 26.5, 11.5, 6, 2.6, 6, leaf)
  // 금빛 번개 한 줄기: 앞(+z) 줄기에 지그재그로 박혔다 (신의 빛깔은 여기 한 군데)
  g.line(12, 15, 14, 10, 12, 14, C.zeus, 0)
  g.line(10, 12, 14, 13, 9, 14, C.zeus, 0)
  g.line(13, 9, 14, 11, 5, 14, C.zeusDeep, 0)
  // 뿌리 곁 청동 그릇 (바람이 불면 울린다)
  g.column(18.5, 18.5, 0, 1, 1.5, 2, C.bronze)
  g.set(18, 1, 18, null)
  return g
}

/** 바위에 박힌 삼지창 (포세이돈, E241): 바닷가 바위에 비스듬히 꽂힌 청동 삼지창, 바위틈에서 바닷물이 솟는다 */
function tridentRock(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(19, 30, 17)
  const rock = () => pick(rng, [C.seaRock, C.seaRock, C.seaRockDark, C.barnacle])
  g.ellipsoid(9.5, 2.5, 8.5, 8, 5.5, 7, rock)
  // 바위에 붙은 해초
  for (const [x, z] of [[3, 4], [15, 11], [5, 13]] as const) g.line(x, 1, z, x, 3, z, C.weed, 0)
  // 삼지창: 비스듬히 박힌 자루, 위에 가로대와 갈래 셋 (끝은 미늘)
  g.line(10, 6, 8, 11, 21, 8, C.bronze, 0)
  g.line(8, 21, 8, 14, 21, 8, C.bronze, 0)
  for (const x of [8, 11, 14]) {
    g.line(x, 22, 8, x, x === 11 ? 27 : 26, 8, C.bronzeLight, 0)
    g.set(x, x === 11 ? 28 : 27, 8, C.bronze)
  }
  g.set(7, 25, 8, C.bronzeLight)
  g.set(15, 25, 8, C.bronzeLight)
  // 바위틈에서 솟는 바닷물 (신의 빛깔): 물기둥과 튀는 물방울, 발치에 고인 물
  g.column(5.5, 10.5, 5, 11, 1.3, 0.4, () => (rng() < 0.4 ? C.sea : C.seaLight))
  for (const [x, y, z] of [[4, 13, 10], [7, 12, 11], [6, 14, 9]] as const) g.set(x, y, z, C.seaLight)
  g.ellipsoid(4, 0, 13.5, 3, 0.6, 2.4, C.sea)
  return g
}

/** 초승달 제단 (아르테미스, E241): 흰 돌 제단 위에 세운 은빛 초승달, 앞에 기대 둔 사슴뿔 한 쌍 */
function moonAltar(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(19, 28, 15)
  const marble = () => pick(rng, [C.marble, C.marble, C.marbleShade])
  // 두 단 계단과 제단, 덮개 돌
  g.box(1, 0, 1, 17, 0, 13, C.marbleShade)
  g.box(3, 1, 3, 15, 2, 11, C.marble)
  g.box(5, 3, 5, 13, 8, 9, C.marble)
  g.box(4, 9, 4, 14, 9, 10, C.marbleShade)
  g.forEach((x, y, z, hex) => {
    if (hex === C.marble && rng() < 0.2) g.set(x, y, z, marble())
  })
  // 은빛 초승달 (신의 빛깔): 덮개 돌 위에 세웠다
  const cx = 9.5
  const cy = 17
  for (let y = 10; y < 26; y++) {
    for (let x = 2; x < 18; x++) {
      const outer = (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= 6.6 ** 2
      const inner = (x + 0.5 - cx - 2.8) ** 2 + (y + 0.5 - cy - 0.6) ** 2 <= 5.4 ** 2
      if (outer && !inner) for (const z of [7, 8]) g.set(x, y, z, z === 8 ? C.moon : C.moonShade)
    }
  }
  // 사슴뿔 한 쌍: 제단 앞 양쪽에 기대 세웠다 (줄기에 가지 둘)
  for (const side of [-1, 1] as const) {
    const x0 = side === -1 ? 4 : 14
    const x1 = x0 + side * 3
    g.line(x0, 1, 12, x1, 9, 12, C.antler, 0)
    g.line(x0 + side, 4, 12, x0 + side * 3, 6, 13, C.antler, 0)
    g.line(x1, 9, 12, x1 + side, 12, 12, C.antler, 0)
    g.line(x0 + side * 2, 7, 12, x0, 10, 12, C.antler, 0)
  }
  return g
}

/** 저승의 틈 (하데스, E241): 잿빛 바위 둔덕이 앞뒤로 갈라져 틈 바닥이 보랏빛으로 빛나고, 틈 앞에 석류 한 알 */
function underworldCleft(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(21, 16, 19)
  const rock = () => pick(rng, [C.ash, C.ash, C.ashDark, C.basalt])
  g.ellipsoid(10.5, 1.5, 8.5, 9.5, 5.5, 7.5, rock)
  // 가운데를 앞뒤로 가른 틈: 위는 비우고 바닥은 보랏빛 (신의 빛깔), 벽에도 빛이 비친다
  for (let z = 0; z < 17; z++) {
    const x = Math.round(10 + Math.sin(z * 0.45) * 1.6)
    g.box(x - 1, 1, z, x + 1, 9, z, null)
    g.box(x - 1, 0, z, x + 1, 0, z, C.underDeep)
    g.set(x, 1, z, z % 2 ? C.under : C.underDeep)
    if (z % 3 === 0) g.set(x + (z % 2 ? 2 : -2), 2, z, C.underDeep)
  }
  // 틈에서 피어오르는 빛 몇 점
  for (const [x, y, z] of [[10, 4, 8], [11, 6, 6], [9, 8, 10], [10, 3, 13]] as const) g.set(x, y, z, C.under)
  // 날카롭게 솟은 바위 끝
  g.line(5, 5, 6, 4, 9, 5, C.basalt, 0)
  g.line(16, 4, 10, 17, 8, 11, C.ashDark, 0)
  // 틈 앞 땅에 놓인 석류 한 알과 꼭지
  g.ellipsoid(15.5, 1.4, 16.5, 1.5, 1.4, 1.5, C.pomegranate)
  g.set(15, 3, 16, C.pomegranateDark)
  g.set(16, 3, 16, C.pomegranateDark)
  return g
}

const BUILDERS: Readonly<Record<TraceModel, (seed: number) => VoxelGrid>> = { charredOak, runeRaven, boundRock, boarMound, dodonaOak, tridentRock, moonAltar, underworldCleft }

/** 흔적마다 신의 빛깔이 깃든 색: 그 흔적에서 빛나는 한 군데 */
export const TRACE_GLOW: Readonly<Record<TraceModel, readonly number[]>> = {
  charredOak: [C.bolt, C.boltDeep],
  runeRaven: [C.rune],
  boundRock: [C.venom],
  boarMound: [C.gold, C.goldDeep],
  dodonaOak: [C.zeus, C.zeusDeep],
  tridentRock: [C.sea, C.seaLight],
  moonAltar: [C.moon, C.moonShade],
  underworldCleft: [C.under, C.underDeep],
}

/** 흔적 모양의 복셀 격자 */
export function traceGrid(model: TraceModel, seed = 7): VoxelGrid {
  return BUILDERS[model](seed)
}

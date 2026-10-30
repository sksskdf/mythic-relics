import type { TraceModel } from '../../data/wake'
import { createRng } from '../../world/rng'
import { VoxelGrid } from '../VoxelGrid'

/**
 * 신의 흔적 (E238, `src/data/wake.ts`): 잠든 신이 남긴 자리. 바닥 가운데가 원점, 칸 0.16m (둘레 소품보다 한 뼘 크게).
 * 벼락 맞은 참나무(토르)·룬 돌과 까마귀(오딘)·묶인 바위(로키)·황금 멧돼지 무덤(프레이).
 * 신의 색은 빛 한 군데에만 두고 나머지는 그 땅의 흙·돌·나무 색이라, 주변 소품보다 크고 빛나는 곳으로 알아본다.
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

const BUILDERS: Readonly<Record<TraceModel, (seed: number) => VoxelGrid>> = { charredOak, runeRaven, boundRock, boarMound }

/** 흔적 모양의 복셀 격자 */
export function traceGrid(model: TraceModel, seed = 7): VoxelGrid {
  return BUILDERS[model](seed)
}

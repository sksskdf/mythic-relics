import { VoxelGrid } from '../VoxelGrid'

/**
 * 탈것: 고개지기의 산양 (E241-02). 주인공과 같은 복셀 크기(HERO_VOXEL)로, 앞은 +z.
 * 사람을 태울 만한 큰 산양이다: 등 높이 1.2m, 머리까지 2.4m 길이. 탄 주인공 앞뒤로 머리와 엉덩이가 보여야 산양으로 읽힌다.
 * 몸(등·목·머리·뒤로 말린 뿔·수염·등 깔개)과 다리 넷을 따로 찍어 다리 관절을 흔든다.
 */
export const GOAT_COLORS = {
  fur: 0x9c8c7a,
  furDark: 0x76695b,
  furLight: 0xcfc4b2,
  horn: 0xd6c9aa,
  hornTip: 0x8a7a62,
  beard: 0xece4d4,
  eye: 0x231c26,
  hoof: 0x3a302a,
  /** 등 깔개: 고개지기의 붉은 천과 금빛 술 */
  cloth: 0x9c2f2f,
  clothDark: 0x6c2020,
  trim: 0xe6bd4e,
}

const C = GOAT_COLORS

/** 다리 길이 (복셀). 몸은 이 높이에서 시작한다 */
export const GOAT_LEG = 8
/** 몸 격자에서 안장 가운데 (주인공이 앉는 자리, 복셀) */
export const GOAT_SADDLE = { x: 4.5, z: 11.5 }
/** 안장(등 깔개) 윗면의 높이 (복셀, 땅에서) */
export const GOAT_SADDLE_TOP = GOAT_LEG + 8
/** 다리 자리 (몸 격자 x·z의 가운데): 앞다리 둘, 뒷다리 둘 */
export const GOAT_LEGS = [
  { x: 1.5, z: 18.5 },
  { x: 7.5, z: 18.5 },
  { x: 1.5, z: 6.5 },
  { x: 7.5, z: 6.5 },
] as const

/** 몸: 9×17×31 (꼬리 z=2 → 주둥이 z=30). 땅에서 GOAT_LEG 위에 얹힌다 */
export function goatBody(): VoxelGrid {
  const g = new VoxelGrid(9, 17, 31)
  // 몸통: 등은 둥글게(위 모서리를 깎는다), 배는 옅게
  g.box(0, 0, 4, 8, 6, 21, C.fur)
  for (let z = 4; z <= 21; z++) {
    g.set(0, 6, z, null)
    g.set(8, 6, z, null)
  }
  for (let x = 0; x <= 8; x++) {
    g.set(x, 6, 4, null)
    g.set(x, 0, 4, null)
  }
  g.box(1, 0, 5, 7, 0, 20, C.furLight)
  g.box(3, 6, 4, 5, 6, 21, C.furDark)
  // 엉덩이와 위로 선 짧은 꼬리
  g.box(1, 1, 3, 7, 5, 3, C.furDark)
  g.box(3, 5, 2, 5, 8, 2, C.furLight)
  // 등 깔개: 등을 덮고 옆으로 늘어진 붉은 천, 아래 끝에 금빛 술, 가운데 마름모 무늬
  g.box(1, 7, 8, 7, 7, 15, C.cloth)
  for (const x of [0, 8]) {
    g.box(x, 2, 8, x, 5, 15, C.cloth)
    g.box(x, 1, 8, x, 1, 15, C.trim)
    g.set(x, 4, 11, C.clothDark)
    g.set(x, 4, 12, C.clothDark)
    g.set(x, 3, 11, C.trim)
    g.set(x, 5, 12, C.trim)
  }
  // 목: 앞으로 비스듬히 오른다
  g.box(2, 3, 21, 6, 9, 23, C.fur)
  g.box(2, 7, 24, 6, 10, 24, C.fur)
  g.box(3, 3, 22, 5, 5, 23, C.furLight)
  // 머리와 주둥이
  g.box(2, 9, 24, 6, 13, 28, C.fur)
  g.box(3, 8, 29, 5, 11, 30, C.furLight)
  g.set(4, 11, 30, C.furDark)
  g.set(2, 12, 27, C.eye)
  g.set(6, 12, 27, C.eye)
  // 옆으로 뻗은 귀
  g.box(1, 12, 25, 1, 12, 26, C.furDark)
  g.box(7, 12, 25, 7, 12, 26, C.furDark)
  // 턱 아래 흰 수염
  g.box(4, 5, 28, 4, 8, 29, C.beard)
  g.set(3, 7, 28, C.beard)
  g.set(5, 7, 28, C.beard)
  // 뒤로 말린 뿔: 정수리에서 위로 솟아 뒤로 넘어가 목 위로 내려온다 (뿌리는 두 칸 굵기, 끝은 짙게)
  const curl: [number, number][] = [[14, 26], [15, 25], [16, 24], [16, 23], [15, 22], [14, 21], [13, 21]]
  for (const [x, inner] of [[2, 3], [6, 5]] as const) {
    curl.forEach(([y, z], i) => {
      const hex = i >= 5 ? C.hornTip : C.horn
      g.set(x, y, z, hex)
      if (i < 3) g.set(inner, y, z, hex)
    })
  }
  return g
}

/** 다리 하나: 3×GOAT_LEG×3, 아래가 짙고 발굽은 검다. 위가 관절 */
export function goatLeg(): VoxelGrid {
  const g = new VoxelGrid(3, GOAT_LEG, 3)
  g.box(0, 4, 0, 2, GOAT_LEG - 1, 2, C.fur)
  g.box(0, 1, 0, 2, 3, 2, C.furDark)
  g.box(0, 0, 0, 2, 0, 2, C.hoof)
  return g
}

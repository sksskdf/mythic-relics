import { createRng } from '../../world/rng'
import { VoxelGrid } from '../VoxelGrid'

/** 주인공 복셀 한 칸의 크기 (미터) */
export const HERO_VOXEL = 0.08

export const HERO_COLORS = {
  skin: 0xe2b38c,
  skinShade: 0xc28d6a,
  eye: 0x231c26,
  tunic: 0x34598f,
  tunicDark: 0x253f6c,
  trim: 0xd9a441,
  leather: 0x6e4b31,
  leatherDark: 0x4f3524,
  boots: 0x3d2a1e,
  fur: 0xd6cab6,
  furShade: 0xb4a68e,
  helmet: 0xa9b2bc,
  helmetDark: 0x77818d,
  horn: 0xefe6cf,
  hornTip: 0xbcae8e,
  cape: 0x9c2f2f,
  capeDark: 0x6c2020,
  gold: 0xe6bd4e,
  beard: 0xc4692a,
  beardDark: 0x93491b,
  wood: 0x7a5636,
  iron: 0x8e98a3,
  ironEdge: 0xd7dee5,
}

const C = HERO_COLORS

/** 다리: 위쪽(엉덩이)이 관절. 털 장식이 달린 장화와 끈을 감은 바지 */
export function heroLeg(): VoxelGrid {
  const g = new VoxelGrid(3, 9, 4)
  g.box(0, 0, 0, 2, 2, 2, C.boots)
  g.box(0, 0, 3, 2, 1, 3, C.boots)
  g.box(0, 3, 0, 2, 3, 2, C.fur)
  g.box(0, 4, 0, 2, 8, 2, C.leather)
  // 각반 끈: 비스듬히 감긴 무늬
  for (let y = 4; y <= 7; y++) g.set((y % 3) as 0 | 1 | 2, y, 2, C.leatherDark)
  for (let y = 4; y <= 7; y++) g.set(2 - (y % 3), y, 0, C.leatherDark)
  return g
}

/** 몸통: 바닥 가운데가 원점. 넓은 어깨, 털 어깨 망토, 가죽 가슴끈, 벨트와 주머니 */
export function heroTorso(seed = 3): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(10, 9, 7)
  // 아래가 살짝 퍼지는 웃옷
  g.box(0, 0, 0, 9, 1, 6, C.tunic)
  g.box(1, 2, 1, 8, 7, 5, C.tunic)
  g.box(0, 0, 0, 9, 0, 6, C.trim)
  // 벨트, 버클, 주머니
  g.box(1, 2, 1, 8, 2, 5, C.leatherDark)
  g.set(4, 2, 6, C.gold)
  g.set(5, 2, 6, C.gold)
  g.box(7, 0, 5, 8, 1, 6, C.leather)
  // 왼쪽 어깨에서 오른쪽 허리로 내려오는 가죽 가슴끈
  for (let i = 0; i <= 4; i++) g.set(2 + i, 7 - i, 6, C.leather)
  // 털 어깨: 가장자리를 들쭉날쭉하게
  g.box(0, 7, 0, 9, 8, 6, C.fur)
  g.forEach((x, y, z, hex) => {
    if (hex !== C.fur) return
    const edge = x === 0 || x === 9 || z === 0 || z === 6
    if (edge && y === 7 && rng() < 0.5) g.set(x, y, z, null)
    else if (rng() < 0.3) g.set(x, y, z, C.furShade)
  })
  return g
}

/** 팔: 위쪽(어깨)이 관절. 소매, 쇠테를 두른 가죽 팔목 보호대, 장갑 낀 손 */
export function heroArm(): VoxelGrid {
  const g = new VoxelGrid(3, 8, 3)
  g.box(0, 4, 0, 2, 7, 2, C.tunic)
  g.box(0, 4, 0, 2, 4, 2, C.tunicDark)
  g.box(0, 1, 0, 2, 3, 2, C.leather)
  g.box(0, 2, 0, 2, 2, 2, C.helmetDark)
  g.box(0, 0, 0, 2, 0, 2, C.leatherDark)
  return g
}

/** 머리: 땋은 수염, 코 보호대가 달린 투구, 앞으로 휘어 오르는 뿔 */
export function heroHead(): VoxelGrid {
  const g = new VoxelGrid(12, 12, 9)
  // 얼굴 (y2~7, 앞면 z6)
  g.box(3, 2, 1, 8, 7, 6, C.skin)
  g.box(3, 2, 1, 8, 7, 1, C.skinShade)
  // 뒷머리
  g.box(3, 2, 0, 8, 6, 0, C.beard)
  // 눈과 코
  g.set(4, 5, 6, C.eye)
  g.set(7, 5, 6, C.eye)
  g.box(5, 4, 7, 6, 4, 7, C.skinShade)
  // 수염: 입을 덮고 아래로 땋아 내린다.
  g.box(3, 2, 6, 8, 3, 7, C.beard)
  g.box(3, 3, 6, 3, 4, 6, C.beard)
  g.box(8, 3, 6, 8, 4, 6, C.beard)
  g.box(4, 3, 7, 7, 3, 7, C.beardDark)
  g.box(5, 0, 7, 6, 1, 7, C.beard)
  g.box(5, 1, 7, 6, 1, 7, C.gold)
  // 투구: 테두리, 낮고 둥근 윗부분, 코 보호대
  g.box(2, 6, 0, 9, 6, 7, C.helmetDark)
  g.box(3, 7, 1, 8, 8, 6, C.helmet)
  g.box(4, 9, 2, 7, 9, 5, C.helmet)
  g.box(5, 9, 3, 6, 9, 4, C.helmetDark)
  g.box(5, 4, 7, 6, 5, 7, C.helmetDark)
  // 뿔: 두 칸 두께로 옆으로 뻗었다가 짧게 위·앞으로 휜다.
  for (const [inner, outer] of [
    [2, 1],
    [9, 10],
  ] as const) {
    const edge = inner === 2 ? 0 : 11
    g.box(inner, 7, 3, inner, 7, 4, C.horn)
    g.box(outer, 7, 3, outer, 8, 4, C.horn)
    g.box(edge, 8, 4, edge, 9, 4, C.horn)
    g.set(edge, 9, 5, C.hornTip)
  }
  return g
}

/** 망토: 위쪽 가운데가 관절. 금 걸쇠, 아랫단은 해진 듯 들쭉날쭉하다. */
export function heroCape(): VoxelGrid {
  const g = new VoxelGrid(8, 12, 1)
  g.box(0, 0, 0, 7, 11, 0, C.cape)
  g.box(0, 0, 0, 0, 11, 0, C.capeDark)
  g.box(7, 0, 0, 7, 11, 0, C.capeDark)
  g.box(0, 1, 0, 7, 1, 0, C.capeDark)
  g.set(0, 11, 0, C.gold)
  g.set(7, 11, 0, C.gold)
  for (const x of [1, 4, 6]) g.set(x, 0, 0, null)
  return g
}

/** 손도끼: 손잡이가 앞(z+)으로 뻗고 끝에 아래로 처진 넓은 도끼날이 달려 있다. 손으로 쥐는 곳이 원점 */
export function heroAxe(): VoxelGrid {
  const g = new VoxelGrid(2, 7, 11)
  g.box(0, 5, 0, 1, 5, 10, C.wood)
  g.box(0, 5, 1, 1, 5, 2, C.leatherDark)
  // 도끼날: 손잡이 끝에서 아래로 넓어진다.
  g.box(0, 3, 7, 1, 6, 9, C.iron)
  g.box(0, 1, 8, 1, 2, 10, C.iron)
  g.box(0, 0, 9, 1, 0, 10, C.iron)
  g.box(0, 0, 10, 1, 6, 10, C.ironEdge)
  return g
}

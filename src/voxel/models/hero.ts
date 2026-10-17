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


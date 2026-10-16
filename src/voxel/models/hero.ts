import { createRng } from '../../world/rng'
import { VoxelGrid } from '../VoxelGrid'

/** 주인공 복셀 한 칸의 크기 (미터) */
export const HERO_VOXEL = 0.08

export const HERO_COLORS = {
  skin: 0xe2b38c,
  skinShade: 0xc99572,
  eye: 0x2a2230,
  tunic: 0x35588f,
  tunicDark: 0x264272,
  leather: 0x6b4a32,
  leatherDark: 0x523726,
  boots: 0x3f2c20,
  fur: 0xd2c6b4,
  furShade: 0xb3a68f,
  helmet: 0xa3acb6,
  helmetDark: 0x7c8590,
  horn: 0xece4cf,
  hornTip: 0xb9ad91,
  cape: 0x9a3030,
  capeDark: 0x6e2222,
  belt: 0x3a2a1f,
  gold: 0xe0b54a,
  beard: 0xc06a2c,
  beardDark: 0x96501f,
}

const C = HERO_COLORS

/** 다리: 위쪽(엉덩이)이 관절. 발끝이 앞(z+)으로 한 칸 나와 있다. */
export function heroLeg(): VoxelGrid {
  const g = new VoxelGrid(3, 10, 4)
  g.box(0, 0, 0, 2, 3, 2, C.boots)
  g.box(0, 0, 3, 2, 1, 3, C.boots)
  g.box(0, 4, 0, 2, 9, 2, C.leather)
  // 각반을 감은 끈
  for (const y of [5, 7]) g.box(0, y, 0, 2, y, 2, C.leatherDark)
  g.box(0, 4, 0, 2, 4, 2, C.fur)
  return g
}

/** 몸통: 바닥 가운데가 원점. 어깨를 덮는 털 망토가 붙어 있다. */
export function heroTorso(seed = 3): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(9, 9, 6)
  g.box(1, 0, 1, 7, 7, 4, C.tunic)
  g.box(1, 0, 1, 7, 0, 4, C.tunicDark)
  g.box(1, 1, 1, 7, 1, 4, C.belt)
  g.set(4, 1, 5, C.gold)
  g.box(4, 2, 4, 4, 6, 4, C.tunicDark)
  // 어깨 털: 가장자리를 들쭉날쭉하게
  g.box(0, 7, 0, 8, 8, 5, C.fur)
  g.forEach((x, y, z, hex) => {
    if (hex !== C.fur) return
    const edge = x === 0 || x === 8 || z === 0 || z === 5
    if (edge && y === 7 && rng() < 0.45) g.set(x, y, z, null)
    else if (rng() < 0.3) g.set(x, y, z, C.furShade)
  })
  return g
}

/** 팔: 위쪽(어깨)이 관절. 소매, 가죽 팔목 보호대, 손 */
export function heroArm(): VoxelGrid {
  const g = new VoxelGrid(2, 9, 2)
  g.box(0, 5, 0, 1, 8, 1, C.tunic)
  g.box(0, 2, 0, 1, 4, 1, C.leather)
  g.box(0, 3, 0, 1, 3, 1, C.leatherDark)
  g.box(0, 0, 0, 1, 1, 1, C.skin)
  return g
}

/** 머리: 수염, 코 보호대가 달린 투구, 양옆으로 휜 뿔 */
export function heroHead(): VoxelGrid {
  const g = new VoxelGrid(11, 9, 7)
  // 얼굴
  g.box(3, 0, 1, 7, 4, 5, C.skin)
  g.box(3, 0, 1, 7, 4, 1, C.skinShade)
  g.set(4, 2, 5, C.eye)
  g.set(6, 2, 5, C.eye)
  // 수염
  g.box(3, 0, 5, 7, 1, 6, C.beard)
  g.box(4, 0, 6, 6, 0, 6, C.beardDark)
  g.box(3, 1, 5, 3, 2, 5, C.beard)
  g.box(7, 1, 5, 7, 2, 5, C.beard)
  // 투구
  g.box(2, 4, 0, 8, 4, 6, C.helmetDark)
  g.box(3, 5, 1, 7, 5, 5, C.helmet)
  g.box(4, 6, 2, 6, 6, 4, C.helmet)
  g.box(5, 2, 6, 5, 3, 6, C.helmetDark)
  // 뿔: 옆으로 뻗다가 위로 휜다
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? 1 : 9
    const x1 = side < 0 ? 0 : 10
    g.set(x0, 5, 3, C.horn)
    g.set(x1, 6, 3, C.horn)
    g.set(x1, 7, 3, C.horn)
    g.set(x1, 8, 3, C.hornTip)
  }
  return g
}

/** 망토: 위쪽 가운데가 관절. 아랫단은 해진 듯 들쭉날쭉하다. */
export function heroCape(): VoxelGrid {
  const g = new VoxelGrid(7, 11, 1)
  g.box(0, 0, 0, 6, 10, 0, C.cape)
  g.box(0, 0, 0, 0, 10, 0, C.capeDark)
  g.box(6, 0, 0, 6, 10, 0, C.capeDark)
  g.box(0, 1, 0, 6, 1, 0, C.capeDark)
  for (const x of [1, 3, 5]) g.set(x, 0, 0, null)
  return g
}

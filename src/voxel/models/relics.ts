import { VoxelGrid } from '../VoxelGrid'

/** 유물 복셀 한 칸의 크기 (미터) */
export const RELIC_VOXEL = 0.07

const C = {
  iron: 0x9aa4ae,
  ironLight: 0xd7dee5,
  ironDark: 0x5b636c,
  wood: 0x7a5636,
  leather: 0x4f3524,
  gold: 0xe6bd4e,
  ember: 0xff9a3c,
  mask: 0x5fae4e,
  maskDark: 0x2f6b2a,
  eye: 0x1c2a1a,
}

/** 묠니르: 짧은 손잡이에 넓은 망치머리. 손잡이 끝이 원점 근처 */
export function mjolnir(): VoxelGrid {
  const g = new VoxelGrid(9, 12, 5)
  g.box(3, 0, 1, 5, 0, 3, C.gold)
  g.box(4, 1, 2, 4, 6, 2, C.leather)
  g.box(4, 2, 2, 4, 2, 2, C.wood)
  g.box(4, 4, 2, 4, 4, 2, C.wood)
  g.box(0, 7, 0, 8, 11, 4, C.iron)
  g.box(0, 7, 0, 8, 7, 4, C.ironDark)
  g.box(0, 11, 0, 8, 11, 4, C.ironLight)
  // 룬 무늬
  g.box(3, 9, 4, 5, 9, 4, C.gold)
  g.set(4, 10, 4, C.gold)
  g.set(4, 8, 4, C.gold)
  return g
}

/** 메긴교르드: 금 버클이 달린 넓은 가죽 허리띠 (둥글게 말린 모양) */
export function megingjord(): VoxelGrid {
  const g = new VoxelGrid(11, 4, 11)
  for (let x = 0; x <= 10; x++) {
    for (let z = 0; z <= 10; z++) {
      const d = Math.hypot(x - 5, z - 5)
      if (d >= 3.6 && d <= 5.4) g.box(x, 0, z, x, 3, z, C.wood)
    }
  }
  g.box(0, 1, 4, 10, 2, 6, null)
  g.box(4, 0, 9, 6, 3, 10, C.gold)
  g.box(5, 1, 10, 5, 2, 10, C.ironLight)
  for (const [x, z] of [[1, 3], [9, 3], [1, 7], [9, 7]] as const) g.box(x, 1, z, x, 2, z, C.gold)
  return g
}

/** 야른그레이프르: 쇠 장갑 */
export function jarngreipr(): VoxelGrid {
  const g = new VoxelGrid(6, 10, 4)
  g.box(0, 0, 0, 5, 3, 3, C.ironDark)
  g.box(0, 0, 0, 5, 0, 3, C.ember)
  g.box(0, 4, 0, 5, 7, 3, C.iron)
  for (const x of [0, 2, 4]) g.box(x, 8, 1, x + 1, 9, 2, C.iron)
  g.box(0, 9, 1, 0, 9, 2, C.ironLight)
  g.box(5, 5, 0, 5, 7, 0, C.ironLight)
  return g
}

/** 변신의 가면: 뿔 달린 초록 가면 */
export function lokiMask(): VoxelGrid {
  const g = new VoxelGrid(10, 11, 3)
  g.box(1, 1, 0, 8, 7, 1, C.mask)
  g.box(2, 0, 0, 7, 0, 1, C.mask)
  g.box(0, 3, 0, 9, 6, 1, C.mask)
  g.box(3, 0, 0, 6, 2, 1, C.maskDark)
  g.box(2, 4, 1, 3, 5, 1, C.eye)
  g.box(6, 4, 1, 7, 5, 1, C.eye)
  g.set(3, 4, 2, C.gold)
  g.set(6, 4, 2, C.gold)
  g.box(1, 8, 0, 1, 10, 0, C.mask)
  g.box(8, 8, 0, 8, 10, 0, C.mask)
  g.set(0, 10, 0, C.maskDark)
  g.set(9, 10, 0, C.maskDark)
  return g
}

/** 달군 쇳덩이 (야른그레이프르 스킬로 되던지는 것) */
export function emberIngot(): VoxelGrid {
  const g = new VoxelGrid(5, 3, 3)
  g.box(0, 0, 0, 4, 2, 2, C.ember)
  g.box(1, 1, 1, 3, 1, 1, C.gold)
  return g
}

/** 유물 데이터의 model 이름 → 복셀 모델 */
export const RELIC_MODELS: Readonly<Record<string, () => VoxelGrid>> = { mjolnir, megingjord, jarngreipr, lokiMask }

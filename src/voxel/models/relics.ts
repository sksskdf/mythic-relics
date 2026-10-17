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

/** 땅에 꽂힌 검 (아수라의 네 검). 칼끝이 아래, 손잡이가 위 */
function sword(blade: number, hilt: number, guard: number, length = 12): VoxelGrid {
  const g = new VoxelGrid(5, length + 5, 3)
  g.box(2, 0, 1, 2, length - 1, 1, blade)
  g.box(2, 1, 1, 2, length - 2, 1, blade)
  g.set(2, 0, 1, 0xffffff)
  g.box(0, length, 0, 4, length, 2, guard)
  g.box(2, length + 1, 1, 2, length + 3, 1, hilt)
  g.set(2, length + 4, 1, guard)
  return g
}

export const kusanagi = (): VoxelGrid => sword(0xbfe9ff, 0x1c1416, 0xe6bd4e, 13)
export const totsuka = (): VoxelGrid => sword(0xe9eef5, 0x6a1a22, 0xff4a4a, 14)
export const futsu = (): VoxelGrid => sword(0xd7dee5, 0xc9a23a, 0x7fd4ff, 12)
export const ohabari = (): VoxelGrid => sword(0xffd0a0, 0x3b2414, 0xff7a2a, 12)

/** 레바테인: 검은 칼에 초록 불꽃이 감긴 로키의 칼 */
export function laevateinn(): VoxelGrid {
  const g = sword(0x2a3a2c, 0x1d2620, 0x2f6a3a, 13)
  for (let y = 1; y < 12; y += 2) {
    g.set(1, y, 1, 0x8fe07a)
    g.set(3, y + 1, 1, 0x5fd06a)
  }
  g.set(2, 0, 1, 0xd8ffb0)
  return g
}

/** 겨우살이 가지: 갈라진 잔가지에 초록 잎과 흰 열매 */
export function mistletoe(): VoxelGrid {
  const g = new VoxelGrid(9, 12, 3)
  const twig = 0x6b5434
  // 줄기와 두 갈래
  g.box(4, 0, 1, 4, 6, 1, twig)
  for (let i = 0; i < 4; i++) {
    g.set(3 - i, 6 + i, 1, twig)
    g.set(5 + i, 6 + i, 1, twig)
  }
  // 잎: 갈래마다 짝을 지어
  for (const [x, y] of [[1, 9], [2, 10], [7, 9], [6, 10], [3, 5], [5, 4]] as const) g.box(x, y, 0, x, y, 2, 0x6fbf4a)
  // 흰 열매
  for (const [x, y] of [[0, 10], [8, 10], [4, 7], [1, 11], [7, 11]] as const) g.set(x, y, 1, 0xf2f4e8)
  return g
}

/** 유물 데이터의 model 이름 → 복셀 모델 */
export const RELIC_MODELS: Readonly<Record<string, () => VoxelGrid>> = {
  mjolnir,
  megingjord,
  jarngreipr,
  lokiMask,
  kusanagi,
  totsuka,
  futsu,
  ohabari,
  laevateinn,
  mistletoe,
}

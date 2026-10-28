import { createRng } from '../../world/rng'
import { VoxelGrid } from '../VoxelGrid'

/**
 * 모닥불 마을의 건물과 벽 (E24-07): 목책·망루·족장의 긴 집·이층집·대장간·장터 노점·나무다리.
 * 바닥 가운데가 원점이고 앞(문·간판)은 +z를 본다. 칸 크기는 regionMap.ts의 BUILDERS가 정한다.
 */

const V = {
  log: 0x7a5a3c,
  logDark: 0x5e4430,
  logTip: 0x9a7a52,
  plank: 0x8a6a48,
  plankDark: 0x6a4e34,
  beam: 0x4e3826,
  thatch: 0xc8a860,
  thatchDark: 0xa8883e,
  shingle: 0x6a4a3a,
  shingleDark: 0x4e3428,
  plaster: 0xe8dcc0,
  plasterShade: 0xd4c6a6,
  stone: 0x9a968a,
  stoneDark: 0x7a766a,
  stoneLight: 0xb2aea2,
  window: 0x2a2424,
  iron: 0x4a4e56,
  ironLight: 0x6e7480,
  ember: 0xd2552a,
  shieldRed: 0xb8402e,
  shieldBlue: 0x3e5e9a,
  shieldGold: 0xd8a83a,
  clothRed: 0xc0443a,
  cloth: 0xe8e0c8,
  clothBlue: 0x4a6aa0,
  apple: 0xc83a2a,
  cabbage: 0x7ab04a,
  pot: 0xb06a3a,
  water: 0x5aa8c8,
} as const

const pick = <T,>(rng: () => number, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!

/** 목책 한 칸 (칸 0.15m, 길이 3.9m): 끝을 깎은 통나무를 나란히 세우고 뒤에 가로대 둘 */
export function palisade(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(26, 17, 4)
  for (let x = 0; x < 26; x += 2) {
    const top = 13 + Math.floor(rng() * 3)
    const color = pick(rng, [V.log, V.log, V.logDark])
    g.box(x, 0, 0, x + 1, top, 1, color)
    // 깎은 끝
    g.box(x, top + 1, 0, x + 1, top + 1, 1, V.logTip)
    g.set(x, top + 2, 0, V.logTip)
  }
  for (const y of [4, 10]) g.box(0, y, 2, 25, y + 1, 2, V.beam)
  return g
}

/** 망루 (칸 0.15m): 네 기둥, 3m 높이의 발판과 난간, 짚 지붕, 앞의 사다리 */
export function watchtower(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(18, 38, 18)
  for (const [x, z] of [[1, 1], [15, 1], [1, 15], [15, 15]] as const) g.box(x, 0, z, x + 1, 29, z + 1, V.logDark)
  // 엇갈린 버팀대
  g.line(2, 2, 1, 15, 18, 1, V.beam, 0)
  g.line(15, 2, 16, 2, 18, 16, V.beam, 0)
  g.line(1, 2, 2, 1, 18, 15, V.beam, 0)
  g.line(16, 2, 15, 16, 18, 2, V.beam, 0)
  // 발판과 난간
  g.box(0, 19, 0, 17, 20, 17, V.plank)
  for (let x = 0; x < 18; x += 3) g.box(x, 21, 0, x, 24, 0, V.plankDark)
  for (let x = 0; x < 18; x += 3) g.box(x, 21, 17, x, 24, 17, V.plankDark)
  for (let z = 0; z < 18; z += 3) g.box(0, 21, z, 0, 24, z, V.plankDark)
  for (let z = 0; z < 18; z += 3) g.box(17, 21, z, 17, 24, z, V.plankDark)
  for (const z of [0, 17]) g.box(0, 24, z, 17, 24, z, V.plank)
  for (const x of [0, 17]) g.box(x, 24, 0, x, 24, 17, V.plank)
  // 짚 지붕: 네모 뿔
  for (let i = 0; i < 8; i++) {
    const y = 30 + i
    g.box(-1 + i, y, -1 + i, 18 - i, y, 18 - i, rng() < 0.5 ? V.thatch : V.thatchDark)
  }
  // 앞 사다리
  for (const x of [7, 10]) g.box(x, 0, 17, x, 20, 17, V.plankDark)
  for (let y = 2; y < 20; y += 3) g.box(8, y, 17, 9, y, 17, V.plank)
  return g
}

/** 족장의 긴 집 (칸 0.2m, 8.8 × 4.4m): 세로 널벽, 가파른 짚 지붕, 박공 끝의 엇갈린 용머리, 앞벽의 둥근 방패 */
export function longhouse(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(44, 24, 24)
  // 벽: 세로 널
  for (let x = 2; x <= 41; x++) g.box(x, 0, 5, x, 6, 18, x % 2 ? V.plank : V.plankDark)
  g.box(3, 0, 6, 40, 6, 17, null)
  g.box(2, 0, 5, 41, 0, 18, V.beam)
  // 문과 문틀
  g.box(19, 1, 18, 24, 6, 18, V.beam)
  g.box(20, 1, 18, 23, 5, 18, V.window)
  // 방패
  const shields = [V.shieldRed, V.shieldBlue, V.shieldGold, V.shieldBlue, V.shieldRed]
  ;[6, 12, 30, 36].forEach((x, i) => {
    g.box(x, 3, 19, x + 2, 5, 19, shields[i]!)
    g.set(x + 1, 4, 19, V.iron)
  })
  // 지붕: 용마루가 x를 따라간다
  for (let i = 0; i <= 11; i++) {
    const y = 7 + i
    g.box(0, y, 1 + i, 43, y, 22 - i, rng() < 0.55 ? V.thatch : V.thatchDark)
    if (22 - i - (1 + i) > 2) g.box(1, y, 2 + i, 42, y, 21 - i, null)
  }
  g.box(0, 18, 11, 43, 18, 12, V.shingleDark)
  // 박공 끝의 엇갈린 용머리
  for (const x of [0, 43]) {
    g.line(x, 14, 6, x, 22, 14, V.beam, 0)
    g.line(x, 14, 17, x, 22, 9, V.beam, 0)
    g.set(x, 23, 15, V.shieldRed)
    g.set(x, 23, 8, V.shieldRed)
  }
  return g
}

/** 이층집 (칸 0.2m): 돌로 쌓은 아래층, 나무 뼈대가 드러난 위층(조금 내밀었다), 널 지붕, 굴뚝 */
export function house2(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(24, 27, 18)
  // 아래층: 돌
  g.box(2, 0, 3, 21, 6, 14, V.stone)
  g.forEach((x, y, z, hex) => {
    if (hex === V.stone && (x * 7 + y * 3 + z * 5) % 5 === 0) g.set(x, y, z, V.stoneDark)
  })
  g.box(3, 0, 4, 20, 6, 13, null)
  g.box(10, 1, 14, 13, 5, 14, V.beam)
  g.box(11, 1, 14, 12, 4, 14, V.window)
  g.box(4, 3, 14, 6, 4, 14, V.window)
  g.box(17, 3, 14, 19, 4, 14, V.window)
  // 위층: 회벽과 나무 뼈대, 한 칸 내밀었다
  g.box(1, 7, 2, 22, 13, 15, V.plaster)
  g.box(2, 7, 3, 21, 13, 14, null)
  for (const x of [1, 6, 11, 12, 17, 22]) g.box(x, 7, 15, x, 13, 15, V.beam)
  for (const x of [1, 22]) g.box(x, 7, 2, x, 13, 15, V.beam)
  g.box(1, 7, 15, 22, 7, 15, V.beam)
  g.box(1, 13, 15, 22, 13, 15, V.beam)
  g.line(1, 8, 15, 6, 12, 15, V.beam, 0)
  g.line(22, 8, 15, 17, 12, 15, V.beam, 0)
  g.box(8, 9, 15, 9, 11, 15, V.window)
  g.box(14, 9, 15, 15, 11, 15, V.window)
  // 널 지붕
  for (let i = 0; i <= 9; i++) {
    const y = 14 + i
    g.box(0, y, i, 23, y, 17 - i, rng() < 0.5 ? V.shingle : V.shingleDark)
    if (17 - i - i > 2) g.box(1, y, i + 1, 22, y, 16 - i, null)
  }
  // 굴뚝
  g.box(17, 16, 5, 19, 26, 7, V.stoneDark)
  return g
}

/** 대장간 (칸 0.15m): 왼쪽은 굴뚝 달린 돌 화덕(불 아가리), 오른쪽은 기둥 넷의 비스듬한 지붕 아래 모루·물통·무기걸이 */
export function forge(): VoxelGrid {
  const g = new VoxelGrid(32, 30, 22)
  // 돌 화덕과 굴뚝
  g.box(1, 0, 4, 11, 8, 15, V.stone)
  g.forEach((x, y, z, hex) => {
    if (hex === V.stone && (x * 5 + y * 7 + z * 3) % 4 === 0) g.set(x, y, z, V.stoneDark)
  })
  g.box(4, 1, 15, 8, 4, 15, V.window)
  g.box(3, 9, 6, 9, 9, 12, V.stoneDark)
  g.box(4, 10, 7, 8, 28, 11, V.stone)
  g.box(5, 10, 8, 7, 29, 10, null)
  g.box(4, 28, 7, 8, 29, 11, V.stoneDark)
  g.box(5, 28, 8, 7, 29, 10, null)
  // 지붕: 기둥 넷, 앞으로 기운 널
  for (const [x, z] of [[12, 2], [30, 2], [12, 19], [30, 19]] as const) g.box(x, 0, z, x + 1, 16, z + 1, V.logDark)
  for (let z = 0; z < 22; z++) {
    const y = 19 - Math.floor(z / 4)
    g.box(11, y, z, 31, y, z, z % 2 ? V.shingle : V.shingleDark)
  }
  // 모루와 그루터기
  g.box(19, 0, 10, 22, 3, 13, V.logDark)
  g.box(18, 4, 11, 23, 5, 12, V.iron)
  g.box(17, 5, 11, 18, 5, 12, V.ironLight)
  // 물통
  g.column(27, 15, 0, 4, 2, 2, V.plankDark)
  g.column(27, 15, 4, 4, 1.5, 1.5, V.water)
  // 무기걸이: 칼과 도끼
  g.box(14, 0, 19, 15, 9, 19, V.beam)
  g.box(14, 8, 19, 26, 8, 19, V.beam)
  for (const x of [17, 20, 23]) g.box(x, 2, 19, x, 7, 19, V.ironLight)
  g.box(22, 6, 19, 24, 7, 19, V.iron)
  return g
}

/** 대장간 화덕의 불 아가리와 굴뚝 끝 (빛나는 부분, forge와 같은 격자 크기) */
export function forgeGlow(): VoxelGrid {
  const g = new VoxelGrid(32, 30, 22)
  g.box(5, 1, 16, 7, 3, 16, V.ember)
  g.box(6, 2, 16, 6, 2, 16, 0xffc060)
  return g
}

/** 장터 노점 (칸 0.12m): 네 기둥, 줄무늬 천 차양, 판자 위의 사과·배추·항아리 */
export function stall(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(26, 22, 16)
  for (const [x, z] of [[1, 2], [23, 2], [1, 13], [23, 13]] as const) g.box(x, 0, z, x + 1, 17, z + 1, V.logDark)
  // 판자와 다리
  g.box(2, 7, 9, 23, 7, 14, V.plank)
  g.box(2, 0, 9, 23, 6, 9, V.plankDark)
  // 물건
  for (let x = 3; x < 23; x += 3) {
    const kind = pick(rng, ['apple', 'cabbage', 'pot'] as const)
    if (kind === 'pot') g.column(x + 0.5, 11.5, 8, 10, 1.2, 0.9, V.pot)
    else g.box(x, 8, 10, x + 1, 9, 13, kind === 'apple' ? V.apple : V.cabbage)
  }
  // 줄무늬 차양 (뒤가 높다)
  const stripe = seed % 2 ? V.clothBlue : V.clothRed
  for (let z = 0; z < 16; z++) {
    const y = 20 - Math.floor(z / 5)
    for (let x = 0; x < 26; x++) g.set(x, y, z, Math.floor(x / 3) % 2 ? V.cloth : stripe)
  }
  return g
}

/** 나무다리 (칸 0.15m, 길이 4.5 × 폭 2.4m): 판자 바닥과 양옆 난간. x를 따라 건넌다 */
export function bridge(): VoxelGrid {
  const g = new VoxelGrid(30, 7, 16)
  for (let x = 0; x < 30; x++) g.box(x, 0, 1, x, 0, 14, x % 3 === 0 ? V.plankDark : V.plank)
  for (const z of [0, 15]) {
    g.box(0, 1, z, 29, 1, z, V.beam)
    for (let x = 0; x < 30; x += 7) g.box(x, 1, z, x, 5, z, V.logDark)
    g.box(0, 5, z, 29, 5, z, V.plank)
  }
  return g
}

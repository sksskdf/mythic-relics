import { createRng } from '../../world/rng'
import { VoxelGrid } from '../VoxelGrid'

/**
 * 길목 (E24-07, 사용자 의견 "신화권별로 문이 있다"): 출구마다 같은 나무 문 대신, 그 길이 가는 땅의 모습으로 선 길목.
 * 모두 칸 0.15m, 폭 26칸(3.9m)에 길이 가운데로 지나간다(기둥은 x 2~5·20~23). 바닥 가운데가 원점, 앞은 +z.
 */

const R = {
  log: 0x7a5a3c,
  logDark: 0x5e4430,
  beam: 0x4e3826,
  snow: 0xf2f6fa,
  snowShade: 0xd6e0ea,
  rune: 0x8a8e98,
  runeDark: 0x6a6e78,
  shieldRed: 0xb8402e,
  shieldGold: 0xd8a83a,
  marble: 0xefeae0,
  marbleShade: 0xd2cbbd,
  marbleDark: 0xb0a898,
  laurel: 0x6f8a4a,
  red: 0xc0392b,
  redDark: 0x8e2a20,
  jade: 0x3e7a5e,
  jadeDark: 0x2c5a44,
  gold: 0xe0b040,
  black: 0x2a2424,
  vermilion: 0xd8432a,
  vermilionDark: 0xa83020,
  stone: 0x9a968a,
  stoneDark: 0x7a766a,
  thatch: 0xc8a860,
  thatchDark: 0xa8883e,
  ruin: 0x8a8296,
  ruinDark: 0x645e70,
  crack: 0xc49af0,
  blue: 0x3e5e9a,
} as const

/** 북유럽: 통나무 두 기둥에 끝이 말린 용머리 가로대, 가운데 방패, 위에 쌓인 눈. 옆에 룬 돌, 발치에 눈 */
export function norseMark(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(30, 26, 8)
  for (const x of [4, 22]) {
    g.box(x, 0, 2, x + 3, 19, 5, R.log)
    g.box(x, 0, 2, x, 19, 2, R.logDark)
  }
  // 가로대와 말린 끝
  g.box(1, 18, 2, 28, 20, 5, R.beam)
  for (const [x, dx] of [[1, -1], [28, 1]] as const) {
    g.box(x, 21, 3, x, 23, 4, R.beam)
    g.set(x + dx, 23, 3, R.beam)
    g.set(x + dx, 23, 4, R.beam)
    g.set(x + dx, 24, 3, R.shieldRed)
  }
  // 가운데 방패
  g.box(13, 14, 5, 16, 17, 5, R.shieldRed)
  g.box(14, 15, 5, 15, 16, 5, R.shieldGold)
  // 가로대 위 눈
  g.box(1, 21, 2, 28, 21, 5, R.snow)
  for (let x = 2; x < 28; x += 3) if (rng() < 0.6) g.set(x, 22, 3, R.snowShade)
  // 왼쪽 앞의 룬 돌
  g.box(0, 0, 6, 2, 9, 7, R.rune)
  for (let y = 2; y < 9; y += 2) g.set(1, y, 7, R.runeDark)
  // 발치의 눈
  for (let x = 0; x < 30; x++) for (let z = 0; z < 8; z++) if ((x < 6 || x > 23) && rng() < 0.45) g.set(x, 0, z, g.get(x, 0, z) || R.snow)
  return g
}

/** 그리스: 홈을 판 대리석 기둥 둘, 기둥머리, 삼각 박공을 얹은 들보, 가운데 월계관, 발치의 대리석 단 */
export function greekMark(): VoxelGrid {
  const g = new VoxelGrid(30, 28, 8)
  // 단
  g.box(0, 0, 0, 29, 0, 7, R.marbleDark)
  for (const x of [3, 21]) {
    g.box(x, 1, 2, x + 5, 1, 5, R.marbleShade)
    for (let y = 2; y <= 18; y++) for (let k = 0; k < 4; k++) g.box(x + 1 + k, y, 2, x + 1 + k, y, 5, k % 2 ? R.marbleShade : R.marble)
    g.box(x, 19, 1, x + 5, 20, 6, R.marble)
  }
  // 들보와 박공
  g.box(0, 21, 1, 29, 22, 6, R.marble)
  g.box(0, 23, 1, 29, 23, 6, R.marbleShade)
  for (let i = 0; i < 4; i++) g.box(3 + i * 3, 24 + i, 1, 26 - i * 3, 24 + i, 6, i % 2 ? R.marbleShade : R.marble)
  // 월계관
  for (const [x, y] of [[13, 17], [12, 16], [12, 15], [13, 14], [16, 17], [17, 16], [17, 15], [16, 14]] as const) g.set(x, y, 6, R.laurel)
  return g
}

/** 중국: 붉은 기둥 둘의 패루, 푸른 기와 지붕 두 겹(끝이 들림), 가운데 금빛 현판 */
export function chinaMark(): VoxelGrid {
  const g = new VoxelGrid(30, 28, 8)
  for (const x of [4, 22]) {
    g.box(x, 0, 1, x + 3, 0, 6, R.stoneDark)
    g.box(x + 1, 1, 2, x + 2, 19, 5, R.red)
  }
  g.box(3, 16, 2, 26, 17, 5, R.redDark)
  g.box(11, 13, 5, 18, 16, 5, R.gold)
  g.box(12, 14, 5, 17, 15, 5, R.black)
  // 지붕 두 겹: 가운데가 높고 끝이 들린다
  for (const [y, x0, x1] of [[20, 0, 29], [24, 6, 23]] as const) {
    g.box(x0, y, 0, x1, y, 7, R.jadeDark)
    g.box(x0 + 1, y + 1, 1, x1 - 1, y + 1, 6, R.jade)
    g.box(x0 + 3, y + 2, 2, x1 - 3, y + 2, 5, R.jade)
    g.set(x0, y + 1, 0, R.jadeDark)
    g.set(x1, y + 1, 0, R.jadeDark)
    g.set(x0, y + 1, 7, R.jadeDark)
    g.set(x1, y + 1, 7, R.jadeDark)
  }
  g.box(7, 21, 3, 22, 23, 4, R.redDark)
  return g
}

/** 일본: 붉은 도리이와 양옆 석등 */
export function japanMark(): VoxelGrid {
  const g = new VoxelGrid(30, 26, 8)
  for (const x of [6, 22]) g.box(x, 0, 3, x + 1, 20, 4, R.vermilion)
  g.box(4, 16, 3, 25, 17, 4, R.vermilion)
  g.box(1, 21, 2, 28, 22, 5, R.vermilion)
  g.box(1, 23, 2, 28, 24, 5, R.black)
  g.box(1, 25, 2, 3, 25, 5, R.black)
  g.box(26, 25, 2, 28, 25, 5, R.black)
  g.box(14, 18, 3, 15, 20, 4, R.vermilionDark)
  // 석등
  for (const x of [0, 27]) {
    g.box(x, 0, 5, x + 2, 0, 7, R.stoneDark)
    g.box(x + 1, 1, 6, x + 1, 4, 6, R.stone)
    g.box(x, 5, 5, x + 2, 6, 7, R.stone)
    g.box(x, 7, 5, x + 2, 7, 7, R.stoneDark)
  }
  return g
}

/** 한국: 붉은 홍살문 (두 기둥, 위에 화살 모양 살을 늘어놓고 가운데 태극) */
export function koreaMark(): VoxelGrid {
  const g = new VoxelGrid(30, 28, 8)
  for (const x of [4, 23]) g.box(x, 0, 3, x + 2, 24, 5, R.red)
  g.box(2, 17, 3, 27, 18, 5, R.redDark)
  g.box(2, 23, 3, 27, 23, 5, R.redDark)
  // 살: 두 칸마다 세로 살, 끝은 뾰족
  for (let x = 7; x <= 22; x += 2) {
    g.box(x, 19, 4, x, 25, 4, R.red)
    g.set(x, 26, 4, R.black)
  }
  // 태극
  g.box(13, 19, 5, 16, 22, 5, R.red)
  g.box(13, 19, 5, 16, 20, 5, R.blue)
  return g
}

/** 마을로 가는 길: 짚 지붕을 얹은 두 기둥의 마을 어귀 문과 걸린 등 */
export function villageMark(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(30, 26, 8)
  for (const x of [4, 22]) g.box(x, 0, 2, x + 3, 17, 5, R.log)
  g.box(2, 16, 2, 27, 17, 5, R.beam)
  for (let i = 0; i < 6; i++) g.box(0 + i, 18 + i, 0 + Math.min(i, 3), 29 - i, 18 + i, 7 - Math.min(i, 3), rng() < 0.5 ? R.thatch : R.thatchDark)
  g.box(14, 12, 4, 15, 15, 5, R.beam)
  g.box(13, 9, 3, 16, 11, 6, R.shieldGold)
  return g
}

/** 갈라진 하늘로 가는 길: 무너진 돌 아치 (한쪽은 부러졌다), 틈마다 보랏빛 금 */
export function riftMark(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(30, 26, 8)
  g.box(3, 0, 2, 7, 22, 5, R.ruin)
  g.box(21, 0, 2, 25, 12, 5, R.ruin)
  g.box(3, 20, 2, 18, 23, 5, R.ruin)
  g.forEach((x, y, z, hex) => {
    if (hex === R.ruin && rng() < 0.18) g.set(x, y, z, R.ruinDark)
  })
  // 금
  for (const [x, y] of [[5, 4], [5, 5], [6, 6], [5, 13], [6, 14], [10, 21], [11, 22], [23, 9], [22, 10]] as const) g.set(x, y, 5, R.crack)
  // 부러져 떨어진 돌
  g.box(20, 0, 6, 23, 1, 7, R.ruinDark)
  g.box(25, 0, 0, 27, 2, 1, R.ruin)
  return g
}

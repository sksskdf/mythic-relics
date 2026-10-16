import { createRng } from '../../world/rng'
import { VoxelGrid } from '../VoxelGrid'

export const PROP_COLORS = {
  snow: 0xf0f4f8,
  snowShade: 0xd3dde8,
  snowBlue: 0xbccbdc,
  pine: 0x2f5d4b,
  pineDark: 0x234838,
  pineLight: 0x3c6e57,
  trunk: 0x5b4636,
  trunkDark: 0x46362a,
  deadWood: 0x725d4c,
  deadWoodDark: 0x58473a,
  rock: 0x7f8996,
  rockDark: 0x626b77,
  rockLight: 0x98a2ad,
  bush: 0x4a5e3c,
  bushDark: 0x3b4c30,
  berry: 0xc23a40,
  ruin: 0xaba295,
  ruinDark: 0x8a8175,
  ruinMoss: 0x78806a,
  stoneDark: 0x555d68,
  rune: 0x6fe3ff,
  runeCore: 0xd8fbff,
  iron: 0x3f3b3b,
  ironLight: 0x5a5452,
  ember: 0xd2552a,
  fire: 0xffa63d,
  fireCore: 0xfff0a0,
}

const C = PROP_COLORS

function pick<T>(rng: () => number, items: readonly T[]): T {
  return items[Math.floor(rng() * items.length)]!
}

/** 침엽수 (칸 0.2m). 층층이 쌓인 가지 위에 눈이 덮여 있다. */
export function pineTree(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(15, 23, 15)
  const cx = 7.5
  g.column(cx, cx, 0, 5, 1.1, 0.9, (x, y) => ((x + y) % 3 === 0 ? C.trunkDark : C.trunk))
  const tiers: [number, number, number][] = [
    [3, 6, 6.8],
    [7, 6, 5.3],
    [11, 5, 4],
    [15, 4, 2.7],
    [18, 3, 1.5],
  ]
  for (const [y0, height, radius] of tiers) {
    const wobble = 0.8 + rng() * 0.4
    g.column(cx, cx, y0, y0 + height - 1, radius * wobble, 0.6, () => pick(rng, [C.pine, C.pine, C.pineDark, C.pineLight]))
  }
  // 눈은 각 층의 윗부분(가지 끝 안쪽)에만 듬성듬성 쌓인다.
  g.paintTops((x, _y, z, hex) => {
    if (hex === C.trunk || hex === C.trunkDark) return null
    const inner = Math.hypot(x + 0.5 - cx, z + 0.5 - cx)
    return rng() < (inner < 2.5 ? 0.7 : 0.28) ? (rng() < 0.7 ? C.snow : C.snowShade) : null
  })
  g.set(7, 21, 7, C.snow)
  return g
}

/** 고목 (칸 0.12m). 껍질이 벗겨진 줄기와 앙상한 가지 */
export function deadTree(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(15, 22, 15)
  const cx = 7.5
  g.column(cx, cx, 0, 15, 1.5, 0.6, () => (rng() < 0.3 ? C.deadWoodDark : C.deadWood))
  const branches = 3 + Math.floor(rng() * 2)
  for (let i = 0; i < branches; i++) {
    const y = 7 + Math.floor(rng() * 8)
    const angle = rng() * Math.PI * 2
    const len = 4 + rng() * 3
    const ex = Math.round(7 + Math.cos(angle) * len)
    const ez = Math.round(7 + Math.sin(angle) * len)
    const ey = Math.min(21, y + 2 + Math.floor(rng() * 4))
    g.line(7, y, 7, ex, ey, ez, C.deadWood)
    g.set(ex, ey + 1, ez, rng() < 0.5 ? C.snow : C.deadWoodDark)
  }
  g.set(7, 16, 7, C.deadWoodDark)
  return g
}

/** 바위 (칸 0.15m). 큰 바위 옆에 작은 바위가 붙어 있고, 윗면에 눈이 쌓였다. */
export function rock(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(15, 9, 12)
  const stone = () => pick(rng, [C.rock, C.rock, C.rockDark, C.rockLight])
  g.ellipsoid(6.5, 2.5, 5.5, 5.5 + rng(), 3.8, 4.5, stone)
  g.ellipsoid(11.5, 1.2, 8.5, 2.2, 1.8, 2.2, () => C.rockDark)
  // 모서리를 조금씩 깎아 거친 느낌을 낸다.
  g.forEach((x, y, z) => {
    const exposed = !g.get(x + 1, y, z) || !g.get(x - 1, y, z) || !g.get(x, y, z + 1) || !g.get(x, y, z - 1)
    if (exposed && y > 1 && rng() < 0.12) g.set(x, y, z, null)
  })
  g.paintTops((_x, y, _z) => (y >= 5 && rng() < 0.55 ? C.snow : null))
  return g
}

/** 덤불 (칸 0.12m). 붉은 열매가 박혀 있다. */
export function bush(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(12, 8, 12)
  const leaf = () => (rng() < 0.3 ? C.bushDark : C.bush)
  g.ellipsoid(6, 3, 6, 4, 3, 4, leaf)
  g.ellipsoid(3.5 + rng(), 2, 7, 2.5, 2, 2.5, leaf)
  g.ellipsoid(8.5, 2, 4 + rng(), 2.5, 2, 2.5, leaf)
  g.forEach((x, y, z, hex) => {
    if ((hex === C.bush || hex === C.bushDark) && rng() < 0.06) g.set(x, y, z, C.berry)
  })
  g.paintTops((_x, y) => (y >= 5 && rng() < 0.4 ? C.snow : null))
  return g
}

/** 눈 둔덕 (칸 0.2m) */
export function snowMound(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(16, 4, 12)
  g.ellipsoid(8, 0, 6, 7 + rng(), 3, 5, () => (rng() < 0.25 ? C.snowShade : C.snow))
  return g
}

/** 무너진 석조 유적 (칸 0.15m). 기둥 세 개와 걸쳐진 상인방, 굴러떨어진 돌덩이 */
export function ruin(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(18, 19, 8)
  const stone = () => pick(rng, [C.ruin, C.ruin, C.ruin, C.ruinDark, C.ruinMoss])
  const pillars: [number, number][] = [
    [0, 16],
    [7, 9],
    [14, 5],
  ]
  for (const [x0, h] of pillars) {
    g.box(x0, 0, 1, x0 + 3, h - 1, 4, C.ruin)
    g.forEach((x, y, z) => {
      if (x < x0 || x > x0 + 3 || y >= h) return
      g.set(x, y, z, stone())
    })
    // 기둥 띠
    g.box(x0, 0, 1, x0 + 3, 0, 4, C.ruinDark)
  }
  // 상인방: 첫 기둥 위에 걸쳐 있다.
  g.box(0, 16, 1, 9, 17, 4, C.ruin)
  g.forEach((x, y, z, hex) => {
    if (y >= 16 && hex === C.ruin && rng() < 0.3) g.set(x, y, z, C.ruinDark)
  })
  // 굴러떨어진 돌덩이
  g.box(10, 0, 5, 13, 1, 7, C.ruinDark)
  g.box(11, 2, 5, 12, 2, 6, C.ruin)
  // 모서리 풍화
  g.forEach((x, y, z) => {
    const corner = (x % 7 === 0 || x % 7 === 3) && (z === 1 || z === 4)
    if (corner && y > 1 && rng() < 0.25) g.set(x, y, z, null)
  })
  g.paintTops(() => (rng() < 0.85 ? C.snow : null))
  return g
}

/** 룬석 받침 (칸 0.12m). 빛나는 룬은 runestoneGlyph()로 따로 그린다. */
export function runestone(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(7, 17, 4)
  g.box(0, 0, 0, 5, 15, 2, C.stoneDark)
  g.forEach((x, y, z) => {
    if (rng() < 0.2) g.set(x, y, z, C.rockDark)
  })
  // 윗부분을 둥글게
  for (const [x, y] of [[0, 15], [5, 15], [0, 14], [5, 14], [1, 15], [4, 15]] as const) g.box(x, y, 0, x, y, 2, null)
  g.paintTops(() => (rng() < 0.7 ? C.snow : null))
  return g
}

/** 룬석 앞면에 새겨진 빛나는 룬 (룬석과 같은 격자 크기) */
export function runestoneGlyph(seed: number): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(7, 17, 4)
  const z = 3
  // 세로획
  g.box(2, 3, z, 2, 12, z, C.rune)
  // 가지 획 (룬 문자처럼)
  const style = Math.floor(rng() * 3)
  if (style === 0) g.line(2, 12, z, 4, 10, z, C.rune)
  if (style === 1) g.line(2, 9, z, 4, 11, z, C.rune)
  g.line(2, 7, z, 4, 5, z, C.rune)
  if (style === 2) g.line(2, 11, z, 4, 11, z, C.rune)
  g.set(2, 8, z, C.runeCore)
  return g
}

/** 화로 받침 (칸 0.1m) */
export function brazier(): VoxelGrid {
  const g = new VoxelGrid(9, 12, 9)
  g.column(4.5, 4.5, 0, 0, 3, 3, C.iron)
  g.column(4.5, 4.5, 1, 7, 1, 1, C.iron)
  g.column(4.5, 4.5, 8, 10, 2.5, 4.2, (_x, y) => (y === 10 ? C.ironLight : C.iron))
  g.column(4.5, 4.5, 10, 10, 3, 3, (x, _y, z) => ((x + z) % 2 ? C.ember : C.iron))
  return g
}

/** 화로의 불꽃 (칸 0.1m). 바닥 가운데가 원점 */
export function flame(): VoxelGrid {
  const g = new VoxelGrid(7, 9, 7)
  g.column(3.5, 3.5, 0, 6, 3.2, 0.8, C.fire)
  g.column(3.5, 3.5, 0, 4, 1.8, 0.6, C.fireCore)
  g.set(3, 7, 3, C.fire)
  g.set(4, 8, 2, C.fire)
  return g
}

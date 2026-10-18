import { VoxelGrid } from '../VoxelGrid'
import { HERO_COLORS } from './hero'

/**
 * 외형 생성기 (E6-11): 클래스 20개의 외형을 손으로 하나씩 찍지 않고, 부품을 골라 색을 입혀 만든다.
 * 규격은 looks.ts와 같다. (머리 12×12×9, 몸 10×9×7, 망토 8×12×1, 팔 4×8×4, 다리 3×9×4, 허리 12×3×9, 얼굴 8×8×1, 무기는 쥐는 곳이 원점)
 * 대표 부위는 E9에서 손으로 다듬는다.
 */

const C = HERO_COLORS

/** 한 칸 색 바꾸기를 줄이려고 */
type Hex = number

/** 격자 위에 두께 있는 선을 긋는다. (z 한 장) */
function line(g: VoxelGrid, x0: number, y0: number, x1: number, y1: number, z: number, hex: Hex, thick = 1): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps)
    const y = Math.round(y0 + ((y1 - y0) * i) / steps)
    for (let t = 0; t < thick; t++) g.set(x + t, y, z, hex)
  }
}

/** 어둡게 / 밝게 */
export function shade(hex: Hex, k: number): Hex {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * k)))
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * k)))
  const b = Math.min(255, Math.max(0, Math.round((hex & 255) * k)))
  return (r << 16) | (g << 8) | b
}

// ───────────────────────────── 머리 ─────────────────────────────

export interface HeadSpec {
  hair: Hex
  /** 머리 모양 */
  style: 'short' | 'long' | 'bun' | 'wild' | 'bald' | 'topknot'
  /** 피부 (도깨비는 붉게, 용왕은 푸르스름하게) */
  skin?: Hex
  beard?: Hex
  /** 머리 위에 쓰는 것 */
  gear?: 'crown' | 'circlet' | 'helm' | 'hood' | 'hat' | 'laurel' | 'veil' | 'band'
  gearColor?: Hex
  gearAccent?: Hex
  /** 뿔·귀·날개 */
  horns?: 'curved' | 'single' | 'antlers' | 'dragon' | 'wings' | 'feathers' | 'ears'
  hornColor?: Hex
  /** 한쪽 눈 가리개 (오딘) */
  eyepatch?: boolean
}

function face(g: VoxelGrid, skin: Hex): void {
  const dark = shade(skin, 0.85)
  g.box(3, 2, 1, 8, 7, 6, skin)
  g.box(3, 2, 1, 8, 7, 1, dark)
  g.set(4, 5, 6, C.eye)
  g.set(7, 5, 6, C.eye)
  g.box(5, 4, 7, 6, 4, 7, dark)
}

export function head(spec: HeadSpec): VoxelGrid {
  const g = new VoxelGrid(12, 12, 9)
  face(g, spec.skin ?? C.skin)
  const hair = spec.hair
  const hairDark = shade(hair, 0.8)
  const gear = spec.gearColor ?? C.gold
  const accent = spec.gearAccent ?? 0xffffff
  // 머리카락
  if (spec.style !== 'bald') {
    g.box(2, 6, 0, 9, 8, 5, hair)
    g.box(3, 8, 1, 8, 8, 6, hair)
    g.box(3, 1, 0, 8, 5, 0, hairDark)
  }
  if (spec.style === 'long') {
    g.box(2, 1, 0, 2, 6, 3, hair)
    g.box(9, 1, 0, 9, 6, 3, hair)
    g.box(3, 0, 0, 8, 5, 0, hair)
  }
  if (spec.style === 'bun') {
    g.box(4, 9, 1, 7, 10, 3, hair)
    g.box(5, 11, 2, 6, 11, 2, hairDark)
  }
  if (spec.style === 'topknot') {
    g.box(5, 9, 2, 6, 10, 3, hair)
    g.box(5, 10, 2, 6, 10, 3, gear)
  }
  if (spec.style === 'wild') {
    for (const [x, z, h] of [[2, 1, 9], [4, 0, 10], [6, 2, 10], [8, 1, 9], [9, 4, 9], [3, 5, 9], [7, 5, 10]] as const) g.box(x, 8, z, x, h, z, hair)
  }
  // 수염
  if (spec.beard !== undefined) {
    g.box(3, 2, 6, 8, 3, 7, spec.beard)
    g.box(3, 3, 6, 3, 4, 6, spec.beard)
    g.box(8, 3, 6, 8, 4, 6, spec.beard)
    g.box(4, 0, 7, 7, 1, 7, spec.beard)
    g.box(5, 0, 8, 6, 0, 8, shade(spec.beard, 0.8))
  }
  if (spec.eyepatch) {
    g.set(4, 5, 6, 0x1c1416)
    g.set(4, 5, 7, 0x1c1416)
    line(g, 2, 7, 9, 4, 6, 0x1c1416)
  }
  // 쓰는 것
  switch (spec.gear) {
    case 'crown':
      g.box(2, 7, 1, 9, 7, 6, gear)
      for (const x of [3, 5, 6, 8]) g.box(x, 8, 6, x, 9, 6, gear)
      for (const x of [2, 9]) g.box(x, 8, 1, x, 9, 5, gear)
      g.set(5, 7, 7, accent)
      g.set(6, 7, 7, accent)
      break
    case 'circlet':
      g.box(2, 7, 1, 9, 7, 6, gear)
      g.set(5, 7, 7, accent)
      g.set(6, 7, 7, accent)
      break
    case 'band':
      g.box(2, 6, 1, 9, 6, 6, gear)
      g.box(1, 3, 0, 1, 6, 1, gear)
      break
    case 'helm':
      g.box(2, 6, 0, 9, 6, 7, shade(gear, 0.75))
      g.box(3, 7, 1, 8, 8, 6, gear)
      g.box(4, 9, 2, 7, 9, 5, gear)
      g.box(5, 10, 1, 6, 10, 6, accent)
      g.box(5, 4, 7, 6, 5, 7, shade(gear, 0.75))
      break
    case 'hood':
      g.box(2, 3, 0, 9, 9, 6, gear)
      g.box(2, 3, 0, 9, 3, 6, shade(gear, 0.8))
      face(g, spec.skin ?? C.skin)
      g.box(2, 8, 6, 9, 8, 7, shade(gear, 0.8))
      break
    case 'hat':
      g.box(0, 8, 0, 11, 8, 8, gear)
      g.box(3, 9, 2, 8, 10, 6, gear)
      g.box(3, 9, 2, 8, 9, 6, accent)
      g.box(4, 11, 3, 7, 11, 5, shade(gear, 0.85))
      break
    case 'laurel':
      for (let x = 2; x <= 9; x++) g.set(x, 7, 6, x % 2 ? 0x6fbf4a : 0x4f9a3a)
      for (const x of [2, 9]) g.box(x, 7, 2, x, 7, 5, 0x6fbf4a)
      break
    case 'veil':
      g.box(2, 7, 0, 9, 9, 5, gear)
      g.box(1, 1, 0, 1, 8, 4, gear)
      g.box(10, 1, 0, 10, 8, 4, gear)
      g.box(2, 0, 0, 9, 7, 0, shade(gear, 0.9))
      g.box(2, 7, 6, 9, 7, 6, accent)
      break
  }
  // 뿔·귀·날개
  const horn = spec.hornColor ?? C.gold
  switch (spec.horns) {
    case 'curved':
      for (const x of [3, 8] as const) {
        g.box(x, 8, 4, x, 9, 4, horn)
        g.set(x, 10, 3, horn)
        g.box(x, 11, 1, x, 11, 2, horn)
      }
      break
    case 'single':
      g.box(5, 9, 4, 6, 10, 5, horn)
      g.box(5, 11, 4, 5, 11, 4, horn)
      break
    case 'antlers':
      for (const [x, dir] of [[2, -1], [9, 1]] as const) {
        g.box(x, 8, 3, x, 10, 3, horn)
        g.set(x + dir, 10, 3, horn)
        g.set(x + dir, 11, 2, horn)
        g.set(x, 11, 4, horn)
      }
      break
    case 'dragon':
      for (const x of [3, 8] as const) {
        g.box(x, 9, 3, x, 11, 3, horn)
        g.set(x, 10, 4, horn)
      }
      // 수염 같은 용의 긴 수염
      g.box(2, 0, 6, 2, 4, 6, horn)
      g.box(9, 0, 6, 9, 4, 6, horn)
      break
    case 'wings':
      for (const [inner, outer] of [[2, 1], [9, 10]] as const) {
        const edge = inner === 2 ? 0 : 11
        g.box(inner, 7, 2, inner, 8, 4, horn)
        g.box(outer, 8, 1, outer, 10, 3, horn)
        g.box(edge, 10, 0, edge, 11, 2, horn)
      }
      break
    case 'feathers':
      for (const [x, h] of [[4, 11], [5, 11], [6, 11], [7, 11], [3, 10], [8, 10]] as const) g.box(x, 9, 2, x, h, 2, x % 2 ? horn : shade(horn, 0.75))
      break
    case 'ears':
      g.box(1, 5, 2, 1, 7, 3, horn)
      g.box(10, 5, 2, 10, 7, 3, horn)
      break
  }
  return g
}

// ───────────────────────────── 몸 ─────────────────────────────

export interface TorsoSpec {
  kind: 'robe' | 'armor' | 'tunic' | 'dress' | 'fur'
  main: Hex
  dark?: Hex
  trim?: Hex
  /** 무늬 */
  pattern?: 'sash' | 'belt' | 'scales' | 'emblem' | 'dots' | 'cross'
  accent?: Hex
}

export function torso(spec: TorsoSpec): VoxelGrid {
  const g = new VoxelGrid(10, 9, 7)
  const main = spec.main
  const dark = spec.dark ?? shade(main, 0.75)
  const trim = spec.trim ?? C.gold
  const accent = spec.accent ?? trim
  switch (spec.kind) {
    case 'robe':
      g.box(0, 0, 0, 9, 1, 6, main)
      g.box(1, 2, 1, 8, 7, 5, main)
      g.box(0, 0, 0, 9, 0, 6, trim)
      g.box(0, 6, 1, 9, 7, 5, dark)
      g.box(2, 8, 1, 7, 8, 4, dark)
      g.box(4, 1, 6, 5, 7, 6, trim)
      break
    case 'armor':
      g.box(1, 0, 1, 8, 7, 5, main)
      g.box(0, 6, 0, 9, 7, 6, dark)
      g.box(0, 7, 0, 9, 7, 6, trim)
      for (let y = 1; y <= 5; y += 2) g.box(1, y, 6, 8, y, 6, dark)
      g.box(3, 8, 2, 6, 8, 4, dark)
      break
    case 'tunic':
      g.box(0, 0, 0, 9, 1, 6, main)
      g.box(1, 2, 1, 8, 7, 5, main)
      g.box(0, 0, 0, 9, 0, 6, dark)
      g.box(0, 6, 1, 9, 7, 5, main)
      g.box(3, 8, 2, 6, 8, 4, trim)
      break
    case 'dress':
      g.box(0, 0, 0, 9, 2, 6, main)
      g.box(2, 3, 1, 7, 7, 5, main)
      g.box(0, 0, 0, 9, 0, 6, trim)
      g.box(1, 6, 1, 8, 7, 5, main)
      g.box(3, 8, 2, 6, 8, 4, trim)
      g.box(2, 3, 6, 7, 3, 6, trim)
      break
    case 'fur':
      g.box(1, 0, 1, 8, 6, 5, main)
      g.box(0, 0, 0, 9, 0, 6, dark)
      g.box(0, 6, 0, 9, 8, 6, C.fur)
      g.box(0, 6, 0, 9, 6, 6, C.furShade)
      break
  }
  switch (spec.pattern) {
    case 'sash':
      for (let i = 0; i <= 5; i++) g.set(8 - i, 7 - i, 6, accent)
      break
    case 'belt':
      g.box(1, 2, 1, 8, 2, 5, C.leatherDark)
      g.box(1, 2, 6, 8, 2, 6, accent)
      break
    case 'scales':
      g.forEach((x, y, z, hex) => {
        if (z === 6 && hex === main && (x + y) % 2 === 0) g.set(x, y, z, dark)
      })
      break
    case 'emblem':
      g.box(4, 4, 6, 5, 5, 6, accent)
      break
    case 'dots':
      g.forEach((x, y, z, hex) => {
        if (z >= 5 && hex === main && (x * 3 + y * 5) % 7 === 0) g.set(x, y, z, accent)
      })
      break
    case 'cross':
      g.box(4, 1, 6, 5, 7, 6, accent)
      g.box(1, 4, 6, 8, 4, 6, accent)
      break
  }
  return g
}

// ───────────────────────────── 망토 ─────────────────────────────

export interface CapeSpec {
  kind: 'cape' | 'tattered' | 'stars' | 'ribbons' | 'feathers' | 'short'
  main: Hex
  dark?: Hex
  trim?: Hex
}

export function cape(spec: CapeSpec): VoxelGrid {
  const g = new VoxelGrid(8, 12, 1)
  const main = spec.main
  const dark = spec.dark ?? shade(main, 0.75)
  const trim = spec.trim ?? C.gold
  if (spec.kind === 'ribbons') {
    // 어깨에서 늘어진 비단 띠 둘 (나타의 혼천릉, 선녀의 날개옷)
    for (const [x, sway] of [[1, -1], [6, 1]] as const) {
      for (let y = 0; y <= 11; y++) g.set(Math.max(0, Math.min(7, x + (y < 6 ? sway * (y % 2) : 0))), y, 0, y % 4 === 0 ? dark : main)
    }
    g.box(1, 11, 0, 6, 11, 0, trim)
    return g
  }
  const top = spec.kind === 'short' ? 5 : 0
  g.box(0, top, 0, 7, 11, 0, main)
  g.box(0, top, 0, 0, 11, 0, dark)
  g.box(7, top, 0, 7, 11, 0, dark)
  g.set(0, 11, 0, trim)
  g.set(7, 11, 0, trim)
  if (spec.kind === 'tattered') for (const x of [1, 3, 4, 6]) g.set(x, 0, 0, null), g.set(x, 1, 0, x % 3 === 0 ? null : dark)
  if (spec.kind === 'stars') for (const [x, y] of [[2, 3], [5, 6], [3, 9], [6, 2], [1, 7]] as const) g.set(x, y, 0, trim)
  if (spec.kind === 'feathers') for (let y = top; y <= 10; y += 2) for (let x = (y / 2) % 2; x <= 7; x += 2) g.set(x, y, 0, dark)
  return g
}

// ───────────────────────────── 무기 (쥐는 곳이 원점 근처: x 가운데, y 5, z 0~2) ─────────────────────────────

export interface WeaponSpec {
  kind: 'spear' | 'trident' | 'bident' | 'staff' | 'bow' | 'pole' | 'sword' | 'club' | 'fan' | 'mirror' | 'mallet' | 'bolt' | 'scepter' | 'flower'
  shaft?: Hex
  head?: Hex
  accent?: Hex
}

export function weapon(spec: WeaponSpec): VoxelGrid {
  const shaft = spec.shaft ?? C.wood
  const head = spec.head ?? C.ironEdge
  const accent = spec.accent ?? C.gold
  switch (spec.kind) {
    case 'spear': {
      const g = new VoxelGrid(2, 7, 20)
      g.box(0, 5, 0, 1, 5, 16, shaft)
      g.box(0, 4, 16, 1, 6, 16, accent)
      g.box(0, 4, 17, 1, 6, 18, head)
      g.box(0, 5, 19, 1, 5, 19, head)
      return g
    }
    case 'trident':
    case 'bident': {
      const g = new VoxelGrid(2, 11, 20)
      g.box(0, 5, 0, 1, 5, 15, shaft)
      g.box(0, 2, 15, 1, 8, 15, head)
      const prongs = spec.kind === 'trident' ? [2, 5, 8] : [3, 7]
      for (const y of prongs) g.box(0, y, 16, 1, y, 19, head)
      g.box(0, 5, 14, 1, 5, 14, accent)
      return g
    }
    case 'staff':
    case 'flower':
    case 'scepter': {
      const g = new VoxelGrid(3, 9, 18)
      g.box(1, 5, 0, 1, 5, 13, shaft)
      if (spec.kind === 'staff') {
        g.box(0, 3, 14, 2, 7, 14, accent)
        g.box(1, 3, 15, 1, 7, 16, head)
        g.box(0, 4, 17, 2, 6, 17, head)
      } else if (spec.kind === 'flower') {
        for (const [y, z] of [[5, 17], [3, 15], [7, 15], [4, 14], [6, 14], [5, 16]] as const) g.box(0, y, z, 2, y, z, y === 5 && z === 16 ? accent : head)
      } else {
        g.box(0, 4, 14, 2, 6, 16, head)
        g.set(1, 5, 17, accent)
        g.box(0, 5, 13, 2, 5, 13, accent)
      }
      return g
    }
    case 'bow': {
      const g = new VoxelGrid(2, 13, 5)
      for (let y = 0; y <= 12; y++) {
        const bend = Math.round(3 * Math.sin((y / 12) * Math.PI))
        g.set(0, y, 1 + bend, shaft)
        g.set(1, y, 1 + bend, shaft)
      }
      g.box(0, 0, 1, 0, 12, 1, 0xf2f4e8)
      g.box(0, 5, 4, 1, 7, 4, accent)
      return g
    }
    case 'pole': {
      const g = new VoxelGrid(2, 7, 20)
      g.box(0, 5, 0, 1, 5, 19, shaft)
      g.box(0, 5, 0, 1, 5, 1, accent)
      g.box(0, 5, 18, 1, 5, 19, accent)
      g.box(0, 4, 18, 1, 6, 18, accent)
      return g
    }
    case 'sword': {
      const g = new VoxelGrid(2, 7, 13)
      g.box(0, 5, 0, 1, 5, 2, shaft)
      g.box(0, 4, 3, 1, 6, 3, accent)
      g.box(0, 5, 4, 1, 5, 12, head)
      g.box(0, 6, 4, 1, 6, 11, shade(head, 1.2))
      return g
    }
    case 'club': {
      const g = new VoxelGrid(4, 9, 11)
      g.box(1, 5, 0, 2, 5, 4, shaft)
      g.box(0, 3, 5, 3, 7, 10, head)
      g.box(0, 3, 5, 3, 3, 10, shade(head, 0.8))
      for (const [y, z] of [[7, 6], [7, 9], [5, 10], [3, 8]] as const) g.box(0, y, z, 3, y, z, accent)
      return g
    }
    case 'fan': {
      const g = new VoxelGrid(2, 11, 10)
      g.box(0, 5, 0, 1, 5, 3, shaft)
      for (let z = 4; z <= 9; z++) {
        const spread = z - 3
        g.box(0, Math.max(0, 5 - spread), z, 0, Math.min(10, 5 + spread), z, z % 2 ? head : shade(head, 0.85))
      }
      g.box(1, 0, 9, 1, 10, 9, accent)
      return g
    }
    case 'mirror': {
      const g = new VoxelGrid(2, 11, 11)
      g.box(0, 5, 0, 1, 5, 3, shaft)
      for (let y = 0; y <= 10; y++) for (let z = 3; z <= 10; z++) {
        const d = Math.hypot(y - 5, z - 6.5)
        if (d <= 4) g.set(0, y, z, d > 3.2 ? accent : head)
      }
      return g
    }
    case 'mallet': {
      const g = new VoxelGrid(4, 9, 10)
      g.box(1, 5, 0, 2, 5, 6, shaft)
      g.box(0, 3, 7, 3, 7, 9, head)
      g.box(0, 5, 7, 3, 5, 9, accent)
      return g
    }
    case 'bolt': {
      const g = new VoxelGrid(2, 9, 16)
      g.box(0, 5, 0, 1, 5, 3, accent)
      const zig: [number, number][] = [[5, 4], [6, 6], [4, 8], [6, 10], [4, 12], [5, 14], [5, 15]]
      for (let i = 0; i < zig.length - 1; i++) {
        const [y0, z0] = zig[i]!
        const [y1, z1] = zig[i + 1]!
        for (let t = 0; t <= 2; t++) g.set(0, Math.round(y0 + ((y1 - y0) * t) / 2), Math.round(z0 + ((z1 - z0) * t) / 2), head), g.set(1, Math.round(y0 + ((y1 - y0) * t) / 2), Math.round(z0 + ((z1 - z0) * t) / 2), head)
      }
      return g
    }
  }
}

// ───────────────────────────── 유물 부위: 허리 12×3×9, 팔 4×8×4, 얼굴 8×8×1, 다리 3×9×4 ─────────────────────────────

export interface GearSpec {
  kind: 'belt' | 'sash' | 'gourd' | 'bracers' | 'rings' | 'mask' | 'eyepatch' | 'boots' | 'wheels'
  main: Hex
  accent?: Hex
}

export function gear(spec: GearSpec): VoxelGrid {
  const main = spec.main
  const dark = shade(main, 0.75)
  const accent = spec.accent ?? C.gold
  switch (spec.kind) {
    case 'belt': {
      const g = new VoxelGrid(12, 3, 9)
      g.box(0, 0, 0, 11, 2, 8, dark)
      g.box(0, 1, 0, 11, 1, 8, main)
      g.box(4, 0, 8, 7, 2, 8, accent)
      return g
    }
    case 'sash': {
      const g = new VoxelGrid(12, 3, 9)
      g.box(0, 0, 0, 11, 2, 8, main)
      g.box(0, 1, 0, 11, 1, 8, dark)
      g.box(9, 0, 8, 10, 2, 8, accent)
      return g
    }
    case 'gourd': {
      const g = new VoxelGrid(12, 3, 9)
      g.box(0, 1, 0, 11, 1, 8, C.leatherDark)
      g.box(1, 0, 8, 3, 2, 8, main)
      g.box(2, 2, 8, 2, 2, 8, accent)
      return g
    }
    case 'bracers': {
      const g = new VoxelGrid(4, 8, 4)
      g.box(1, 4, 1, 2, 7, 2, 0xcdb791)
      g.box(0, 0, 0, 3, 4, 3, main)
      g.box(0, 4, 0, 3, 4, 3, accent)
      g.box(0, 0, 0, 3, 0, 3, dark)
      return g
    }
    case 'rings': {
      const g = new VoxelGrid(4, 8, 4)
      g.box(1, 1, 1, 2, 7, 2, 0xcdb791)
      g.box(0, 2, 0, 3, 3, 3, main)
      g.box(1, 2, 1, 2, 3, 2, null as unknown as number)
      g.box(1, 1, 1, 2, 1, 2, 0xcdb791)
      g.set(0, 3, 0, accent)
      return g
    }
    case 'mask': {
      const g = new VoxelGrid(8, 8, 1)
      g.box(1, 0, 0, 6, 5, 0, main)
      g.box(0, 2, 0, 7, 4, 0, main)
      g.set(2, 3, 0, 0x1c1416)
      g.set(5, 3, 0, 0x1c1416)
      g.box(2, 0, 0, 5, 0, 0, dark)
      g.set(1, 6, 0, accent)
      g.set(6, 6, 0, accent)
      return g
    }
    case 'eyepatch': {
      const g = new VoxelGrid(8, 8, 1)
      g.box(1, 3, 0, 3, 4, 0, main)
      line(g, 0, 5, 7, 3, 0, dark)
      g.set(2, 4, 0, accent)
      return g
    }
    case 'boots': {
      const g = new VoxelGrid(3, 9, 4)
      g.box(0, 0, 0, 2, 4, 2, main)
      g.box(0, 0, 3, 2, 1, 3, main)
      g.box(0, 4, 0, 2, 4, 2, accent)
      g.box(0, 5, 0, 2, 8, 2, 0x5d4c3b)
      return g
    }
    case 'wheels': {
      // 발밑에 도는 불 바퀴 (풍화륜): 발 둘레의 고리
      const g = new VoxelGrid(3, 9, 4)
      g.box(0, 2, 0, 2, 8, 2, 0x5d4c3b)
      g.box(0, 0, 0, 2, 1, 3, main)
      g.box(1, 0, 0, 1, 1, 3, accent)
      return g
    }
  }
}

// ───────────────────────────── 표식 (레벨마다 다른 모양) ─────────────────────────────

export interface MarkSpec {
  /**
   * - halo 머리 뒤 고리 (레벨마다 겹이 늘고 Lv4 가시)
   * - rays 해·빛살 (레벨마다 빛살이 길어지고 많아짐)
   * - crescent 초승달 (레벨마다 커지고 별이 붙음)
   * - arc 어깨 위로 둥글게 늘어선 물건 (북·불꽃·구슬·돌·꽃잎·까마귀: 레벨마다 개수가 는다)
   * - tail 꼬리 (레벨마다 길어지고 Lv4 둘)
   * - waves 물결 (레벨마다 물마루가 는다)
   * - wings 날개 (레벨마다 깃이 길어짐)
   */
  kind: 'halo' | 'rays' | 'crescent' | 'arc' | 'tail' | 'waves' | 'wings'
  main: Hex
  light?: Hex
  accent?: Hex
  /** arc에 늘어선 물건 */
  stamp?: 'drum' | 'flame' | 'orb' | 'stone' | 'petal' | 'raven' | 'blade'
}

/** arc의 물건 하나 (가운데 x, y) */
function stamp(g: VoxelGrid, kind: NonNullable<MarkSpec['stamp']>, x: number, y: number, main: Hex, light: Hex, accent: Hex): void {
  switch (kind) {
    case 'drum':
      g.box(x - 1, y - 1, 0, x + 1, y + 1, 1, main)
      g.box(x - 1, y - 1, 2, x + 1, y + 1, 2, light)
      g.set(x, y, 2, accent)
      break
    case 'flame':
      g.box(x - 1, y - 1, 1, x + 1, y, 1, main)
      g.set(x, y + 1, 1, light)
      g.set(x, y - 1, 2, accent)
      break
    case 'orb':
      g.box(x - 1, y - 1, 1, x + 1, y + 1, 1, main)
      g.set(x, y, 2, light)
      break
    case 'stone':
      g.box(x - 1, y - 1, 0, x + 1, y, 2, main)
      g.set(x, y + 1, 1, light)
      break
    case 'petal':
      g.set(x, y, 1, accent)
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) g.set(x + dx, y + dy, 1, main)
      break
    case 'raven':
      g.box(x - 1, y, 1, x + 1, y + 1, 1, main)
      g.set(x - 2, y + 1, 1, main)
      g.set(x + 2, y + 1, 1, main)
      g.set(x + 1, y + 1, 2, accent)
      break
    case 'blade':
      line(g, x, y - 2, x, y + 2, 1, light)
      g.set(x, y - 2, 2, accent)
      break
  }
}

export function mark(spec: MarkSpec, level = 1): VoxelGrid {
  const g = new VoxelGrid(28, 20, 3)
  const main = spec.main
  const light = spec.light ?? shade(main, 1.35)
  const accent = spec.accent ?? 0xffffff
  const cx = 14
  const cy = 9
  switch (spec.kind) {
    case 'halo': {
      for (let ring = 0; ring < Math.min(3, level); ring++) {
        const r = 5 + ring * 2
        const n = 40 + ring * 16
        for (let a = 0; a < n; a++) {
          const t = (a / n) * Math.PI * 2
          g.set(Math.round(cx + Math.cos(t) * r), Math.round(cy + Math.sin(t) * r * 0.9), 1, a % 3 === 0 ? light : main)
        }
      }
      if (level >= 4) for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2
        line(g, Math.round(cx + Math.cos(t) * 10), Math.round(cy + Math.sin(t) * 9), Math.round(cx + Math.cos(t) * 13), Math.round(cy + Math.sin(t) * 10), 0, accent)
      }
      break
    }
    case 'rays': {
      const r0 = 3
      g.box(cx - 2, cy - 2, 1, cx + 2, cy + 2, 2, main)
      g.set(cx, cy, 2, accent)
      const count = 6 + level * 2
      const len = 3 + level * 1.5
      for (let i = 0; i < count; i++) {
        const t = (i / count) * Math.PI * 2
        line(g, Math.round(cx + Math.cos(t) * r0), Math.round(cy + Math.sin(t) * r0), Math.round(cx + Math.cos(t) * (r0 + len)), Math.round(cy + Math.sin(t) * (r0 + len) * 0.9), 1, i % 2 ? light : main)
      }
      break
    }
    case 'crescent': {
      const r = 4 + level
      for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
        const inOuter = x * x + y * y <= r * r
        const inInner = (x - Math.ceil(r * 0.45)) ** 2 + y * y <= (r * 0.8) ** 2
        if (inOuter && !inInner) g.set(cx + x, cy + y, 1, x < -r * 0.5 ? light : main)
      }
      const stars: [number, number][] = [[cx + 8, cy + 6], [cx - 9, cy + 7], [cx + 10, cy - 3], [cx - 11, cy - 4], [cx + 6, cy + 9]]
      for (const [x, y] of stars.slice(0, Math.max(0, level * 2 - 3))) {
        g.set(x, y, 2, accent)
        g.set(x + 1, y, 1, light)
        g.set(x - 1, y, 1, light)
        g.set(x, y + 1, 1, light)
        g.set(x, y - 1, 1, light)
      }
      break
    }
    case 'arc': {
      const count = [2, 3, 5, 7][Math.min(3, level - 1)]!
      const r = 8 + level
      for (let i = 0; i < count; i++) {
        const t = Math.PI * (0.1 + (0.8 * i) / Math.max(1, count - 1))
        stamp(g, spec.stamp ?? 'orb', Math.round(cx + Math.cos(t) * r), Math.round(4 + Math.sin(t) * (r - 2)), main, light, accent)
      }
      if (level >= 4) for (let x = cx - r; x <= cx + r; x += 2) g.set(x, 1, 0, light)
      break
    }
    case 'tail': {
      const tails = level >= 4 ? 2 : 1
      for (let k = 0; k < tails; k++) {
        const side = k === 0 ? 1 : -1
        const len = 8 + level * 2
        for (let i = 0; i < len; i++) {
          const x = cx + side * Math.round(Math.sin(i * 0.45) * (2 + i * 0.25))
          const y = 1 + i
          if (y > 19) break
          g.box(x, y, 1, x + 1, y, 1, i > len - 3 ? light : main)
        }
      }
      break
    }
    case 'waves': {
      const crests = 1 + level
      for (let k = 0; k < crests; k++) {
        const y0 = 2 + k * 4
        for (let x = 2; x <= 25; x++) {
          const y = y0 + Math.round(Math.sin(x * 0.6 + k) * 1.5)
          if (y >= 0 && y < 20) g.set(x, y, 1, (x + k) % 5 === 0 ? light : main)
        }
        if (k === crests - 1) for (let x = 4; x <= 23; x += 5) g.set(x, Math.min(19, y0 + 2), 2, accent)
      }
      break
    }
    case 'wings': {
      const span = 6 + level * 2
      for (const side of [-1, 1] as const) {
        for (let i = 0; i < span; i++) {
          const x = cx + side * (2 + i)
          const top = 4 + Math.round(i * 0.6)
          const bottom = Math.max(1, top - 3 - Math.round(i * 0.3))
          if (x < 0 || x > 27) break
          g.box(x, bottom, 1, x, Math.min(19, top), 1, i % 3 === 0 ? light : main)
        }
      }
      break
    }
  }
  return g
}

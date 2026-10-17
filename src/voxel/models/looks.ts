import { createRng } from '../../world/rng'
import { VoxelGrid } from '../VoxelGrid'
import { HERO_COLORS, heroCape, heroTorso } from './hero'

/**
 * 주인공 외형 모델. (E3, 외형 규칙은 DESIGN.md 8.4)
 * 같은 칸의 모델은 격자 크기와 원점이 같아서 그대로 바꿔 끼울 수 있다.
 * - 머리 12×12×9, 원점 [6, 2, 4] / 몸 10×9×7, 원점 [5, 0, 3.5] / 팔 3×8×3, 원점 [1.5, 8, 1.5]
 * - 다리 3×9×4, 원점 [1.5, 9, 1.5] / 망토 8×12×1, 원점 [4, 12, 1] / 무기는 손으로 쥐는 곳이 원점
 * - 소매는 어느 몸 외형과도 어울리도록 가죽·삼베 같은 수수한 색으로 둔다.
 */

const C = HERO_COLORS
/** 기본 모험가와 발현 외형에 새로 쓰는 색 */
const L = {
  linen: 0xcdb791,
  linenShade: 0xa99470,
  olive: 0x6b7a4a,
  oliveDark: 0x4f5c34,
  hood: 0x7a5a3a,
  hoodDark: 0x5a412a,
  hair: 0x4a3222,
  trousers: 0x5d4c3b,
  wing: 0xf2f4f7,
  wingShade: 0xc5ccd6,
  lokiHair: 0x1d2620,
  lokiGreen: 0x2f6a3a,
  lokiGreenDark: 0x1f4a28,
  lokiGold: 0xe6bd4e,
  mask: 0x5fae4e,
  maskDark: 0x2f6b2a,
  maskEye: 0x1c2a1a,
}

/** 머리의 얼굴 부분: 모든 머리 외형이 같은 자리에 얼굴을 둔다. (y2~7, 앞면 z6) */
function face(g: VoxelGrid): void {
  g.box(3, 2, 1, 8, 7, 6, C.skin)
  g.box(3, 2, 1, 8, 7, 1, C.skinShade)
  g.set(4, 5, 6, C.eye)
  g.set(7, 5, 6, C.eye)
  g.box(5, 4, 7, 6, 4, 7, C.skinShade)
}

// ───────────────────────────── 기본 모험가 ─────────────────────────────

/** 모험가의 두건: 얼굴만 내놓은 갈색 두건, 앞머리가 살짝 나온다. */
export function adventurerHood(): VoxelGrid {
  const g = new VoxelGrid(12, 12, 9)
  g.box(2, 3, 0, 9, 9, 6, L.hood)
  g.box(2, 3, 0, 9, 3, 6, L.hoodDark)
  face(g)
  // 얼굴 위를 덮는 두건 앞단과 앞머리
  g.box(2, 8, 6, 9, 8, 7, L.hoodDark)
  g.box(3, 7, 6, 8, 7, 6, L.hair)
  g.set(4, 6, 6, L.hair)
  g.set(8, 6, 6, L.hair)
  // 둥글게 다듬기
  for (const [x, z] of [[2, 0], [9, 0], [2, 6], [9, 6]] as const) g.set(x, 9, z, null)
  // 뒤로 늘어진 두건 끝
  g.box(5, 4, 0, 6, 6, 0, L.hoodDark)
  return g
}

/** 모험가의 웃옷: 털 장식 없는 올리브색 웃옷, 가죽 띠와 비스듬한 가방끈 */
export function adventurerTunic(): VoxelGrid {
  const g = new VoxelGrid(10, 9, 7)
  g.box(0, 0, 0, 9, 1, 6, L.olive)
  g.box(1, 2, 1, 8, 7, 5, L.olive)
  g.box(0, 0, 0, 9, 0, 6, L.oliveDark)
  g.box(1, 2, 1, 8, 2, 5, C.leatherDark)
  g.set(5, 2, 6, C.iron)
  // 어깨와 목둘레
  g.box(0, 6, 1, 9, 7, 5, L.olive)
  g.box(3, 8, 2, 6, 8, 4, L.linen)
  // 오른쪽 어깨에서 왼쪽 허리로 내려오는 가방끈
  for (let i = 0; i <= 4; i++) g.set(7 - i, 7 - i, 6, C.leather)
  return g
}

/** 모험가의 소매: 삼베 소매와 가죽 장갑 */
export function adventurerSleeves(): VoxelGrid {
  const g = new VoxelGrid(3, 8, 3)
  g.box(0, 3, 0, 2, 7, 2, L.linen)
  g.box(0, 3, 0, 2, 3, 2, L.linenShade)
  g.box(0, 0, 0, 2, 2, 2, C.leather)
  g.box(0, 0, 0, 2, 0, 2, C.leatherDark)
  return g
}

/** 모험가의 장화: 갈색 바지와 목이 긴 장화 */
export function adventurerBoots(): VoxelGrid {
  const g = new VoxelGrid(3, 9, 4)
  g.box(0, 0, 0, 2, 3, 2, C.boots)
  g.box(0, 0, 3, 2, 1, 3, C.boots)
  g.box(0, 3, 0, 2, 3, 2, C.leatherDark)
  g.box(0, 4, 0, 2, 8, 2, L.trousers)
  return g
}

/** 짧은 검: 손잡이가 앞(z+)으로 뻗는다. 손으로 쥐는 곳이 원점 */
export function shortSword(): VoxelGrid {
  const g = new VoxelGrid(2, 7, 11)
  g.box(0, 5, 0, 1, 5, 2, C.leatherDark)
  g.box(0, 4, 3, 1, 6, 3, C.trim)
  g.box(0, 5, 4, 1, 5, 9, C.iron)
  g.box(0, 6, 4, 1, 6, 8, C.ironEdge)
  g.set(0, 5, 10, C.ironEdge)
  g.set(1, 5, 10, C.ironEdge)
  return g
}

// ───────────────────────────── 유물 외형 ─────────────────────────────

/** 묠니르: 짧은 손잡이 끝에 넓은 망치머리. 손으로 쥐는 곳이 원점 */
export function mjolnirHammer(): VoxelGrid {
  const g = new VoxelGrid(4, 9, 11)
  g.box(1, 5, 0, 2, 5, 6, C.wood)
  g.box(1, 5, 0, 2, 5, 1, C.leatherDark)
  g.box(0, 2, 7, 3, 8, 10, C.iron)
  g.box(0, 2, 7, 3, 2, 10, C.helmetDark)
  g.box(0, 8, 7, 3, 8, 10, C.ironEdge)
  g.box(0, 5, 7, 3, 5, 10, C.gold)
  return g
}

/** 메긴교르드: 몸통을 두르는 넓은 허리띠, 앞에 큰 금 버클. 몸통 원점 기준 한 칸 크게 감싼다. */
export function megingjordBelt(): VoxelGrid {
  const g = new VoxelGrid(12, 3, 9)
  g.box(0, 0, 0, 11, 2, 8, C.leatherDark)
  g.box(0, 1, 0, 11, 1, 8, C.leather)
  for (let x = 1; x <= 10; x += 3) g.set(x, 1, 8, C.gold)
  g.box(4, 0, 8, 7, 2, 8, C.gold)
  g.box(5, 1, 8, 6, 1, 8, C.ironEdge)
  return g
}

/** 야른그레이프르: 팔꿈치까지 오는 두툼한 쇠 장갑 (4×8×4, 원점 [2, 8, 2]) */
export function ironGauntlets(): VoxelGrid {
  const g = new VoxelGrid(4, 8, 4)
  g.box(1, 4, 1, 2, 7, 2, L.linen)
  g.box(0, 0, 0, 3, 4, 3, C.iron)
  g.box(0, 4, 0, 3, 4, 3, C.ironEdge)
  g.box(0, 0, 0, 3, 0, 3, C.helmetDark)
  g.set(0, 2, 3, C.ironEdge)
  g.set(3, 2, 3, C.ironEdge)
  return g
}

/** 변신의 가면: 얼굴 앞에 쓰는 뿔 달린 초록 가면 (8×8×1). 머리 앞면 바로 앞에 붙는다. */
export function lokiMaskFace(): VoxelGrid {
  const g = new VoxelGrid(8, 8, 1)
  g.box(1, 0, 0, 6, 5, 0, L.mask)
  g.box(0, 2, 0, 7, 4, 0, L.mask)
  g.box(2, 0, 0, 5, 0, 0, L.maskDark)
  g.set(2, 3, 0, L.maskEye)
  g.set(5, 3, 0, L.maskEye)
  g.set(1, 6, 0, L.mask)
  g.set(6, 6, 0, L.mask)
  g.set(0, 7, 0, L.maskDark)
  g.set(7, 7, 0, L.maskDark)
  return g
}

// ───────────────────────────── 발현: 천둥의 신 ─────────────────────────────

/** 천둥의 날개 투구: 둥근 투구 양옆에 흰 날개, 붉은 수염 */
export function thorHelm(): VoxelGrid {
  const g = new VoxelGrid(12, 12, 9)
  face(g)
  g.box(3, 2, 0, 8, 6, 0, C.beard)
  // 수염
  g.box(3, 2, 6, 8, 3, 7, C.beard)
  g.box(3, 3, 6, 3, 4, 6, C.beard)
  g.box(8, 3, 6, 8, 4, 6, C.beard)
  g.box(4, 3, 7, 7, 3, 7, C.beardDark)
  g.box(5, 0, 7, 6, 1, 7, C.beard)
  g.box(5, 1, 7, 6, 1, 7, C.gold)
  // 투구
  g.box(2, 6, 0, 9, 6, 7, C.helmetDark)
  g.box(3, 7, 1, 8, 8, 6, C.helmet)
  g.box(4, 9, 2, 7, 9, 5, C.helmet)
  g.box(5, 9, 3, 6, 9, 4, C.gold)
  g.box(5, 4, 7, 6, 5, 7, C.helmetDark)
  // 날개: 옆으로 붙어 뒤·위로 펼쳐진다.
  for (const [inner, outer] of [[2, 1], [9, 10]] as const) {
    const edge = inner === 2 ? 0 : 11
    g.box(inner, 7, 2, inner, 8, 4, L.wing)
    g.box(outer, 8, 1, outer, 10, 3, L.wing)
    g.box(outer, 8, 1, outer, 8, 3, L.wingShade)
    g.box(edge, 10, 0, edge, 11, 2, L.wing)
    g.set(edge, 9, 0, L.wingShade)
  }
  return g
}

/** 털 어깨 전투복 (예전 기본 몸) */
export const thorTunic = (): VoxelGrid => heroTorso()
/** 붉은 망토 */
export const thorCape = (): VoxelGrid => heroCape()

// ───────────────────────────── 발현: 변신술사 ─────────────────────────────

/** 뿔 장식 관: 검은 머리에 뒤로 휘어 오르는 금빛 뿔 */
export function lokiCrown(): VoxelGrid {
  const g = new VoxelGrid(12, 12, 9)
  face(g)
  // 눈매를 가늘게
  g.set(4, 5, 6, L.lokiHair)
  g.set(7, 5, 6, L.lokiHair)
  // 머리카락: 위·뒤를 덮고 옆으로 길게 내린다.
  g.box(2, 6, 0, 9, 8, 5, L.lokiHair)
  g.box(3, 8, 1, 8, 8, 6, L.lokiHair)
  g.box(2, 2, 0, 2, 6, 3, L.lokiHair)
  g.box(9, 2, 0, 9, 6, 3, L.lokiHair)
  g.box(3, 1, 0, 8, 5, 0, L.lokiHair)
  // 금 머리띠
  g.box(2, 7, 1, 9, 7, 6, L.lokiGold)
  // 뿔
  for (const x of [3, 8] as const) {
    g.box(x, 8, 4, x, 9, 4, L.lokiGold)
    g.box(x, 10, 3, x, 10, 3, L.lokiGold)
    g.box(x, 11, 1, x, 11, 2, L.lokiGold)
  }
  return g
}

/** 초록 비단옷: 짙은 초록에 금 테두리, 높은 깃 */
export function lokiTunic(seed = 5): VoxelGrid {
  const rng = createRng(seed)
  const g = new VoxelGrid(10, 9, 7)
  g.box(0, 0, 0, 9, 1, 6, L.lokiGreen)
  g.box(1, 2, 1, 8, 7, 5, L.lokiGreen)
  g.box(0, 0, 0, 9, 0, 6, L.lokiGold)
  g.box(0, 6, 1, 9, 7, 5, L.lokiGreenDark)
  g.box(2, 8, 1, 7, 8, 4, L.lokiGreenDark)
  // 가운데 금 여밈선
  g.box(4, 1, 6, 5, 7, 6, L.lokiGold)
  // 비단 결: 군데군데 어둡게
  g.forEach((x, y, z, hex) => {
    if (hex === L.lokiGreen && rng() < 0.15) g.set(x, y, z, L.lokiGreenDark)
  })
  return g
}

/** 초록 망토: 금 걸쇠, 끝이 뾰족하게 갈라진다. */
export function lokiCape(): VoxelGrid {
  const g = new VoxelGrid(8, 12, 1)
  g.box(0, 0, 0, 7, 11, 0, L.lokiGreen)
  g.box(0, 0, 0, 0, 11, 0, L.lokiGreenDark)
  g.box(7, 0, 0, 7, 11, 0, L.lokiGreenDark)
  g.set(0, 11, 0, L.lokiGold)
  g.set(7, 11, 0, L.lokiGold)
  for (const x of [0, 2, 3, 5, 7]) g.set(x, 0, 0, null)
  for (const x of [0, 7]) g.set(x, 1, 0, null)
  return g
}

// ───────────────────────────── 표식 (발현 정체성) ─────────────────────────────

/** 격자 위에 두께 있는 선을 긋는다. (z 한 장) */
function line(g: VoxelGrid, x0: number, y0: number, x1: number, y1: number, z: number, hex: number, thick = 1): void {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1)
  for (let i = 0; i <= steps; i++) {
    const x = Math.round(x0 + ((x1 - x0) * i) / steps)
    const y = Math.round(y0 + ((y1 - y0) * i) / steps)
    for (let t = 0; t < thick; t++) g.set(x + t, y, z, hex)
  }
}

/** 토르의 표식 「벼락 고리」: 머리 뒤에 뜬 들쭉날쭉한 번개 고리 (15×15×1) */
export function thorStormHalo(): VoxelGrid {
  const g = new VoxelGrid(15, 17, 1)
  const c = 7
  for (let a = 0; a < 56; a++) {
    const t = (a / 56) * Math.PI * 2
    // 반지름을 들쭉날쭉하게 해 번개처럼 보이게 한다.
    const r = 6 + (a % 4 === 0 ? 1 : a % 4 === 2 ? -1 : 0)
    g.set(Math.round(c + Math.cos(t) * r), Math.round(c + Math.sin(t) * r), 0, a % 3 === 0 ? 0xffffff : 0x9fe3ff)
  }
  // 고리 위아래로 튀는 짧은 번개
  line(g, 7, 16, 6, 14, 0, 0xffffff)
  line(g, 1, 10, 0, 11, 0, 0x9fe3ff)
  line(g, 13, 10, 14, 11, 0, 0x9fe3ff)
  return g
}

/** 로키의 표식 「어깨의 두 뱀」: 양 어깨에서 솟아 바깥으로 고개를 튼 초록 뱀 둘 (16×12×3) */
export function lokiSerpents(): VoxelGrid {
  const g = new VoxelGrid(16, 12, 3)
  const body = 0x3f8a3a
  const belly = 0xb9d36a
  for (const side of [-1, 1] as const) {
    const base = side < 0 ? 3 : 12
    // S자로 솟는 몸통
    const path: [number, number][] = [[0, 0], [0, 1], [-1, 2], [-1, 3], [0, 4], [1, 5], [1, 6], [0, 7], [-1, 8], [-1, 9]]
    for (const [dx, y] of path) {
      const x = base + dx * side * -1
      g.box(x, y, 1, x + 1, y, 1, body)
      g.set(x, y, 2, belly)
    }
    // 바깥을 보는 머리와 갈라진 혀
    const hx = base + (side < 0 ? -2 : 2)
    g.box(Math.min(hx, base), 10, 0, Math.max(hx, base) + 1, 11, 2, body)
    g.set(hx + (side < 0 ? -1 : 2), 10, 1, 0xd23c3c)
    g.set(base + (side < 0 ? -1 : 2), 11, 2, 0xe6bd4e)
  }
  return g
}

/** 아수라의 표식 「칼을 쥔 여섯 팔」: 등에서 부챗살처럼 뻗은 네 팔이 저마다 칼을 쥐었다 (28×18×3) */
export function asuraArms(): VoxelGrid {
  const g = new VoxelGrid(28, 18, 3)
  const skin = 0x7a2a2a
  const band = 0x1c1416
  const steel = 0xc9d0d8
  const edge = 0xff4a4a
  const arms: [number, number, number, number][] = [
    // 팔꿈치 끝 (x, y), 칼끝 (x, y)
    [7, 9, 0, 17],
    [6, 4, 0, 1],
    [20, 9, 27, 17],
    [21, 4, 27, 1],
  ]
  const root: [number, number] = [14, 6]
  for (const [ex, ey, tx, ty] of arms) {
    line(g, root[0], root[1], ex, ey, 1, skin, 2)
    g.box(ex, ey, 0, ex + 1, ey, 2, band)
    // 칼: 팔 끝에서 칼끝까지 강철, 한 칸 바깥은 붉은 날
    line(g, ex, ey, tx, ty, 1, steel)
    line(g, ex, ey, tx, ty, 2, edge)
  }
  g.box(12, 4, 0, 15, 8, 1, skin)
  return g
}

// ───────────────────────────── 아수라: 모든 부위가 검 ─────────────────────────────

const A = { steel: 0xc9d0d8, steelDark: 0x7d8792, edge: 0xff4a4a, hilt: 0x1c1416, gold: 0xc9a23a, crimson: 0x6a1a22 }

/** 아메노오하바리: 머리 뒤로 칼날이 부챗살처럼 꽂힌 관 */
export function ohabariCrown(): VoxelGrid {
  const g = new VoxelGrid(12, 12, 9)
  face(g)
  g.set(4, 5, 6, A.crimson)
  g.set(7, 5, 6, A.crimson)
  g.box(2, 6, 0, 9, 8, 5, A.hilt)
  g.box(2, 7, 1, 9, 7, 6, A.gold)
  for (const [x, top] of [[3, 10], [5, 11], [6, 11], [8, 10]] as const) {
    g.box(x, 8, 2, x, top, 2, A.steel)
    g.set(x, top, 2, A.edge)
  }
  return g
}

/** 쿠사나기노츠루기: 곧은 양날 검 (손으로 쥐는 곳이 원점) */
export function kusanagiBlade(): VoxelGrid {
  const g = new VoxelGrid(2, 7, 13)
  g.box(0, 5, 0, 1, 5, 2, A.hilt)
  g.box(0, 4, 3, 1, 6, 3, A.gold)
  g.box(0, 5, 4, 1, 5, 12, A.steel)
  g.box(0, 6, 4, 1, 6, 11, 0xe9f4fa)
  g.box(0, 4, 5, 1, 4, 11, A.steelDark)
  return g
}

/** 토츠카노츠루기: 허리에 비스듬히 찬 긴 칼과 붉은 띠 (12×3×9) */
export function totsukaSash(): VoxelGrid {
  const g = new VoxelGrid(12, 3, 9)
  g.box(0, 0, 0, 11, 2, 8, A.crimson)
  g.box(0, 1, 0, 11, 1, 8, A.hilt)
  // 왼쪽 허리에 칼집, 앞으로 칼자루
  g.box(0, 0, 2, 0, 2, 8, A.hilt)
  g.box(1, 2, 7, 2, 2, 8, A.gold)
  return g
}

/** 후츠노미타마: 팔뚝을 덮은 칼날 장갑, 손등에서 칼날이 뻗는다 (4×8×4) */
export function futsuGauntlets(): VoxelGrid {
  const g = new VoxelGrid(4, 8, 4)
  g.box(1, 4, 1, 2, 7, 2, A.crimson)
  g.box(0, 0, 0, 3, 4, 3, A.hilt)
  g.box(0, 4, 0, 3, 4, 3, A.gold)
  g.box(1, 0, 3, 2, 3, 3, A.steel)
  g.set(1, 0, 3, A.edge)
  return g
}

/** 칼날 갑주: 가슴에 엇갈린 칼날, 어깨에 칼날 견갑 */
export function asuraBladeArmor(): VoxelGrid {
  const g = new VoxelGrid(10, 9, 7)
  g.box(0, 0, 0, 9, 1, 6, A.crimson)
  g.box(1, 2, 1, 8, 7, 5, A.hilt)
  g.box(0, 6, 1, 9, 7, 5, A.steelDark)
  for (let i = 0; i <= 5; i++) {
    g.set(2 + i, 2 + i, 6, A.steel)
    g.set(7 - i, 2 + i, 6, A.steel)
  }
  g.set(4, 4, 6, A.edge)
  g.set(5, 4, 6, A.edge)
  g.box(0, 8, 1, 1, 8, 5, A.steel)
  g.box(8, 8, 1, 9, 8, 5, A.steel)
  return g
}

/** 칼날 정강이받이 */
export function asuraBladeGreaves(): VoxelGrid {
  const g = new VoxelGrid(3, 9, 4)
  g.box(0, 0, 0, 2, 2, 3, A.hilt)
  g.box(0, 3, 0, 2, 8, 2, A.crimson)
  g.box(0, 2, 3, 2, 6, 3, A.steel)
  g.set(1, 6, 3, A.edge)
  return g
}

/** 외형 id → 복셀 모델 */
export const LOOK_MODELS: Readonly<Record<string, () => VoxelGrid>> = {
  adventurerHood,
  adventurerTunic,
  adventurerSleeves,
  adventurerBoots,
  shortSword,
  mjolnirHammer,
  megingjordBelt,
  ironGauntlets,
  lokiMaskFace,
  thorHelm,
  thorTunic,
  thorCape,
  lokiCrown,
  lokiTunic,
  lokiCape,
  thorStormHalo,
  lokiSerpents,
  ohabariCrown,
  kusanagiBlade,
  totsukaSash,
  futsuGauntlets,
  asuraBladeArmor,
  asuraBladeGreaves,
  asuraArms,
}

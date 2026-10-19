import * as THREE from 'three'

import type { BodySpec, GiantSpec } from '../data/schema'
import { toonGradient } from '../render/toon'
import { voxelMesh } from '../voxel/mesher'
import { VoxelGrid } from '../voxel/VoxelGrid'
import { createRng } from '../world/rng'
import { buildGiantRig, FROST_COLORS, type GiantRig } from './giantModel'

/**
 * 적 모델 생성기 (E8-03). 몸 종류마다 모양이 확 달라서, 모양만 보고 무엇을 할지 짐작하게 한다.
 * - giant(거인): 서리 거인 모델을 색·머리·든 것만 바꿔 쓴다. 느리고 세게 친다
 * - beast(짐승): 네 발, 낮고 긴 몸. 달려든다 (앞발 = 팔 관절, 뒷발 = 다리 관절)
 * - humanoid(사람): 사람 크기. 방패·지팡이·창
 * - flyer(날개): 날개 = 팔 관절, 떠 있다
 * - spirit(혼령): 떠다니는 불·혼. 팔다리 없음
 * - serpent(뱀): 땅을 기는 긴 몸, 머리를 든다
 * 앞은 +z, 발은 y=0. 관절 이름은 거인과 같아서 Giant의 자세 코드를 함께 쓴다.
 */

export type EnemyRig = GiantRig & { kind: BodySpec['kind'] }

const mix = (a: number, b: number, k: number): number => {
  const ch = (shift: number) => Math.round(((a >> shift) & 255) * (1 - k) + ((b >> shift) & 255) * k)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

function joint(x: number, y: number, z: number, child?: THREE.Object3D): THREE.Group {
  const g = new THREE.Group()
  g.position.set(x, y, z)
  if (child) g.add(child)
  return g
}

interface Parts {
  root: THREE.Group
  body: THREE.Group
  material: THREE.MeshToonMaterial
  mesh: (grid: VoxelGrid, pivot: [number, number, number]) => THREE.Mesh
  s: number
}

function parts(voxelSize: number): Parts {
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() })
  const root = new THREE.Group()
  const body = new THREE.Group()
  root.add(body)
  return { root, body, material, s: voxelSize, mesh: (grid, pivot) => voxelMesh(grid, { voxelSize, pivot }, material) }
}

// ───────────────────────────── 짐승 ─────────────────────────────

function beast(b: BodySpec, p: Parts, rng: () => number): EnemyRig {
  const { s, mesh, body } = p
  const armored = b.head === 'horns' || b.head === 'bull'
  // 몸통: 앞이 높고 뒤로 갈수록 낮아지는 둥근 몸, 배는 그늘색, 등줄기는 어두운 색
  const torso = new VoxelGrid(10, 10, 16)
  torso.ellipsoid(4.5, 4.5, 7.5, 4.4, 3.8, 7.6, (x, y) => {
    if (y < 2.5) return b.shade
    if (y > 6.5 && Math.abs(x - 4.5) < 1.6) return b.dark
    return rng() < 0.05 ? b.shade : b.main
  })
  // 엉덩이 쪽을 깎아 내린다 (뒤가 낮다)
  torso.forEach((x, y, z) => {
    if (z < 5 && y > 6 + z * 0.3) torso.set(x, y, z, null)
  })
  // 목 둘레 갈기
  torso.ellipsoid(4.5, 5.5, 12.5, 4.9, 4.4, 2.6, () => (rng() < 0.3 ? b.dark : b.accent))
  // 갑옷 등: 등줄기를 따라 솟은 돌기
  if (armored) for (let z = 3; z < 12; z += 3) torso.box(4, 8, z, 5, 9, z, b.accent)
  const hipY = 6 * s
  const torsoMesh = mesh(torso, [5, 0, 8])
  torsoMesh.position.y = hipY - 2 * s
  body.add(torsoMesh)
  // 머리: 큰 머리통에 앞으로 내민 주둥이, 빛나는 눈
  const head = new VoxelGrid(8, 8, 9)
  head.box(0, 1, 0, 7, 6, 5, b.main)
  head.box(0, 1, 0, 7, 2, 5, b.shade)
  head.box(2, 1, 6, 5, 3, 8, b.shade)
  head.box(2, 3, 6, 5, 3, 8, b.main)
  head.box(3, 1, 8, 4, 1, 8, b.dark)
  head.set(1, 5, 6, b.eye)
  head.set(6, 5, 6, b.eye)
  head.box(1, 5, 5, 1, 5, 5, b.eye)
  head.box(6, 5, 5, 6, 5, 5, b.eye)
  if (armored) {
    // 뿔: 옆으로 뻗었다가 위로 휜다
    head.box(0, 6, 2, 0, 7, 3, b.accent)
    head.box(7, 6, 2, 7, 7, 3, b.accent)
  } else {
    // 쫑긋한 귀
    head.box(0, 7, 1, 1, 7, 2, b.dark)
    head.box(6, 7, 1, 7, 7, 2, b.dark)
  }
  const headMesh = mesh(head, [4, 0, 1])
  headMesh.position.set(0, hipY + 3 * s, 7 * s)
  body.add(headMesh)
  // 꼬리: 굵고 위로 든다
  const tail = new VoxelGrid(3, 3, 7)
  tail.box(0, 0, 0, 2, 2, 6, b.dark)
  tail.box(0, 0, 0, 2, 2, 1, b.accent)
  const tailMesh = mesh(tail, [1.5, 1.5, 7])
  tailMesh.position.set(0, hipY + 4 * s, -6 * s)
  tailMesh.rotation.x = -0.7
  body.add(tailMesh)
  // 다리 넷: 굵고 발끝이 어둡다. 앞다리는 팔 관절, 뒷다리는 다리 관절
  const legGrid = new VoxelGrid(3, 7, 3)
  legGrid.box(0, 0, 0, 2, 6, 2, b.shade)
  legGrid.box(0, 0, 0, 2, 1, 2, b.dark)
  const leg = () => mesh(legGrid, [1.5, 7, 1.5])
  const leftArm = joint(-3 * s, hipY + s, 5 * s, leg())
  const rightArm = joint(3 * s, hipY + s, 5 * s, leg())
  const leftLeg = joint(-3 * s, hipY + s, -4 * s, leg())
  const rightLeg = joint(3 * s, hipY + s, -4 * s, leg())
  body.add(leftArm, rightArm, leftLeg, rightLeg)
  return { root: p.root, body, leftArm, rightArm, leftLeg, rightLeg, material: p.material, palette: [b.main, b.shade, b.dark, b.accent], kind: 'beast' }
}

// ───────────────────────────── 사람 ─────────────────────────────

function gearGrid(b: BodySpec): { grid: VoxelGrid; pivot: [number, number, number]; left: boolean } | null {
  switch (b.gear) {
    case 'shield': {
      const g = new VoxelGrid(7, 8, 1)
      g.box(0, 0, 0, 6, 7, 0, b.accent)
      g.box(1, 1, 0, 5, 6, 0, b.dark)
      g.box(3, 2, 0, 3, 5, 0, b.accent)
      return { grid: g, pivot: [3.5, 4, -1], left: true }
    }
    case 'staff': {
      const g = new VoxelGrid(3, 16, 3)
      g.box(1, 0, 1, 1, 13, 1, 0x6a4a30)
      g.box(0, 13, 0, 2, 15, 2, b.eye)
      return { grid: g, pivot: [1.5, 6, 1.5], left: false }
    }
    case 'spear': {
      const g = new VoxelGrid(3, 3, 16)
      g.box(1, 1, 0, 1, 1, 12, 0x6a4a30)
      g.box(0, 1, 12, 2, 1, 15, b.accent)
      return { grid: g, pivot: [1.5, 1.5, 4], left: false }
    }
    case 'club': {
      const g = new VoxelGrid(3, 3, 11)
      g.box(1, 1, 0, 1, 1, 6, 0x6a4a30)
      g.box(0, 0, 6, 2, 2, 10, b.dark)
      return { grid: g, pivot: [1.5, 1.5, 1], left: false }
    }
    default:
      return null
  }
}

function humanoid(b: BodySpec, p: Parts): EnemyRig {
  const { s, mesh, body } = p
  const legGrid = new VoxelGrid(3, 7, 3)
  legGrid.box(0, 0, 0, 2, 6, 2, b.dark)
  legGrid.box(0, 0, 0, 2, 0, 2, b.shade)
  const hipY = 7 * s
  const leftLeg = joint(-1.6 * s, hipY, 0, mesh(legGrid, [1.5, 7, 1.5]))
  const rightLeg = joint(1.6 * s, hipY, 0, mesh(legGrid, [1.5, 7, 1.5]))
  const torso = new VoxelGrid(8, 8, 5)
  torso.box(0, 0, 0, 7, 7, 4, b.main)
  torso.box(0, 0, 0, 7, 1, 4, b.shade)
  torso.box(3, 2, 4, 4, 6, 4, b.accent)
  const torsoMesh = mesh(torso, [4, 0, 2.5])
  torsoMesh.position.y = hipY
  const armGrid = new VoxelGrid(2, 7, 2)
  armGrid.box(0, 0, 0, 1, 6, 1, b.main)
  armGrid.box(0, 0, 0, 1, 1, 1, b.shade)
  const shoulderY = hipY + 7 * s
  const leftArm = joint(-5 * s, shoulderY, 0, mesh(armGrid, [1, 7, 1]))
  const rightArm = joint(5 * s, shoulderY, 0, mesh(armGrid, [1, 7, 1]))
  const head = new VoxelGrid(6, 7, 6)
  head.box(0, 0, 0, 5, 5, 5, b.head === 'skull' ? 0xe4dcc6 : b.shade)
  head.set(1, 3, 5, b.eye)
  head.set(4, 3, 5, b.eye)
  if (b.head === 'hood') head.box(0, 4, 0, 5, 6, 5, b.dark), head.box(1, 1, 5, 4, 4, 5, null), head.set(1, 3, 5, b.eye), head.set(4, 3, 5, b.eye)
  if (b.head === 'horns') head.box(0, 6, 2, 0, 6, 3, b.accent), head.box(5, 6, 2, 5, 6, 3, b.accent)
  if (b.head === 'beak') head.box(2, 1, 6, 3, 2, 6, b.accent)
  if (b.head === 'crown') head.box(0, 6, 0, 5, 6, 5, b.accent)
  const headMesh = mesh(head, [3, 0, 3])
  headMesh.position.y = shoulderY + 0.5 * s
  body.add(leftLeg, rightLeg, torsoMesh, leftArm, rightArm, headMesh)
  const gear = gearGrid(b)
  if (gear) {
    const gearMesh = mesh(gear.grid, gear.pivot)
    gearMesh.position.set(0, -6 * s, gear.left ? 1.2 * s : 0.5 * s)
    ;(gear.left ? leftArm : rightArm).add(gearMesh)
  }
  return { root: p.root, body, leftArm, rightArm, leftLeg, rightLeg, material: p.material, palette: [b.main, b.shade, b.accent], kind: 'humanoid' }
}

// ───────────────────────────── 날개 ─────────────────────────────

function flyer(b: BodySpec, p: Parts): EnemyRig {
  const { s, mesh, body } = p
  // 떠 있는 높이: 몸 전체를 들어 올린다
  const lift = 9 * s
  const torso = new VoxelGrid(6, 7, 5)
  torso.box(0, 0, 0, 5, 6, 4, b.main)
  torso.box(1, 0, 4, 4, 4, 4, b.shade)
  const torsoMesh = mesh(torso, [3, 0, 2.5])
  torsoMesh.position.y = lift
  const head = new VoxelGrid(5, 5, 5)
  head.box(0, 0, 0, 4, 4, 4, b.shade)
  head.set(1, 3, 4, b.eye)
  head.set(3, 3, 4, b.eye)
  head.box(1, 1, 5, 3, 2, 5, b.accent)
  if (b.head === 'beak') head.box(2, 1, 5, 2, 1, 5, b.accent)
  const headMesh = mesh(head, [2.5, 0, 2.5])
  headMesh.position.y = lift + 7 * s
  // 날개: 넓은 판
  const wing = new VoxelGrid(10, 2, 6)
  wing.box(0, 0, 0, 9, 1, 5, b.dark)
  wing.box(0, 1, 1, 9, 1, 4, b.main)
  for (let x = 1; x < 10; x += 3) wing.set(x, 0, 0, null)
  const leftArm = joint(-3 * s, lift + 5 * s, 0, mesh(wing, [10, 1, 3]))
  const rightArm = joint(3 * s, lift + 5 * s, 0, mesh(wing, [0, 1, 3]))
  // 발톱 달린 짧은 다리
  const talon = new VoxelGrid(2, 4, 2)
  talon.box(0, 0, 0, 1, 3, 1, b.accent)
  const leftLeg = joint(-1.5 * s, lift, 0, mesh(talon, [1, 4, 1]))
  const rightLeg = joint(1.5 * s, lift, 0, mesh(talon, [1, 4, 1]))
  body.add(torsoMesh, headMesh, leftArm, rightArm, leftLeg, rightLeg)
  return { root: p.root, body, leftArm, rightArm, leftLeg, rightLeg, material: p.material, palette: [b.main, b.dark, b.accent], kind: 'flyer' }
}

// ───────────────────────────── 혼령 ─────────────────────────────

function spirit(b: BodySpec, p: Parts, rng: () => number): EnemyRig {
  const { s, mesh, body } = p
  const lift = 6 * s
  const core = new VoxelGrid(9, 12, 9)
  core.ellipsoid(4.5, 4.5, 4.5, 4.2, 4.2, 4.2, () => (rng() < 0.3 ? b.shade : b.main))
  // 위로 일렁이는 불꼬리
  core.column(4.5, 4.5, 8, 11, 2.4, 0.6, () => (rng() < 0.5 ? b.accent : b.main))
  core.set(3, 5, 8, b.eye)
  core.set(5, 5, 8, b.eye)
  core.box(3, 3, 8, 5, 3, 8, b.dark)
  const coreMesh = mesh(core, [4.5, 0, 4.5])
  coreMesh.position.y = lift
  body.add(coreMesh)
  // 팔다리가 없다 (빈 관절)
  const empty = () => joint(0, lift, 0)
  const leftArm = empty()
  const rightArm = empty()
  const leftLeg = empty()
  const rightLeg = empty()
  body.add(leftArm, rightArm, leftLeg, rightLeg)
  return { root: p.root, body, leftArm, rightArm, leftLeg, rightLeg, material: p.material, palette: [b.main, b.accent, b.eye], kind: 'spirit' }
}

// ───────────────────────────── 뱀 ─────────────────────────────

function serpent(b: BodySpec, p: Parts, heads = 1): EnemyRig {
  const { s, mesh, body } = p
  // 땅을 기는 몸: 뒤로 갈수록 가늘어지는 마디 다섯
  for (let i = 0; i < 5; i++) {
    const r = 4 - i * 0.5
    const seg = new VoxelGrid(9, 7, 6)
    seg.ellipsoid(4.5, 3, 3, r, r * 0.7, 3, (_x, y) => (y < 2 ? b.shade : b.main))
    seg.forEach((x, y, z, hex) => {
      if (hex === b.main && y > 3 && (x + z) % 3 === 0) seg.set(x, y, z, b.accent)
    })
    const m = mesh(seg, [4.5, 0, 3])
    m.position.set(Math.sin(i * 1.3) * 1.5 * s, 0, -i * 5 * s)
    body.add(m)
  }
  // 고개를 든 머리
  const head = new VoxelGrid(8, 6, 8)
  head.box(0, 0, 0, 7, 4, 6, b.main)
  head.box(1, 0, 6, 6, 2, 7, b.shade)
  head.set(1, 4, 5, b.eye)
  head.set(6, 4, 5, b.eye)
  if (b.head === 'horns') head.box(1, 5, 1, 1, 5, 2, b.accent), head.box(6, 5, 1, 6, 5, 2, b.accent)
  // 머리는 몸통보다 조금 작게 해서 뒤의 긴 몸이 보이게 한다
  const neck = joint(0, 4 * s, 2 * s, mesh(head, [4, 0, 2]))
  neck.children[0]!.position.y = 6 * s
  neck.children[0]!.scale.setScalar(0.8)
  // 보스 뱀(야마타노오로치)은 양옆으로 고개를 더 든다: 머리가 여럿인 큰 뱀
  if (heads > 1) {
    for (const side of [-1, 1]) {
      const extra = mesh(head, [4, 0, 2])
      extra.position.set(side * 7 * s, 7 * s, -2 * s)
      extra.rotation.y = side * 0.6
      extra.scale.setScalar(0.65)
      body.add(extra)
    }
  }
  // 팔 관절 = 목 (공격 자세에서 머리가 들썩인다), 나머지는 비어 있다
  const rightArm = neck
  const leftArm = joint(0, 0, 0)
  const leftLeg = joint(0, 0, 0)
  const rightLeg = joint(0, 0, 0)
  body.add(rightArm, leftArm, leftLeg, rightLeg)
  return { root: p.root, body, leftArm, rightArm, leftLeg, rightLeg, material: p.material, palette: [b.main, b.shade, b.accent], kind: 'serpent' }
}

/** 적 데이터로 모델을 만든다. 거인은 서리 거인 모델을 그 색으로 바꿔 칠한다 */
export function buildEnemyRig(spec: GiantSpec, seed = 1): EnemyRig {
  const b = spec.body
  const rng = createRng(seed)
  if (b.kind === 'giant') {
    const recolor: Record<number, number> = {
      [FROST_COLORS.skin]: b.main,
      [FROST_COLORS.skinShade]: b.shade,
      [FROST_COLORS.skinDark]: b.dark,
      [FROST_COLORS.eye]: b.eye,
      [FROST_COLORS.fur]: b.accent,
      [FROST_COLORS.furDark]: mix(b.accent, 0x000000, 0.25),
    }
    const head = b.head === 'oneEye' || b.head === 'horns' || b.head === 'bull' ? b.head : 'plain'
    const gear = b.gear === 'rock' || b.gear === 'none' ? b.gear : 'club'
    return { ...buildGiantRig({ voxelSize: spec.voxelSize, king: spec.king, seed, head, gear, recolor }), kind: 'giant' }
  }
  const p = parts(spec.voxelSize)
  switch (b.kind) {
    case 'beast':
      return beast(b, p, rng)
    case 'humanoid':
      return humanoid(b, p)
    case 'flyer':
      return flyer(b, p)
    case 'spirit':
      return spirit(b, p, rng)
    case 'serpent':
      return serpent(b, p, spec.role === 'boss' ? 3 : 1)
  }
}

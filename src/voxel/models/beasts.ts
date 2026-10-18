import { VoxelGrid } from '../VoxelGrid'
import { shade } from './gen'

/**
 * 동료 짐승 (E6-09): 오딘의 까마귀, 프레이의 황금 멧돼지, 아르테미스의 사냥개.
 * 앞은 +z, 발이 y=0. 색은 클래스 데이터(companions.color)로 칠한다.
 */

/** 까마귀: 날개를 편 작은 새 (9×3×6) */
export function raven(main: number): VoxelGrid {
  const g = new VoxelGrid(9, 3, 6)
  const dark = shade(main, 0.7)
  g.box(3, 0, 1, 5, 1, 4, main)
  g.box(4, 1, 5, 4, 1, 5, 0xe6bd4e)
  for (const [x0, x1] of [[0, 2], [6, 8]] as const) g.box(x0, 1, 1, x1, 1, 3, dark)
  g.box(3, 0, 0, 5, 0, 0, dark)
  return g
}

/** 멧돼지: 등에 갈기, 앞으로 휜 엄니 (5×5×8) */
export function boar(main: number): VoxelGrid {
  const g = new VoxelGrid(5, 5, 8)
  const dark = shade(main, 0.7)
  // 다리
  for (const [x, z] of [[0, 1], [4, 1], [0, 5], [4, 5]] as const) g.box(x, 0, z, x, 1, z, dark)
  g.box(0, 2, 0, 4, 3, 6, main)
  g.box(1, 4, 1, 3, 4, 5, shade(main, 1.25))
  // 머리와 엄니
  g.box(1, 2, 7, 3, 3, 7, dark)
  g.set(0, 2, 7, 0xf2f4e8)
  g.set(4, 2, 7, 0xf2f4e8)
  return g
}

/** 사냥개: 길쭉한 몸, 쫑긋한 귀 (3×5×8) */
export function hound(main: number): VoxelGrid {
  const g = new VoxelGrid(3, 5, 8)
  const dark = shade(main, 0.7)
  for (const [x, z] of [[0, 1], [2, 1], [0, 5], [2, 5]] as const) g.box(x, 0, z, x, 1, z, dark)
  g.box(0, 2, 0, 2, 2, 6, main)
  g.box(0, 3, 5, 2, 3, 7, main)
  g.set(0, 4, 6, dark)
  g.set(2, 4, 6, dark)
  g.set(1, 3, 0, dark)
  return g
}

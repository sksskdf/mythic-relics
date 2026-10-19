import { describe, expect, it } from 'vitest'

import { buildVoxelGeometry } from '../src/voxel/mesher'
import { pineTree, rock, ruin } from '../src/voxel/models/props'
import { toVox } from '../src/voxel/vox'
import { VoxelGrid } from '../src/voxel/VoxelGrid'

function faceCount(grid: VoxelGrid): number {
  const geometry = buildVoxelGeometry(grid, { voxelSize: 1 })
  return geometry.index!.count / 6
}

describe('VoxelGrid', () => {
  it('같은 색은 팔레트 번호를 재사용한다', () => {
    const g = new VoxelGrid(2, 2, 2)
    expect(g.color(0xff0000)).toBe(1)
    expect(g.color(0x00ff00)).toBe(2)
    expect(g.color(0xff0000)).toBe(1)
  })

  it('격자 밖을 칠해도 오류 없이 무시한다', () => {
    const g = new VoxelGrid(2, 2, 2)
    g.set(-1, 0, 0, 0xffffff)
    g.set(5, 5, 5, 0xffffff)
    expect(g.count()).toBe(0)
  })
})

describe('복셀 메시 변환', () => {
  it('복셀 하나는 면 6개', () => {
    const g = new VoxelGrid(1, 1, 1)
    g.set(0, 0, 0, 0xffffff)
    expect(faceCount(g)).toBe(6)
  })

  it('맞닿은 면은 그리지 않는다', () => {
    const g = new VoxelGrid(2, 1, 1)
    g.box(0, 0, 0, 1, 0, 0, 0xffffff)
    // 맞닿은 면을 빼고, 같은 평면의 같은 색 면은 하나로 합친다: 1×2 상자는 면 6개
    expect(faceCount(g)).toBe(6)
    const cube = new VoxelGrid(3, 3, 3)
    cube.box(0, 0, 0, 2, 2, 2, 0xffffff)
    expect(faceCount(cube)).toBe(6)
  })

  it('색이 다르면 합치지 않는다', () => {
    const g = new VoxelGrid(2, 1, 1)
    g.set(0, 0, 0, 0xffffff)
    g.set(1, 0, 0, 0xff0000)
    // 위·아래·앞·뒤는 색마다 하나씩(8), 양 끝 2
    expect(faceCount(g)).toBe(10)
  })

  it('합쳐도 겉넓이와 바깥을 보는 방향은 그대로다', () => {
    const g = new VoxelGrid(4, 3, 5)
    g.box(0, 0, 0, 3, 2, 4, 0x88aacc)
    g.set(1, 2, 1, null)
    g.set(2, 1, 4, 0x223344)
    const geometry = buildVoxelGeometry(g, { voxelSize: 1, pivot: [0, 0, 0] })
    const p = geometry.getAttribute('position')
    const n = geometry.getAttribute('normal')
    const index = geometry.index!
    let area = 0
    for (let t = 0; t < index.count; t += 3) {
      const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)]
      const ab = [p.getX(b) - p.getX(a), p.getY(b) - p.getY(a), p.getZ(b) - p.getZ(a)]
      const ac = [p.getX(c) - p.getX(a), p.getY(c) - p.getY(a), p.getZ(c) - p.getZ(a)]
      const cross = [ab[1]! * ac[2]! - ab[2]! * ac[1]!, ab[2]! * ac[0]! - ab[0]! * ac[2]!, ab[0]! * ac[1]! - ab[1]! * ac[0]!]
      area += Math.hypot(...cross) / 2
      // 삼각형 방향이 법선과 같은 쪽 (바깥에서 반시계)
      expect(cross[0]! * n.getX(a) + cross[1]! * n.getY(a) + cross[2]! * n.getZ(a)).toBeGreaterThan(0)
    }
    // 4×3×5 상자 겉넓이 94, 위에서 한 칸을 파내면 옆면 4개가 늘어난다
    expect(area).toBeCloseTo(94 + 4)
  })

  it('원점(pivot)을 기준으로 위치를 옮긴다', () => {
    const g = new VoxelGrid(2, 2, 2)
    g.set(0, 0, 0, 0xffffff)
    const geometry = buildVoxelGeometry(g, { voxelSize: 0.5, pivot: [1, 0, 1] })
    geometry.computeBoundingBox()
    expect(geometry.boundingBox!.min.toArray()).toEqual([-0.5, 0, -0.5])
    expect(geometry.boundingBox!.max.toArray()).toEqual([0, 0.5, 0])
  })
})

describe('.vox 내보내기', () => {
  it('MagicaVoxel 파일 머리말과 크기 정보를 쓴다', () => {
    const g = new VoxelGrid(3, 4, 5)
    g.set(1, 2, 3, 0x336699)
    const bytes = toVox(g)
    const view = new DataView(bytes.buffer)
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('VOX ')
    expect(view.getInt32(4, true)).toBe(150)
    expect(String.fromCharCode(...bytes.slice(8, 12))).toBe('MAIN')
    // SIZE 청크: MagicaVoxel은 z가 위쪽이라 (x, z, y) 순서
    expect(String.fromCharCode(...bytes.slice(20, 24))).toBe('SIZE')
    expect([view.getInt32(32, true), view.getInt32(36, true), view.getInt32(40, true)]).toEqual([3, 5, 4])
  })
})

describe('소품 모델', () => {
  it('같은 시드면 같은 모양이 나온다', () => {
    expect(pineTree(3).cells).toEqual(pineTree(3).cells)
    expect(rock(9).cells).toEqual(rock(9).cells)
  })

  it('비어 있지 않다', () => {
    for (const grid of [pineTree(1), rock(1), ruin(1)]) expect(grid.count()).toBeGreaterThan(50)
  })
})

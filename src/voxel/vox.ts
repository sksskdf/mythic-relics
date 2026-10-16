import type { VoxelGrid } from './VoxelGrid'

/**
 * 복셀 격자를 MagicaVoxel 파일(.vox) 바이트로 바꾼다.
 * MagicaVoxel은 z축이 위쪽이라 y와 z를 바꿔 저장한다.
 */
export function toVox(grid: VoxelGrid): Uint8Array {
  if (grid.sizeX > 256 || grid.sizeY > 256 || grid.sizeZ > 256) throw new Error('.vox는 한 변 256칸까지만 저장할 수 있습니다.')
  const voxels: number[] = []
  for (let z = 0; z < grid.sizeZ; z++)
    for (let y = 0; y < grid.sizeY; y++)
      for (let x = 0; x < grid.sizeX; x++) {
        const index = grid.get(x, y, z)
        if (index) voxels.push(x, z, y, index)
      }

  const sizeChunk = chunk('SIZE', int32s(grid.sizeX, grid.sizeZ, grid.sizeY))
  const xyzi = new Uint8Array(4 + voxels.length)
  new DataView(xyzi.buffer).setInt32(0, voxels.length / 4, true)
  xyzi.set(voxels, 4)
  const xyziChunk = chunk('XYZI', xyzi)
  const rgba = new Uint8Array(256 * 4)
  // RGBA 청크의 i번째 색이 팔레트 번호 i+1에 해당한다.
  for (let i = 1; i < grid.palette.length; i++) {
    const hex = grid.palette[i]!
    rgba.set([(hex >> 16) & 255, (hex >> 8) & 255, hex & 255, 255], (i - 1) * 4)
  }
  const rgbaChunk = chunk('RGBA', rgba)

  const children = concat(sizeChunk, xyziChunk, rgbaChunk)
  const main = concat(ascii('MAIN'), int32s(0, children.length), children)
  return concat(ascii('VOX '), int32s(150), main)
}

function chunk(id: string, content: Uint8Array): Uint8Array {
  return concat(ascii(id), int32s(content.length, 0), content)
}

function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => c.charCodeAt(0))
}

function int32s(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4)
  const view = new DataView(out.buffer)
  values.forEach((v, i) => view.setInt32(i * 4, v, true))
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}

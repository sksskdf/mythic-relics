import type { VoxelGrid } from './VoxelGrid'

/**
 * 복셀 모델을 12×12 픽셀 그림으로 (E6-11): 유물 그림을 손으로 찍지 않은 유물은 외형 모델을 옆에서 본 모습으로 그린다.
 * 가장 얇은 축을 따라 보고(앞에 있는 칸이 보인다), 긴 쪽을 12칸에 맞춰 줄인다. 색마다 글자 하나.
 */
export function iconFromGrid(grid: VoxelGrid): { rows: string[]; colors: Record<string, string> } {
  const dims = [grid.sizeX, grid.sizeY, grid.sizeZ]
  const depthAxis = dims.indexOf(Math.min(...dims))
  // 화면의 가로·세로 축: 깊이 축을 뺀 둘. 세로는 y가 있으면 y
  const rest = [0, 1, 2].filter((a) => a !== depthAxis)
  const vAxis = rest.includes(1) ? 1 : rest[1]!
  const uAxis = rest.find((a) => a !== vAxis)!
  const uSize = dims[uAxis]!
  const vSize = dims[vAxis]!
  const scale = Math.max(uSize, vSize) / 12
  const size = Math.max(1, scale)
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  const colors: Record<string, string> = {}
  const letterOf = new Map<number, string>()
  const rows: string[] = []
  const offU = Math.floor((12 - Math.min(12, Math.ceil(uSize / size))) / 2)
  const offV = Math.floor((12 - Math.min(12, Math.ceil(vSize / size))) / 2)
  for (let py = 0; py < 12; py++) {
    let row = ''
    for (let px = 0; px < 12; px++) {
      const u = Math.floor((px - offU) * size)
      const v = Math.floor((11 - py - offV) * size)
      let hex = 0
      if (u >= 0 && v >= 0 && u < uSize && v < vSize) {
        // 깊이 축의 뒤에서 앞으로 보며 가장 앞에 있는 칸
        for (let d = dims[depthAxis]! - 1; d >= 0 && hex === 0; d--) {
          const at = [0, 0, 0]
          at[uAxis] = u
          at[vAxis] = v
          at[depthAxis] = d
          hex = grid.palette[grid.get(at[0]!, at[1]!, at[2]!)] ?? 0
        }
      }
      if (hex === 0) {
        row += '.'
        continue
      }
      let letter = letterOf.get(hex)
      if (!letter) {
        letter = letters[letterOf.size % letters.length]!
        letterOf.set(hex, letter)
        colors[letter] = `#${hex.toString(16).padStart(6, '0')}`
      }
      row += letter
    }
    rows.push(row)
  }
  return { rows, colors }
}

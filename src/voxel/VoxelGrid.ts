/**
 * 색칠한 큐브(복셀)들의 3차원 격자.
 * 좌표는 x(오른쪽), y(위), z(앞쪽)이고, 0은 빈칸, 1 이상은 팔레트 번호다.
 */
export class VoxelGrid {
  readonly cells: Uint8Array
  /** 팔레트 번호 → 색 (0번은 비어 있음) */
  readonly palette: number[] = [0]
  private readonly colorIndex = new Map<number, number>()

  constructor(
    readonly sizeX: number,
    readonly sizeY: number,
    readonly sizeZ: number,
  ) {
    this.cells = new Uint8Array(sizeX * sizeY * sizeZ)
  }

  /** 색을 팔레트에 넣고 번호를 돌려준다. 이미 있는 색이면 그 번호를 쓴다. */
  color(hex: number): number {
    const existing = this.colorIndex.get(hex)
    if (existing !== undefined) return existing
    if (this.palette.length >= 256) throw new Error('팔레트는 255색까지 쓸 수 있습니다.')
    const index = this.palette.length
    this.palette.push(hex)
    this.colorIndex.set(hex, index)
    return index
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.sizeX && y < this.sizeY && z < this.sizeZ
  }

  get(x: number, y: number, z: number): number {
    if (!this.inside(x, y, z)) return 0
    return this.cells[(z * this.sizeY + y) * this.sizeX + x]!
  }

  /** 한 칸을 칠한다. hex가 null이면 지운다. 격자 밖은 무시한다. */
  set(x: number, y: number, z: number, hex: number | null): void {
    if (!this.inside(x, y, z)) return
    this.cells[(z * this.sizeY + y) * this.sizeX + x] = hex === null ? 0 : this.color(hex)
  }

  /** 상자를 칠한다. 양 끝을 포함한다. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number | null): void {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.set(x, y, z, hex)
  }

  /** 타원체를 칠한다. 중심과 반지름은 칸 단위(소수 가능). */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, hex: number | ((x: number, y: number, z: number) => number | null)): void {
    for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++)
      for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
        for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
          const dx = (x + 0.5 - cx) / rx
          const dy = (y + 0.5 - cy) / ry
          const dz = (z + 0.5 - cz) / rz
          if (dx * dx + dy * dy + dz * dz <= 1) this.set(x, y, z, typeof hex === 'function' ? hex(x, y, z) : hex)
        }
  }

  /** y0~y1 높이에 걸쳐 반지름이 r0에서 r1로 바뀌는 원기둥(원뿔)을 칠한다. */
  column(cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, hex: number | ((x: number, y: number, z: number) => number | null)): void {
    for (let y = y0; y <= y1; y++) {
      const t = y1 === y0 ? 0 : (y - y0) / (y1 - y0)
      const r = r0 + (r1 - r0) * t
      for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++)
        for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          const dx = x + 0.5 - cx
          const dz = z + 0.5 - cz
          if (dx * dx + dz * dz <= r * r) this.set(x, y, z, typeof hex === 'function' ? hex(x, y, z) : hex)
        }
    }
  }

  /** 두 점을 잇는 선(가지 등)을 칠한다. */
  line(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: number, thickness = 0): void {
    const steps = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)) * 2) + 1
    for (let i = 0; i <= steps; i++) {
      const t = i / steps
      const x = Math.round(x0 + (x1 - x0) * t)
      const y = Math.round(y0 + (y1 - y0) * t)
      const z = Math.round(z0 + (z1 - z0) * t)
      if (thickness > 0) this.box(x, y, z, x + thickness, y, z + thickness, hex)
      else this.set(x, y, z, hex)
    }
  }

  /** 칠해진 칸마다 함수를 부른다. */
  forEach(fn: (x: number, y: number, z: number, hex: number) => void): void {
    for (let z = 0; z < this.sizeZ; z++)
      for (let y = 0; y < this.sizeY; y++)
        for (let x = 0; x < this.sizeX; x++) {
          const index = this.get(x, y, z)
          if (index) fn(x, y, z, this.palette[index]!)
        }
  }

  /** 위가 비어 있는 칸(윗면)을 바꿔 칠한다. 눈 덮기 등에 쓴다. */
  paintTops(fn: (x: number, y: number, z: number, hex: number) => number | null): void {
    const tops: [number, number, number, number][] = []
    this.forEach((x, y, z, hex) => {
      if (!this.get(x, y + 1, z)) tops.push([x, y, z, hex])
    })
    for (const [x, y, z, hex] of tops) {
      const next = fn(x, y, z, hex)
      if (next !== null) this.set(x, y, z, next)
    }
  }

  count(): number {
    let n = 0
    for (const c of this.cells) if (c) n++
    return n
  }
}

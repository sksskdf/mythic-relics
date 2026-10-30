import * as THREE from 'three'

import { VFX } from '../art/palette'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { heightAt } from '../world/terrain'

/** 바닥에 그리는 공격 예고의 모양 */
export type TelegraphShape =
  | { kind: 'circle'; radius: number }
  | { kind: 'sector'; radius: number; halfAngle: number }
  /** 퍼져 나가는 충격파. radius는 지금 반지름, width는 띠 두께 */
  | { kind: 'ring'; radius: number; width: number }
  /** 앞으로 뻗은 띠 (돌진) */
  | { kind: 'line'; length: number; width: number }

const DANGER = VFX.danger
const SEGMENTS = 40
const RINGS = 6
/** 충격파 띠의 둘레·두께 나눔 수 */
const RING_SEGMENTS = SEGMENTS * 2
const RING_ROWS = 2

/** 땅에서 띄우는 높이 (땅에 묻혀 깜빡이지 않을 만큼) */
const LIFT = 0.08
/** 테두리 두께 (m). 땅색이 진한 지역에서도 범위 끝이 또렷하게 보이게 (E9-07) */
const EDGE = 0.14

/**
 * 적 공격 예고. 바닥에 범위를 옅게 깔고, 안쪽이 차오르는 정도로 맞을 때까지 남은 시간을 보여 준다.
 * 땅의 높낮이를 따라 휘게 만들어서, 깊이 검사를 켜도 땅에 묻히지 않고 캐릭터는 그 위로 보인다.
 */
export class Telegraph {
  readonly object = new THREE.Group()
  private readonly base: THREE.Mesh
  private readonly fill: THREE.Mesh
  /** 범위 끝을 두르는 진한 테두리 (충격파에는 없다) */
  private readonly edge: THREE.Mesh
  private readonly edgeMaterial = new THREE.MeshBasicMaterial({
    color: DANGER,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
  })
  private readonly baseMaterial = new THREE.MeshBasicMaterial({
    color: DANGER,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  })
  private readonly fillMaterial = new THREE.MeshBasicMaterial({
    color: DANGER,
    transparent: true,
    opacity: 0.45,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -3,
  })
  /** 땅에 맞춰 휘기 전의 평평한 정점 위치 */
  private baseFlat: Float32Array
  private fillFlat: Float32Array
  private edgeFlat: Float32Array
  private fillScale = 0

  constructor(private shape: TelegraphShape) {
    this.base = new THREE.Mesh(this.geometry(shape), this.baseMaterial)
    this.fill = new THREE.Mesh(this.geometry(shape), this.fillMaterial)
    this.edge = new THREE.Mesh(edgeGeometry(shape), this.edgeMaterial)
    this.edge.visible = shape.kind !== 'ring'
    this.baseFlat = flatPositions(this.base.geometry)
    this.fillFlat = flatPositions(this.fill.geometry)
    this.edgeFlat = flatPositions(this.edge.geometry)
    for (const mesh of [this.base, this.fill, this.edge]) {
      mesh.rotation.x = -Math.PI / 2
      mesh.renderOrder = 10
      mesh.layers.set(EFFECT_LAYER)
      this.object.add(mesh)
    }
    this.fill.renderOrder = 11
    this.edge.renderOrder = 12
    this.setProgress(0)
  }

  /** 예고 위치와 방향 (방향은 부채꼴에만 쓴다) */
  place(x: number, z: number, facing = 0): void {
    this.object.position.set(x, heightAt(x, z), z)
    this.object.rotation.y = facing
    this.object.updateMatrixWorld()
    this.conform(this.base, this.baseFlat, 1)
    if (this.edge.visible) this.conform(this.edge, this.edgeFlat, 1)
    // 채움은 맞추지 않는다: 예고 중에는 setProgress가 늘 뒤따라 새 크기로 맞춘다 (처음 크기 0.001이라 그 사이에도 보이지 않는다)
  }

  /** 0이면 막 시작, 1이면 지금 맞는다. 충격파는 띠 전체가 진하게 보인다. */
  setProgress(t: number): void {
    if (this.shape.kind === 'ring') {
      this.fill.visible = false
      this.baseMaterial.opacity = 0.55
      return
    }
    this.fillScale = Math.max(0.001, Math.min(1, t))
    this.conform(this.fill, this.fillFlat, this.fillScale)
    // 맞기 직전에는 깜빡여서 눈에 띄게 한다.
    this.fillMaterial.opacity = t > 0.85 ? 0.75 : 0.45
  }

  /** 충격파처럼 크기가 바뀌는 모양을 새로 만든다. */
  reshape(shape: TelegraphShape): void {
    const wasRing = this.shape.kind === 'ring'
    this.shape = shape
    // 충격파는 프레임마다 반지름만 바뀌고 정점 수는 같으니, 형상을 새로 만들지 않고 그 자리에서 다시 쓴다
    if (wasRing && shape.kind === 'ring') {
      writeRing(this.base.geometry, this.baseFlat, Math.max(0.01, shape.radius - shape.width / 2), shape.radius + shape.width / 2)
      this.conform(this.base, this.baseFlat, 1)
      return
    }
    this.base.geometry.dispose()
    this.base.geometry = this.geometry(shape)
    this.baseFlat = flatPositions(this.base.geometry)
    this.conform(this.base, this.baseFlat, 1)
  }

  /** 평평한 모양을 scale배 한 뒤, 정점마다 그 자리의 땅 높이에 맞춘다. */
  private conform(mesh: THREE.Mesh, flat: Float32Array, scale: number): void {
    const position = mesh.geometry.getAttribute('position') as THREE.BufferAttribute
    const { x: ox, y: oy, z: oz } = this.object.position
    const cos = Math.cos(this.object.rotation.y)
    const sin = Math.sin(this.object.rotation.y)
    for (let i = 0; i < position.count; i++) {
      const lx = flat[i * 3]! * scale
      const ly = flat[i * 3 + 1]! * scale
      // 눕힌 평면의 (lx, ly)는 월드에서 (lx, -ly) 방향이고, 거기에 바라보는 방향만큼 돌린다.
      const wx = ox + lx * cos - ly * sin
      const wz = oz - lx * sin - ly * cos
      position.setXYZ(i, lx, ly, heightAt(wx, wz) - oy + LIFT)
    }
    position.needsUpdate = true
    mesh.geometry.computeBoundingSphere()
  }

  dispose(): void {
    this.object.removeFromParent()
    this.base.geometry.dispose()
    this.fill.geometry.dispose()
    this.edge.geometry.dispose()
    this.baseMaterial.dispose()
    this.fillMaterial.dispose()
    this.edgeMaterial.dispose()
  }

  private geometry(shape: TelegraphShape): THREE.BufferGeometry {
    switch (shape.kind) {
      // 땅의 굴곡을 따라가도록 반지름 방향으로도 잘게 나눈다.
      case 'circle':
        return new THREE.RingGeometry(0.001, shape.radius, SEGMENTS, RINGS)
      case 'sector': {
        // 가운데 방향이 +z(바라보는 쪽)가 되도록 놓는다. 눕히면 평면의 -π/2 방향이 +z가 된다.
        const length = shape.halfAngle * 2
        return new THREE.RingGeometry(0.001, shape.radius, SEGMENTS, RINGS, -Math.PI / 2 - shape.halfAngle, length)
      }
      case 'line': {
        // 바라보는 쪽(+z)으로 뻗게: 눕히면 평면의 -y가 +z가 된다. 원점에서 앞으로 자라도록 한쪽 끝을 원점에 둔다
        const g = new THREE.PlaneGeometry(shape.width, shape.length, 2, Math.max(2, Math.ceil(shape.length / 0.8)))
        g.translate(0, -shape.length / 2, 0)
        return g
      }
      case 'ring':
        return new THREE.RingGeometry(
          Math.max(0.01, shape.radius - shape.width / 2),
          shape.radius + shape.width / 2,
          RING_SEGMENTS,
          RING_ROWS,
        )
    }
  }
}

/** 모양의 바깥선 (평면 좌표, 반시계 방향). geometry()와 같은 자리에 놓인다 */
function outline(shape: TelegraphShape): [number, number][] {
  const arc = (r: number, from: number, length: number, n: number) =>
    Array.from({ length: n + 1 }, (_, i) => [r * Math.cos(from + (length * i) / n), r * Math.sin(from + (length * i) / n)] as [number, number])
  switch (shape.kind) {
    case 'circle':
      return arc(shape.radius, 0, Math.PI * 2, SEGMENTS).slice(0, -1)
    case 'sector':
      return [[0, 0], ...arc(shape.radius, -Math.PI / 2 - shape.halfAngle, shape.halfAngle * 2, SEGMENTS)]
    case 'line': {
      const w = shape.width / 2
      return [[-w, -shape.length], [w, -shape.length], [w, 0], [-w, 0]]
    }
    case 'ring':
      return []
  }
}

/** 바깥선을 따라 안쪽으로 EDGE만큼 두께를 준 띠. 길게 나눠 땅 굴곡을 따른다 */
function edgeGeometry(shape: TelegraphShape): THREE.BufferGeometry {
  const points = outline(shape)
  const positions: number[] = []
  const indices: number[] = []
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i]!
    const [bx, by] = points[(i + 1) % points.length]!
    const len = Math.hypot(bx - ax, by - ay)
    if (len < 1e-6) continue
    // 반시계 방향이라 왼쪽이 안쪽
    const nx = (-(by - ay) / len) * EDGE
    const ny = ((bx - ax) / len) * EDGE
    const steps = Math.max(1, Math.ceil(len / 0.8))
    for (let k = 0; k < steps; k++) {
      const t0 = k / steps
      const t1 = (k + 1) / steps
      const x0 = ax + (bx - ax) * t0
      const y0 = ay + (by - ay) * t0
      const x1 = ax + (bx - ax) * t1
      const y1 = ay + (by - ay) * t1
      const base = positions.length / 3
      positions.push(x0, y0, 0, x1, y1, 0, x1 + nx, y1 + ny, 0, x0 + nx, y0 + ny, 0)
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(indices)
  return g
}

function flatPositions(geometry: THREE.BufferGeometry): Float32Array {
  return Float32Array.from((geometry.getAttribute('position') as THREE.BufferAttribute).array)
}

/**
 * 충격파 띠(RingGeometry(inner, outer, RING_SEGMENTS, RING_ROWS))의 정점·uv를 같은 식으로 그 자리에서 다시 쓴다.
 * flat에는 평평한 정점 위치를 쓰고, 땅 높이는 conform이 맞춘다
 */
function writeRing(geometry: THREE.BufferGeometry, flat: Float32Array, inner: number, outer: number): void {
  const uv = geometry.getAttribute('uv') as THREE.BufferAttribute
  const step = (outer - inner) / RING_ROWS
  let radius = inner
  let v = 0
  for (let j = 0; j <= RING_ROWS; j++) {
    for (let i = 0; i <= RING_SEGMENTS; i++) {
      const segment = (i / RING_SEGMENTS) * Math.PI * 2
      const x = radius * Math.cos(segment)
      const y = radius * Math.sin(segment)
      flat[v * 3] = x
      flat[v * 3 + 1] = y
      flat[v * 3 + 2] = 0
      uv.setXY(v, (x / outer + 1) / 2, (y / outer + 1) / 2)
      v++
    }
    radius += step
  }
  uv.needsUpdate = true
}

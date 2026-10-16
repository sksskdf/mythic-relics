import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'
import { heightAt } from '../world/terrain'

/** 바닥에 그리는 공격 예고의 모양 */
export type TelegraphShape =
  | { kind: 'circle'; radius: number }
  | { kind: 'sector'; radius: number; halfAngle: number }
  /** 퍼져 나가는 충격파. radius는 지금 반지름, width는 띠 두께 */
  | { kind: 'ring'; radius: number; width: number }

const DANGER = 0xff5a3c
const SEGMENTS = 40
const RINGS = 6

/** 땅에서 띄우는 높이 (땅에 묻혀 깜빡이지 않을 만큼) */
const LIFT = 0.08

/**
 * 적 공격 예고. 바닥에 범위를 옅게 깔고, 안쪽이 차오르는 정도로 맞을 때까지 남은 시간을 보여 준다.
 * 땅의 높낮이를 따라 휘게 만들어서, 깊이 검사를 켜도 땅에 묻히지 않고 캐릭터는 그 위로 보인다.
 */
export class Telegraph {
  readonly object = new THREE.Group()
  private readonly base: THREE.Mesh
  private readonly fill: THREE.Mesh
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
  private fillScale = 0

  constructor(private shape: TelegraphShape) {
    this.base = new THREE.Mesh(this.geometry(shape), this.baseMaterial)
    this.fill = new THREE.Mesh(this.geometry(shape), this.fillMaterial)
    this.baseFlat = flatPositions(this.base.geometry)
    this.fillFlat = flatPositions(this.fill.geometry)
    for (const mesh of [this.base, this.fill]) {
      mesh.rotation.x = -Math.PI / 2
      mesh.renderOrder = 10
      mesh.layers.set(EFFECT_LAYER)
      this.object.add(mesh)
    }
    this.fill.renderOrder = 11
    this.setProgress(0)
  }

  /** 예고 위치와 방향 (방향은 부채꼴에만 쓴다) */
  place(x: number, z: number, facing = 0): void {
    this.object.position.set(x, heightAt(x, z), z)
    this.object.rotation.y = facing
    this.object.updateMatrixWorld()
    this.conform(this.base, this.baseFlat, 1)
    if (this.fill.visible) this.conform(this.fill, this.fillFlat, this.fillScale)
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
    this.shape = shape
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
    this.baseMaterial.dispose()
    this.fillMaterial.dispose()
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
      case 'ring':
        return new THREE.RingGeometry(
          Math.max(0.01, shape.radius - shape.width / 2),
          shape.radius + shape.width / 2,
          SEGMENTS * 2,
          2,
        )
    }
  }
}

function flatPositions(geometry: THREE.BufferGeometry): Float32Array {
  return Float32Array.from((geometry.getAttribute('position') as THREE.BufferAttribute).array)
}

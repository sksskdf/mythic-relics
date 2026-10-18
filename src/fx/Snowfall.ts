import * as THREE from 'three'

import { createRng } from '../world/rng'

/**
 * 카메라 주변 상자 안에서 눈송이가 떨어지고, 바닥에 닿으면 위로 되돌아간다.
 * 지역 테마에 따라 꽃잎(드문드문 천천히)·불티(위로 오름)로 바꾸거나 끈다 (E7-05).
 */
export class Snowfall {
  readonly object: THREE.Points
  private readonly velocities: Float32Array
  /** 가장 멀리 축소해도 화면을 덮도록 넉넉히 잡는다. */
  private readonly half = 30
  private readonly height = 14
  /** 떨어지는 빠르기 배율 (음수면 위로 오른다) */
  private speed = 1

  constructor(count = 2200, seed = 5) {
    const rng = createRng(seed)
    const positions = new Float32Array(count * 3)
    this.velocities = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rng() * 2 - 1) * this.half
      positions[i * 3 + 1] = rng() * this.height
      positions[i * 3 + 2] = (rng() * 2 - 1) * this.half
      this.velocities[i] = 1.2 + rng() * 1.3
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    // 저해상도 화면에서 정확히 1픽셀로 찍히게 크기를 고정한다.
    const material = new THREE.PointsMaterial({ color: 0xffffff, size: 1, sizeAttenuation: false, depthWrite: false })
    this.object = new THREE.Points(geometry, material)
    this.object.frustumCulled = false
  }

  /** 지역 테마의 날림으로 바꾼다 */
  setStyle(kind: 'snow' | 'petals' | 'embers' | 'none', color: number): void {
    this.object.visible = kind !== 'none'
    ;(this.object.material as THREE.PointsMaterial).color.setHex(color)
    const count = this.velocities.length
    this.object.geometry.setDrawRange(0, kind === 'snow' ? count : kind === 'petals' ? Math.round(count * 0.18) : Math.round(count * 0.05))
    this.speed = kind === 'snow' ? 1 : kind === 'petals' ? 0.35 : -0.6
  }

  update(dt: number, center: THREE.Vector3, elapsed: number): void {
    if (!this.object.visible) return
    const attr = this.object.geometry.attributes.position as THREE.BufferAttribute
    const p = attr.array as Float32Array
    const wind = Math.sin(elapsed * 0.4) * 0.6 + 0.8
    for (let i = 0; i < this.velocities.length; i++) {
      const v = this.velocities[i]!
      p[i * 3]! += (wind + Math.sin(elapsed * 1.3 + i) * 0.3) * dt
      p[i * 3 + 1]! -= v * this.speed * dt
      p[i * 3 + 2]! += Math.cos(elapsed * 1.1 + i * 0.7) * 0.3 * dt
      // 주인공 주변 상자를 벗어나면 반대편으로 감싸 넣는다.
      for (const axis of [0, 2]) {
        const c = axis === 0 ? center.x : center.z
        const rel = p[i * 3 + axis]! - c
        if (rel > this.half) p[i * 3 + axis]! -= this.half * 2
        else if (rel < -this.half) p[i * 3 + axis]! += this.half * 2
      }
      if (p[i * 3 + 1]! < 0) p[i * 3 + 1]! += this.height
      else if (p[i * 3 + 1]! > this.height) p[i * 3 + 1]! -= this.height
    }
    attr.needsUpdate = true
  }
}

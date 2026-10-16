import * as THREE from 'three'

import { createRng } from '../world/rng'

/** 카메라 주변 상자 안에서 눈송이가 떨어지고, 바닥에 닿으면 위로 되돌아간다. */
export class Snowfall {
  readonly object: THREE.Points
  private readonly velocities: Float32Array
  private readonly half = 16
  private readonly height = 14

  constructor(count = 700, seed = 5) {
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

  update(dt: number, center: THREE.Vector3, elapsed: number): void {
    const attr = this.object.geometry.attributes.position as THREE.BufferAttribute
    const p = attr.array as Float32Array
    const wind = Math.sin(elapsed * 0.4) * 0.6 + 0.8
    for (let i = 0; i < this.velocities.length; i++) {
      const v = this.velocities[i]!
      p[i * 3]! += (wind + Math.sin(elapsed * 1.3 + i) * 0.3) * dt
      p[i * 3 + 1]! -= v * dt
      p[i * 3 + 2]! += Math.cos(elapsed * 1.1 + i * 0.7) * 0.3 * dt
      // 주인공 주변 상자를 벗어나면 반대편으로 감싸 넣는다.
      for (const axis of [0, 2]) {
        const c = axis === 0 ? center.x : center.z
        const rel = p[i * 3 + axis]! - c
        if (rel > this.half) p[i * 3 + axis]! -= this.half * 2
        else if (rel < -this.half) p[i * 3 + axis]! += this.half * 2
      }
      if (p[i * 3 + 1]! < 0) p[i * 3 + 1]! += this.height
    }
    attr.needsUpdate = true
  }
}

import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'
import { heightAt } from '../world/terrain'

const WISPS = 8

/**
 * 변신술사 발현 연출: 발밑에 짙은 초록 그림자가 일렁이고, 그림자 조각이 피어올랐다 사라진다.
 */
export class ShadowAura {
  readonly object = new THREE.Group()
  enabled = false
  private readonly pool: THREE.Mesh
  private readonly poolMaterial = new THREE.MeshBasicMaterial({ color: 0x0f2a18, transparent: true, opacity: 0.45, depthWrite: false })
  private readonly wisps: { mesh: THREE.Mesh; life: number; angle: number }[] = []
  private time = 0

  constructor() {
    this.pool = new THREE.Mesh(new THREE.CircleGeometry(0.9, 20), this.poolMaterial)
    this.pool.rotation.x = -Math.PI / 2
    this.pool.renderOrder = 11
    this.object.add(this.pool)
    const geometry = new THREE.BoxGeometry(0.12, 0.12, 0.12)
    const material = new THREE.MeshBasicMaterial({ color: 0x1c3d24, transparent: true, opacity: 0.8, depthWrite: false })
    for (let i = 0; i < WISPS; i++) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.visible = false
      this.object.add(mesh)
      this.wisps.push({ mesh, life: 0, angle: 0 })
    }
    this.object.traverse((o) => o.layers.set(EFFECT_LAYER))
    this.object.visible = false
  }

  update(dt: number, center: THREE.Vector3): void {
    this.object.visible = this.enabled
    if (!this.enabled) return
    this.time += dt
    const y = heightAt(center.x, center.z) + 0.04
    this.pool.position.set(center.x, y, center.z)
    this.pool.scale.setScalar(1 + Math.sin(this.time * 3) * 0.08)
    this.poolMaterial.opacity = 0.38 + Math.sin(this.time * 5) * 0.07
    for (const wisp of this.wisps) {
      wisp.life -= dt
      if (wisp.life <= 0) {
        wisp.life = 0.6 + Math.random() * 0.6
        wisp.angle = Math.random() * Math.PI * 2
      }
      const t = 1 - wisp.life / 1.2
      const r = 0.45 + t * 0.2
      wisp.mesh.visible = true
      wisp.mesh.position.set(center.x + Math.sin(wisp.angle) * r, y + t * 1.4, center.z + Math.cos(wisp.angle) * r)
      wisp.mesh.scale.setScalar(Math.max(0.1, 1 - t))
    }
  }
}

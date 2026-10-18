import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'

/**
 * 천둥 계열 발현 연출: 주인공 몸 주변에서 푸른 전기가 짧게 튄다. (DESIGN.md 10.3)
 * 작은 조각 몇 개를 몸 둘레의 무작위 위치에 잠깐씩 켰다 끈다.
 */
export class Sparks {
  readonly object = new THREE.Group()
  private readonly pieces: { mesh: THREE.Mesh; life: number }[] = []
  private timer = 0
  enabled = false
  /** 발현 레벨: 오를수록 자주, 넓게 튄다 (E6) */
  level = 1

  constructor(color = 0x9fe3ff, count = 18) {
    const material = new THREE.MeshBasicMaterial({ color })
    const geometry = new THREE.BoxGeometry(1, 1, 1)
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(geometry, material)
      mesh.visible = false
      mesh.layers.set(EFFECT_LAYER)
      this.object.add(mesh)
      this.pieces.push({ mesh, life: 0 })
    }
  }

  update(dt: number, center: THREE.Vector3): void {
    this.timer -= dt
    if (this.enabled && this.timer <= 0) {
      this.timer = (0.05 + Math.random() * 0.08) / (0.5 + this.level * 0.5)
      const piece = this.pieces.find((p) => p.life <= 0)
      if (piece) {
        piece.life = 0.06 + Math.random() * 0.08
        const a = Math.random() * Math.PI * 2
        const r = 0.35 + Math.random() * (0.25 + this.level * 0.15)
        piece.mesh.position.set(center.x + Math.sin(a) * r, center.y + 0.3 + Math.random() * 1.8, center.z + Math.cos(a) * r)
        // 가늘고 긴 조각을 아무렇게나 기울여 전기 줄기처럼 보이게 한다.
        piece.mesh.scale.set(0.06, 0.25 + Math.random() * (0.2 + this.level * 0.1), 0.06)
        piece.mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
      }
    }
    for (const piece of this.pieces) {
      piece.life -= dt
      piece.mesh.visible = piece.life > 0
    }
  }
}

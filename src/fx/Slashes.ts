import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'

interface Slash {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  life: number
  maxLife: number
}

/** 기본 공격을 휘두를 때 남는 반달 모양 궤적. 미리 만든 몇 개를 돌려 쓴다. */
export class Slashes {
  readonly object = new THREE.Group()
  private readonly pool: Slash[] = []
  private next = 0

  constructor(size = 18) {
    for (let i = 0; i < size; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material)
      mesh.rotation.order = 'YXZ'
      mesh.visible = false
      mesh.layers.set(EFFECT_LAYER)
      mesh.renderOrder = 12
      this.object.add(mesh)
      this.pool.push({ mesh, material, life: 0, maxLife: 1 })
    }
  }

  /**
   * 주인공 앞에 궤적을 그린다.
   * @param origin 주인공 발 위치
   * @param facing 바라보는 각도
   * @param range 궤적 바깥 반지름
   * @param halfAngle 궤적 절반 각도
   * @param strong 마지막 타처럼 강한 공격이면 금빛으로 더 굵게
   */
  spawn(origin: THREE.Vector3, facing: number, range: number, halfAngle: number, strong: boolean, color?: number): void {
    const slash = this.pool[this.next]!
    this.next = (this.next + 1) % this.pool.length
    const inner = range * (strong ? 0.45 : 0.6)
    slash.mesh.geometry.dispose()
    slash.mesh.geometry = new THREE.RingGeometry(inner, range, 24, 1, -Math.PI / 2 - halfAngle, halfAngle * 2)
    slash.mesh.position.set(origin.x, origin.y + (strong ? 0.5 : 0.9), origin.z)
    slash.mesh.rotation.set(-Math.PI / 2, facing, 0)
    slash.material.color.setHex(color ?? (strong ? 0xffe08a : 0xf2f7ff))
    slash.maxLife = slash.life = strong ? 0.2 : 0.13
    slash.mesh.visible = true
  }

  update(dt: number): void {
    for (const slash of this.pool) {
      if (slash.life <= 0) continue
      slash.life -= dt
      const t = Math.max(0, slash.life / slash.maxLife)
      slash.material.opacity = t
      slash.mesh.visible = slash.life > 0
    }
  }
}

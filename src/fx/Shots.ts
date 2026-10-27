import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'

interface Shot {
  mesh: THREE.Mesh
  material: THREE.MeshBasicMaterial
  from: THREE.Vector3
  to: THREE.Vector3
  t: number
  life: number
  /** 포물선 높이 (m, 0이면 곧게) */
  arc: number
  /** 날며 도는 빠르기 (0이면 앞을 본 채) */
  spin: number
}

/** 날아가는 것의 모양 (E18): 크기 배율과 포물선·회전 */
export interface ShotShape {
  /** 가로·세로·길이 배율 (기본 1, 1, 1: 0.06×0.06×0.9m 조각) */
  scale?: [number, number, number]
  arc?: number
  spin?: number
}

/**
 * 날아가는 것 (E6-10): 활의 화살, 던진 창, 빛 조각. 가늘고 긴 조각이 출발점에서 대상까지 짧게 날아간다.
 * 판정은 공격 순간에 이미 끝났으므로 연출만 한다. 미리 만든 몇 개를 돌려 쓴다.
 */
export class Shots {
  readonly object = new THREE.Group()
  private readonly pool: Shot[] = []
  private next = 0

  constructor(size = 16) {
    const geometry = new THREE.BoxGeometry(0.06, 0.06, 0.9)
    for (let i = 0; i < size; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.visible = false
      mesh.layers.set(EFFECT_LAYER)
      mesh.renderOrder = 12
      this.object.add(mesh)
      this.pool.push({ mesh, material, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, life: 1, arc: 0, spin: 0 })
    }
  }

  /** from에서 to로 seconds초 동안 날아간다. shape로 크기·포물선·회전을 바꾼다 (바위·고리) */
  fire(from: THREE.Vector3, to: THREE.Vector3, color: number, seconds = 0.12, shape: ShotShape = {}): void {
    const shot = this.pool[this.next]!
    this.next = (this.next + 1) % this.pool.length
    shot.from.copy(from)
    shot.to.copy(to)
    shot.t = 0
    shot.life = seconds
    shot.arc = shape.arc ?? 0
    shot.spin = shape.spin ?? 0
    shot.material.color.setHex(color)
    shot.mesh.scale.set(...(shape.scale ?? [1, 1, 1]))
    shot.mesh.visible = true
    shot.mesh.position.copy(from)
    shot.mesh.lookAt(to)
  }

  /** 지금 날아가는 수 (점검용) */
  get flying(): number {
    return this.pool.filter((s) => s.mesh.visible).length
  }

  update(dt: number): void {
    for (const shot of this.pool) {
      if (!shot.mesh.visible) continue
      shot.t += dt
      const k = Math.min(1, shot.t / shot.life)
      shot.mesh.position.lerpVectors(shot.from, shot.to, k)
      if (shot.arc > 0) shot.mesh.position.y += Math.sin(k * Math.PI) * shot.arc
      if (shot.spin !== 0) shot.mesh.rotateY(shot.spin * dt)
      shot.material.opacity = 1 - k * 0.3
      if (k >= 1) shot.mesh.visible = false
    }
  }
}

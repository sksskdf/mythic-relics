import * as THREE from 'three'

interface Puff {
  mesh: THREE.Mesh
  velocity: THREE.Vector3
  life: number
  maxLife: number
}

/** 발걸음과 회피 때 튀어 오르는 눈 먼지. 미리 만들어 둔 조각을 돌려 쓴다. */
export class Puffs {
  readonly object = new THREE.Group()
  private readonly pool: Puff[] = []
  private next = 0

  constructor(size = 64) {
    const geometry = new THREE.BoxGeometry(0.14, 0.14, 0.14)
    for (let i = 0; i < size; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0xf4f8fc, transparent: true, depthWrite: false })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.visible = false
      this.object.add(mesh)
      this.pool.push({ mesh, velocity: new THREE.Vector3(), life: 0, maxLife: 1 })
    }
  }

  /** 지점에서 눈 먼지를 count개 터뜨린다. */
  burst(origin: THREE.Vector3, count: number, spread = 1.5): void {
    for (let i = 0; i < count; i++) {
      const puff = this.pool[this.next]!
      this.next = (this.next + 1) % this.pool.length
      const angle = Math.random() * Math.PI * 2
      const speed = (0.4 + Math.random()) * spread
      puff.velocity.set(Math.cos(angle) * speed, 1 + Math.random() * 1.5, Math.sin(angle) * speed)
      puff.mesh.position.copy(origin).add(new THREE.Vector3(0, 0.1, 0))
      puff.maxLife = puff.life = 0.35 + Math.random() * 0.3
      puff.mesh.visible = true
    }
  }

  update(dt: number): void {
    for (const puff of this.pool) {
      if (puff.life <= 0) continue
      puff.life -= dt
      puff.velocity.y -= 5 * dt
      puff.mesh.position.addScaledVector(puff.velocity, dt)
      const t = Math.max(0, puff.life / puff.maxLife)
      puff.mesh.scale.setScalar(0.5 + t)
      ;(puff.mesh.material as THREE.MeshBasicMaterial).opacity = t
      puff.mesh.visible = puff.life > 0
    }
  }
}

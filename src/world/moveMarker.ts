import * as THREE from 'three'

/** 우클릭한 지점에 잠깐 나타났다 사라지는 표시 */
export class MoveMarker {
  readonly object: THREE.Mesh
  private life = 0
  private readonly duration = 0.45

  constructor() {
    const material = new THREE.MeshBasicMaterial({ color: 0x5fd0ff, transparent: true, depthWrite: false })
    this.object = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 16), material)
    this.object.rotation.x = -Math.PI / 2
    this.object.visible = false
  }

  /** forced면 적을 무시하는 이동이라 흰색으로, 아니면 파란색으로 보인다. */
  show(x: number, z: number, forced = false): void {
    ;(this.object.material as THREE.MeshBasicMaterial).color.setHex(forced ? 0xf2f7ff : 0x5fd0ff)
    this.object.position.set(x, 0.03, z)
    this.life = this.duration
    this.object.visible = true
  }

  update(dt: number): void {
    if (this.life <= 0) return
    this.life = Math.max(0, this.life - dt)
    const t = this.life / this.duration
    this.object.scale.setScalar(0.6 + (1 - t) * 0.8)
    ;(this.object.material as THREE.MeshBasicMaterial).opacity = t
    this.object.visible = this.life > 0
  }
}

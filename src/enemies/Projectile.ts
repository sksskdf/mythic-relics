import * as THREE from 'three'

import type { AttackSpec } from '../data/schema'
import type { Telegraph } from '../fx/Telegraphs'
import { EFFECT_LAYER } from '../render/PixelRenderer'
import { heightAt } from '../world/terrain'

/** 던진 것의 모양별 색과 크기 */
const LOOKS = {
  rock: { color: 0x7f8996, size: 0.45, glow: false },
  fire: { color: 0xff8a3c, size: 0.35, glow: true },
  water: { color: 0x6ad0f0, size: 0.32, glow: true },
  wind: { color: 0xe8f4ff, size: 0.3, glow: true },
  bone: { color: 0xe4dcc6, size: 0.3, glow: false },
  // 수호자 (E239): 요르문간드의 독, 스카디의 얼음 화살
  venom: { color: 0x9ce05a, size: 0.38, glow: true },
  ice: { color: 0xcdeeff, size: 0.26, glow: true },
} as const

/**
 * 던지기 (E8-02): 적의 손에서 떨어질 자리까지 포물선으로 날아간다. 떨어질 자리의 예고는 내려앉을 때까지 남는다.
 * 날아가는 시간 = 거리 / 빠르기. 맞는지는 떨어지는 순간 판정한다 (Giant.updateProjectiles).
 */
export class Projectile {
  readonly object = new THREE.Group()
  private t = 0
  private readonly duration: number
  private readonly mesh: THREE.Mesh

  constructor(
    readonly attack: AttackSpec,
    private readonly from: { x: number; z: number; y: number },
    readonly to: { x: number; z: number },
    private readonly telegraph: Telegraph | null,
  ) {
    const look = LOOKS[attack.projectile?.look ?? 'rock']
    const material = look.glow ? new THREE.MeshBasicMaterial({ color: look.color }) : new THREE.MeshLambertMaterial({ color: look.color })
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(look.size, look.size, look.size), material)
    if (look.glow) this.mesh.layers.set(EFFECT_LAYER)
    this.mesh.castShadow = !look.glow
    this.object.add(this.mesh)
    const dist = Math.hypot(to.x - from.x, to.z - from.z)
    this.duration = Math.max(0.25, dist / (attack.projectile?.speed ?? 12))
    this.place()
  }

  /** 지금 몇 할 날아왔나 (0~1) */
  get progress(): number {
    return Math.min(1, this.t / this.duration)
  }

  /** 날린다. 떨어졌으면 true */
  update(dt: number): boolean {
    this.t += dt
    this.place()
    this.mesh.rotation.x += dt * 9
    this.mesh.rotation.y += dt * 6
    return this.t >= this.duration
  }

  private place(): void {
    const k = this.progress
    const x = this.from.x + (this.to.x - this.from.x) * k
    const z = this.from.z + (this.to.z - this.from.z) * k
    const ground = heightAt(x, z)
    // 포물선: 가운데에서 가장 높다
    const arc = Math.sin(k * Math.PI) * Math.max(1.5, this.duration * 3)
    const y = (heightAt(this.from.x, this.from.z) + this.from.y) * (1 - k) + ground * k + arc
    this.mesh.position.set(x, y, z)
  }

  /** 원점이 옮겨졌다 (E19): 던진 곳·떨어질 곳과 그 예고를 같은 만큼 옮긴다 */
  shift(dx: number, dz: number): void {
    this.from.x += dx
    this.from.z += dz
    this.to.x += dx
    this.to.z += dz
    if (this.telegraph) {
      this.telegraph.object.position.x += dx
      this.telegraph.object.position.z += dz
      this.telegraph.object.updateMatrixWorld()
    }
    this.place()
  }

  dispose(): void {
    this.object.removeFromParent()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as THREE.Material).dispose()
    this.telegraph?.dispose()
  }
}

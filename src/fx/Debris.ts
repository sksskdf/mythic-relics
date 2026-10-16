import * as THREE from 'three'

import { toonMaterial } from '../render/toon'
import { heightAt } from '../world/terrain'

interface Chunk {
  position: THREE.Vector3
  velocity: THREE.Vector3
  spin: THREE.Vector3
  rotation: THREE.Euler
  size: number
  life: number
}

const LIFE = 1.8
const hidden = new THREE.Matrix4().makeScale(0, 0, 0)
const quaternion = new THREE.Quaternion()
const scale = new THREE.Vector3()
const matrix = new THREE.Matrix4()
const color = new THREE.Color()

/**
 * 쓰러진 적이 복셀 조각으로 부서져 흩어지는 연출.
 * 조각은 땅에 튕기며 구르다가 작아져 사라진다. 하나의 인스턴스 메시로 그린다.
 */
export class Debris {
  readonly object: THREE.InstancedMesh
  private readonly chunks: Chunk[] = []
  private next = 0

  constructor(private readonly capacity = 160) {
    this.object = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), toonMaterial(0xffffff), capacity)
    this.object.castShadow = true
    this.object.frustumCulled = false
    for (let i = 0; i < capacity; i++) {
      this.object.setMatrixAt(i, hidden)
      this.object.setColorAt(i, color.setHex(0xffffff))
      this.chunks.push({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        rotation: new THREE.Euler(),
        size: 0.1,
        life: 0,
      })
    }
  }

  /** 지점에서 조각 count개를 터뜨린다. height는 조각이 퍼지는 높이 범위 */
  burst(origin: THREE.Vector3, count: number, palette: readonly number[], height: number, chunkSize: number): void {
    for (let i = 0; i < count; i++) {
      const index = this.next
      this.next = (this.next + 1) % this.capacity
      const chunk = this.chunks[index]!
      const angle = Math.random() * Math.PI * 2
      const speed = 1.5 + Math.random() * 3.5
      chunk.position.set(
        origin.x + (Math.random() - 0.5) * 0.8,
        origin.y + Math.random() * height,
        origin.z + (Math.random() - 0.5) * 0.8,
      )
      chunk.velocity.set(Math.cos(angle) * speed, 2 + Math.random() * 4, Math.sin(angle) * speed)
      chunk.spin.set(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5)
      chunk.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
      chunk.size = chunkSize * (0.6 + Math.random() * 0.8)
      chunk.life = LIFE * (0.7 + Math.random() * 0.3)
      this.object.setColorAt(index, color.setHex(palette[i % palette.length]!))
    }
    if (this.object.instanceColor) this.object.instanceColor.needsUpdate = true
  }

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      const chunk = this.chunks[i]!
      if (chunk.life <= 0) continue
      chunk.life -= dt
      if (chunk.life <= 0) {
        this.object.setMatrixAt(i, hidden)
        continue
      }
      chunk.velocity.y -= 18 * dt
      chunk.position.addScaledVector(chunk.velocity, dt)
      const floor = heightAt(chunk.position.x, chunk.position.z) + chunk.size / 2
      if (chunk.position.y < floor) {
        // 땅에 닿으면 튕기고, 미끄러지며 멈춘다.
        chunk.position.y = floor
        chunk.velocity.y = Math.abs(chunk.velocity.y) * 0.3
        chunk.velocity.x *= 0.6
        chunk.velocity.z *= 0.6
        chunk.spin.multiplyScalar(0.6)
      }
      chunk.rotation.x += chunk.spin.x * dt
      chunk.rotation.y += chunk.spin.y * dt
      chunk.rotation.z += chunk.spin.z * dt
      const shrink = Math.min(1, chunk.life / 0.4)
      quaternion.setFromEuler(chunk.rotation)
      scale.setScalar(chunk.size * shrink)
      matrix.compose(chunk.position, quaternion, scale)
      this.object.setMatrixAt(i, matrix)
    }
    this.object.instanceMatrix.needsUpdate = true
  }
}

import * as THREE from 'three'

import { EFFECT_LAYER } from '../render/PixelRenderer'

interface Bolt {
  group: THREE.Group
  core: THREE.MeshBasicMaterial
  glow: THREE.MeshBasicMaterial
  life: number
  maxLife: number
}

const CORE = 0xf2fbff
const GLOW = 0x5fc4ff
const unit = new THREE.BoxGeometry(1, 1, 1)
const up = new THREE.Vector3(0, 1, 0)

/**
 * 번개 줄기. 두 점 사이를 지그재그로 꺾인 굵은 선으로 잇고, 짧게 깜빡이다 사라진다.
 * 번개가 칠 때 주변을 비추는 빛 하나를 미리 만들어 두고 돌려 쓴다. (빛 개수가 바뀌면 셰이더를 다시 만들어 멈칫하므로)
 */
export class Lightning {
  readonly object = new THREE.Group()
  readonly light = new THREE.PointLight(0x9fdcff, 0, 9, 1.6)
  private readonly bolts: Bolt[] = []
  private lightLife = 0

  constructor() {
    this.object.add(this.light)
  }

  /** from에서 to로 번개를 긋는다. */
  strike(from: THREE.Vector3, to: THREE.Vector3, thickness = 0.12, life = 0.2): void {
    const group = new THREE.Group()
    const core = new THREE.MeshBasicMaterial({ color: CORE, transparent: true, depthWrite: false })
    const glow = new THREE.MeshBasicMaterial({ color: GLOW, transparent: true, depthWrite: false, opacity: 0.6 })
    const points = zigzag(from, to, Math.max(3, Math.round(from.distanceTo(to) / 0.9)))
    for (let i = 0; i < points.length - 1; i++) {
      group.add(segment(points[i]!, points[i + 1]!, thickness, core, 14))
      group.add(segment(points[i]!, points[i + 1]!, thickness * 2.6, glow, 13))
    }
    group.traverse((o) => o.layers.set(EFFECT_LAYER))
    this.object.add(group)
    this.bolts.push({ group, core, glow, life, maxLife: life })
    this.light.position.copy(to).y += 1
    this.light.intensity = 6
    this.lightLife = 0.15
  }

  /** 하늘에서 땅의 한 점으로 내리꽂는다. */
  fromSky(target: THREE.Vector3, thickness = 0.16): void {
    const top = target.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2, 12, (Math.random() - 0.5) * 2))
    this.strike(top, target, thickness, 0.24)
  }

  update(dt: number): void {
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const bolt = this.bolts[i]!
      bolt.life -= dt
      if (bolt.life <= 0) {
        bolt.group.removeFromParent()
        bolt.core.dispose()
        bolt.glow.dispose()
        this.bolts.splice(i, 1)
        continue
      }
      // 깜빡이며 사라진다.
      const t = bolt.life / bolt.maxLife
      const flicker = Math.random() < 0.3 ? 0.4 : 1
      bolt.core.opacity = Math.min(1, t * 2) * flicker
      bolt.glow.opacity = 0.6 * t * flicker
    }
    this.lightLife = Math.max(0, this.lightLife - dt)
    this.light.intensity = this.lightLife > 0 ? 6 * (this.lightLife / 0.15) : 0
  }
}

/** 두 점 사이를 몇 번 꺾어 지그재그 점 목록을 만든다. */
function zigzag(from: THREE.Vector3, to: THREE.Vector3, steps: number): THREE.Vector3[] {
  const points = [from.clone()]
  const length = from.distanceTo(to)
  const jitter = Math.min(0.7, length * 0.12)
  for (let i = 1; i < steps; i++) {
    const p = from.clone().lerp(to, i / steps)
    p.x += (Math.random() - 0.5) * jitter * 2
    p.y += (Math.random() - 0.5) * jitter
    p.z += (Math.random() - 0.5) * jitter * 2
    points.push(p)
  }
  points.push(to.clone())
  return points
}

/** a에서 b까지 이어지는 가늘고 긴 상자 */
function segment(a: THREE.Vector3, b: THREE.Vector3, thickness: number, material: THREE.Material, order: number): THREE.Mesh {
  const mesh = new THREE.Mesh(unit, material)
  const dir = b.clone().sub(a)
  mesh.position.copy(a).addScaledVector(dir, 0.5)
  mesh.quaternion.setFromUnitVectors(up, dir.clone().normalize())
  mesh.scale.set(thickness, dir.length() + thickness, thickness)
  mesh.renderOrder = order
  return mesh
}

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'

import { collectPropLights, PROP_LIGHT_SLOTS, PropLight, PropLightPool } from '../src/world/propLights'

describe('소품 불빛 묶음', () => {
  it('진짜 빛 수는 불빛 자리 수와 상관없이 늘 같다', () => {
    const scene = new THREE.Scene()
    new PropLightPool(scene)
    const count = () => scene.children.filter((o) => o instanceof THREE.PointLight).length
    expect(count()).toBe(PROP_LIGHT_SLOTS)
  })

  it('주인공 가까운 자리부터 빛을 달고, 먼 자리와 남는 빛은 끈다', () => {
    const scene = new THREE.Scene()
    const pool = new PropLightPool(scene)
    const root = new THREE.Group()
    scene.add(root)
    const at = (x: number, intensity: number) => {
      const l = new PropLight(0xff8800, intensity, 9, 1.6)
      l.position.set(x, 1, 0)
      root.add(l)
      return l
    }
    ;[10, 2, 8, 4, 6, 100].forEach((x, i) => at(x, i + 1))
    scene.updateMatrixWorld()
    pool.update(new THREE.Vector3(0, 0, 0), [collectPropLights(root)])
    const real = scene.children.filter((o): o is THREE.PointLight => o instanceof THREE.PointLight)
    expect(real.map((l) => l.position.x)).toEqual([2, 4, 6, 8])
    expect(real[0]!.intensity).toBe(2)

    // 불빛이 하나뿐이면 나머지 빛은 꺼진다
    const one = new THREE.Group()
    scene.add(one)
    const solo = new PropLight(0xffffff, 3, 5, 2)
    one.add(solo)
    scene.updateMatrixWorld()
    pool.update(new THREE.Vector3(0, 0, 0), [[solo]])
    expect(real.map((l) => l.intensity)).toEqual([3, 0, 0, 0])
  })
})

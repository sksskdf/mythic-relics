import * as THREE from 'three'

import { buildTestMap, type TestMap } from '../world/testMap'

/** 무대: 하늘색, 빛과 해(그림자), 맵. 해와 그림자 범위는 주인공을 따라다닌다. */
export class Stage {
  readonly map: TestMap
  private readonly sun: THREE.DirectionalLight

  constructor(scene: THREE.Scene) {
    scene.background = new THREE.Color(0x9fb4c8)
    scene.add(new THREE.HemisphereLight(0xc4d8ff, 0x4a5566, 0.85))

    this.sun = new THREE.DirectionalLight(0xffe4bd, 2.7)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const shadowCamera = this.sun.shadow.camera
    shadowCamera.near = 1
    shadowCamera.far = 60
    this.sun.shadow.bias = -0.002
    scene.add(this.sun, this.sun.target)

    this.map = buildTestMap()
    scene.add(this.map.group)
  }

  /** 그림자가 보이는 범위가 주인공을 따라다니게 한다. */
  follow(focus: THREE.Vector3): void {
    this.sun.position.set(focus.x + 12, 20, focus.z + 6)
    this.sun.target.position.copy(focus)
  }

  /** 그림자가 그려지는 범위를 화면에 보이는 범위에 맞춘다. */
  fitShadow(viewHeight: number): void {
    const half = viewHeight * 1.15
    const shadowCamera = this.sun.shadow.camera
    shadowCamera.left = -half
    shadowCamera.right = half
    shadowCamera.top = half
    shadowCamera.bottom = -half
    shadowCamera.updateProjectionMatrix()
  }

  /** 불꽃 일렁임 등 맵의 움직이는 것 */
  update(elapsed: number): void {
    this.map.update(elapsed)
  }
}

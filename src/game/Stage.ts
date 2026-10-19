import * as THREE from 'three'

import type { RegionDef } from '../data/regions'
import { RegionMap } from '../world/regionMap'
import { THEMES } from '../world/themes'

const DUSK_SKY = new THREE.Color(0x6a70a8)

/** 무대: 하늘색, 빛과 해(그림자), 맵. 해와 그림자 범위는 주인공을 따라다닌다. */
export class Stage {
  readonly map: RegionMap
  private readonly sun: THREE.DirectionalLight
  private readonly hemi: THREE.HemisphereLight
  private readonly sky = new THREE.Color()

  constructor(scene: THREE.Scene, region: RegionDef) {
    scene.background = this.sky
    this.hemi = new THREE.HemisphereLight(0xc4d8ff, 0x4a5566, 0.85)
    scene.add(this.hemi)

    this.sun = new THREE.DirectionalLight(0xffe4bd, 2.7)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    const shadowCamera = this.sun.shadow.camera
    shadowCamera.near = 1
    shadowCamera.far = 60
    this.sun.shadow.bias = -0.002
    scene.add(this.sun, this.sun.target)

    this.map = new RegionMap(region)
    scene.add(this.map.group)
    this.applyLight()
  }

  /** 그림자를 켜고 끈다 (화질 낮음에서 끈다) */
  setShadows(on: boolean): void {
    this.sun.castShadow = on
  }

  /** 지역을 바꾼다: 맵을 다시 짓고 하늘빛을 그 테마로 */
  load(region: RegionDef): void {
    this.map.load(region)
    this.applyLight()
  }

  /** 해 질 녘 (시작 화면 뒤, E9-08): 하늘과 반구광을 낮추고 해를 붉게 기울여 모닥불이 돋보이게 */
  private dusk = false

  setDusk(on: boolean): void {
    this.dusk = on
    this.applyLight()
  }

  private applyLight(): void {
    const light = THEMES[this.map.region.theme].light
    this.sky.setHex(light.sky)
    this.hemi.color.setHex(light.hemiSky)
    this.hemi.groundColor.setHex(light.hemiGround)
    this.hemi.intensity = light.hemi
    this.sun.color.setHex(light.sun)
    this.sun.intensity = light.sunIntensity
    if (this.dusk) {
      this.sky.multiplyScalar(0.45)
      this.hemi.color.lerp(DUSK_SKY, 0.6)
      this.hemi.intensity *= 0.55
      this.sun.color.setHex(0xffa070)
      this.sun.intensity *= 0.6
    }
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

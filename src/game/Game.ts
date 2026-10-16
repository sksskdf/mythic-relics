import * as THREE from 'three'

import { PixelRenderer } from '../render/PixelRenderer'
import { QuarterViewCamera } from '../render/QuarterViewCamera'
import { TARGET_RENDER_HEIGHT } from '../render/resolution'
import { buildPlaceholderHero } from '../world/placeholderHero'
import { buildTestMap } from '../world/testMap'
import { frameDelta } from './clock'

export interface GameOptions {
  /** 저해상도 렌더링의 기준 세로 픽셀 수 */
  renderHeight?: number
}

/** 게임 전체를 묶는 최상위 객체. 렌더러, 장면, 카메라, 메인 루프를 가진다. */
export class Game {
  readonly scene = new THREE.Scene()
  readonly pixel: PixelRenderer
  readonly view = new QuarterViewCamera()
  readonly hero = buildPlaceholderHero()
  frame = 0

  private lastTime = performance.now()
  private elapsed = 0
  private readonly sun: THREE.DirectionalLight

  constructor(
    private readonly container: HTMLElement,
    options: GameOptions = {},
  ) {
    this.pixel = new PixelRenderer(container, options.renderHeight ?? TARGET_RENDER_HEIGHT)

    this.scene.background = new THREE.Color(0x9fb4c8)
    this.scene.add(new THREE.HemisphereLight(0xe6eeff, 0x55606e, 1.1))

    this.sun = new THREE.DirectionalLight(0xfff4e0, 2.2)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    const shadowCamera = this.sun.shadow.camera
    shadowCamera.left = -18
    shadowCamera.right = 18
    shadowCamera.top = 18
    shadowCamera.bottom = -18
    shadowCamera.near = 1
    shadowCamera.far = 60
    this.sun.shadow.bias = -0.002
    this.scene.add(this.sun, this.sun.target)

    this.scene.add(buildTestMap())
    this.scene.add(this.hero)

    this.view.jumpTo(this.hero.position)
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  /** 현재 저해상도 렌더 크기 (자동 점검용) */
  get renderSize() {
    return this.pixel.size
  }

  start(): void {
    this.pixel.renderer.setAnimationLoop((now) => this.tick(now))
  }

  private tick(now: number): void {
    const dt = frameDelta(this.lastTime, now)
    this.lastTime = now
    this.elapsed += dt

    this.updateDemoWalk()
    this.view.follow(this.hero.position, dt)
    this.followSun()

    this.pixel.render(this.scene, this.view.camera)
    this.frame += 1
  }

  /** 조작(M2)이 붙기 전까지, 카메라가 따라가는 모습을 보기 위해 주인공을 원을 그리며 걷게 한다. */
  private updateDemoWalk(): void {
    const radius = 7
    const angle = this.elapsed * 0.25
    const x = Math.cos(angle) * radius - radius
    const z = Math.sin(angle) * radius
    this.hero.rotation.y = Math.atan2(x - this.hero.position.x, z - this.hero.position.z)
    this.hero.position.set(x, 0, z)
  }

  /** 그림자가 보이는 범위가 주인공을 따라다니게 한다. */
  private followSun(): void {
    const focus = this.hero.position
    this.sun.position.set(focus.x + 12, 20, focus.z + 6)
    this.sun.target.position.copy(focus)
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container
    const size = this.pixel.setScreenSize(width, height)
    this.view.setRenderSize(size.width, size.height)
  }
}

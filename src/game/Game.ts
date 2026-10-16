import * as THREE from 'three'

import { Input } from '../input/Input'
import { screenToGround } from '../render/picking'
import { PixelRenderer } from '../render/PixelRenderer'
import { QuarterViewCamera } from '../render/QuarterViewCamera'
import { TARGET_RENDER_HEIGHT } from '../render/resolution'
import { Hud } from '../ui/Hud'
import { MoveMarker } from '../world/moveMarker'
import { NavGrid } from '../world/navGrid'
import { buildPlaceholderHero } from '../world/placeholderHero'
import { buildTestMap, MAP_HALF_EXTENT } from '../world/testMap'
import { frameDelta } from './clock'
import { HERO_RADIUS, HeroController } from './HeroController'

export interface GameOptions {
  /** 저해상도 렌더링의 기준 세로 픽셀 수 */
  renderHeight?: number
}

/** 게임 전체를 묶는 최상위 객체. 렌더러, 장면, 카메라, 입력, 메인 루프를 가진다. */
export class Game {
  readonly scene = new THREE.Scene()
  readonly pixel: PixelRenderer
  readonly view = new QuarterViewCamera()
  readonly input: Input
  readonly hero: HeroController
  readonly hud: Hud
  frame = 0

  private lastTime = performance.now()
  private readonly sun: THREE.DirectionalLight
  private readonly marker = new MoveMarker()
  private readonly cursor = new THREE.Vector3()

  constructor(
    private readonly container: HTMLElement,
    options: GameOptions = {},
  ) {
    this.pixel = new PixelRenderer(container, options.renderHeight ?? TARGET_RENDER_HEIGHT)
    this.input = new Input(this.pixel.renderer.domElement)
    this.hud = new Hud(container)

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

    const map = buildTestMap()
    this.scene.add(map.group)
    const nav = new NavGrid(MAP_HALF_EXTENT, 0.5, map.colliders, HERO_RADIUS)

    const heroObject = buildPlaceholderHero()
    this.scene.add(heroObject)
    this.hero = new HeroController(heroObject, nav, map.colliders, MAP_HALF_EXTENT)
    this.scene.add(this.marker.object)

    this.view.jumpTo(heroObject.position)
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

    const cursor = this.cursorOnGround()
    this.hero.update(dt, this.input, cursor)
    if (this.hero.lastMoveTarget) this.marker.show(this.hero.lastMoveTarget.x, this.hero.lastMoveTarget.z)
    this.marker.update(dt)

    const position = this.hero.object.position
    this.view.follow(position, dt)
    this.followSun(position)

    this.hud.update(
      {
        life: 1,
        divine: 0,
        dodgeCooldown: this.hero.dodgeCooldownLeft / this.hero.tuning.dodgeCooldown,
      },
      this.input,
    )

    this.pixel.render(this.scene, this.view.camera)
    this.input.endFrame()
    this.frame += 1
  }

  /** 마우스 커서가 가리키는 땅 위치 */
  private cursorOnGround(): THREE.Vector3 | null {
    const { pointer } = this.input
    return screenToGround(pointer.x, pointer.y, this.container.clientHeight, this.pixel.size, this.view.camera, this.cursor)
  }

  /** 그림자가 보이는 범위가 주인공을 따라다니게 한다. */
  private followSun(focus: THREE.Vector3): void {
    this.sun.position.set(focus.x + 12, 20, focus.z + 6)
    this.sun.target.position.copy(focus)
  }

  private resize(): void {
    const { clientWidth: width, clientHeight: height } = this.container
    const size = this.pixel.setScreenSize(width, height)
    this.view.setRenderSize(size.width, size.height)
  }
}

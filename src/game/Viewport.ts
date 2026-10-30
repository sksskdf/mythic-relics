import type { AudioEngine } from '../audio/AudioEngine'
import { PixelRenderer } from '../render/PixelRenderer'
import type { QuarterViewCamera } from '../render/QuarterViewCamera'
import { renderHeightForScreen, TARGET_RENDER_HEIGHT, visibleHeight } from '../render/resolution'
import { clampViewHeight, RENDER_SCALE, type RenderQuality, type Settings, settingsStorage } from '../save/settings'
import type { Hud } from '../ui/Hud'
import type { Stage } from './Stage'

/** 화면이 손대는 게임의 부품. 함수는 만들어진 뒤에 읽는다 */
export interface ViewportParts {
  readonly container: HTMLElement
  readonly view: QuarterViewCamera
  stage(): Stage
  hud(): Hud
  audio(): AudioEngine
  /** 대화 장면(줌인·줌아웃 포함)의 시야는 장면이 정한다 */
  sceneActive(): boolean
}

/** 시작 옵션 가운데 화면에 닿는 것 */
export interface ViewportOptions {
  /** 저해상도 렌더링의 기준 세로 픽셀 수 (?res=) */
  renderHeight?: number
  /** 화면 세로 방향에 보이는 범위 (미터, ?view=) */
  viewHeight?: number
  /** 화질을 이것으로 (?quality=, 설정에 저장하지 않는다) */
  quality?: RenderQuality
}

/**
 * 화면과 설정 (E305-04에서 Game.ts에서 뗌): 픽셀 렌더러, 확대·축소(휠·두 손가락), 창 크기에 맞춘 렌더 크기,
 * 일시 정지 메뉴의 설정(음량·흔들림·번쩍임·화질) 적용.
 */
export class Viewport {
  readonly pixel: PixelRenderer
  /** 지금 설정 (저장한 것에 ?quality=를 덮은 것) */
  settings: Settings
  /** 가장 크게 확대했을 때(시야 12m)의 렌더 세로 픽셀 수. ?res= 로 바꿔 볼 수 있고, 설정의 해상도를 곱한다 */
  private baseRenderHeight: number
  /** ?res= 로 정한 기준 (없으면 기본값) */
  private readonly requestedRenderHeight: number

  constructor(
    private readonly parts: ViewportParts,
    options: ViewportOptions,
  ) {
    this.settings = settingsStorage.load()
    if (options.quality) this.settings = { ...this.settings, quality: options.quality }
    // ?res= 로 픽셀 밀도를 바꿔 볼 수 있다. 기본은 프로토타입의 밀도에 설정의 해상도를 곱한다
    this.requestedRenderHeight = options.renderHeight ?? TARGET_RENDER_HEIGHT
    this.baseRenderHeight = options.renderHeight ?? Math.round(TARGET_RENDER_HEIGHT * RENDER_SCALE[this.settings.quality])
    this.pixel = new PixelRenderer(parts.container, this.baseRenderHeight)
  }

  /** 첫 시야와 휠: 주소의 ?view= 가 있으면 그 값, 없으면 저장한 설정 (입력을 만든 뒤에 부른다) */
  attach(viewHeight?: number): void {
    const { container, view } = this.parts
    view.viewHeight = viewHeight ?? this.settings.viewHeight
    this.pixel.setTargetHeight(renderHeightForScreen(view.viewHeight, container.clientWidth, container.clientHeight, this.baseRenderHeight))
    this.pixel.renderer.domElement.addEventListener('wheel', (e) => this.onWheel(e), { passive: false })
  }

  /** 설정을 적용한다: 음량, 흔들림, 번쩍임, 렌더 해상도 */
  apply(next: Settings = this.settings): void {
    const before = this.settings
    this.settings = next
    this.parts.audio().setVolumes(next.volume)
    this.parts.view.shakeScale = next.shake ? 1 : 0
    this.parts.hud().flashEnabled = next.flash
    // 낮음: 그림자를 끈다 (그림자 패스가 장면을 한 번 더 그린다)
    this.parts.stage().setShadows(next.quality !== 'low')
    if (next.quality !== before.quality && this.requestedRenderHeight === TARGET_RENDER_HEIGHT) {
      this.baseRenderHeight = Math.round(TARGET_RENDER_HEIGHT * RENDER_SCALE[next.quality])
      this.setViewHeight(this.parts.view.viewHeight)
    }
  }

  /** 일시 정지 메뉴에서 바꾼 설정을 저장하고 적용한다 */
  change(patch: Partial<Settings>): void {
    this.apply(settingsStorage.update(patch))
  }

  /** 두 손가락 확대·축소 (E235): end면 손을 뗀 것이라 설정에 남긴다 */
  zoom(viewHeight: number, end: boolean): void {
    const { view } = this.parts
    // 대화 장면의 시야는 장면이 정한다 (휠과 같이)
    if (this.parts.sceneActive()) return
    if (viewHeight !== view.viewHeight) this.setViewHeight(viewHeight)
    if (end) this.settings = settingsStorage.update({ viewHeight: view.viewHeight })
  }

  /** 마우스 휠로 확대·축소한다. 설정에 저장되어 다시 켜도 유지된다. */
  private onWheel(e: WheelEvent): void {
    e.preventDefault()
    // 대화 장면(줌인·줌아웃 포함)의 시야는 장면이 정한다. 바꾸지도 저장하지도 않는다
    if (this.parts.sceneActive()) return
    const next = clampViewHeight(this.parts.view.viewHeight * (e.deltaY > 0 ? 1.1 : 1 / 1.1))
    if (next === this.parts.view.viewHeight) return
    this.setViewHeight(next)
    this.settings = settingsStorage.update({ viewHeight: next })
  }

  /** 확대·축소. 그림자가 그려지는 범위도 보이는 범위에 맞춘다. */
  setViewHeight(viewHeight: number): void {
    this.applyViewHeight(clampViewHeight(viewHeight))
  }

  /** 보이는 범위를 그대로 바꾼다 (대화 장면의 줌은 평소 범위보다 가깝다) */
  applyViewHeight(next: number): void {
    this.parts.view.viewHeight = next
    this.resize()
    this.parts.view.setViewHeight(next)
  }

  /** 창 크기에 맞추고, 창 크기가 바뀔 때마다 다시 맞춘다 (게임을 다 지은 뒤에 부른다) */
  fit(): void {
    this.resize()
    window.addEventListener('resize', () => this.resize())
  }

  private resize(): void {
    const { container, view } = this.parts
    const { clientWidth: width, clientHeight: height } = container
    // 가장 크게 확대했을 때의 픽셀 크기를 기준으로, 넓게 볼 때는 뭉개지지 않을 만큼만 해상도를 올린다 (세로 화면은 늘어난 세로만큼 더)
    this.pixel.setTargetHeight(renderHeightForScreen(view.viewHeight, width, height, this.baseRenderHeight))
    const size = this.pixel.setScreenSize(width, height)
    view.setRenderSize(size.width, size.height)
    this.parts.stage().fitShadow(visibleHeight(view.viewHeight, width, height))
  }
}

import * as THREE from 'three'

import type { QuarterViewCamera } from '../render/QuarterViewCamera'
import type { Hud } from '../ui/Hud'
import type { HeroController } from './HeroController'
import type { Stage } from './Stage'
import type { Effects } from './systems/Effects'

/**
 * 시작 화면 뒤의 장면 (E9-08, E11-03에서 Game.ts에서 뗌).
 * 해 질 녘 마을에 눈·꽃잎이 날리고, 주인공은 숨만 쉬며, 카메라가 둘레를 천천히 흘러 마을이 살아 있게 보인다.
 */
export class TitleBackdrop {
  /** 카메라가 바라보는 곳 */
  private readonly focus = new THREE.Vector3()

  constructor(
    private readonly parts: { hero: HeroController; fx: Effects; stage: Stage; view: QuarterViewCamera; hud: Hud },
  ) {}

  /** 시작 화면을 띄우거나 닫는다: 해 질 녘 빛과 HUD 숨기기 */
  show(on: boolean): void {
    this.parts.stage.setDusk(on)
    this.parts.hud.root.classList.toggle('is-hidden', on)
  }

  /** 한 프레임. elapsed는 게임이 센 누적 시간 */
  update(dt: number, elapsed: number): void {
    const { hero, fx, stage, view } = this.parts
    hero.update(dt)
    const position = hero.object.position
    fx.snow.update(dt, position, elapsed)
    stage.update(elapsed)
    const t = elapsed * 0.08
    this.focus.set(position.x - 6 + Math.sin(t) * 2, position.y, position.z + 3 + Math.cos(t * 0.7) * 1.2)
    view.follow(this.focus, dt)
    stage.follow(position)
  }
}

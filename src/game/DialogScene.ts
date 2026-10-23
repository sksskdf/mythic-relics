import * as THREE from 'three'

import { SCENES, type SceneDef } from '../data/scenes'
import type { DialogBox } from '../ui/DialogBox'
import type { HeroController } from './HeroController'
import type { Villagers } from './Villagers'

/** 대화 중 화면 세로에 보이는 범위 (m). 평소(12~24m)보다 가깝게 */
const SCENE_VIEW = 8
/** 줌인·줌아웃에 걸리는 시간 (초) */
const ZOOM_SECONDS = 0.6

/** 대화 장면이 게임에서 쓰는 것 */
export interface SceneHost {
  hero: HeroController
  villagers: Villagers
  box: DialogBox
  /** 대화 중 HUD를 숨기거나 다시 보인다 */
  setHudHidden(hidden: boolean): void
  /** 지금 보이는 범위 (m) */
  viewHeight(): number
  /** 보이는 범위를 바꾼다 (설정에는 저장하지 않는다) */
  setViewHeight(viewHeight: number): void
  /** 이동 지시를 지운다 */
  clearOrders(): void
  /** 장면을 처음 끝까지 봤다 (저장) */
  onSeen(id: string): void
  /** 본 장면 기록 (저장과 함께 쓴다) */
  seen: Set<string>
}

/**
 * 대화 장면 재생기 (E12-10, DESIGN.md 9.5): 동물의 숲 같은 짧은 대화.
 * 카메라가 말하는 사람 쪽으로 다가가고 HUD와 이동 클릭이 사라진다. 대사는 대화 상자에 한 자씩 써지고,
 * 누르면 완성·다음 줄. 마지막 줄 뒤에는 줌아웃하며 원래 화면으로 돌아온다. 한 번 본 장면은 건너뛸 수 있다.
 */
export class DialogScene {
  private scene: SceneDef | null = null
  private line = 0
  /** 줌: 0(평소) → 1(대화). 닫는 중이면 줄어든다 */
  private zoom = 0
  private closing = false
  private normalView = 16
  /** 카메라가 바라볼 곳 (주인공과 말하는 사람 사이) */
  readonly focus = new THREE.Vector3()
  private nod = 0

  constructor(private readonly host: SceneHost) {
    host.box.onAdvance = () => this.advance()
    host.box.onSkip = () => this.finish()
  }

  /** 대화 중인가 (이동 입력을 받지 않는다) */
  get active(): boolean {
    return this.scene !== null
  }

  /** 지금 장면 id (점검용) */
  get current(): string | null {
    return this.scene?.id ?? null
  }

  /** 장면을 연다. 없는 장면이거나 이미 대화 중이면 false */
  play(id: string): boolean {
    const scene = SCENES[id]
    if (!scene || this.scene) return false
    this.scene = scene
    this.line = 0
    this.closing = false
    this.zoom = 0
    this.normalView = this.host.viewHeight()
    this.host.clearOrders()
    this.host.hero.stop()
    this.host.setHudHidden(true)
    this.host.box.open(this.host.seen.has(id))
    this.showLine()
    return true
  }

  update(dt: number): void {
    if (!this.scene) return
    const { hero, villagers, box } = this.host
    box.update(dt)
    // 줌인·줌아웃
    const before = this.zoom
    this.zoom = THREE.MathUtils.clamp(this.zoom + (this.closing ? -dt : dt) / ZOOM_SECONDS, 0, 1)
    if (this.zoom !== before) {
      const t = this.zoom * this.zoom * (3 - 2 * this.zoom)
      this.host.setViewHeight(THREE.MathUtils.lerp(this.normalView, SCENE_VIEW, t))
    }
    // 말하는 사람과 주인공 사이를 본다. 말하는 사람은 주인공 쪽을 보고, 끄덕이면 몸을 살짝 숙인다
    const speaker = villagers.find(this.scene.lines[Math.min(this.line, this.scene.lines.length - 1)]!.who)
    const p = hero.object.position
    if (speaker) {
      this.focus.set((p.x + speaker.def.x) / 2, p.y, (p.z + speaker.def.z) / 2)
      villagers.lookAt(speaker, p, dt)
      hero.face(Math.atan2(speaker.def.x - p.x, speaker.def.z - p.z))
      this.nod = Math.max(0, this.nod - dt)
      speaker.rig.head.rotation.x = Math.sin((1 - this.nod / 0.5) * Math.PI) * 0.35 * (this.nod > 0 ? 1 : 0)
    } else this.focus.copy(p)
    if (this.closing && this.zoom <= 0) this.end()
  }

  private showLine(): void {
    const scene = this.scene!
    const line = scene.lines[this.line]!
    this.host.box.say(line.who, line.text)
    if (line.pose === 'nod') this.nod = 0.5
  }

  private advance(): void {
    const scene = this.scene
    if (!scene || this.closing) return
    if (this.line + 1 < scene.lines.length) {
      this.line += 1
      this.showLine()
    } else this.finish()
  }

  /** 마지막 줄 뒤나 건너뛰기: 대화 상자를 닫고 줌아웃한다 */
  private finish(): void {
    const scene = this.scene
    if (!scene || this.closing) return
    this.closing = true
    this.host.box.close()
    if (!this.host.seen.has(scene.id)) {
      this.host.seen.add(scene.id)
      this.host.onSeen(scene.id)
    }
  }

  private end(): void {
    this.scene = null
    this.closing = false
    this.host.setViewHeight(this.normalView)
    this.host.setHudHidden(false)
  }
}

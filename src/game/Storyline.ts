import { SCENES, sceneId } from '../data/scenes'
import type { GameContext } from './context'
import type { DialogScene } from './DialogScene'
import type { Villagers } from './Villagers'

/** 장면 순서가 게임에서 쓰는 것 */
export interface StorylineParts {
  readonly ctx: GameContext
  readonly scenes: DialogScene
  readonly villagers: Villagers
  /** 정보 화면이나 일시 정지 창이 열려 게임이 멈췄는가 */
  paused(): boolean
  /** 큰 카드·장면 같은 순간을 보이는 중인가 (E23-01: 짧은 대화는 그 뒤에) */
  holding?(): boolean
}

/** 말 걸 마을 사람 곁이라고 보는 거리 (m) */
const TALK_REACH = 2.6

/**
 * 대화 장면을 언제 여는가 (E15-06): 처음 보는 일(신화 개방·첫 벼리기·한계를 깸·위협 단계 오름·보스 등장)의 짧은 장면과,
 * 누른 마을 사람에게 걸어가 말 걸기. 창이 열려 있거나 다른 장면 중이면 미뤘다가 차례로 연다.
 */
export class Storyline {
  /** 처음 보는 일의 대화 장면을 띄우는가 (봇·점검 스크립트는 끈다) */
  enabled = true
  /** 걸어가 말을 걸 마을 사람 */
  talkTo: string | null = null
  /** 창이 열려 있거나 다른 장면 중이라 미룬 장면. 창을 닫으면 차례로 연다 */
  private readonly pending: string[] = []

  constructor(private readonly parts: StorylineParts) {
    const { bus, threat } = parts.ctx
    // 신화 개방: 숙련으로 여럿이 함께 열리면(아직 고른 신화가 없을 때 그 신화권 신 넷) 장면이 줄줄이 서지 않게,
    // 이미 다른 신화의 장면이 떠 있거나 기다리면 미루고 그 신화를 처음 고를 때 연다
    bus.on('mythOpened', ({ god, quiet }) => !quiet && !this.mythBusy() && this.play(sceneId('myth', god)))
    bus.on('manifested', ({ god }) => this.play(sceneId('myth', god)))
    bus.on('forged', ({ stage }) => stage === 1 && this.play('forgeFirst'))
    bus.on('limitBroken', () => this.play('limitBreak'))
    bus.on('threatChanged', () => threat.level === threat.reached && threat.reached >= 2 && this.play('threatUp'))
  }

  /**
   * 처음 보는 일의 짧은 대화 장면. 본 장면·꺼 둔 때(봇·점검)·다른 지역의 장면은 열지 않는다.
   * 창이 열려 있거나(대장간에서 처음 제작 등) 다른 장면 중이면 미뤘다가 연다:
   * 장면은 HUD를 숨기는데 창은 HUD 안에 있어, 창이 열린 채 장면이 서면 둘 다 멈춘다.
   * 큰 카드·장면 같은 순간을 보이는 중이어도 미룬다 (벼린 큰 카드 뒤에 대장장이의 한마디). now면 순간이 연 장면이라 바로
   */
  play(id: string, now = false): boolean {
    const { ctx, scenes, paused } = this.parts
    const scene = SCENES[id]
    if (!this.enabled || !scene || ctx.scenesSeen.has(id)) return false
    if (scene.region && scene.region !== ctx.map.region.id) return false
    if (scenes.current === id || this.pending.includes(id)) return true
    if (paused() || scenes.active || (!now && this.parts.holding?.())) {
      if (!this.pending.includes(id)) this.pending.push(id)
      return true
    }
    return scenes.play(id)
  }

  /** 신화 개방 장면이 떠 있거나 기다리는가 */
  private mythBusy(): boolean {
    const current = this.parts.scenes.current
    return (current?.startsWith('myth') ?? false) || this.pending.some((id) => id.startsWith('myth'))
  }

  /** 게임이 멈추지 않은 프레임마다: 다른 장면·순간이 없으면 미룬 장면을 하나 연다 */
  next(): void {
    if (!this.parts.scenes.active && !this.parts.holding?.() && this.pending.length > 0) this.play(this.pending.shift()!)
  }

  /** 게임 한 프레임 뒤: 말 걸 마을 사람 곁에 닿았는가, 보스와 처음 싸움이 붙었는가 */
  update(position: { x: number; z: number }): void {
    const { ctx, scenes, villagers } = this.parts
    if (this.talkTo) {
      const v = villagers.find(this.talkTo)
      if (!v) this.talkTo = null
      else if (Math.hypot(position.x - v.def.x, position.z - v.def.z) < TALK_REACH) {
        const talk = Object.values(SCENES).find((sc) => sc.id.startsWith('talk') && sc.lines[0]!.who === this.talkTo)
        if (talk) scenes.play(talk.id)
        this.talkTo = null
      }
    }
    // 보스 등장: 처음 싸움이 붙으면 한마디
    const boss = ctx.encounter.boss
    if (boss?.alive && ctx.encounter.bossEngaged && !ctx.legend.active) this.play(sceneId('boss', boss.spec.id))
  }
}

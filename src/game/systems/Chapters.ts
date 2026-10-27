import type { ChapterStep } from '../../data/chapters'
import type { GameContext } from '../context'

/**
 * 장 진행 (E22-01): 땅에 들어섬·보스 처치를 적고, 신화·유물이 바뀌면 지금 장과 목표를 다시 본다.
 * 장이 바뀌면 chapterChanged, 목표가 바뀌면 goalChanged를 보낸다 (HUD 한 줄·장 제목 띠·지도·결계가 듣는다).
 */
export class ChapterSystem {
  private index: number
  private goal: ChapterStep | null

  constructor(private readonly ctx: GameContext) {
    const { bus, chapters } = ctx
    this.index = chapters.index
    this.goal = chapters.goal
    bus.on('regionEntered', ({ id }) => {
      if (ctx.map.region.kind === 'rift') return
      if (chapters.enter(id)) this.check()
    })
    bus.on('giantKilled', ({ giant }) => {
      const region = ctx.map.region
      // 땅의 보스만 (성소의 전설·시련·균열 층의 보스는 세지 않는다)
      if (giant.spec.role !== 'boss' || !region.boss || ctx.legend.active || region.kind === 'rift') return
      if (chapters.bossDefeated(region.id)) this.check()
    })
    bus.on('mythOpened', () => this.check())
    bus.on('promoted', () => this.check())
    bus.on('forged', () => this.check())
  }

  /** 지금 장과 목표를 다시 본다 (불러온 뒤, 개발 지름길 뒤에도) */
  check(): void {
    const { bus, chapters } = this.ctx
    const index = chapters.index
    const goal = chapters.goal
    if (index !== this.index) {
      this.index = index
      bus.emit('chapterChanged', { chapter: chapters.chapter, index })
    }
    if (goal !== this.goal) {
      this.goal = goal
      bus.emit('goalChanged', { goal })
    }
    bus.emit('progressChanged', {})
  }

  /** 불러온 뒤: 알리지 않고 지금 장과 목표를 맞춘다 */
  sync(): void {
    this.index = this.ctx.chapters.index
    this.goal = this.ctx.chapters.goal
  }
}

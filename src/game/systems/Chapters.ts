import type { ChapterDef, ChapterStep } from '../../data/chapters'
import { REGIONS } from '../../data/regions'
import { missing, nextRecipe } from '../../gear/forge'
import { MASTERY_TO_OPEN } from '../../myth/ClassProgress'
import { GODS } from '../../relics/data'
import type { GoalView } from '../../ui/ChapterHud'
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

  /**
   * HUD 목표 한 줄 (E22-04): 지금 목표의 글과, 채워야 하는 목표면 그 비율.
   * 첫 신화(그 신화권 경험치)·신화 단계(고른 신화 경험치)·벼리기(재료)는 차기 전까지 막대로 보인다
   */
  goalView(): GoalView | null {
    const { chapters, progress, build, powers } = this.ctx
    const goal = chapters.goal
    if (!goal) return null
    let ratio: number | null = null
    if (goal.kind === 'choose' && progress.opened.length === 0) {
      const xp = Math.max(0, ...Object.values(GODS).filter((g) => g.realm === goal.realm && !g.hidden).map((g) => progress.xpOf(g.id)))
      ratio = xp / MASTERY_TO_OPEN
    } else if (goal.kind === 'level' && build.chosen && progress.level(build.chosen) < goal.n!) {
      ratio = progress.xpRatio(build.chosen)
    } else if (goal.kind === 'forge' && build.chosen) {
      const recipe = nextRecipe(powers.loadout, build.chosen, powers.maxStage())
      if (recipe) {
        const lack = missing(powers.loadout, recipe)
        const need = recipe.materials.reduce((a, m) => a + m.count, 0)
        ratio = 1 - lack.reduce((a, m) => a + m.count, 0) / need
      }
    }
    // 다 찼으면 막대 없이 할 일만
    return { text: goal.goal, ratio: ratio !== null && ratio < 1 ? ratio : null }
  }

  /** 불러온 뒤: 알리지 않고 지금 장과 목표를 맞춘다 */
  sync(): void {
    this.index = this.ctx.chapters.index
    this.goal = this.ctx.chapters.goal
  }
}

/** 장 제목 띠의 색: 그 장 첫 땅의 신화권 (땅이 없는 막간은 마을 빛) */
export function chapterColor(chapter: ChapterDef): string {
  const first = Object.keys(chapter.lands)[0]
  return `var(--c-realm-${(first && REGIONS[first]?.realm) || 'hub'})`
}

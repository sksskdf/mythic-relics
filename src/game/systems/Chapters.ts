import type { ChapterDef, ChapterStep } from '../../data/chapters'
import { REGIONS } from '../../data/regions'
import { sceneId } from '../../data/scenes'
import { missing, nextRecipe } from '../../gear/forge'
import { awakenDef, HUNT_KILLS } from '../../data/awaken'
import { godDef } from '../../relics/data'
import { josa } from '../../ui/josa'
import type { GoalView } from '../../ui/ChapterHud'
import { RETURN_MIN_LEVEL, RETURN_MIN_SECONDS, RETURN_SIGNAL } from '../../data/cycle'
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
      // 무너지는 동안 통로를 넘었으면 지금 땅이 아니라 쓰러진 땅의 처치로 적는다
      const fell = ctx.encounter.fellRegion(giant)
      const region = fell && fell !== ctx.map.region.id ? (REGIONS[fell] ?? ctx.map.region) : ctx.map.region
      // 땅의 보스만 (성소의 전설·시련·균열 층의 보스는 세지 않는다)
      if (giant.spec.role !== 'boss' || !region.boss || ctx.legend.active || region.kind === 'rift') return
      if (!chapters.bossDefeated(region.id)) return
      // 장 보스를 처음 이겼다 (E23-02): 느린 동작 → 쓰러지며 하는 한마디. 마지막 보스는 엔딩 장면이 대신한다
      const last = chapters.chapters.at(-1)?.steps.at(-1)
      const step = chapters.chapters.flatMap((c) => c.steps).find((s) => s.kind === 'boss' && s.region === region.id)
      if (step && step !== last) bus.emit('moment', { id: 'chapterBoss', scene: sceneId('down', giant.spec.id), slow: true })
      this.check()
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
   * 신 깨우기(E238)는 깨우는 신이 있으면 그 조각의 할 일(사냥 막대·수호자), 신화 단계(고른 신화 경험치)·벼리기(재료)는 차기 전까지 막대로 보인다
   */
  goalView(): GoalView | null {
    const { chapters, progress, build, powers, awaken } = this.ctx
    const goal = chapters.goal
    if (!goal) return null
    // 귀환 (E304): 귀환이 할 일이면 떠난 지 2분까지 막대, 그 뒤는 받을 배율. 첫 귀환 뒤로는 받을 배율이 넉넉하면 귀환을 알린다
    const { expedition } = this.ctx
    const p = expedition.preview()
    const mult = ` (×${p.next.toFixed(2)})`
    const level = this.ctx.training.insights
    const ripe = p.seconds >= RETURN_MIN_SECONDS && level >= RETURN_MIN_LEVEL
    // 무르익기 전에는 기세 막대(깨달음 n/8), 무르익으면 받을 배율
    if (goal.kind === 'return') return ripe ? { text: goal.goal + mult, ratio: null } : { text: `기세를 모은다 ${Math.min(level, RETURN_MIN_LEVEL)}/${RETURN_MIN_LEVEL}`, ratio: Math.min(1, level / RETURN_MIN_LEVEL) }
    if (expedition.returns >= 1 && ripe && p.seconds >= RETURN_SIGNAL.after && p.next >= p.now * RETURN_SIGNAL.gain) return { text: `성소 화로에서 원정을 마친다${mult}`, ratio: null }
    let ratio: number | null = null
    const waking = awaken.waking && !progress.isOpen(awaken.waking) ? awaken.waking : null
    if (goal.kind === 'awaken' && waking) {
      const path = awakenDef(waking)!
      const name = godDef(waking).name
      if (awaken.fragments >= 2) return { text: `${josa(path.guardian.name, '을')} 쓰러뜨려 ${josa(name, '을')} 깨운다`, ratio: null }
      return { text: `${REGIONS[path.land]?.name ?? path.land}에서 사냥한다 ${awaken.hunt}/${HUNT_KILLS}`, ratio: awaken.huntRatio }
    }
    if (goal.kind === 'level' && build.chosen && progress.level(build.chosen) < goal.n!) {
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

/** 장 제목 띠의 색: 그 장 첫 땅의 신화권 (땅이 없는 장은 마을 빛) */
export function chapterColor(chapter: ChapterDef): string {
  const first = Object.keys(chapter.lands)[0]
  return `var(--c-realm-${(first && REGIONS[first]?.realm) || 'hub'})`
}

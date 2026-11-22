import { CONQUESTS, type ChapterDef, type ChapterStep } from '../../data/chapters'
import { ENEMIES } from '../../enemies/Giant'
import { AURA_SLOTS } from '../../data/powers'
import { REGIONS } from '../../data/regions'
import { sceneId } from '../../data/scenes'
import { missing, nextRecipe } from '../../gear/forge'
import { godDef } from '../../relics/data'
import { josa } from '../../ui/josa'
import type { GoalView } from '../../ui/ChapterHud'
import { RETURN_SIGNAL } from '../../data/cycle'
import { ripeNow } from './Expedition'
import { MERGE_COUNT } from '../../gear/merge'
import type { GameContext } from '../context'

/**
 * 장 진행 (E22-01): 땅에 들어섬·보스 처치를 적고, 신화·유물·귀환·탈것·합치기·맹세가 바뀌면 지금 장과 목표를 다시 본다.
 * 장이 바뀌면 chapterChanged, 목표가 바뀌면 goalChanged를 보낸다 (HUD 한 줄·장 제목 띠·지도·결계가 듣는다).
 */
export class ChapterSystem {
  private index: number
  private goal: ChapterStep | null
  /** 이번 원정에서 마지막으로 기세 레벨이 오른 때 (떠난 뒤 초, 귀환 신호의 「기세가 느려짐」, E306 D10) */
  private levelAt = 0
  /** 신 깨우기의 다음 할 일 하나가 흔적인가 수호자인가 (게임이 `WakeSystem.target`으로 단다. 없으면 깨우는 중인 신으로 짐작) */
  nextWake?: (goal: ChapterStep) => 'trace' | 'guardian' | null

  constructor(private readonly ctx: GameContext) {
    const { bus, chapters } = ctx
    this.index = chapters.index
    this.goal = chapters.goal
    bus.on('regionEntered', ({ id }) => {
      if (ctx.map.region.kind === 'endless') return
      if (chapters.enter(id)) this.check()
    })
    bus.on('giantKilled', ({ giant }) => {
      // 무너지는 동안 통로를 넘었으면 지금 땅이 아니라 쓰러진 땅의 처치로 적는다
      const fell = ctx.encounter.fellRegion(giant)
      const region = fell && fell !== ctx.map.region.id ? (REGIONS[fell] ?? ctx.map.region) : ctx.map.region
      // 땅의 보스만 (끝없는 원정 층의 보스는 세지 않는다)
      if (giant.spec.role !== 'boss' || !region.boss || region.kind === 'endless') return
      this.bossDown(region.id, giant.spec.id)
    })
    bus.on('mythOpened', () => this.check())
    bus.on('promoted', () => this.check())
    bus.on('forged', () => this.check())
    // 귀환도 할 일이다 (불씨 갈래는 promoted를 내지 않는다): 목표와 결계를 바로 맞춘다
    bus.on('expeditionReturned', () => this.check())
    // 고개지기를 만난 것도 (E241): 귀환을 이미 넉넉히 했으면 다음 귀환 할 일까지 지나가 올림포스가 바로 열린다
    bus.on('mountGained', () => this.check())
    // 영웅 합치기·맹세를 지킨 것도 할 일이다 (E306)
    bus.on('gearMerged', () => this.check())
    bus.on('oathEnded', ({ win }) => win && this.check())
    bus.on('insightGained', () => (this.levelAt = ctx.expedition.elapsed))
    bus.on('expeditionReturned', () => (this.levelAt = 0))
  }

  /**
   * 그 땅의 보스를 이겼다 (싸움과 개발 지름길이 함께 부른다). 처음이면 장 보스 장면(E23-02: 느린 동작 → 쓰러지며 하는 한마디),
   * 장 정복 보스(E305-02)면 그 카드와 `chapterConquered`. 마지막 보스는 엔딩 장면이 대신한다
   */
  bossDown(region: string, enemy = REGIONS[region]?.boss?.enemy ?? ''): void {
    const { bus, chapters, progress, expedition, mythPowers, ending } = this.ctx
    // 장 정복은 도는 힘의 칸을 하나 늘린다 (P6: 칸 수가 정복한 장을 센다). 늘지 않았으면(여섯) 줄을 뺀다
    const before = { aura: mythPowers.auraSlots, cap: progress.levelCap, mult: expedition.multiplier }
    if (!chapters.bossDefeated(region)) return
    const last = chapters.chapters.at(-1)?.steps.at(-1)
    const step = chapters.chapters.flatMap((c) => c.steps).find((s) => s.kind === 'boss' && s.region === region)
    const conquest = CONQUESTS.includes(region)
    if (step && step !== last) {
      const aura = mythPowers.auraSlots
      // 다음 장의 첫 할 일이 땅에 들어서는 것이면 그 땅이 바로 열린다 (E241: 거인 왕 → 올림포스 고개)
      const next = chapters.chapters[chapters.chapters.findIndex((c) => c.steps.includes(step)) + 1]
      const opens = next?.steps[0]?.kind === 'enter' ? REGIONS[next.steps[0].region] : undefined
      const lines = conquest
        ? [
            ...(aura > before.aura && aura <= AURA_SLOTS.max ? [`도는 힘 칸 ${before.aura} → ${aura}`] : []),
            // 신 단계·명성 배율은 엔딩 뒤 장치라 그때만 적는다 (P6: 엔딩 전 화면에 없는 말)
            ...(ending.reached && progress.levelCap > before.cap ? [`신 단계 끝 ${before.cap} → ${progress.levelCap}`] : []),
            ...(ending.reached ? [`명성 배율 ×${before.mult.toFixed(2)} → ×${expedition.multiplier.toFixed(2)}`] : []),
            ...(opens ? [`${josa(opens.name, '이')} 열렸다`] : []),
          ]
        : []
      const name = ENEMIES[enemy]?.name ?? '장 보스'
      bus.emit('moment', { id: 'chapterBoss', scene: sceneId('down', enemy), slow: true, ...(conquest ? { card: { kind: '장 정복', title: name, color: '#ffd27a', lines } } : {}) })
    }
    if (conquest) bus.emit('chapterConquered', { region, conquered: chapters.conquered })
    this.check()
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
   * 신 깨우기(E238)는 특정 신을 가리키지 않는다 (2026-11-22): 수호자가 서 있으면 「수호자를 쓰러뜨린다」, 아니면 「신의 흔적을 찾는다」
   * (사냥 막대와 기세 막대는 2026-11-20에 걷었다: 엔딩 전 깨우는 길에는 「n/m」이 없다),
   * 벼리기는 재료, 합치기는 같은 부위 희귀 수(E306), 맹세는 건 맹세가 있는지(E306)를 보인다
   */
  goalView(): GoalView | null {
    const { chapters, progress, build, powers } = this.ctx
    const goal = chapters.goal
    if (!goal) return null
    // 귀환 (E304): 글만 보인다. 목표 글은 움직이는 수(받을 배율 「×1.39」)도 시간 막대도 품지 않는다
    // (2026-11-20 손 QA: 배율은 귀환 카드가 보이고, 393 폭에서 두 줄이 된 글이 보스 막대와 겹쳤다)
    const { expedition } = this.ctx
    const p = expedition.preview()
    const toReturn = (text: string): GoalView => ({ text, ratio: null })
    if (goal.kind === 'return') return toReturn(goal.goal)
    // 귀환할 수 있나 (`ExpeditionSystem.ripe`와 같은 셈: 여기까지 왔으면 목표가 귀환을 바라지 않으니 이번 원정에서 한 일이 있어야 한다)
    const ripe = ripeNow(this.ctx, false)
    // 귀환 신호 (E306 D10, `DESIGN.md` 5.3): 첫 귀환 뒤로, 귀환할 수 있고 성장이 느려졌거나 받을 배율이 넉넉하면. 합치기 목표 동안은 알리지 않는다 (D8: 모은 희귀가 원형으로 녹는다)
    const quiet = p.seconds - this.levelAt >= RETURN_SIGNAL.quietLevel
    if (goal.kind !== 'merge' && expedition.returns >= 1 && ripe && (quiet || p.next >= p.now * RETURN_SIGNAL.gain)) return toReturn('성소 화로에서 원정을 마친다')
    let ratio: number | null = null
    if (goal.kind === 'awaken') {
      // 다음 할 일 하나가 흔적이면 수호자가 서 있어도 「신의 흔적을 찾는다」 (그 흔적이 더 가깝다, `pickAwaken`)
      const next = this.nextWake?.(goal)
      const standing = next !== undefined ? next === 'guardian' : this.ctx.awaken.waking.some((g) => !progress.isOpen(g) && godDef(g).realm === goal.realm)
      const text = standing ? GUARDIAN_GOAL : goal.goal
      // 첫 귀환 전에도 귀환할 수 있게 되면 한 마디 덧붙인다 (성소의 빛기둥과 함께, 2026-11-22 손 QA)
      return { text: ripe ? `${text} · ${RETURN_NOTE}` : text, ratio: null }
    }
    // 합치기 (E306): 가방에 든 같은 부위 희귀가 가장 많은 수 ÷ 셋 (합치기는 가방의 것만 받는다, 낀 것은 세지 않는다)
    if (goal.kind === 'merge') {
      const rare = new Map<string, number>()
      for (const uid of powers.loadout.bag) {
        const item = powers.loadout.gear.get(uid)
        if (item?.grade === 'rare') rare.set(item.part, (rare.get(item.part) ?? 0) + 1)
      }
      ratio = Math.max(0, ...rare.values()) / MERGE_COUNT
    }
    // 맹세 (E306): 건 맹세가 있으면 보스·수호자를, 없으면 다음 출발에 건다
    if (goal.kind === 'oath') return { text: expedition.oath ? '건 맹세를 지킨다 · 보스나 수호자' : '다음 출발에 맹세를 건다', ratio: null }
    // 벼리기는 저장된 자리의 손 신 유물로 (빈 손의 맹세 동안에도 막대가 보이게)
    const hand = progress.pantheon.hand ?? build.chosen
    if (goal.kind === 'forge' && hand) {
      const recipe = nextRecipe(powers.loadout, hand, powers.maxStage())
      if (recipe) {
        const lack = missing(powers.loadout, recipe)
        const need = recipe.materials.reduce((a, m) => a + m.count, 0)
        ratio = 1 - lack.reduce((a, m) => a + m.count, 0) / need
      }
    }
    // 다 찼으면 막대 없이 할 일만
    return { text: goal.goal, ratio: ratio !== null && ratio < 1 ? ratio : null }
  }

  /** 불러온 뒤: 알리지 않고 지금 장과 목표를 맞춘다 (기세가 오른 때는 불러온 때부터 잰다) */
  sync(): void {
    this.index = this.ctx.chapters.index
    this.goal = this.ctx.chapters.goal
    this.levelAt = this.ctx.expedition.elapsed
  }
}

/** 신 깨우기의 목표 한 줄 (특정 신을 가리키지 않는다): 그 신화권 신의 수호자가 서 있을 때. 아니면 장 자료의 글(「신의 흔적을 찾는다」) */
export const GUARDIAN_GOAL = '수호자를 쓰러뜨린다'
/** 귀환할 수 있을 때 목표 한 줄에 덧붙이는 말 */
export const RETURN_NOTE = '귀환할 수 있다'
/** 지금 땅에 밟지 않은 빛이 있을 때의 목표 한 줄 */
export const LIGHT_GOAL = '신들의 빛을 밟는다'
/** 흔적을 지키는 무리가 깨어나 있을 때의 목표 한 줄 (P5): 힘을 고른 뒤 */
export const PACK_GOAL = '지키는 것들을 쓰러뜨린다'

/** 장 제목 띠의 색: 그 장 첫 땅의 신화권 (땅이 없는 장은 마을 빛) */
export function chapterColor(chapter: ChapterDef): string {
  const first = Object.keys(chapter.lands)[0]
  return `var(--c-realm-${(first && REGIONS[first]?.realm) || 'hub'})`
}

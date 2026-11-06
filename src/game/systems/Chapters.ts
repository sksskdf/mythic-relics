import { CONQUESTS, type ChapterDef, type ChapterStep } from '../../data/chapters'
import { ENEMIES } from '../../enemies/Giant'
import { breathSlots } from '../../myth/pantheon'
import { REGIONS } from '../../data/regions'
import { sceneId } from '../../data/scenes'
import { missing, nextRecipe } from '../../gear/forge'
import { WAKE, WAKE_GODS, wakeDef, mayWake, traceLevel, traceStateOf } from '../../data/wake'
import type { God } from '../../relics/data'
import { godDef } from '../../relics/data'
import { josa } from '../../ui/josa'
import type { GoalView } from '../../ui/ChapterHud'
import { RETURN_MIN_SECONDS, RETURN_SIGNAL, returnMinLevel } from '../../data/cycle'
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
    const { bus, chapters, progress, expedition } = this.ctx
    // 숨 칸은 자리와 같은 셈으로 (지킨 홀로의 맹세와 엔딩 전 끝 4까지 넣어, 늘지 않았으면 줄을 뺀다)
    const before = { breath: breathSlots(this.ctx), cap: progress.levelCap, mult: expedition.multiplier }
    if (!chapters.bossDefeated(region)) return
    const last = chapters.chapters.at(-1)?.steps.at(-1)
    const step = chapters.chapters.flatMap((c) => c.steps).find((s) => s.kind === 'boss' && s.region === region)
    const conquest = CONQUESTS.includes(region)
    if (step && step !== last) {
      const breath = breathSlots(this.ctx)
      // 다음 장의 첫 할 일이 땅에 들어서는 것이면 그 땅이 바로 열린다 (E241: 거인 왕 → 올림포스 고개)
      const next = chapters.chapters[chapters.chapters.findIndex((c) => c.steps.includes(step)) + 1]
      const opens = next?.steps[0]?.kind === 'enter' ? REGIONS[next.steps[0].region] : undefined
      const lines = conquest
        ? [
            ...(breath > before.breath ? [`숨 칸 ${before.breath} → ${breath}`] : []),
            ...(progress.levelCap > before.cap ? [`신 단계 끝 ${before.cap} → ${progress.levelCap}`] : []),
            `명성 배율 ×${before.mult.toFixed(2)} → ×${expedition.multiplier.toFixed(2)}`,
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
   * 신 깨우기(E238)는 깨우는 신이 있으면 그 조각의 할 일(사냥 막대·수호자), 흔적이 기세를 기다리면 기세 막대(E306),
   * 벼리기는 재료, 합치기는 같은 부위 희귀 수(E306), 맹세는 건 맹세가 있는지(E306)를 보인다
   */
  goalView(): GoalView | null {
    const { chapters, progress, build, powers, awaken, ending } = this.ctx
    const goal = chapters.goal
    if (!goal) return null
    // 귀환 (E304): 무르익기 전에는 기세 막대(깨달음 n/문턱, 문턱은 귀환 번호마다 E306 D9), 무르익으면 받을 배율
    const { expedition } = this.ctx
    const p = expedition.preview()
    const mult = ` (×${p.next.toFixed(2)})`
    const level = this.ctx.training.insights
    const need = returnMinLevel(expedition.returns + 1, ending.reached)
    const ripe = p.seconds >= RETURN_MIN_SECONDS && level >= need
    const toReturn = (text: string): GoalView => (ripe ? { text: text + mult, ratio: null } : { text: `기세를 모은다 ${Math.min(level, need)}/${need}`, ratio: Math.min(1, level / need) })
    if (goal.kind === 'return') return toReturn(goal.goal)
    // 깨울 신의 흔적이 잠잠하다 (E305-03: 신을 더 깨우려면 귀환이나 장 정복을 더 해야 함): 깨우기 대신 귀환을 안내한다
    if (this.awaitsReturn()) return toReturn('성소 화로에서 원정을 마친다')
    // 귀환 신호 (E306 D10, `DESIGN.md` 5.3): 첫 귀환 뒤로, 문턱을 넘었고 기세가 느려졌거나 받을 배율이 넉넉하면. 합치기 목표 동안은 알리지 않는다 (D8: 모은 희귀가 원형으로 녹는다)
    const quiet = p.seconds - this.levelAt >= RETURN_SIGNAL.quietLevel
    if (goal.kind !== 'merge' && expedition.returns >= 1 && ripe && (quiet || p.next >= p.now * RETURN_SIGNAL.gain)) return { text: `성소 화로에서 원정을 마친다${mult}`, ratio: null }
    let ratio: number | null = null
    const waking = awaken.waking && !progress.isOpen(awaken.waking) ? awaken.waking : null
    if (goal.kind === 'awaken' && waking) {
      const path = wakeDef(waking)!
      const name = godDef(waking).name
      if (awaken.fragments >= 2) return { text: `${josa(path.guardian.name, '을')} 쓰러뜨려 ${josa(name, '을')} 깨운다`, ratio: null }
      return { text: `${REGIONS[path.land]?.name ?? path.land}에서 사냥한다 ${awaken.hunt}/${awaken.need}`, ratio: awaken.huntRatio }
    }
    // 흔적이 기세를 기다린다 (E306 D11): 그 신화권의 열린 땅에 응답할 흔적이 없고 기세가 모자란 흔적이 있으면 기세 막대
    if (goal.kind === 'awaken') {
      const gate = this.levelGate(goal.realm!)
      if (gate !== null) return { text: `기세를 모은다 ${Math.min(level, gate)}/${gate}`, ratio: Math.min(1, level / gate) }
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

  /**
   * 그 신화권 열린 땅의 흔적이 기세만 모자라 잠잠하면 그 문턱 (깨운 차례의 것, E306 D11).
   * 이미 응답하는 흔적이 있거나 기세가 아닌 까닭(귀환·장 정복·엔딩 뒤)으로 잠잠하면 null
   */
  private levelGate(realm: string): number | null {
    const { progress, expedition, chapters, ending, training } = this.ctx
    const gods = WAKE_GODS.filter((g) => godDef(g).realm === realm && chapters.isOpen(WAKE[g]!.trace.region))
    const state = (god: God, level: number) =>
      traceStateOf(god, { open: progress.isOpen(god), waking: null, awakened: progress.opened.length, returns: expedition.returns, conquered: chapters.conquered, ending: ending.has('realms'), level })
    if (gods.some((g) => state(g, training.insights) === 'open')) return null
    // 문턱은 깨운 차례마다 하나 (`TRACE_LEVELS`)
    return gods.some((g) => state(g, training.insights) === 'sealed' && state(g, Infinity) === 'open') ? traceLevel(progress.opened.length) : null
  }

  /** 목표가 신 깨우기인데 깨우는 신이 없고 흔적이 잠잠한가 (귀환해야 다음 신이 응답한다). HUD 한 줄과 작은 지도의 목표 자리가 읽는다 */
  awaitsReturn(): boolean {
    const { chapters, progress, awaken, expedition, ending } = this.ctx
    if (chapters.goal?.kind !== 'awaken') return false
    if (awaken.waking && !progress.isOpen(awaken.waking)) return false
    return !mayWake(progress.opened.length, expedition.returns, chapters.conquered, ending.has('realms'))
  }

  /** 불러온 뒤: 알리지 않고 지금 장과 목표를 맞춘다 (기세가 오른 때는 불러온 때부터 잰다) */
  sync(): void {
    this.index = this.ctx.chapters.index
    this.goal = this.ctx.chapters.goal
    this.levelAt = this.ctx.expedition.elapsed
  }
}

/** 장 제목 띠의 색: 그 장 첫 땅의 신화권 (땅이 없는 장은 마을 빛) */
export function chapterColor(chapter: ChapterDef): string {
  const first = Object.keys(chapter.lands)[0]
  return `var(--c-realm-${(first && REGIONS[first]?.realm) || 'hub'})`
}

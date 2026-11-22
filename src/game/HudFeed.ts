import { KEEPER, MOUNT } from '../data/mount'
import { insightProgress } from '../data/training'
import { godDef } from '../relics/data'
import { heroIcon } from '../ui/heroIcon'
import { PACK_GOAL } from './systems/Chapters'
import type { Build } from '../build/Build'
import type { AwakenTarget } from './systems/Wake'
import type { Game } from './Game'

/** HUD가 읽는 게임의 부품 */
export interface HudFeedParts {
  /** 게임 (시스템들은 만들어진 뒤에 읽는다) */
  readonly game: Game
  readonly build: Build
  /** 장면의 위아래 검은 띠를 둘 곳 */
  readonly container: HTMLElement
  /** 몬스터 이름표를 띄우나 (`HoverCards.plates`) */
  plates(show: boolean): void
}

/**
 * HUD에 넣을 것 (E305-04에서 Game.ts에서 뗌): 생명·심장 게이지·보스·유물 칸·기세·초상, 조작 안내 한 줄,
 * 장면의 위아래 검은 띠(E23-02), 목표 한 줄과 목표의 자리(E22-04), 작은 지도(E7-08).
 */
export class HudFeed {
  /** 조작 안내: 걸어 보면 싸우는 법으로, 싸워 보면 사라진다. 탈것을 얻으면 타는 법을 처음 타기 전까지 (E241, 저장하지 않는다) */
  coach: 'move' | 'fight' | 'ride' | null = null
  /** 장면의 위아래 검은 띠 (E23-02) */
  private readonly letterbox = document.createElement('div')

  constructor(private readonly parts: HudFeedParts) {
    this.letterbox.className = 'letterbox'
    parts.container.append(this.letterbox)
    parts.game.bus.on('mountGained', ({ quiet }) => !quiet && (this.coach = 'ride'))
  }

  /** 화면 한 프레임 (그릴 때마다, 실제 시간) */
  update(realDt: number): void {
    const { game, build } = this.parts
    // 창이 열렸거나 대화 중이면 이름표를 띄우지 않는다 (창 위에 그려지지 않게, E12-09)
    this.parts.plates(game.playing && !game.paused && !game.scenes.active)
    this.updateCoach()
    const { encounter, awakening, progress } = game
    const boss = encounter.boss
    // 저장된 자리의 손 (빈 손의 맹세 동안 도는 손은 비지만, 기세 막대·초상의 빛·귀환 빛은 그대로 보인다)
    const manifested = progress.pantheon.hand
    game.hud.update(
      {
        life: game.combat.health.ratio,
        heartGauge: game.combat.heartGauge,
        // 보스 막대: 싸우는 지역 보스, 아니면 깨어난 수호자
        boss: boss && encounter.bossEngaged ? boss.health.ratio : awakening.fighting ? awakening.fighting.health.ratio : null,
        bossName: boss && encounter.bossEngaged ? boss.spec.name : (awakening.fighting?.spec.name ?? null),
        slots: game.powers.hudSlots(),
        ultimate: build.heart !== null && !build.state.noUltimate,
        // 기세 막대 (E305-03): 신화 경험치 대신 다음 깨달음까지 (원정마다 처음부터)
        xp: manifested ? this.momentum() : null,
        xpColor: manifested ? godDef(manifested).color : '',
        // 초상은 주인공의 얼굴 그대로 (E307: 신의 문장·칭호로 바꾸지 않는다). 손의 신은 테의 빛·보석·첫 칩으로
        face: heroIcon(game.wardrobe.body),
        hand: manifested ? { name: godDef(manifested).name, color: godDef(manifested).color, level: progress.level(manifested) } : null,
        // 손 말고 자리에 든 신(E237 → E302)도 칩으로
        lent: build.borrowed.filter((g) => g !== manifested).map((g) => ({ name: godDef(g).name, color: godDef(g).color })),
        promote: manifested !== null && game.expeditionSystem.canReturn,
        sources: Object.fromEntries(game.sourceRows().map((r) => [r.id, { value: r.total, level: r.level }])),
      },
      realDt,
    )
    // 장면에는 위아래 검은 띠 (E23-02)
    this.letterbox.classList.toggle('is-on', game.scenes.active)
    // 목표 한 줄 (E22-04): 보스 막대가 서거나 대화 중이면 잠깐 감춘다
    const fighting = (boss !== null && encounter.bossEngaged) || awakening.fighting !== null
    // 흔적을 지키는 무리가 깨어나 있으면 지금 할 일은 그 무리다 (P5 손 QA: 힘을 고른 뒤에도 「신의 흔적을 찾는다」에 머물렀다)
    const view = game.chapterSystem.goalView()
    game.chapterHud.setGoal(view && awakening.roused ? { text: PACK_GOAL, ratio: null } : view, fighting || game.scenes.active || game.world.traveling)
  }

  /** 작은 지도 (게임 한 프레임마다, 게임 시간) */
  updateMinimap(dt: number): void {
    const { game } = this.parts
    // 신 깨우기의 자리는 한 번만 센다 (첫째가 금빛 목표, 나머지는 함께 표시)
    const spots = this.goalSpots()
    game.minimap.update(dt, {
      hero: game.hero.object.position,
      relics: game.pickups.list,
      // 원정이 무르익으면 성소 화로가 깜빡인다 (E305-03: 성소 전설 대신 귀환)
      sanctuaryReady: game.sanctuary.lit,
      goal: this.goalSpot(spots),
      goals: spots.slice(1),
      // 신의 흔적 (E238): 아직 응답할 흔적만 그 신의 색 십자로. 땅에서 기다리는 빛(P5)은 작은 기둥으로 따로, 서 있는 수호자는 금빛 목표 표시가 맡는다
      traces: game.awakening.spots.filter((t) => t.state === 'open').map((t) => ({ x: t.x, z: t.z, color: godDef(t.god).color })),
      lights: game.powerPicks.spots,
    })
  }

  /**
   * 다음 목표의 자리 (지금 땅 좌표, E22-04): 지금 땅이면 성소(귀환)·보스·대장장이·고개지기, 다른 땅이면 그쪽 통로 입구.
   * 작은 지도의 금빛 표시와 봇이 쓴다
   */
  /**
   * 신 깨우기의 표시 자리 (2026-11-22: 특정 신을 가리키지 않는다): 수호자가 서 있으면 가장 가까운 수호자 하나, 아니면 응답할 흔적 모두.
   * 지금 땅의 것은 그 자리, 다른 땅의 것은 그쪽 통로 입구 (같은 통로는 한 번). 신 깨우기 목표가 아니면 빈 목록
   */
  goalSpots(): { x: number; z: number }[] {
    const { chapters, awakening, world } = this.parts.game
    const region = world.region
    if (chapters.goal?.kind !== 'awaken' || region.kind === 'endless') return []
    const { region: prefer, realm } = chapters.goal
    const spotOf = (t: AwakenTarget) => (t.region === region.id ? awakening.placed(t) : world.wayTo(t.region))
    // 수호자가 서 있으면 금빛은 하나만: 가장 가까운 수호자(다른 땅이면 그쪽 통로 입구) (P5 손 QA: 같은 모양 마름모 셋 사이에서 바닷가 출구를 2분 헤맸다)
    const p = this.parts.game.hero.object.position
    const guardians = awakening.targets(realm).filter((t) => t.kind === 'guardian')
    if (guardians.length > 0) {
      const spots = guardians.map(spotOf).filter((s): s is { x: number; z: number } => s !== null)
      const near = spots.reduce<{ x: number; z: number } | null>((best, s) => (!best || Math.hypot(s.x - p.x, s.z - p.z) < Math.hypot(best.x - p.x, best.z - p.z) ? s : best), null)
      return near ? [near] : []
    }
    const first = awakening.target(prefer, null, realm)
    const out: { x: number; z: number }[] = []
    // 다음 할 일 하나(`target`)가 맨 앞: 봇과 지도 탭이 같은 곳을 본다
    for (const t of [...(first ? [first] : []), ...awakening.targets(realm)]) {
      const spot = t.region === region.id ? awakening.placed(t) : world.wayTo(t.region)
      if (spot && !out.some((o) => Math.hypot(o.x - spot.x, o.z - spot.z) < 1)) out.push(spot)
    }
    return out
  }

  /** awakenSpots: 이미 센 신 깨우기의 자리 (`goalSpots`, 없으면 여기서 센다) */
  goalSpot(awakenSpots?: readonly { x: number; z: number }[]): { x: number; z: number } | null {
    const { game } = this.parts
    const { chapters, world } = game
    const goal = chapters.goal
    const region = world.region
    if (!goal || region.kind === 'endless') return null
    // 신 깨우기 (E238): 다음 할 일 하나(서 있는 수호자, 없으면 가까운 흔적). 나머지 자리는 `goalSpots`가 함께 표시한다
    if (goal.kind === 'awaken') return (awakenSpots ?? this.goalSpots())[0] ?? null
    // 합치기 (E306): 가방에서 하는 일이라 자리가 없다
    if (goal.kind === 'merge') return null
    // 귀환 (E306 D2): 어느 성소에서 해도 되니 지금 땅에 성소가 있으면 그 화로, 없으면 데이터의 땅으로
    if (goal.kind === 'return' && region.sanctuary) return region.sanctuary
    // 맹세 (E306): 건 맹세가 있으면 지금 장의 다음 보스 땅(그 땅이면 보스 자리), 없으면 이 땅의 성소(다음 출발에 건다)
    if (goal.kind === 'oath') {
      if (!game.expedition.oath) return region.sanctuary
      const boss = game.chapters.chapter?.steps.find((s) => s.kind === 'boss')
      if (!boss) return null
      return boss.region === region.id ? region.boss : world.wayTo(boss.region)
    }
    if (goal.region !== region.id) return world.wayTo(goal.region)
    if (goal.kind === 'boss') return region.boss
    if (goal.kind === 'forge') return region.npcs.find((n) => n.name === '대장장이') ?? null
    // 탈것 (E241): 고개지기
    if (goal.kind === 'mount') return region.npcs.find((n) => n.name === KEEPER) ?? null
    return region.sanctuary
  }

  /** 조작 안내 한 줄: 땅을 눌러 걸어 보면 → 가까이 적이 있을 때 적을 눌러 보라고 → 싸우면 사라진다 */
  private updateCoach(): void {
    const { game } = this.parts
    const { orders } = game
    if (this.coach === 'move' && orders.order?.kind === 'move') this.coach = 'fight'
    if (this.coach === 'fight' && (orders.order?.kind === 'attack' || game.combat.combo.swinging)) this.coach = null
    if (this.coach === 'ride' && game.hero.riding) this.coach = null
    let text: string | null = null
    if (game.playing && !game.paused && !game.scenes.active && this.coach) {
      const p = game.hero.object.position
      if (this.coach === 'move') text = game.touch ? '화면을 누른 채 끌면 걷는다' : '땅을 누르면 걷는다'
      else if (this.coach === 'ride') text = game.touch ? `멀리 끌면 산양에 올라탄다 · ×${MOUNT.speed}` : `멀리 누르면 산양에 올라탄다 · ×${MOUNT.speed}`
      else if (game.encounter.alive.some((g) => Math.hypot(g.x - p.x, g.z - p.z) < 9)) text = game.touch ? '적을 톡 누르면 싸운다' : '적을 누르면 싸운다'
    }
    game.hud.setCoach(text)
  }

  /** 다음 깨달음까지 모은 기세 0~1 (HUD 막대) */
  private momentum(): number {
    const { have, need } = insightProgress(this.parts.game.training.xp)
    return need > 0 ? Math.min(1, have / need) : 1
  }
}

import { insightProgress } from '../data/training'
import { godDef } from '../relics/data'
import type { Build } from '../build/Build'
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
 * 장면의 위아래 검은 띠(E23-02), 목표 한 줄(E22-04), 작은 지도(E7-08).
 */
export class HudFeed {
  /** 조작 안내: 걸어 보면 싸우는 법으로, 싸워 보면 사라진다 (저장하지 않는다) */
  coach: 'move' | 'fight' | null = null
  /** 장면의 위아래 검은 띠 (E23-02) */
  private readonly letterbox = document.createElement('div')

  constructor(private readonly parts: HudFeedParts) {
    this.letterbox.className = 'letterbox'
    parts.container.append(this.letterbox)
  }

  /** 화면 한 프레임 (그릴 때마다, 실제 시간) */
  update(realDt: number): void {
    const { game, build } = this.parts
    // 창이 열렸거나 대화 중이면 이름표를 띄우지 않는다 (창 위에 그려지지 않게, E12-09)
    this.parts.plates(game.playing && !game.paused && !game.scenes.active)
    this.updateCoach()
    const { encounter, awakening, progress } = game
    const boss = encounter.boss
    const manifested = build.chosen
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
        portrait: manifested ? { name: godDef(manifested).name, title: progress.title(manifested), color: godDef(manifested).color, level: progress.level(manifested) } : null,
        // 빌린 신(E237)은 밝은 칩, 그 밖에 낀 유물의 신은 잠든 가호
        lent: build.borrowed.map((g) => ({ name: godDef(g).name, color: godDef(g).color })),
        promote: manifested !== null && game.expeditionSystem.canReturn,
        sources: Object.fromEntries(game.sourceRows().map((r) => [r.id, { value: r.total, level: r.level }])),
      },
      realDt,
    )
    // 장면과 신화 고르기에는 위아래 검은 띠 (E23-02)
    this.letterbox.classList.toggle('is-on', game.scenes.active || game.swapOpen)
    // 목표 한 줄 (E22-04): 보스 막대가 서거나 대화 중이면 잠깐 감춘다
    const fighting = (boss !== null && encounter.bossEngaged) || awakening.fighting !== null
    game.chapterHud.setGoal(game.chapterSystem.goalView(), fighting || game.scenes.active || game.world.traveling)
  }

  /** 작은 지도 (게임 한 프레임마다, 게임 시간) */
  updateMinimap(dt: number): void {
    const { game } = this.parts
    game.minimap.update(dt, {
      hero: game.hero.object.position,
      relics: game.pickups.list,
      // 원정이 무르익으면 성소 화로가 깜빡인다 (E305-03: 성소 전설 대신 귀환)
      sanctuaryReady: game.sanctuary.lit,
      goal: game.goalSpot(),
      // 신의 흔적 (E238): 응답하는 흔적만 그 신의 색으로
      traces: game.awakening.spots.filter((t) => t.state === 'open').map((t) => ({ x: t.x, z: t.z, color: godDef(t.god).color })),
    })
  }

  /** 조작 안내 한 줄: 땅을 눌러 걸어 보면 → 가까이 적이 있을 때 적을 눌러 보라고 → 싸우면 사라진다 */
  private updateCoach(): void {
    const { game } = this.parts
    const { orders } = game
    if (this.coach === 'move' && orders.order?.kind === 'move') this.coach = 'fight'
    if (this.coach === 'fight' && (orders.order?.kind === 'attack' || game.combat.combo.swinging)) this.coach = null
    let text: string | null = null
    if (game.playing && !game.paused && !game.scenes.active && this.coach) {
      const p = game.hero.object.position
      if (this.coach === 'move') text = game.touch ? '화면을 누른 채 끌면 걷는다' : '땅을 누르면 걷는다'
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

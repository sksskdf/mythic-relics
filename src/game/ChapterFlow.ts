import { endingLines } from '../progress/Ending'
import { sceneId } from '../data/scenes'
import type { Game } from './Game'
import type { PlayEvent } from './PlayLog'
import type { Effects } from './systems/Effects'
import { chapterColor } from './systems/Chapters'
import type { MomentCard } from './systems/Moments'

/** 첫 엔딩의 큰 카드 (E22-05): 엔딩 장면 뒤에 무엇이 열렸는지 (엔딩 문의 표에서 뽑는다) */
const ENDING_CARD: MomentCard = {
  kind: '첫 엔딩',
  title: '엔딩 뒤가 열렸다',
  color: '#ffd27a',
  lines: endingLines(),
}

/** 장 넘어가기와 엔딩이 손대는 게임의 부품 */
export interface ChapterFlowParts {
  /** 게임 (시스템들은 만들어진 뒤에 읽는다) */
  readonly game: Game
  readonly fx: Effects
  /** 플레이 기록에 남긴다 (`PlayLog.record`) */
  record(type: PlayEvent['type']): void
}

/**
 * 장 넘어가기와 첫 엔딩 (E22-04·05, E23-02, E305-04에서 Game.ts에서 뗌): 장이 바뀌면 결계를 다시 맞추고 그 장의 한마디 뒤에
 * 장 제목 띠, 마지막 장을 끝내면 느린 동작 → 엔딩 장면 → 엔딩 뒤 장치가 열리고 큰 카드.
 */
export class ChapterFlow {
  constructor(private readonly parts: ChapterFlowParts) {
    const { game } = parts
    // 다음 장이 열리면 그 땅으로 가는 결계가 풀리고(E22-02) 장 제목 띠가 지나간다 (E22-04)
    // 장 넘어가기는 장면 (E23-02): 그 장의 한마디 뒤에 장 제목 띠
    game.bus.on('chapterChanged', ({ chapter }) => {
      game.world.refreshLinks()
      if (chapter) {
        game.bus.emit('moment', { id: 'chapterChanged', scene: sceneId('chapter', chapter.id), after: () => game.chapterHud.showChapter(chapter.title, chapter.name, chapterColor(chapter)) })
      } else if (!game.ending.reached) this.endingMoment(true)
    })
    // 지금 장의 땅은 할 일 차례로 열린다 (E236-01): 할 일을 하나 마치면 다음 땅의 결계가 풀린다
    game.bus.on('goalChanged', () => game.world.refreshLinks())
  }

  /** 마지막 장을 끝냈다 (E22-05): 느린 동작 → 엔딩 장면(엔딩 곡) → 엔딩 뒤 장치가 열리고 큰 카드. slow면 쓰러진 순간의 느린 동작 */
  endingMoment(slow: boolean): void {
    this.parts.game.bus.emit('moment', { id: 'ending', scene: 'ending', slow, music: 'ending', card: ENDING_CARD, after: () => this.showEnding() })
  }

  /** 첫 엔딩을 보았다 (E21-06): 엔딩 뒤 장치를 연다. 마지막 보스를 이기면 엔딩 장면 뒤에 부르고(E22-05), 개발 패널과 점검 스크립트도 부른다 */
  reachEnding(): void {
    const { game } = this.parts
    if (game.ending.reached) return
    game.ending.reached = true
    game.chapterSystem.check()
    // 모든 땅과 정보 화면 탭이 열린다
    game.world.refreshLinks()
    game.tabs.openAll()
    game.menu.refresh()
  }

  /** 첫 엔딩 (E22-05): 엔딩 장면 뒤에 엔딩 뒤 장치를 열고 「첫 엔딩」 띠 (무엇이 열렸는지는 ENDING_CARD) */
  private showEnding(): void {
    const { game, fx } = this.parts
    this.reachEnding()
    const gold = ENDING_CARD.color
    game.hud.flash(gold)
    fx.power.column(game.hero.object.position, gold)
    game.view.shake(0.4)
    game.chapterHud.showChapter('첫 엔딩', '갈라진 하늘이 닫혔다', gold)
    game.bus.emit('sound', { cue: 'promote' })
    this.parts.record('ending')
  }
}

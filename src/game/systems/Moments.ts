import type { ThemeId } from '../../audio/music'
import { CARD_HOLD, type MomentId, type MomentTier, SLOW_MOTION, tierOf } from '../../data/moments'
import type { GameContext } from '../context'

/** 얻은 것 카드: 무엇(kind)·이름·색·그림, 한 줄에 얻은 것 하나 */
export interface MomentCard {
  kind: string
  title: string
  color: string
  icon?: string
  lines: readonly string[]
}

/**
 * 순간 하나 (버스의 moment 사건). 등급은 id가 정한다 (src/data/moments.ts).
 * - 1: text 한 줄 (없으면 card.title)
 * - 2·3: card. 3은 card.color로 번쩍이고 빛기둥이 선다
 * - 4: scene(대화 장면)을 열고, 끝나면 card와 after. slow면 장면 앞에 느린 동작, music이면 장면 동안 그 곡
 */
export interface MomentShow {
  id: MomentId
  text?: string
  card?: MomentCard
  scene?: string
  slow?: boolean
  music?: ThemeId
  /** 장면이 끝난 뒤 할 일 (장 제목 띠, 엔딩 뒤 장치 열기) */
  after?: () => void
}

/** 순간이 게임에서 쓰는 것 */
export interface MomentHost {
  /** 대화 장면을 연다. 꺼 두었거나(봇) 없는 장면이면 false */
  playScene(id: string): boolean
  /** 대화 장면 중인가 */
  sceneActive(): boolean
  /** 장면 앞 느린 동작을 쓰는가 (봇·점검은 끈다) */
  slowMotion(): boolean
}

/** 보인 순간 하나 (점검·시험용 기록) */
export interface MomentRecord {
  id: MomentId
  tier: MomentTier
}

/**
 * 순간의 크기 (E23-01): 시스템들이 보낸 순간을 등급에 맞는 크기로 보인다.
 * 작은 알림은 바로, 카드·큰 카드·장면은 온 차례대로 하나씩 (보내는 쪽이 일어난 차례대로 보낸다: 보스 장면 → 장 넘어가기 → 신화 개방 카드,
 * 벼린 큰 카드 → 장 넘어가기). 장면 중·느린 동작 중에는 기다리고, 카드를 띄운 뒤에는 다음 장면이 잠깐 기다린다 (장면이 HUD를 숨기므로).
 */
export class MomentSystem {
  /** 보인 순간 (점검용, 오래된 것부터 버린다) */
  readonly shown: MomentRecord[] = []
  private readonly queue: MomentShow[] = []
  /** 지금 장면이 끝나면 보일 것 */
  private afterScene: MomentShow | null = null
  /** 장면을 열기 전 느린 동작이 끝나기를 기다리는 장면 */
  private slowing: MomentShow | null = null
  private cardWait = 0

  constructor(
    private readonly ctx: GameContext,
    private readonly host: MomentHost,
  ) {
    ctx.bus.on('moment', (m) => this.receive(m))
  }

  /** 기다리는 순간이 있나 */
  get busy(): boolean {
    return this.queue.length > 0 || this.afterScene !== null || this.slowing !== null
  }

  /** 순간을 보이는 중인가 (처음 보는 일의 짧은 대화는 이것이 끝난 뒤에 연다) */
  get holding(): boolean {
    return this.busy || this.cardWait > 0
  }

  private receive(m: MomentShow): void {
    if (tierOf(m.id) === 1) this.present(m)
    else this.queue.push(m)
  }

  /** 정보 화면이 열리지 않은 프레임마다 (realDt: 실제 흐른 초) */
  update(realDt: number): void {
    this.cardWait = Math.max(0, this.cardWait - realDt)
    if (this.host.sceneActive()) return
    // 장면이 끝났다: 그 장면이 얻게 한 것을 보인다
    if (this.afterScene) {
      const done = this.afterScene
      this.afterScene = null
      this.finish(done)
    }
    if (this.slowing) {
      if (this.ctx.feel.slowLeft > 0) return
      const m = this.slowing
      this.slowing = null
      this.openScene(m)
      return
    }
    while (this.queue.length > 0) {
      const head = this.queue[0]!
      if (tierOf(head.id) === 4) {
        if (this.cardWait > 0) return
        this.queue.shift()
        this.present(head)
        // 장면이나 느린 동작이 시작됐으면 그것이 끝나길 기다린다
        if (this.slowing || this.afterScene) return
      } else {
        this.queue.shift()
        this.present(head)
      }
    }
  }

  private present(m: MomentShow): void {
    const tier = tierOf(m.id)
    this.shown.push({ id: m.id, tier })
    if (this.shown.length > 200) this.shown.shift()
    const { hud } = this.ctx
    switch (tier) {
      case 1:
        hud.showToast(m.text ?? m.card?.title ?? '')
        break
      case 2:
        if (m.card) this.card(m.card, 'card')
        break
      case 3:
        if (m.card) this.big(m.card)
        break
      case 4:
        if (m.slow && this.host.slowMotion()) {
          this.ctx.feel.slow(SLOW_MOTION.seconds, SLOW_MOTION.scale)
          this.slowing = m
        } else this.openScene(m)
        break
    }
  }

  /** 장면을 연다. 열지 못하면(봇·이미 본 장면) 그 뒤의 것을 바로 */
  private openScene(m: MomentShow): void {
    if (m.music) this.ctx.bus.emit('music', { theme: m.music })
    if (m.scene && this.host.playScene(m.scene)) this.afterScene = m
    else this.finish(m)
  }

  /** 장면 뒤: 곡을 땅의 곡으로 돌리고, 얻은 것 카드와 할 일 */
  private finish(m: MomentShow): void {
    if (m.music) this.ctx.bus.emit('music', { theme: null })
    if (m.card) this.card(m.card, m.id === 'ending' || m.id === 'mythChosen' ? 'big' : 'card')
    m.after?.()
  }

  private card(card: MomentCard, size: 'card' | 'big'): void {
    this.ctx.hud.showGains(card.kind, card.title, card.color, card.icon ?? '', card.lines, size)
    this.cardWait = CARD_HOLD
  }

  /** 큰 카드: 그 색으로 번쩍, 주인공 둘레 빛기둥, 가운데 큰 카드, 북소리 */
  private big(card: MomentCard): void {
    const { hud, fx, hero, bus } = this.ctx
    hud.flash(card.color)
    fx.power.column(hero.object.position, card.color)
    bus.emit('sound', { cue: 'drum' })
    this.card(card, 'big')
  }
}

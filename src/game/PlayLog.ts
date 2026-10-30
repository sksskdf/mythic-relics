import type { EventBus, GameEvents } from './events'

/** 플레이 기록: 검증과 수치 조정에 쓴다. */
export interface PlayEvent {
  /** 게임 시간 (초) */
  t: number
  type: 'relic' | 'manifest' | 'open' | 'fragment' | 'forge' | 'gear' | 'kill' | 'bossKill' | 'death' | 'promote' | 'hurt' | 'depth' | 'region' | 'oath' | 'endless' | 'chapter' | 'ending'
  detail?: string
}

/**
 * 사건을 플레이 기록으로 남긴다 (봇 검증과 수치 조정용, E305-04에서 Game.ts에서 뗌).
 * 봇·점검 스크립트는 `game.log`로 읽는다
 */
export class PlayLog {
  readonly events: PlayEvent[] = []

  /** now: 지금 게임 시간 (초) */
  constructor(
    bus: EventBus<GameEvents>,
    private readonly now: () => number,
  ) {
    const record = (type: PlayEvent['type'], detail?: string) => this.record(type, detail)
    bus.on('relicPicked', ({ id }) => record('relic', id))
    bus.on('mythOpened', ({ god }) => record('open', god))
    bus.on('fragment', ({ god, piece }) => record('fragment', `${god}:${piece}`))
    bus.on('forged', ({ relic, stage }) => record('forge', `${relic}:${stage}`))
    bus.on('gearPicked', ({ item }) => record('gear', item.grade))
    bus.on('manifested', ({ god }) => record('manifest', god))
    bus.on('giantKilled', ({ giant }) => record(giant.spec.boss ? 'bossKill' : 'kill', giant.spec.boss))
    bus.on('heroHurt', ({ damage }) => record('hurt', String(Math.round(damage))))
    bus.on('depthChanged', ({ level }) => record('depth', String(level)))
    bus.on('regionEntered', ({ id }) => record('region', id))
    bus.on('chapterChanged', ({ chapter }) => record('chapter', chapter?.id ?? 'end'))
    bus.on('endlessFloor', ({ depth }) => record('endless', `floor:${depth}`))
    bus.on('endlessEnded', ({ depth, reason }) => record('endless', `${reason}:${depth}`))
    bus.on('oathEnded', ({ id, win, seconds }) => record('oath', `${id}:${win ? 'win' : 'fail'}:${Math.round(seconds)}`))
    bus.on('heroDied', () => record('death'))
    bus.on('promoted', ({ title }) => record('promote', title))
  }

  /** 지금 게임 시간으로 하나 남긴다 (0.1초 단위) */
  record(type: PlayEvent['type'], detail?: string): void {
    this.events.push({ t: Math.round(this.now() * 10) / 10, type, detail })
  }
}

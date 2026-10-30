import { DEMO_OATHS, OATH, OATH_IDS, type OathId, OATHS } from '../../data/oaths'
import { isBossLike } from '../../enemies/grade'
import { josa } from '../../ui/josa'
import type { OathView } from '../../ui/OathCard'
import type { GameContext } from '../context'

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** 게임이 맹세 시스템에 넘기는 것 */
export interface OathParts {
  /** 출발 카드를 보인다 (고르면 pick, 「맹세 없음」이면 null) */
  offer(view: OathView, pick: (id: OathId | null) => void): void
  /** 도는 자리를 다시 맞춘다 (빈 손·홀로) */
  reapply(): void
  /** 늘어난 숨 칸을 깨어난 신으로 채운다 (홀로의 맹세를 지켰을 때) */
  fillBreath(): void
}

/**
 * 맹세 (E305-01, `CYCLE.md` 3.4): 귀환 2부터 다시 떠날 때 출발 카드에서 「맹세 없음」 또는 하나를 건다.
 * 건 동안 제약이 돌고, 그 원정에서 장 보스나 수호자를 이기면 지킨 것(그 자리에서 제약이 풀리고 영구 보상).
 * 지키지 못한 채 귀환하면 벌 없이 풀린다. 타는 모래시계는 떠난 지 10분이 지나면 깨진다
 */
export class OathSystem {
  constructor(
    private readonly ctx: GameContext,
    private readonly parts: OathParts,
  ) {
    ctx.bus.on('giantKilled', ({ giant }) => {
      const oath = ctx.expedition.oath
      if (!oath || ctx.legend.active || ctx.map.region.kind === 'rift') return
      if (giant.spec.boss !== undefined || isBossLike(giant.spec)) this.keep(oath)
    })
    // 귀환하면 그 자리에서 다시 떠난다: 맹세가 열렸으면 출발 카드
    ctx.bus.on('expeditionReturned', () => {
      this.sync()
      if (this.unlocked) this.offer()
    })
  }

  /** 맹세를 고를 수 있나: 귀환 2부터 (엔딩 뒤는 언제나) */
  get unlocked(): boolean {
    return this.ctx.expedition.returns >= OATH.unlock || this.ctx.ending.reached
  }

  /** 고를 수 있는 맹세: 데모 셋, 엔딩 뒤에는 여덟 */
  available(): OathId[] {
    return this.ctx.ending.reached ? [...OATH_IDS] : [...DEMO_OATHS]
  }

  /** 출발 카드에 보일 것 */
  view(): OathView {
    const { oaths } = this.ctx
    return {
      oaths: this.available().map((id) => {
        const def = OATHS[id]
        const best = oaths.best[id]
        return { id, name: def.name, rule: def.rule, reward: def.reward.text, kept: oaths.has(id), best: best === undefined ? null : clock(best) }
      }),
    }
  }

  private offer(): void {
    this.parts.offer(this.view(), (id) => this.swear(id))
  }

  /** 맹세를 건다 (출발 카드·봇·개발 지름길). null이면 맹세 없이 */
  swear(id: OathId | null): void {
    const { expedition, bus } = this.ctx
    expedition.oath = id
    this.sync()
    if (id) bus.emit('moment', { id: 'oathSworn', card: { kind: '맹세', title: OATHS[id].name, color: '#c9a24a', lines: [OATHS[id].rule, '장 보스나 수호자를 이기면 지킨다', `지키면: ${OATHS[id].reward.text}`] } })
    bus.emit('progressChanged', {})
  }

  /** 건 맹세를 지킨 것으로 (개발 지름길) */
  keepNow(): void {
    if (this.ctx.expedition.oath) this.keep(this.ctx.expedition.oath)
  }

  /** 지켰다: 기록을 남기고 제약을 풀고 영구 보상 */
  private keep(id: OathId): void {
    const { expedition, oaths, bus } = this.ctx
    const seconds = expedition.elapsed
    const { first, record } = oaths.keep(id, seconds)
    expedition.oath = null
    this.sync()
    if (id === 'alone' && first) this.parts.fillBreath()
    bus.emit('oathEnded', { id, win: true, seconds })
    const lines = [first ? OATHS[id].reward.text : '이미 지킨 맹세', `기록 ${clock(seconds)}${record && !first ? ' (가장 빠름)' : ''}`]
    bus.emit('moment', { id: 'oathKept', card: { kind: '맹세를 지켰다', title: OATHS[id].name, color: '#c9a24a', lines } })
    bus.emit('progressChanged', {})
  }

  /** 깨졌다 (타는 모래시계): 벌 없이 풀린다 */
  private broken(id: OathId): void {
    const { expedition, bus } = this.ctx
    expedition.oath = null
    this.sync()
    bus.emit('oathEnded', { id, win: false, seconds: expedition.elapsed })
    bus.emit('moment', { id: 'oathBroken', text: `${josa(OATHS[id].name, '이')} 깨졌다` })
    bus.emit('progressChanged', {})
  }

  /** 지금 맹세에 맞춰 도는 자리·무리 크기를 맞춘다 (불러온 뒤에도) */
  sync(): void {
    const { expedition, encounter } = this.ctx
    encounter.crowd = expedition.oath === 'crowd' ? OATH.crowd : 1
    this.parts.reapply()
  }

  update(): void {
    const { expedition } = this.ctx
    if (expedition.oath === 'timed' && expedition.elapsed > OATH.timed) this.broken('timed')
  }
}

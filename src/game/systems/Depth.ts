import { DEPTH_LIMIT, depthElite, depthScale } from '../../data/depth'
import { ELITE_CHANCE } from '../../enemies/elite'
import { isBossLike } from '../../enemies/grade'
import type { GameContext } from '../context'

/**
 * 깊이 (E305-03, 옛 위협 단계 E14-03). 엔딩 뒤 장치다.
 * - 귀환 카드에서 다음 원정의 깊이를 「그대로 / +1」로 고른다 (마을 촌장·보스 문은 없앴다)
 * - 지금 깊이의 배율을 적 무리에 건다 (고르면 이미 세운 적도 다시 세운다)
 * - 한계를 깸 (D8): 깊이 10 원정에서 장 보스나 수호자를 이기고 귀환하면 깊이의 끝이 사라지고 균열이 열린다
 */
export class DepthSystem {
  /** 이번 원정에서 깊이 10(한계 전 끝)의 장 보스나 수호자를 이겼다: 귀환하면 한계를 깬다 */
  private deepWin = false

  constructor(private readonly ctx: GameContext) {
    const { bus, depth } = ctx
    this.apply()
    bus.on('giantKilled', ({ giant }) => {
      // 균열 층의 보스는 세지 않는다 (층 세기가 깊이와 따로라)
      if (depth.limitBroken || depth.level < DEPTH_LIMIT || !ctx.ending.has('depth') || ctx.map.region.kind === 'rift') return
      if (giant.spec.boss !== undefined || isBossLike(giant.spec)) this.deepWin = true
    })
    bus.on('expeditionReturned', () => {
      if (this.deepWin && !depth.limitBroken) this.breakLimit()
      this.deepWin = false
    })
  }

  /** 지금 깊이의 배율을 적 무리에 건다 (다음에 세우는 적부터) */
  apply(): void {
    const { encounter, depth } = this.ctx
    encounter.threat = depthScale(depth.level)
    encounter.eliteChance = depthElite(ELITE_CHANCE, depth.level)
  }

  /**
   * 다음 원정의 깊이를 고른다 (귀환 카드, 엔딩 뒤). 이미 세운 적도 새 배율로 다시 세운다.
   * 처음 가는 깊이면 큰 카드로 알린다
   */
  choose(level: number): boolean {
    const { depth, bus, ending, encounter } = this.ctx
    if (!ending.has('depth') || level === depth.level) return false
    const first = level > depth.reached
    if (!depth.choose(level)) return false
    this.apply()
    encounter.resetAll()
    if (first) bus.emit('moment', { id: 'depthUp', card: { kind: '깊이', title: `깊이 ${level}`, color: '#c9a24a', lines: ['적이 세지고 정예가 늘어난다', '장비 등급과 재료가 좋아진다'] } })
    bus.emit('depthChanged', { level })
    bus.emit('progressChanged', {})
    return true
  }

  /** 한계를 깸: 깊이의 끝이 사라지고 균열이 열린다 */
  breakLimit(): void {
    const { depth, view, bus } = this.ctx
    depth.limitBroken = true
    view.shake(0.5)
    bus.emit('moment', {
      id: 'limitBroken',
      card: { kind: '한계를 깸', title: '세계의 끝이 갈라졌다', color: '#e6d2ff', lines: ['깊이의 끝이 사라졌다', '마을에서 균열에 들어갈 수 있다 (정보 화면 › 균열)'] },
    })
    bus.emit('limitBroken', {})
    bus.emit('progressChanged', {})
  }
}

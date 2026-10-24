import { DATA } from '../../data'
import { AWAKEN_AT } from '../../data/awakening'
import type { SourceId } from '../../data/schema'
import { THREAT_MAX, threatElite, threatScale } from '../../data/threat'
import { ELITE_CHANCE } from '../../enemies/elite'
import { CONVENIENCES, type CounterId } from '../../progress/Conveniences'
import { BATTLE } from '../../progress/Threat'
import type { GameContext } from '../context'

const sourceName = (s: SourceId) => DATA.classes.sources.find((x) => x.id === s)?.name ?? s

/**
 * 위협 단계·원천 갈래·편의 자동화 (E14-03·04·05).
 * - 적을 잡으면 전투 경험이 쌓이고, 열린 가장 높은 단계에서 지역 보스를 이기면 다음 단계가 열린다
 * - 마을 촌장(정보 화면 › 원천)에서 단계를 고르고, 처음 오르는 단계는 원천 하나에 경험을 붓는다
 * - 지금 단계의 배율을 새로 세우는 적에 건다
 * - 줍기·분해·제작·신화 개방·단계 오르기를 세어 편의 자동화를 연다
 */
export class ThreatSystem {
  constructor(private readonly ctx: GameContext) {
    const { bus, threat, progress } = ctx
    this.apply()
    bus.on('giantKilled', ({ giant }) => {
      const boss = giant.spec.role === 'boss' && giant.spec.boss !== undefined
      threat.gainBattle(boss ? BATTLE.boss : giant.elite ? BATTLE.elite : BATTLE.kill)
      if (!boss || ctx.legend.active) return
      if (threat.bossDefeated(giant.spec.realm)) this.announceOpened()
      bus.emit('progressChanged', {})
    })
    bus.on('gearPicked', () => this.count('pickups', 1))
    bus.on('relicPicked', () => this.count('pickups', 1))
    bus.on('gearSalvaged', () => this.count('salvaged', 1))
    bus.on('forged', () => this.count('forged', 1))
    bus.on('mythOpened', () => this.count('opened', progress.opened.length, 'set'))
  }

  /** 지금 단계의 배율을 적 무리에 건다 (다음에 세우는 적부터) */
  apply(): void {
    const { encounter, threat } = this.ctx
    encounter.threat = threatScale(threat.level)
    encounter.eliteChance = threatElite(ELITE_CHANCE, threat.level)
  }

  /** 단계를 고를 수 있는 곳인가 (마을 촌장 곁, 이 단계는 마을 안 어디서나) */
  get here(): boolean {
    return this.ctx.map.region.kind === 'hub'
  }

  /** 올라가 본 단계 안에서 고른다 */
  choose(level: number): boolean {
    const { threat, bus, hud } = this.ctx
    if (!this.here || level === threat.level || !threat.choose(level)) return false
    this.apply()
    hud.showToast(`위협 ${level}단계`)
    bus.emit('threatChanged', { level })
    bus.emit('progressChanged', {})
    return true
  }

  /** 다음 단계로 처음 오른다: 전투 경험을 그 원천에 붓는다 */
  advance(source: SourceId): boolean {
    const { threat, bus, hud, fx, hero, build } = this.ctx
    if (!this.here) return false
    const before = build.state.sources[source]
    const poured = threat.advance(source)
    if (poured <= 0) return false
    this.apply()
    const after = build.state.sources[source]
    const lines = [`${sourceName(source)} 숙련 +${poured} (원천 ${before} → ${after})`, '적이 세지고 장비·재료가 좋아진다']
    const next = AWAKEN_AT.find((at) => after < at)
    if (next !== undefined) lines.push(`다음 각성까지 ${sourceName(source)} ${next - after}`)
    if (threat.resonance > 0) lines.push(`공명 ${threat.resonance}: 모든 각성 +${threat.resonance * 5}%`)
    hud.flash('#c9a24a')
    fx.power.burst(hero.object.position, '#c9a24a', 3)
    hud.showGains('위협 단계', `${threat.level}단계`, '#c9a24a', '', lines)
    this.count('threat', threat.reached, 'set')
    bus.emit('threatChanged', { level: threat.level })
    bus.emit('progressChanged', {})
    return true
  }

  private announceOpened(): void {
    const { hud, threat } = this.ctx
    const top = threat.unlocked >= THREAT_MAX ? ' (끝)' : ''
    hud.showToast(`위협 ${threat.unlocked}단계가 열렸다${top} · 마을 촌장`)
  }

  private count(counter: CounterId, value: number, mode: 'add' | 'set' = 'add'): void {
    const opened = this.ctx.conveniences.count(counter, value, mode)
    for (const c of opened) {
      this.ctx.hud.showGains('편의', c.name, '#9fe3ff', '', [c.text])
      this.ctx.bus.emit('progressChanged', {})
    }
  }
}

export { CONVENIENCES }

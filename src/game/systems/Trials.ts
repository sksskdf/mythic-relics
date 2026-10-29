import { godDef } from '../../relics/data'
import { glyph } from '../../ui/sigils'
import { threatScale } from '../../data/threat'
import { TRIAL_DIFFICULTY, TRIAL_MILESTONES, TRIAL_TIME, TRIAL_UNLOCK_THREAT, type TrialId, TRIALS } from '../../data/trials'
import type { LegendKind } from '../../data/classKit'
import type { GameContext } from '../context'
import type { ProgressionSystem } from './Progression'
import type { ThreatSystem } from './Threat'

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/**
 * 시련 진행 (E16-02·03, DESIGN.md 5.3).
 * 필드 성소 곁에서 시련과 난이도를 고르면, 고른 신화의 전설(신화 없이면 우트가르드 원정, 'boss')이 그 자리에서 열린다.
 * 진행 중에는 제약을 빌드 상태에 덮어쓰고(`Build`의 trial), 결계 안 적은 난이도만큼 세진다.
 * 이기면 기록을 남기고 그 시련의 영구 보상이 깬 난이도만큼 쌓인다. 지거나 시간이 다 되면 그냥 끝난다.
 */
export class TrialSystem {
  /** 진행 중인 시련 */
  active: { id: TrialId; level: number; t: number } | null = null

  constructor(
    private readonly ctx: GameContext,
    private readonly progression: ProgressionSystem,
    private readonly threat: ThreatSystem,
  ) {
    const self = this
    progression.trial = {
      get active() {
        return self.active !== null
      },
      onStart: () => this.onStart(),
      onWin: () => this.onWin(),
      onFail: () => this.onFail(),
    }
  }

  /** 시련이 열렸나 (위협 3단계) */
  get open(): boolean {
    return this.ctx.ending.has('trials') && this.ctx.threat.reached >= TRIAL_UNLOCK_THREAT
  }

  /** 지금 시련을 열 수 없는 까닭 (열 수 있으면 null) */
  blocked(): string | null {
    const { map, legend, hero, combat } = this.ctx
    if (!this.open) return `위협 ${TRIAL_UNLOCK_THREAT}단계에 열린다`
    if (this.active || legend.active) return '이미 전설이 진행 중이다'
    const sanctuary = map.region.sanctuary
    if (map.region.kind !== 'field' || !sanctuary || !legend.present) return '필드의 성소에서 연다'
    const p = hero.object.position
    if (Math.hypot(p.x - legend.center.x, p.z - legend.center.z) > sanctuary.radius) return '성소 결계 안에 들어서야 한다'
    if (!combat.alive) return '쓰러진 동안은 열 수 없다'
    return null
  }

  /** 시련을 연다 */
  start(id: TrialId, level: number): boolean {
    if (this.blocked() !== null) return false
    const { encounter, legend, hero, build } = this.ctx
    this.active = { id, level, t: 0 }
    // 결계 안 적: 위협 단계 배율 × 시련 난이도
    const base = threatScale(this.ctx.threat.level)
    encounter.arenaThreat = { hp: base.hp * TRIAL_DIFFICULTY.hp[level - 1]! * (TRIALS[id].enemyHp ?? 1), damage: base.damage * TRIAL_DIFFICULTY.damage[level - 1]! * (TRIALS[id].enemyDamage ?? 1) }
    legend.rules = { crowd: id === 'crowd' ? 2 : 1, timeLimit: id === 'timed' ? TRIAL_TIME[level - 1]! : null }
    const chosen = build.chosen
    const kind: LegendKind = (chosen && godDef(chosen).legend?.kind) || 'boss'
    hero.teleport(legend.center.x, legend.center.z)
    if (!legend.begin(kind, encounter, this.progression.legendHost())) {
      this.end()
      return false
    }
    return true
  }

  update(dt: number): void {
    if (this.active) this.active.t += dt
  }

  private onStart(): void {
    const t = this.active!
    this.ctx.hud.showTitleCard(TRIALS[t.id].name, '#c9a24a', glyph('scroll', '#ffe0a0', '#c9a24a'), `시련 ${t.level}단계 · ${TRIALS[t.id].rule}`)
  }

  private onWin(): void {
    const t = this.active!
    const { trials, fx, hero, bus } = this.ctx
    const before = trials.total
    const { record, raised } = trials.win(t.id, t.level, t.t)
    this.end()
    bus.emit('trialEnded', { id: t.id, level: t.level, win: true, seconds: t.t })
    const def = TRIALS[t.id]
    const lines = [`${fmt(t.t)}${record ? ' · 새 기록' : ''}`]
    if (raised) lines.push(`${def.reward.text} +${def.reward.per < 1 ? `${Math.round(def.reward.per * 100)}%` : def.reward.per} (영구)`)
    for (const m of TRIAL_MILESTONES) if (before < m.at && trials.total >= m.at) lines.push(`${m.name}: ${m.text}`)
    fx.power.burst(hero.object.position, '#c9a24a', 3)
    bus.emit('moment', { id: 'trialCleared', card: { kind: '시련', title: `${def.name} ${t.level}단계`, color: '#c9a24a', lines } })
    bus.emit('progressChanged', {})
  }

  private onFail(): void {
    const t = this.active!
    this.end()
    this.ctx.bus.emit('trialEnded', { id: t.id, level: t.level, win: false, seconds: t.t })
    this.ctx.bus.emit('moment', { id: 'trialFailed', text: `시련 실패 · ${TRIALS[t.id].name} ${t.level}단계` })
  }

  /** 시련이 끝났다: 제약과 배율을 되돌린다 */
  private end(): void {
    this.active = null
    this.ctx.encounter.arenaThreat = null
    this.threat.apply()
  }
}

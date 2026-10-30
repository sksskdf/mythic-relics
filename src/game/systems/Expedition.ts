import { SOURCE_IDS, type SourceId } from '../../data/schema'
import { FLAME } from '../../data/cycle'
import { isBossLike } from '../../enemies/grade'
import { isGearUid } from '../../gear/roll'
import { pantheonGods } from '../../myth/pantheon'
import { godDef, type God } from '../../relics/data'
import { SOURCE_COLORS } from '../../ui/sigils'
import type { ReturnBranch, ReturnView } from '../../ui/ReturnCard'
import type { GameContext } from '../context'

/** 원천 이름 (갈래 카드) */
const SOURCE_NAMES: Readonly<Record<SourceId, string>> = { flame: '불꽃', hunt: '사냥', wind: '바람', stone: '바위' }
/** 원천 불씨가 더하는 것 한 줄 */
const FLAME_TEXT: Readonly<Record<SourceId, string>> = {
  flame: `원천 +${FLAME.points}, 모든 피해 ×${FLAME.flame.damage}`,
  stone: `원천 +${FLAME.points}, 최대 생명 ×${FLAME.stone.maxHp}·받는 피해 ×${FLAME.stone.taken}`,
  wind: `원천 +${FLAME.points}, 공격·이동 ×${FLAME.wind.speed}`,
  hunt: `원천 +${FLAME.points}, 받는 명성 ×${FLAME.hunt.renown}`,
}
/** 성소 한가운데에서 이만큼 안에 서면 귀환 카드가 뜬다 */
const HEARTH_RADIUS = 2.5
/** 원정을 떠난 뒤 이 초가 지나야 귀환할 수 있다 (떠나자마자 다시 뜨지 않게) */
const MIN_SECONDS = 120

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** 게임이 귀환 시스템에 넘기는 것 */
export interface ExpeditionParts {
  /** 귀환 카드를 보인다 */
  offer(view: ReturnView, pick: (id: string) => void, later: () => void): void
  /** 귀환 카드가 떠 있다 */
  offering(): boolean
  /** 신을 한 단계 올린다 (승천, 큰 카드와 함께) */
  ascend(god: God): void
}

/**
 * 원정과 귀환 (E304, `CYCLE.md` 3장): 성소 화로(한가운데)에 서면 귀환 카드. 갈래를 고르면 귀환한다:
 * 명성을 받고, 승천이나 원천 불씨를 얻고, 기세(수련 경험치·마디)와 일반 장비(가보 빼고)를 지운 뒤 그 자리에서 새 원정을 떠난다.
 * 귀환 1부터 마디를 지난 차례대로 다시 찍고, 귀환 2부터 기세 출발점이 생긴다. 새 불길: 다시 떠난 뒤 2분 동안 장비가 더 떨어진다
 */
export class ExpeditionSystem {
  /** 「아직」을 눌렀다: 화로를 떠났다 다시 올 때까지 카드를 띄우지 않는다 */
  private declined = false

  constructor(
    private readonly ctx: GameContext,
    private readonly parts: ExpeditionParts,
  ) {
    ctx.bus.on('giantKilled', ({ giant }) => {
      if (giant.spec.boss !== undefined || isBossLike(giant.spec)) ctx.expedition.beatBoss()
    })
  }

  update(dt: number): void {
    const { expedition, chapters } = this.ctx
    expedition.tick(dt)
    expedition.reach(Math.max(1, chapters.index))
    if (this.atHearth()) {
      if (!this.declined && !this.parts.offering() && this.canReturn) this.offer()
    } else this.declined = false
  }

  /** 지금 귀환할 수 있나: 원정을 떠난 지 2분이 지났고 싸우는 중이 아니다 */
  get canReturn(): boolean {
    const { expedition, legend, combat } = this.ctx
    return expedition.elapsed >= MIN_SECONDS && !legend.active && combat.alive
  }

  /** 주인공이 성소 한가운데(화로)에 있다 */
  private atHearth(): boolean {
    const { legend, hero } = this.ctx
    if (!legend.present) return false
    const p = hero.object.position
    return Math.hypot(p.x - legend.center.x, p.z - legend.center.z) < HEARTH_RADIUS
  }

  /** 고를 수 있는 갈래: 자리에 든 신 가운데 더 오를 수 있는 신의 승천, 원천 불씨 넷 */
  branches(): ReturnBranch[] {
    const { progress } = this.ctx
    const out: ReturnBranch[] = []
    for (const god of pantheonGods(progress.pantheon)) {
      const level = progress.level(god)
      if (level < 1 || level >= progress.levelCap) continue
      const def = godDef(god)
      out.push({ id: `ascend:${god}`, name: `${def.name} 승천`, text: `${level + 1}단계: 모든 피해 ×1.35, 생명 +25%`, color: def.color })
    }
    for (const s of SOURCE_IDS) out.push({ id: `flame:${s}`, name: `${SOURCE_NAMES[s]} 불씨`, text: FLAME_TEXT[s], color: SOURCE_COLORS[s]![0] })
    return out
  }

  /** 귀환 카드에 보일 것 */
  view(): ReturnView {
    const { expedition } = this.ctx
    const p = expedition.preview()
    const heirloom = expedition.heirloomSlots
    return {
      count: expedition.count,
      gain: p.gain,
      now: p.now,
      next: p.next,
      time: clock(p.seconds),
      last: p.last === null ? null : clock(p.last),
      keeps: `깨운 신·신 단계·유물표·원형·장 진행·웨이포인트${heirloom > 0 ? `·가보 ${heirloom}` : ''}`,
      clears: '기세(수련 마디), 일반 장비',
      branches: this.branches(),
    }
  }

  private offer(): void {
    this.parts.offer(
      this.view(),
      (id) => this.returnNow(id),
      () => (this.declined = true),
    )
  }

  /** 귀환한다 (카드의 갈래, 봇·점검). 갈래 id는 `ascend:신` 또는 `flame:원천`. 받은 명성 (못 했으면 -1) */
  returnNow(id: string): number {
    const { expedition, training, powers, pickups, bus } = this.ctx
    const [kind, what] = id.split(':') as [string, string]
    if (kind !== 'ascend' && kind !== 'flame') return -1
    const flame = kind === 'flame' && SOURCE_IDS.includes(what as SourceId) ? (what as SourceId) : undefined
    const before = expedition.multiplier
    const gain = expedition.return({ ...(flame ? { flame } : {}) }, training.xp, [...training.taken])
    // 기세: 수련 경험치는 출발점으로, 마디는 비우고 (귀환 1부터) 지난 차례대로 다시 찍는다
    training.reset()
    training.xp = expedition.headStart
    if (expedition.retakes) for (const node of expedition.lastTaken) training.take(node)
    // 일반 장비: 가보 빼고 낀 것·가방·땅의 것을 지운다
    const keep = new Set(expedition.heirloom)
    const { loadout } = powers
    loadout.slots.forEach((uid, i) => uid && isGearUid(uid) && !keep.has(uid) && powers.unequip(i))
    for (const uid of [...loadout.bag]) if (isGearUid(uid) && !keep.has(uid)) loadout.discard(uid)
    for (const uid of [...loadout.gear.keys()]) if (!keep.has(uid) && !loadout.has(uid)) loadout.gear.delete(uid)
    for (const item of [...pickups.list]) if (item.gear) pickups.remove(item.id)
    if (kind === 'ascend') this.parts.ascend(what)
    this.declined = true
    bus.emit('expeditionReturned', { count: expedition.count - 1, renown: gain, mult: expedition.multiplier, branch: id })
    const lines = [`명성 +${gain} · 모든 피해 ×${before.toFixed(2)} → ×${expedition.multiplier.toFixed(2)}`, ...(flame ? [`${SOURCE_NAMES[flame]} 불씨: ${FLAME_TEXT[flame]}`] : []), '새 불길: 2분 동안 장비가 더 떨어진다']
    bus.emit('moment', { id: 'returned', card: { kind: '귀환', title: `원정 ${expedition.count} 출발`, color: '#ffd27a', lines } })
    bus.emit('loadoutChanged', { change: { before: powers.state, after: powers.state }, announce: false })
    bus.emit('progressChanged', {})
    return gain
  }
}

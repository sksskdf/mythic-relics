import { SOURCE_IDS, type SourceId } from '../../data/schema'
import { FLAME, RETURN_MIN_LEVEL, RETURN_MIN_SECONDS } from '../../data/cycle'
import { isBossLike } from '../../enemies/grade'
import { gearName, gearScore, isGearUid } from '../../gear/roll'
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

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** 게임이 귀환 시스템에 넘기는 것 */
export interface ExpeditionParts {
  /** 귀환 카드를 보인다 */
  offer(view: ReturnView, pick: (id: string, depth?: number) => void, later: () => void): void
  /** 귀환 카드가 떠 있다 */
  offering(): boolean
  /** 신을 한 단계 올린다 (승천, 큰 카드와 함께) */
  ascend(god: God): void
  /** 가방의 셋을 합친다 (자동 합치기, 카드와 함께) */
  merge(uids: readonly string[]): void
  /** 다음 원정의 깊이를 정한다 (엔딩 뒤 귀환 카드의 「+1」, 이미 세운 적도 다시 세운다) */
  deepen(level: number): void
}

/**
 * 원정과 귀환 (E304, `CYCLE.md` 3장): 성소 화로(한가운데)에 서면 귀환 카드. 갈래를 고르면 귀환한다:
 * 명성을 받고, 승천이나 원천 불씨를 얻고, 기세(수련 경험치·마디)와 일반 장비(가보 빼고)를 지운 뒤 그 자리에서 새 원정을 떠난다.
 * 귀환 1부터 마디를 지난 차례대로 다시 찍고, 귀환 2부터 기세 출발점이 생긴다. 새 불길: 다시 떠난 뒤 2분 동안 장비가 더 떨어진다
 */
export class ExpeditionSystem {
  /** 「아직」을 눌렀다: 화로를 떠났다 다시 올 때까지 카드를 띄우지 않는다 */
  private declined = false
  /** 장비를 주웠다: 다음 프레임에 저절로 합친다 (주웠다는 알림은 가방에 넣기 전에 오므로, 넣은 뒤에 센다) */
  private mergeDue = false

  constructor(
    private readonly ctx: GameContext,
    private readonly parts: ExpeditionParts,
  ) {
    ctx.bus.on('giantKilled', ({ giant }) => {
      if (giant.spec.boss !== undefined || isBossLike(giant.spec)) ctx.expedition.beatBoss()
    })
    // 귀환 횟수 자동화 (E304-03): 귀환 2부터 보통·좋음, 3부터 희귀를 주울 때 저절로 합친다
    ctx.bus.on('gearPicked', () => (this.mergeDue = true))
  }

  /** 지난 원정 차례에서 아직 안 익힌 마디 하나를 익힌다 (익힐 수 있는 것이 없으면 그대로) */
  private retake(): void {
    const { training, expedition, bus } = this.ctx
    const next = expedition.lastTaken.find((id) => !training.taken.has(id) && training.canTake(id))
    if (next && training.take(next)) bus.emit('progressChanged', {})
  }

  /** 저절로 합칠 수 있는 셋을 모두 합친다 (낮은 등급부터, 한 번에 다섯 묶음까지) */
  private autoMerge(): void {
    const { expedition, powers } = this.ctx
    if (!expedition.autoMerges('good')) return
    for (let i = 0; i < 5; i++) {
      const group = powers.loadout.mergeable().find((g) => g[0]!.grade === 'common' || g[0]!.grade === 'good' || (g[0]!.grade === 'rare' && expedition.autoMerges('rare')))
      if (!group) return
      this.parts.merge(group.map((g) => g.uid))
    }
  }

  update(dt: number): void {
    const { expedition, chapters, training } = this.ctx
    expedition.tick(dt)
    if (this.mergeDue) {
      this.mergeDue = false
      this.autoMerge()
    }
    // 다시 찍기 (귀환 1부터): 깨달음이 생기는 대로 지난 원정에서 익힌 차례대로
    if (expedition.retakes && training.unspent > 0) this.retake()
    expedition.reach(Math.max(1, chapters.index))
    // 원정이 무르익으면 성소의 빛기둥이 선다 (글 대신 빛으로 알린다)
    this.ctx.sanctuary.beacon = this.canReturn
    if (this.atHearth()) {
      if (!this.declined && !this.parts.offering() && this.canReturn) this.offer()
    } else this.declined = false
  }

  /** 원정이 무르익었나: 떠난 지 2분이 지났고 기세 레벨이 문턱을 넘었다 */
  get ripe(): boolean {
    return this.ctx.expedition.elapsed >= RETURN_MIN_SECONDS && this.ctx.training.insights >= RETURN_MIN_LEVEL
  }

  /** 지금 귀환할 수 있나: 원정이 무르익었고 살아 있다 */
  get canReturn(): boolean {
    return this.ripe && this.ctx.combat.alive
  }

  /** 주인공이 성소 한가운데(화로)에 있다 */
  private atHearth(): boolean {
    const { sanctuary, hero } = this.ctx
    if (!sanctuary.present) return false
    const p = hero.object.position
    return Math.hypot(p.x - sanctuary.center.x, p.z - sanctuary.center.z) < HEARTH_RADIUS
  }

  /**
   * 고를 수 있는 갈래: 자리에 든 신 가운데 더 오를 수 있는 신의 승천, 원천 불씨 넷.
   * 엔딩 뒤(자동화 「지난번 갈래 그대로」)에는 지난 귀환의 갈래를 맨 앞에 둔다 (E305-03)
   */
  branches(): ReturnBranch[] {
    const { progress, expedition, automation } = this.ctx
    const out: ReturnBranch[] = []
    for (const god of pantheonGods(progress.pantheon)) {
      const level = progress.level(god)
      if (level < 1 || level >= progress.levelCap) continue
      const def = godDef(god)
      out.push({ id: `ascend:${god}`, name: `${def.name} 승천`, text: `${level + 1}단계: 모든 피해 ×1.35, 생명 +25%`, color: def.color })
    }
    for (const s of SOURCE_IDS) out.push({ id: `flame:${s}`, name: `${SOURCE_NAMES[s]} 불씨`, text: FLAME_TEXT[s], color: SOURCE_COLORS[s]![0] })
    const last = automation.now.sameBranch ? out.findIndex((b) => b.id === expedition.lastBranch) : -1
    if (last >= 0) out.unshift({ ...out.splice(last, 1)[0]!, again: true })
    return out
  }

  /** 귀환 카드에 보일 것 */
  view(): ReturnView {
    const { expedition, depth, ending } = this.ctx
    const p = expedition.preview()
    const heirloom = expedition.heirloomSlots
    return {
      count: expedition.count,
      gain: p.gain,
      now: p.now,
      next: p.next,
      time: clock(p.seconds),
      last: p.last === null ? null : clock(p.last),
      keeps: `깨운 신·신 단계·유물표·원형·장 진행·웨이포인트${heirloom > 0 ? `·가장 좋은 장비 ${heirloom}` : ''}`,
      clears: '기세(수련 마디), 일반 장비',
      branches: this.branches(),
      // 깊이 (E305-03, D9): 엔딩 뒤에만 다음 원정을 그대로나 한 걸음 더 깊이
      ...(ending.has('depth') ? { depth: { now: depth.level, max: depth.max } } : {}),
    }
  }

  private offer(): void {
    this.parts.offer(
      this.view(),
      (id, level) => this.returnNow(id, level),
      () => (this.declined = true),
    )
  }

  /**
   * 귀환한다 (카드의 갈래, 봇·점검). 갈래 id는 `ascend:신` 또는 `flame:원천`, depth는 다음 원정의 깊이(엔딩 뒤, 없으면 그대로).
   * 받은 명성 (못 했으면 -1)
   */
  returnNow(id: string, depth?: number): number {
    const { expedition, training, powers, pickups, bus } = this.ctx
    const [kind, what] = id.split(':') as [string, string]
    if (kind !== 'ascend' && kind !== 'flame') return -1
    const flame = kind === 'flame' && SOURCE_IDS.includes(what as SourceId) ? (what as SourceId) : undefined
    const before = expedition.multiplier
    const gain = expedition.return({ ...(flame ? { flame } : {}) }, training.xp, [...training.taken])
    expedition.lastBranch = id
    // 가보 (귀환 1부터): 낀 일반 장비 가운데 가장 좋은 것을 칸 수만큼 남긴다 (고르는 단추 없이)
    expedition.heirloom = powers.loadout.wornGear
      .sort((a, b) => gearScore(b) - gearScore(a))
      .slice(0, expedition.heirloomSlots)
      .map((g) => g.uid)
    // 기세: 수련 경험치는 출발점으로, 마디는 비우고 (귀환 1부터) 지난 차례대로 다시 찍는다
    training.reset()
    training.xp = expedition.headStart
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
    // 다음 원정의 깊이: 지난 원정의 한계를 깸(DepthSystem이 expeditionReturned에서 본다) 뒤에 바꾼다
    if (depth !== undefined && depth !== this.ctx.depth.level) this.parts.deepen(depth)
    const heirlooms = expedition.heirloom.map((uid) => loadout.gear.get(uid)).filter((g) => g !== undefined)
    const lines = [
      `명성 +${gain} · 모든 피해 ×${before.toFixed(2)} → ×${expedition.multiplier.toFixed(2)}`,
      ...(flame ? [`${SOURCE_NAMES[flame]} 불씨: ${FLAME_TEXT[flame]}`] : []),
      ...heirlooms.map((g) => `가보로 남김: ${gearName(g)}`),
      '새 불길: 2분 동안 장비가 더 떨어진다',
    ]
    bus.emit('moment', { id: 'returned', card: { kind: '귀환', title: `원정 ${expedition.count} 출발`, color: '#ffd27a', lines } })
    bus.emit('loadoutChanged', { change: { before: powers.state, after: powers.state }, announce: false })
    bus.emit('progressChanged', {})
    return gain
  }
}

import { SOURCE_IDS, type SourceId } from '../../data/schema'
import { AURA_SLOTS } from '../../data/powers'
import { FLAME, RETURN_MIN_SECONDS, returnAsked, returnEarned, type ReturnAskNow } from '../../data/cycle'
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
/** 성소 한가운데에서 이만큼 안에 서면 귀환 카드가 뜬다 (맹세 출발 카드도 띄운 자리에서 이만큼 걸어 나가면 닫힌다) */
export const HEARTH_RADIUS = 2.5
/** 엔딩 전 귀환의 갈래 id (고르는 것이 없다, P6) */
export const PLAIN_RETURN = 'return'

const clock = (s: number): string => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

/** 귀환을 바라는지 정하는 지금 값을 게임에서 모은다 (`returnAsked`에 넘긴다: 귀환 카드와 목표 한 줄이 같은 값을 본다) */
export function returnAskNow(ctx: GameContext): ReturnAskNow {
  return { goal: ctx.chapters.goal?.kind }
}

/**
 * 지금 귀환할 만큼 원정이 무르익었나 (`ExpeditionSystem.ripe`). asks가 false면 목표가 귀환을 바라는지는 치지 않는다
 * (목표 한 줄의 귀환 신호: 목표가 귀환을 바라면 이미 그 글이 귀환이다)
 */
export function ripeNow(ctx: GameContext, asks: boolean): boolean {
  const { expedition, ending, training } = ctx
  if (expedition.elapsed < RETURN_MIN_SECONDS) return false
  return returnEarned({ ending: ending.reached, bosses: expedition.bosses, asked: asks && returnAsked(returnAskNow(ctx)), level: training.insights, falls: expedition.falls, seconds: expedition.elapsed })
}

/** 게임이 귀환 시스템에 넘기는 것 */
export interface ExpeditionParts {
  /** 귀환 카드를 보인다 */
  offer(view: ReturnView, pick: (id: string, depth?: number) => void, later: () => void): void
  /** 귀환 카드가 떠 있다 */
  offering(): boolean
  /** 귀환 카드를 닫는다 (화로를 떠났을 때) */
  close(): void
  /** 신을 한 단계 올린다 (승천, 큰 카드와 함께) */
  ascend(god: God): void
  /** 가방의 셋을 합친다 (자동 합치기, 카드와 함께) */
  merge(uids: readonly string[]): void
  /** 다음 원정의 깊이를 정한다 (엔딩 뒤 귀환 카드의 「+1」, 이미 세운 적도 다시 세운다) */
  deepen(level: number): void
}

/**
 * 원정과 귀환 (E304, `DESIGN.md` 5.3): 성소 화로(한가운데)에 서면 귀환 카드. 갈래를 고르면 귀환한다:
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
      // 끝없는 원정 층의 보스는 세지 않는다 (귀환 명성이 부풀지 않게)
      if (ctx.map.region.kind === 'endless') return
      if (giant.spec.boss !== undefined || isBossLike(giant.spec)) ctx.expedition.beatBoss()
    })
    // 쓰러진 원정은 5분 뒤부터 귀환할 수 있다 (`returnEarned`의 둘째 길)
    ctx.bus.on('heroDied', () => ctx.map.region.kind !== 'endless' && ctx.expedition.fell())
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
    } else {
      // 카드를 띄운 채 화로를 떠나면 「아직」과 같다 (E306 리뷰: 떠 있는 동안 얻은 것 카드·장면이 기다리니, 걸어 나가 사냥하면 끝없이 밀렸다)
      if (this.parts.offering()) this.parts.close()
      this.declined = false
    }
  }

  /**
   * 원정이 무르익었나: 떠난 지 2분이 지났고 귀환할 만한 원정이다 (`returnEarned`: 엔딩 전에는 이번 원정에서 수호자·장 보스를 이겼거나
   * 목표가 귀환을 바라거나, 쓰러진 적이 있고 5분이 지났다. 깨달음 수의 문턱은 2026-11-20에 걷었다. 엔딩 뒤에는 깨달음 8)
   */
  get ripe(): boolean {
    return ripeNow(this.ctx, true)
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
   * 고를 수 있는 갈래 (엔딩 뒤): 자리에 든 신 가운데 더 오를 수 있는 신의 승천, 원천 불씨 넷. 엔딩 전에는 「돌아간다」 하나.
   * 엔딩 뒤(자동화 「지난번 갈래 그대로」)에는 지난 귀환의 갈래를 맨 앞에 둔다 (E305-03)
   */
  branches(): ReturnBranch[] {
    const { progress, expedition, automation, ending } = this.ctx
    // 엔딩 전 (P6, `redesign.md` 1장 규칙 7): 고르는 것 없이 하나. 머리 보상은 도는 힘의 칸 하나 더
    if (!ending.reached) return [{ id: PLAIN_RETURN, name: '돌아간다', text: '도는 힘 칸 하나 더', color: '#ffd27a' }]
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
    const { expedition, depth, ending, mythPowers } = this.ctx
    const p = expedition.preview()
    const heirloom = expedition.heirloomSlots
    const best = heirloom > 0 ? `·가장 좋은 장비 ${heirloom}` : ''
    const slots = mythPowers.auraSlots
    return {
      count: expedition.count,
      // 엔딩 전에는 명성·배율을 보이지 않고 도는 힘 칸만 (P6). 배율은 그대로 쌓여 상태 탭의 「귀환」 층으로 보인다
      ...(ending.reached ? { renown: { gain: p.gain, now: p.now, next: p.next } } : { slots: { now: slots, next: Math.min(AURA_SLOTS.max, slots + 1) } }),
      time: clock(p.seconds),
      last: p.last === null ? null : clock(p.last),
      keeps: ending.reached ? `깨운 신·신 단계·유물표·원형·장 진행·웨이포인트${best}` : `가진 힘과 칸·유물·재료·장 진행·켠 성소${best}`,
      clears: ending.reached ? '수련(깨달음과 마디), 일반 장비' : '일반 장비',
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
   * 귀환한다 (카드의 갈래, 봇·점검). 갈래 id는 `return`(엔딩 전) · `ascend:신` · `flame:원천`(엔딩 뒤), depth는 다음 원정의 깊이(엔딩 뒤, 없으면 그대로).
   * 엔딩 전에는 고르는 것이 없다 (P6): 승천·불씨 id가 와도(옛 점검 스크립트) 그냥 돌아간다. 받은 명성 (못 했으면 -1)
   */
  returnNow(id: string, depth?: number): number {
    const { expedition, training, powers, pickups, bus, ending, mythPowers } = this.ctx
    const [kind, what] = id.split(':') as [string, string]
    if (kind !== PLAIN_RETURN && kind !== 'ascend' && kind !== 'flame') return -1
    const chosen = ending.reached ? kind : PLAIN_RETURN
    const flame = chosen === 'flame' && SOURCE_IDS.includes(what as SourceId) ? (what as SourceId) : undefined
    const before = expedition.multiplier
    const slotsBefore = mythPowers.auraSlots
    // 마친 원정에서 깊이 한계 보스를 이겼나 (저장되는 원정 기록, 귀환하면 지워지니 먼저 읽는다)
    const deepWin = expedition.deepWin
    const gain = expedition.return({ ...(flame ? { flame } : {}) }, training.xp, [...training.taken])
    expedition.lastBranch = chosen === PLAIN_RETURN ? PLAIN_RETURN : id
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
    if (chosen === 'ascend') this.parts.ascend(what)
    this.declined = true
    bus.emit('expeditionReturned', { count: expedition.count - 1, renown: gain, mult: expedition.multiplier, branch: expedition.lastBranch, deepWin })
    // 다음 원정의 깊이: 지난 원정의 한계를 깸(DepthSystem이 expeditionReturned에서 본다) 뒤에 바꾼다
    if (depth !== undefined && depth !== this.ctx.depth.level) this.parts.deepen(depth)
    const heirlooms = expedition.heirloom.map((uid) => loadout.gear.get(uid)).filter((g) => g !== undefined)
    // 엔딩 전 (P6): 명성·배율 대신 늘어난 도는 힘 칸
    const slotsAfter = mythPowers.auraSlots
    const head = ending.reached
      ? [`명성 +${gain} · 모든 피해 ×${before.toFixed(2)} → ×${expedition.multiplier.toFixed(2)}`, ...(flame ? [`${SOURCE_NAMES[flame]} 불씨: ${FLAME_TEXT[flame]}`] : [])]
      : [slotsAfter > slotsBefore ? `도는 힘 칸 ${slotsBefore} → ${slotsAfter}` : `도는 힘 칸 ${slotsAfter} · 모두 열렸다`]
    const lines = [...head, ...heirlooms.map((g) => `가보로 남김: ${gearName(g)}`), '2분 동안 장비가 더 떨어진다']
    bus.emit('moment', { id: 'returned', card: { kind: '귀환', title: `원정 ${expedition.count} 출발`, color: '#ffd27a', lines } })
    bus.emit('loadoutChanged', { change: { before: powers.state, after: powers.state }, announce: false })
    bus.emit('progressChanged', {})
    return gain
  }
}

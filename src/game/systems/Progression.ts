import type { Giant } from '../../enemies/Giant'
import { ELITE_REWARD } from '../../enemies/elite'
import { masteryShares, PER_PROMOTION } from '../../myth/ClassProgress'
import { levelGains } from '../../myth/levelGains'
import { classIcon } from '../../ui/classIcons'
import { realmSigil } from '../../ui/sigils'
import { realmInk } from '../../art/palette'
import { type God, godDef, GODS, type RelicId } from '../../relics/data'
import type { LegendKind } from '../../data/classKit'
import type { GameContext } from '../context'
import { godMoment } from './godMoments'

export { BASE_HP } from '../../build/BuildState'
/** 적을 쓰러뜨렸을 때 되찾는 생명력 */
const HEAL_PER_KILL = 4
const HEAL_PER_BOSS = 30

/**
 * 성장: 처치 경험치, 생명력 회복, 유물 드랍, 승급 전설과 승급, 승급 횟수에서 나오는 기본 능력치.
 */
export class ProgressionSystem {
  /** 지금 승급 전설에 도전하는 신 */
  private challenger: God | null = null

  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('giantKilled', ({ giant }) => this.onGiantKilled(giant))
  }

  /** 지금 이 지역 성소에서 열 수 있는 승급 전설 (없으면 null) */
  readyKind(): LegendKind | null {
    const { build, progress } = this.ctx
    const god = build.chosen
    const legend = god ? godDef(god).legend : undefined
    if (!god || !legend || !progress.readyToPromote(god)) return null
    // 지역 성소는 그 신화권 클래스의 전설만 연다 (E7-07)
    const realm = this.ctx.map.region.realm
    if (realm && godDef(god).realm !== realm) return null
    return legend.kind
  }

  /** 성소가 열려 있다 (지도에 깜빡임) */
  get sanctuaryOpen(): boolean {
    return this.readyKind() !== null
  }

  /** 승급 전설: 성소에 들어서면 시작하고, 이기면 승급한다. */
  update(dt: number): void {
    const { legend, encounter, build, combat, hero, hud, view, bus } = this.ctx
    legend.update(dt, encounter, {
      ready: () => {
        const god = build.chosen
        const kind = this.readyKind()
        if (god && kind) this.challenger = god
        return kind
      },
      heroAlive: () => combat.alive,
      heroPosition: () => hero.object.position,
      setArena: (arena) => {
        hero.arena = arena
      },
      onStart: () => {
        bus.emit('legendStarted', {})
        const def = godDef(this.challenger!)
        const ink = realmInk(def.realm)
        hud.showTitleCard(def.legend!.name, def.color, realmSigil(def.realm, ink.light, ink.dark), '전설')
        view.shake(0.3)
      },
      onWin: () => this.challenger && this.promote(this.challenger),
      onFail: () => bus.emit('legendFailed', {}),
    })
  }

  /** 신화 숙련과 유물 드랍. 숙련은 그 몬스터 신화권의 신들에게 나눠 쌓인다. (DESIGN.md 5.2, E12-02) */
  private onGiantKilled(giant: Giant): void {
    const { powers, combat, drops, pickups } = this.ctx
    this.gainMastery(giant.spec.xp * (giant.elite ? ELITE_REWARD.xp : 1), giant.spec.realm)
    // 적을 쓰러뜨리면 생명력을 조금 되찾는다. 몰려오는 무리를 쓸어 내며 버틸 수 있게 한다.
    if (combat.alive) combat.heal((giant.spec.boss ? HEAL_PER_BOSS : HEAL_PER_KILL) + this.ctx.build.state.stats.healOnKill)
    const owned = new Set<RelicId>([
      ...powers.loadout.slots.filter((id): id is RelicId => id !== null),
      ...powers.loadout.bag,
      ...pickups.list.map((p) => p.id),
    ])
    // 정예는 유물을 한 번 더 굴린다. 상시 효과(도깨비)는 그 확률만큼 한 번 더
    const rolls = (giant.elite ? ELITE_REWARD.dropRolls : 1) + (Math.random() < this.ctx.build.state.stats.dropChance ? 1 : 0)
    for (let i = 0; i < rolls; i++) {
      const relic = drops.roll(owned, giant.spec.boss)
      if (!relic) continue
      pickups.drop(relic, giant.x, giant.z)
      break
    }
  }

  /** 신화 숙련을 그 신화권 신들에게 나눠 쌓는다. 문턱을 넘은 신화는 열린다. */
  gainMastery(amount: number, realm: string | undefined): void {
    const { build, progress, bus } = this.ctx
    // 상시 효과: 신화 숙련 얻는 양 (오딘)
    amount *= 1 + build.state.stats.masteryGain
    for (const [god, share] of masteryShares(amount, realm, build.chosen, Object.values(GODS))) {
      if (progress.addXp(god, share) === 'opened') this.announceOpened(god)
    }
    bus.emit('progressChanged', {})
  }

  /** 숙련이 문턱을 넘어 신화가 처음 열렸다: 칭호 카드와 그 신의 순간 (고르지 않아도 상시 효과가 붙는다) */
  private announceOpened(god: God): void {
    const { hud, fx, hero, bus } = this.ctx
    const def = godDef(god)
    bus.emit('mythOpened', { god })
    const echo = def.always.echo
    hud.showGains('신화 개방', def.titles[0], def.color, classIcon(def.name), [`${def.name}의 힘이 깨어났다`, `상시 효과: ${partName(def, echo.part)} 메아리`])
    fx.power.burst(hero.object.position, def.color, 3)
    hud.flash(def.color)
  }

  /** 승급: 칭호가 바뀌고, 스킬이 강해지고, 원천 숙련과 기본 능력치가 오른다. */
  promote(god: God): void {
    const { progress, combat, hero, hud, fx, view, feel, bus } = this.ctx
    const hpBefore = this.ctx.build.state.maxHp
    const dmgBefore = 1 + progress.promotions * PER_PROMOTION.damage
    if (!progress.promote(god)) return
    bus.emit('promoted', { god, title: progress.title(god) })
    bus.emit('progressChanged', {})
    this.applyStats()
    combat.health.reset()
    const p = hero.object.position
    // 무엇이 얼마나 강해졌는지: 기본 능력치는 전→후, 그 단계에서 새로 생긴 힘은 한 줄씩
    const hpAfter = this.ctx.build.state.maxHp
    const dmgAfter = 1 + progress.promotions * PER_PROMOTION.damage
    const level = progress.level(god)
    const lines = [
      `최대 생명 ${hpBefore} → ${hpAfter}`,
      `모든 피해 ×${dmgBefore.toFixed(2)} → ×${dmgAfter.toFixed(2)}`,
      ...levelGains(god, level).filter((g) => g.kind !== 'hp' && g.kind !== 'damage').map((g) => g.text),
    ]
    hud.showGains(`개방 단계 · ${level}단계`, progress.title(god), godDef(god).color, classIcon(godDef(god).name), lines)
    // 신마다 다른 승급 순간: 레벨이 오를수록 크고 많다
    godMoment(this.ctx, god, level)
    fx.puffs.burst(p, 40, 5)
    // 승급: 그 신의 색으로 가장 큰 빛기둥과 번쩍임. 레벨이 오를수록 크다.
    fx.power.burst(p, godDef(god).color, 3 + progress.level(god))
    hud.flash(godDef(god).color)
    view.shake(0.6)
    feel.stop(0.2)
  }

  /** 총 승급 횟수에서 나오는 기본 능력치 (DESIGN.md 6.2) */
  applyStats(): void {
    this.ctx.combat.health.setMax(this.ctx.build.state.maxHp)
  }

  /** 클래스 성장(레벨·경험치)을 처음으로 되돌린다. */
  reset(): void {
    this.ctx.progress.records.clear()
    this.applyStats()
    this.ctx.combat.health.reset()
    this.ctx.bus.emit('progressChanged', {})
  }
}

/** 메아리가 본뜬 패시브 부품의 화면 이름 (이름이 없는 부품은 신 이름) */
function partName(def: ReturnType<typeof godDef>, part: string): string {
  const named = (def.passive as unknown as Record<string, { name?: string } | undefined>)[part]
  if (named?.name) return named.name
  return part === 'basicLightning' ? '번개' : part === 'bladeStorm' ? '칼날 폭풍' : def.name
}

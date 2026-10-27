import { realmInk } from '../../art/palette'
import { REGIONS } from '../../data/regions'
import { REALM_NAMES } from '../../data/threat'
import { ENEMIES } from '../../enemies/Giant'
import { MASTERY_TO_OPEN } from '../../myth/ClassProgress'
import { collectionText } from '../../myth/alwaysText'
import { type God, godDef, GODS } from '../../relics/data'
import { classIcon } from '../../ui/classIcons'
import type { MythPicker } from '../../ui/MythPicker'
import { josa } from '../../ui/josa'
import type { GameContext } from '../context'

/** 성소 가운데에서 이만큼 안에 서면 고르기가 열린다 (전설이 시작되는 거리와 같다) */
const CHOOSE_RADIUS = 1.6

/** 지금 열 수 있는 신화 고르기 */
export interface MythOffer {
  /** 그 신화권 */
  realm: string
  /** 고르는 성소의 땅 */
  region: string
  /** 고를 수 있는 신화 (그 신화권의 히든 아닌 신화) */
  gods: God[]
  /** 처음 고르는 신화인가 (고르면 그 신화로 싸운다) */
  first: boolean
}

/** 그 신화권의 히든 아닌 신화 */
export function realmGods(realm: string): God[] {
  return Object.values(GODS)
    .filter((g) => g.realm === realm && !g.hidden)
    .map((g) => g.id)
}

/**
 * 신화 고르기 (E22-03, TIMELINE.md 5.1): 데모에서는 신화가 경험치로 저절로 열리지 않는다.
 * - 첫 신화: 경험치가 문턱까지 차면 미드가르드 성소에 빛기둥이 서고, 가운데에 서면 북유럽 넷 가운데 하나를 고른다
 * - 다음 신화권: 그 장에 들어서면 그 입구 성소에서 하나를 연다 (고른 신화는 그대로)
 * - 장 보스를 이기면 그 신화권의 나머지가 모두 열린다 (장 데이터의 opens)
 * 엔딩 뒤에는 예전처럼 경험치·유물로 연다.
 */
export class MythChoiceSystem {
  /** 알림 카드의 신화 아이콘 (점검에서는 그림 없이) */
  iconOf = (god: God): string => classIcon(godDef(god).name)

  constructor(
    private readonly ctx: GameContext,
    private readonly picker: MythPicker,
  ) {
    ctx.bus.on('giantKilled', ({ giant }) => {
      const region = ctx.map.region
      if (giant.spec.role !== 'boss' || !region.boss || ctx.legend.active || region.kind === 'rift') return
      const realm = ctx.chapters.chapters.flatMap((c) => c.steps).find((s) => s.kind === 'boss' && s.region === region.id)?.opens
      if (realm) this.openRealm(realm)
    })
  }

  /** 지금 열 수 있는 고르기 (장 흐름의 앞에서부터, 아직 그 신화권 신화가 하나도 안 열린 것) */
  offer(): MythOffer | null {
    const { chapters, progress, ending } = this.ctx
    if (ending.reached) return null
    const reached = chapters.chapters.slice(0, chapters.index + 1).flatMap((c) => c.steps)
    for (const step of reached) {
      if (step.kind !== 'choose' || !step.realm) continue
      const gods = realmGods(step.realm)
      if (gods.some((g) => progress.isOpen(g))) continue
      const first = progress.opened.length === 0
      // 첫 신화는 그 신화권 경험치가 문턱까지 찼을 때
      if (first && !gods.some((g) => progress.xpOf(g) >= MASTERY_TO_OPEN)) return null
      return { realm: step.realm, region: step.region, gods, first }
    }
    return null
  }

  /** 지금 땅의 성소에서 고를 수 있나 (성소에 빛기둥) */
  get here(): MythOffer | null {
    const offer = this.offer()
    return offer && offer.region === this.ctx.map.region.id && this.ctx.legend.present ? offer : null
  }

  /** 프레임마다: 성소 빛기둥, 가운데에 서면 고르기를 연다 */
  update(): void {
    const { legend, hero, combat } = this.ctx
    const offer = this.here
    legend.beacon = offer !== null
    if (!offer || this.picker.open || legend.active || !combat.alive) return
    const p = hero.object.position
    if (Math.hypot(p.x - legend.center.x, p.z - legend.center.z) > CHOOSE_RADIUS) return
    hero.stop()
    this.picker.show(offer.gods, offer.first, this.restText(offer.realm), (god) => this.pick(god))
  }

  /** 그 신화권의 나머지 신화가 열리는 때: 「거인 왕을 쓰러뜨리면」 (장 데이터의 opens가 없으면 null) */
  restText(realm: string): string | null {
    const step = this.ctx.chapters.chapters.flatMap((c) => c.steps).find((s) => s.kind === 'boss' && s.opens === realm)
    const boss = step ? REGIONS[step.region]?.boss : null
    const spec = boss ? ENEMIES[boss.enemy ?? 'king'] : undefined
    return spec ? `${josa(spec.name, '을')} 쓰러뜨리면` : null
  }

  /** 고른다: 그 신화를 열고, 처음이면 그 신화로 싸운다 (처음 연 신화는 RelicSystem이 바로 고른다). 고를 수 없으면 false */
  pick(god: God): boolean {
    const offer = this.offer()
    if (!offer || !offer.gods.includes(god)) return false
    this.picker.hide()
    if (!this.ctx.progress.open(god)) return false
    this.ctx.bus.emit('mythOpened', { god })
    this.ctx.bus.emit('progressChanged', {})
    return true
  }

  /** 장 보스를 이겼다: 그 신화권의 닫힌 신화를 모두 열고 한 장으로 알린다 */
  openRealm(realm: string): God[] {
    const { progress, bus, hud, fx, hero } = this.ctx
    const opened = realmGods(realm).filter((g) => progress.open(g))
    if (opened.length === 0) return opened
    for (const god of opened) bus.emit('mythOpened', { god, quiet: true })
    const names = opened.map((g) => godDef(g).name)
    const color = realmInk(realm).light
    fx.power.burst(hero.object.position, color, 3)
    hud.flash(color)
    hud.showGains('신화 개방', `${REALM_NAMES[realm] ?? realm} 신화 ${opened.length}`, color, this.iconOf(opened[0]!), [
      `${josa(names.join('·'), '이')} 열렸다`,
      '마을이나 성소에서 바꿔 쓸 수 있다',
      `수집 보너스: ${collectionText()}`,
    ])
    bus.emit('progressChanged', {})
    return opened
  }
}

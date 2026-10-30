import { type BodyLook, bodyKey } from '../../looks/body'
import { lookDef, type LookSlot } from '../../looks/catalog'
import { gearLook, parseGearLook } from '../../looks/gearLooks'
import { autoOutfit, type LookChoice, type Outfit } from '../../looks/outfit'
import { godDef, relicDef } from '../../relics/data'
import { relicOwner } from '../../gear/mythRelic'
import type { GameContext } from '../context'

/**
 * 외형: 장착한 유물과 발현 상태로 모습을 정하고, 보관함에서 고른 것을 덧입힌다. (E3)
 * 처음 걸쳐 본 외형은 보관함에 들어간다. 모습만 바뀌고 능력은 그대로다.
 */
export class AppearanceSystem {
  private bodyKey = '000'
  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('loadoutChanged', () => this.refresh())
    this.refresh()
  }

  /** 장착 상태가 정하는 모습 (보관함 선택을 적용하기 전) */
  get auto(): Outfit {
    const { powers, build } = this.ctx
    // 신의 자리 셋 (E302): 무기와 표식은 손의 신, 옷까지 그 신의 모습은 한 신에 몰았을 때만
    const hand = build.chosen
    const focus = build.focus
    const weapon = hand ? handWeapon(hand) : undefined
    const handLooks = hand ? { ...(weapon ? { weapon } : {}), mark: godDef(hand).mark } : {}
    return autoOutfit({
      gearLooks: powers.loadout.slots.map((uid) => (uid ? powers.loadout.gear.get(uid) : undefined)).flatMap((item) => (item ? (gearLook(item) ?? []) : [])),
      // 유물표의 유물은 손의 신 것만 모습에 보인다 (E303-04: 유물은 칸을 떠났다)
      relicLooks: powers.loadout.relics.filter((id) => hand !== null && relicOwner(id) === hand).map((id) => relicDef(id).look),
      manifestLooks: focus ? { ...godDef(focus).looks, mark: godDef(focus).mark } : handLooks,
    })
  }

  /** 장착이 바뀌었다: 새 외형을 보관함에 넣고 다시 입는다. */
  refresh(): void {
    const { wardrobe, bus } = this.ctx
    const auto = this.auto
    // 장비 외형은 끼고 있는 동안만 보이고 보관함에는 모으지 않는다
    const added = wardrobe.unlock(Object.values(auto).filter((id): id is string => id !== null && !parseGearLook(id)))
    if (added.length > 0) {
      bus.emit('looksUnlocked', { ids: added })
      bus.emit('progressChanged', {})
    }
    this.apply()
  }

  /** 보관함에서 칸 하나를 고른다. */
  choose(slot: LookSlot, choice: LookChoice): void {
    if (!this.ctx.wardrobe.choose(slot, choice)) return
    this.ctx.bus.emit('progressChanged', {})
    this.apply()
  }

  /** 처음에 고른 기본 모습을 바꾼다. (캐릭터 만들기) */
  setBody(body: BodyLook): void {
    this.ctx.wardrobe.body = { ...body }
    this.ctx.bus.emit('progressChanged', {})
    this.apply()
  }

  /** 얻은 외형을 모두 다시 적용한다. (불러오기 뒤) */
  apply(): void {
    const { hero, wardrobe, bus } = this.ctx
    if (this.bodyKey !== bodyKey(wardrobe.body)) {
      this.bodyKey = bodyKey(wardrobe.body)
      hero.rig.setBody(wardrobe.body)
    }
    hero.rig.wear(wardrobe.dress(this.auto))
    bus.emit('outfitChanged', {})
  }

  /** 프레임마다: 표식에 딸린 기운 연출을 켜고 끈다. 쓰러져 있으면 끈다. 아수라의 팔은 천천히 숨 쉬듯 흔들린다(dt: 이번 프레임의 게임 시간). */
  update(dt = 1 / 60): void {
    const { hero, combat, fx } = this.ctx
    const mark = hero.rig.outfit.mark
    const aura = combat.alive && mark ? lookDef(mark).aura : undefined
    fx.sparks.enabled = aura === 'sparks'
    fx.shadow.enabled = aura === 'shadow'
    fx.asura.enabled = aura === 'asura'
    fx.tint.enabled = aura === 'tint'
    const manifestedGod = this.ctx.build.chosen
    if (aura === 'tint' && manifestedGod && this.tinted !== manifestedGod) {
      this.tinted = manifestedGod
      fx.tint.setColor(parseInt(godDef(manifestedGod).color.slice(1), 16))
    }
    // 타격 멈춤·느린 동작을 따르도록 게임 dt만큼 흐른다
    this.sway += dt
    // 표식은 레벨마다 다른 모양으로 자라고(E6), 조금씩 커진다 (Lv1 1배 → Lv4 1.15배)
    const manifested = this.ctx.build.chosen
    const level = manifested ? this.ctx.progress.level(manifested) : 1
    hero.rig.setMarkLevel(level)
    hero.rig.mark.scale.setScalar(1 + (level - 1) * 0.05)
    fx.sparks.level = level
    fx.shadow.level = level
    fx.asura.level = level
    fx.tint.level = level
    hero.rig.mark.rotation.z = aura === 'asura' ? Math.sin(this.sway * 1.7) * 0.06 : 0
  }

  private sway = 0
  /** 공용 기운을 마지막으로 물들인 신 */
  private tinted: string | null = null
}

/** 손에 쥔 신의 무기 모습: 신화 외형의 무기, 없으면 그 신의 유물이 무기면 그 모습 (묠니르·궁니르) */
function handWeapon(god: string): string | undefined {
  const def = godDef(god)
  if (def.looks.weapon) return def.looks.weapon
  const look = relicDef(def.relic).look
  return lookDef(look).slot === 'weapon' ? look : undefined
}

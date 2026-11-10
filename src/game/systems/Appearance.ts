import { type BodyLook, bodyKey } from '../../looks/body'
import { lookDef, type LookSlot } from '../../looks/catalog'
import { gearLook, parseGearLook } from '../../looks/gearLooks'
import { autoOutfit, earnedLooks, type LookChoice, type Outfit } from '../../looks/outfit'
import { type God, godDef, GODS, relicDef } from '../../relics/data'
import type { GameContext } from '../context'

/**
 * 외형 (E3 → E307): 주인공은 처음 고른 모습 그대로다. 낀 일반 장비와 손에 쥔 신의 무기만 저절로 보이고,
 * 깨운 신의 옷·표식과 켠 유물의 외형은 보관함에 풀려 직접 골라야 입는다 (사용자 의견 4: 신을 깨워도 내 모습은 바뀌지 않는다).
 * 모습만 바뀌고 능력은 그대로다.
 */
export class AppearanceSystem {
  private bodyKey = '000'
  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('loadoutChanged', () => this.refresh())
    // 자리가 다 차 있어 어디에도 들지 못한 신도 깨어나면 옷이 풀린다
    ctx.bus.on('mythOpened', () => this.refresh())
    this.refresh()
  }

  /** 장착 상태가 정하는 모습 (보관함 선택을 적용하기 전): 기본 모습에 낀 장비, 손에 쥔 신의 무기 */
  get auto(): Outfit {
    const { powers, build } = this.ctx
    const hand = build.chosen
    return autoOutfit({
      gearLooks: powers.loadout.slots.map((uid) => (uid ? powers.loadout.gear.get(uid) : undefined)).flatMap((item) => (item ? (gearLook(item) ?? []) : [])),
      handWeapon: hand ? handWeapon(hand) : null,
    })
  }

  /** 장착·깨운 신이 바뀌었다: 새로 풀린 외형을 보관함에 넣고 다시 입는다. */
  refresh(): void {
    const { wardrobe, bus, powers, progress } = this.ctx
    // 장비 외형은 끼고 있는 동안만 보이고 보관함에는 모으지 않는다
    const worn = Object.values(this.auto).filter((id): id is string => id !== null && !parseGearLook(id))
    const earned = earnedLooks({ relicLooks: powers.loadout.relics.map((id) => relicDef(id).look), gods: progress.opened.map((god) => godDef(god)) })
    const added = wardrobe.unlock([...worn, ...earned])
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

  /** 프레임마다: 고른 표식에 딸린 기운 연출을 켜고 끈다. 쓰러져 있으면 끈다. 아수라의 팔은 천천히 숨 쉬듯 흔들린다(dt: 이번 프레임의 게임 시간). */
  update(dt = 1 / 60): void {
    const { hero, combat, fx } = this.ctx
    const mark = hero.rig.outfit.mark
    const aura = combat.alive && mark ? lookDef(mark).aura : undefined
    fx.sparks.enabled = aura === 'sparks'
    fx.shadow.enabled = aura === 'shadow'
    fx.asura.enabled = aura === 'asura'
    fx.tint.enabled = aura === 'tint'
    // 표식은 그 표식의 신을 따른다 (E307: 손의 신과 다른 신의 표식도 고를 수 있다)
    const owner = mark ? markOwner(mark) : null
    if (aura === 'tint' && owner && this.tinted !== owner) {
      this.tinted = owner
      fx.tint.setColor(parseInt(godDef(owner).color.slice(1), 16))
    }
    // 타격 멈춤·느린 동작을 따르도록 게임 dt만큼 흐른다
    this.sway += dt
    // 표식은 그 신의 단계마다 다른 모양으로 자라고(E6), 조금씩 커진다 (1단계 1배 → 4단계 1.15배)
    const level = owner ? Math.max(1, this.ctx.progress.level(owner)) : 1
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

const markOwners = new Map<string, God>()
/** 그 표식의 신 */
function markOwner(mark: string): God | null {
  if (markOwners.size === 0) for (const god of Object.values(GODS)) markOwners.set(god.mark, god.id)
  return markOwners.get(mark) ?? null
}

/** 손에 쥔 신의 무기 모습: 신화 외형의 무기, 없으면 그 신의 유물이 무기면 그 모습 (묠니르·궁니르) */
function handWeapon(god: string): string | undefined {
  const def = godDef(god)
  if (def.looks.weapon) return def.looks.weapon
  const look = relicDef(def.relic).look
  return lookDef(look).slot === 'weapon' ? look : undefined
}

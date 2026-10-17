import type { LookSlot } from '../../looks/catalog'
import { autoOutfit, type LookChoice, type Outfit } from '../../looks/outfit'
import { godDef, relicDef } from '../../relics/data'
import type { GameContext } from '../context'

/**
 * 외형: 장착한 유물과 발현 상태로 모습을 정하고, 보관함에서 고른 것을 덧입힌다. (E3)
 * 처음 걸쳐 본 외형은 보관함에 들어간다. 모습만 바뀌고 능력은 그대로다.
 */
export class AppearanceSystem {
  constructor(private readonly ctx: GameContext) {
    ctx.bus.on('loadoutChanged', () => this.refresh())
    this.refresh()
  }

  /** 장착 상태가 정하는 모습 (보관함 선택을 적용하기 전) */
  get auto(): Outfit {
    const { powers } = this.ctx
    const manifested = powers.manifested
    return autoOutfit({
      relicLooks: powers.loadout.slots.filter((id) => id !== null).map((id) => relicDef(id).look),
      manifestLooks: manifested ? godDef(manifested).looks : {},
    })
  }

  /** 장착이 바뀌었다: 새 외형을 보관함에 넣고 다시 입는다. */
  refresh(): void {
    const { wardrobe, bus } = this.ctx
    const auto = this.auto
    const added = wardrobe.unlock(Object.values(auto).filter((id): id is string => id !== null))
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

  /** 얻은 외형을 모두 다시 적용한다. (불러오기 뒤) */
  apply(): void {
    const { hero, wardrobe, bus } = this.ctx
    hero.rig.wear(wardrobe.dress(this.auto))
    bus.emit('outfitChanged', {})
  }

  /** 프레임마다: 기운(aura) 칸의 연출을 켜고 끈다. 쓰러져 있으면 끈다. */
  update(): void {
    const { hero, combat, fx } = this.ctx
    const aura = combat.alive ? hero.rig.outfit.aura : null
    fx.sparks.enabled = aura === 'thorSparks'
    fx.shadow.enabled = aura === 'lokiShadow'
  }
}

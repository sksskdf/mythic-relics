import type * as THREE from 'three'

import { RELICS, type RelicId } from '../relics/data'
import { Loadout, type LoadoutState } from '../relics/Loadout'
import { createSkill } from '../skills'
import type { Skill, SkillContext } from '../skills/Skill'
import { ThunderJudgement } from '../skills/Ultimate'
import type { HudSlot } from '../ui/Hud'
import { pixelIcon } from '../ui/pixelIcon'

/** 장착이 바뀐 결과: 발현이 새로 일어났거나 풀렸는지 */
export interface LoadoutChange {
  before: LoadoutState
  after: LoadoutState
}

/**
 * 장착한 유물이 주는 힘을 모아 관리한다.
 * - 유물 1개 = 자동 스킬 1개 (가호 상태에서도 나간다)
 * - 같은 신 유물 3개 이상이면 발현: 궁극기와 패시브가 붙는다
 */
export class RelicPowers {
  readonly loadout = new Loadout()
  readonly skills: (Skill | null)[]
  readonly ultimate = new ThunderJudgement()
  state: LoadoutState
  private readonly icons = new Map<RelicId, string>()

  constructor(private readonly fx: THREE.Object3D) {
    this.skills = this.loadout.slots.map(() => null)
    this.state = this.loadout.state
  }

  get manifested() {
    return this.state.manifested
  }

  /** 빈 칸이 있는가 */
  get hasFreeSlot(): boolean {
    return this.loadout.slots.includes(null)
  }

  equip(id: RelicId): LoadoutChange | null {
    const slot = this.loadout.equip(id)
    if (slot < 0 || this.skills[slot]) return null
    this.skills[slot] = createSkill(id, this.fx)
    return this.refresh()
  }

  unequip(slot: number): { relic: RelicId; change: LoadoutChange } | null {
    const relic = this.loadout.unequip(slot)
    if (!relic) return null
    this.skills[slot]?.dispose()
    this.skills[slot] = null
    return { relic, change: this.refresh() }
  }

  update(dt: number, ctx: SkillContext): void {
    for (const skill of this.skills) skill?.update(dt, ctx)
    this.ultimate.update(dt, ctx)
  }

  /** 맞기 직전에 스킬이 끼어들 기회를 준다. (야른그레이프르) */
  beforeHeroHit(damage: number, fromX: number, fromZ: number, ctx: SkillContext): number {
    let result = damage
    for (const skill of this.skills) {
      if (skill?.beforeHeroHit) result = skill.beforeHeroHit(result, fromX, fromZ, ctx)
    }
    return result
  }

  hudSlots(): HudSlot[] {
    return this.loadout.slots.map((id, i) => {
      const skill = this.skills[i]
      return {
        icon: id ? this.icon(id) : null,
        cooldown: skill ? Math.min(1, skill.left / skill.cooldown) : 0,
      }
    })
  }

  private icon(id: RelicId): string {
    let icon = this.icons.get(id)
    if (!icon) {
      icon = pixelIcon(RELICS[id].icon, RELICS[id].colors)
      this.icons.set(id, icon)
    }
    return icon
  }

  private refresh(): LoadoutChange {
    const before = this.state
    this.state = this.loadout.state
    return { before, after: this.state }
  }
}

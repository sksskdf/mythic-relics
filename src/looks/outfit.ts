import { type BodyLook, DEFAULT_BODY } from './body'
import { BASE_OUTFIT, lookDef, type LookSlot, STARTING_LOOKS, WARDROBE_SLOTS } from './catalog'

/** 칸마다 걸칠 외형. null이면 그 칸은 비어 있다. */
export type Outfit = Record<LookSlot, string | null>

/** 보관함에서 고른 것: 'auto'면 장착을 따르고(표식은 없음), 외형 id면 그것, null이면 비운다. */
export type LookChoice = 'auto' | string | null

export interface OutfitSources {
  /** 낀 일반 장비의 외형 (E18-04-5): 기본 모습을 덮는다 */
  gearLooks?: readonly string[]
  /** 손에 쥔 신의 무기 외형 (E302). 낡은 검이면 없다 */
  handWeapon?: string | null
}

/**
 * 장착 상태가 정하는 모습. (E3-06 외형 우선순위 → E307)
 * 기본 모험가 < 일반 장비 외형(E18) < 손에 쥔 신의 무기. 같은 칸이면 뒤의 것이 덮는다.
 * 신의 옷·표식·유물 외형은 저절로 입지 않는다 (E307, 사용자 의견 4: 신을 깨워도 내 모습 그대로).
 * 깨운 신의 것은 보관함에 풀리고(`earnedLooks`), 칸마다 직접 골라야 입는다. 무기만은 싸우는 방식이라 손의 신을 따른다
 */
export function autoOutfit(sources: OutfitSources): Outfit {
  const outfit: Outfit = { ...BASE_OUTFIT }
  for (const id of sources.gearLooks ?? []) outfit[lookDef(id).slot] = id
  if (sources.handWeapon) outfit.weapon = sources.handWeapon
  return outfit
}

/**
 * 보관함에 풀리는 외형 (E307): 유물표에 켠 유물의 외형, 깨운 신의 옷과 표식.
 * 입혀지지는 않고 고를 수 있게만 된다
 */
export function earnedLooks(from: { relicLooks: readonly string[]; gods: readonly { looks: Readonly<Partial<Record<LookSlot, string>>>; mark: string }[] }): string[] {
  return [...from.relicLooks, ...from.gods.flatMap((god) => [...Object.values(god.looks), god.mark])]
}

/**
 * 외형 보관함. 한 번 걸쳐 본 외형을 모아 두고, 칸마다 골라 입는다. (디아블로의 형상 변환처럼 모습만 바뀐다)
 */
export class Wardrobe {
  readonly unlocked = new Set<string>(STARTING_LOOKS)
  readonly choices = new Map<LookSlot, LookChoice>()
  /** 처음에 고른 기본 모습 (피부·머리카락·옷 색) */
  body: BodyLook = { ...DEFAULT_BODY }

  /** 외형을 얻는다. 새로 얻은 것만 돌려준다. */
  unlock(ids: Iterable<string>): string[] {
    const added: string[] = []
    for (const id of ids) {
      if (this.unlocked.has(id)) continue
      this.unlocked.add(id)
      added.push(id)
    }
    return added
  }

  /** 칸에 무엇을 입을지 고른다. 아직 얻지 않았거나 다른 칸의 외형이면 무시한다. 표식도 고른다 (E307: 깨운 신의 표식 가운데) */
  choose(slot: LookSlot, choice: LookChoice): boolean {
    if (choice !== 'auto' && choice !== null && (!this.unlocked.has(choice) || lookDef(choice).slot !== slot)) return false
    if (choice === 'auto') this.choices.delete(slot)
    else this.choices.set(slot, choice)
    return true
  }

  choice(slot: LookSlot): LookChoice {
    return this.choices.has(slot) ? this.choices.get(slot)! : 'auto'
  }

  /** 칸마다 고른 것을 적용한 최종 모습 */
  dress(auto: Outfit): Outfit {
    const outfit = { ...auto }
    for (const slot of WARDROBE_SLOTS) {
      const choice = this.choice(slot)
      if (choice !== 'auto') outfit[slot] = choice
    }
    return outfit
  }

  /** 칸마다 고를 수 있는 외형 (얻은 것만) */
  options(slot: LookSlot): string[] {
    return [...this.unlocked].filter((id) => lookDef(id).slot === slot)
  }
}

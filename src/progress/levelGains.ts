import { DATA } from '../data'
import { type God, godDef, relicDef, RELIC_IDS } from '../relics/data'
import { MASTERY_DAMAGE, MAX_LEVEL, PER_PROMOTION } from './ClassProgress'

/** 한 단계에서 얻는 것 하나. kind는 그림을 고를 때 쓴다. */
export interface LevelGain {
  kind: 'hp' | 'damage' | 'mastery' | 'power'
  text: string
}

/**
 * 클래스가 그 레벨에 올랐을 때 얻는 것. (Lv1은 발현했을 때)
 * 정보 화면의 단계 목록과 승급 결과 카드가 같은 목록을 쓴다.
 */
export function levelGains(god: God, level: number): LevelGain[] {
  const def = godDef(god)
  const out: LevelGain[] = []
  if (level === 1) {
    if (def.passive.damageScale !== 1) out.push({ kind: 'damage', text: `주는 피해 ×${def.passive.damageScale}` })
    if (def.passive.basicLightning) out.push({ kind: 'power', text: `기본 공격에 번개 (피해 ${def.passive.basicLightning.damage})` })
  } else {
    out.push({ kind: 'hp', text: `최대 생명 +${PER_PROMOTION.maxHp}` })
    out.push({ kind: 'damage', text: `모든 피해 +${Math.round(PER_PROMOTION.damage * 100)}%` })
    const source = DATA.classes.sources.find((x) => x.id === def.source)
    if (source) out.push({ kind: 'mastery', text: `${source.name} 숙련 +1 (${source.name} 신으로 발현 중 피해 +${Math.round(MASTERY_DAMAGE * 100)}%)` })
  }
  const chain = def.passive.chainLightning
  if (chain && chain.minLevel === level) out.push({ kind: 'power', text: `번개가 주변 적 ${chain.jumps}명에게 옮겨 붙음` })
  for (const id of RELIC_IDS) {
    const relic = relicDef(id)
    for (const b of relic.trigger.bonus) {
      if (b.manifested !== god || b.minLevel !== level) continue
      const what = [b.damageScale !== 1 ? `피해 ×${b.damageScale}` : '', b.lightning ? `번개 ${b.lightning}` : ''].filter(Boolean).join(', ')
      if (what) out.push({ kind: 'power', text: `${relic.trigger.name} 강화: ${what}` })
    }
  }
  return out
}

/** Lv1~4 모든 단계 */
export function allLevelGains(god: God): LevelGain[][] {
  return Array.from({ length: MAX_LEVEL }, (_, i) => levelGains(god, i + 1))
}

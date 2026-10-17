import { DATA } from '../data'
import type { UltimateKind } from '../data/schema'
import { type God, godDef, relicDef, RELIC_IDS } from '../relics/data'
import { MASTERY_DAMAGE, MAX_LEVEL, PER_PROMOTION } from './ClassProgress'

/** 궁극기 이름 (gods.json의 ultimate) */
export const ULTIMATE_NAMES: Record<UltimateKind, string> = {
  thunderJudgement: '묠니르의 심판',
  illusionLegion: '환영 군단',
  bladeDance: '육비난무',
}

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
    if (def.passive.bladeStorm) out.push({ kind: 'power', text: `칼날 폭풍: 때릴 때마다 등의 팔이 주변 적에게 칼 ${def.passive.bladeStorm.base}자루 (피해 ${def.passive.bladeStorm.damage})` })
    if (def.passive.basicLightning) out.push({ kind: 'power', text: `기본 공격에 번개 (피해 ${def.passive.basicLightning.damage})` })
    if (def.passive.shadowClones) out.push({ kind: 'power', text: `그림자 분신 ${def.passive.shadowClones.counts[0]}이 곁에서 함께 싸움 (일격 피해 ${def.passive.shadowClones.damage})` })
    if (def.passive.attackSpeed !== 1) out.push({ kind: 'damage', text: `기본 공격 빠르기 ×${def.passive.attackSpeed}` })
  } else {
    out.push({ kind: 'hp', text: `최대 생명 +${PER_PROMOTION.maxHp}` })
    out.push({ kind: 'damage', text: `모든 피해 +${Math.round(PER_PROMOTION.damage * 100)}%` })
    const source = DATA.classes.sources.find((x) => x.id === def.source)
    if (source) out.push({ kind: 'mastery', text: `${source.name} 숙련 +1 (${source.name} 신으로 발현 중 피해 +${Math.round(MASTERY_DAMAGE * 100)}%)` })
  }
  if (level > 1 && def.passive.bladeStorm?.perLevel) {
    const b = def.passive.bladeStorm
    out.push({ kind: 'power', text: `칼날 폭풍 칼 ${b.base + b.perLevel * (level - 2)} → ${b.base + b.perLevel * (level - 1)}자루` })
  }
  const chain = def.passive.chainLightning
  if (chain && chain.minLevel === level) out.push({ kind: 'power', text: `번개가 주변 적 ${chain.jumps}명에게 옮겨 붙음` })
  if (chain?.topJumps && level === 4) out.push({ kind: 'power', text: `번개가 옮겨 붙는 적 ${chain.jumps} → ${chain.topJumps}명` })
  const storm = def.passive.storm
  if (storm && storm.minLevel === level) out.push({ kind: 'power', text: `폭풍: ${storm.interval}초마다 주변 적 ${storm.targets}명에게 번개 (피해 ${storm.damage})` })
  const clones = def.passive.shadowClones
  if (clones && level > 1) {
    const [before, after] = [clones.counts[level - 2]!, clones.counts[level - 1]!]
    if (after > before) out.push({ kind: 'power', text: `그림자 분신 ${before} → ${after}` })
    if (clones.burstMinLevel === level) out.push({ kind: 'power', text: `분신의 일격이 초록 불꽃으로 터짐 (주변 피해 ${clones.burstDamage})` })
  }
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

import { STYLES } from '../combat/styles'
import { DATA } from '../data'
import { atLevel, type Leveled } from '../data/check'
import type { ClassPassive } from '../data/classKit'
import { type God, godDef, relicDef, RELIC_IDS } from '../relics/data'
import { josa } from '../ui/josa'
import { MASTERY_DAMAGE, MAX_LEVEL, PER_PROMOTION } from './ClassProgress'

/** 한 단계에서 얻는 것 하나. kind는 그림을 고를 때 쓴다. */
export interface LevelGain {
  kind: 'hp' | 'damage' | 'mastery' | 'power'
  text: string
}

const n = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

/** 레벨마다 달라지는 값의 이름 (승급 카드의 "이름 a → b") */
const LABELS: Record<string, string> = {
  counts: '수',
  count: '수',
  damage: '피해',
  targets: '대상',
  interval: '간격(초)',
  radius: '범위',
  dps: '초당 피해',
  heal: '회복',
}

/** 패시브 부품이 그 레벨에서 하는 일 한 줄 */
function describe(key: keyof ClassPassive, part: never, level: number): string {
  const p = part as Record<string, unknown> & { name: string }
  const at = (k: string) => n(atLevel(p[k] as Leveled, level))
  switch (key) {
    case 'skyStrike':
      return `${p.name}: ${at('interval')}초마다 주변 적 ${at('targets')}명에게 (피해 ${at('damage')})`
    case 'companions':
      return `${p.name} ${at('counts')}이 곁에서 함께 싸움 (일격 피해 ${at('damage')})`
    case 'orbit':
      return `${josa(p.name, '이')} ${at('count')}개 몸 둘레를 돌며 닿는 적을 침 (피해 ${at('damage')})`
    case 'pulse':
      return `${p.name}: ${at('interval')}초마다 ${at('radius')}m 둘레로 퍼짐 (피해 ${at('damage')})`
    case 'volley':
      return `${p.name}: 기본 공격이 맞을 때 다른 적 ${at('count')}명에게도 (피해 ${at('damage')})`
    case 'curse':
      return `${p.name}: 맞은 적이 ${n(p.duration as number)}초 동안 초당 ${at('dps')}`
    case 'trail':
      return `${p.name}: 걸은 자리에 ${n(p.life as number)}초 남아 초당 ${at('dps')}`
    case 'bloom':
      return `${p.name}: ${n(p.interval as number)}초마다 생명 ${at('heal')} 회복`
    case 'guard':
      return `${p.name}: 생명이 ${Math.round((p.threshold as number) * 100)}% 아래로 떨어지면 ${at('heal')} 회복 (${n(p.cooldown as number)}초에 한 번)`
    default:
      return p.name
  }
}

/** 이름이 있는 패시브 부품들 (하늘 내리치기, 동료 등) */
const PARTS = ['skyStrike', 'companions', 'orbit', 'pulse', 'volley', 'curse', 'trail', 'bloom', 'guard'] as const

/**
 * 클래스가 그 레벨에 올랐을 때 얻는 것. (Lv1은 발현했을 때)
 * 정보 화면의 단계 목록과 승급 결과 카드가 같은 목록을 쓴다. gods.json의 패시브 부품에서 저절로 만든다.
 */
export function levelGains(god: God, level: number): LevelGain[] {
  const def = godDef(god)
  const passive = def.passive
  const out: LevelGain[] = []
  if (level === 1) {
    out.push({ kind: 'power', text: `공격: ${STYLES[def.attack].name}` })
    if (passive.damageScale !== 1) out.push({ kind: 'damage', text: `주는 피해 ×${passive.damageScale}` })
    if (passive.attackSpeed !== 1) out.push({ kind: 'damage', text: `기본 공격 빠르기 ×${passive.attackSpeed}` })
    if (passive.bladeStorm) out.push({ kind: 'power', text: `칼날 폭풍: 때릴 때마다 주변 적에게 칼 ${passive.bladeStorm.base}자루 (피해 ${passive.bladeStorm.damage})` })
    if (passive.basicLightning) out.push({ kind: 'power', text: `기본 공격에 번개 (피해 ${passive.basicLightning.damage})` })
  } else {
    out.push({ kind: 'hp', text: `최대 생명 +${PER_PROMOTION.maxHp}` })
    out.push({ kind: 'damage', text: `모든 피해 +${Math.round(PER_PROMOTION.damage * 100)}%` })
    const source = DATA.classes.sources.find((x) => x.id === def.source)
    if (source) out.push({ kind: 'mastery', text: `${source.name} 숙련 +1 (${source.name} 신화를 연 동안 피해 +${Math.round(MASTERY_DAMAGE * 100)}%)` })
  }
  if (level > 1 && passive.bladeStorm?.perLevel) {
    const b = passive.bladeStorm
    out.push({ kind: 'power', text: `칼날 폭풍 칼 ${b.base + b.perLevel * (level - 2)} → ${b.base + b.perLevel * (level - 1)}자루` })
  }
  const chain = passive.chainLightning
  if (chain && chain.minLevel === level) out.push({ kind: 'power', text: `번개가 주변 적 ${chain.jumps}명에게 옮겨 붙음` })
  if (chain?.topJumps && level === 4) out.push({ kind: 'power', text: `번개가 옮겨 붙는 적 ${chain.jumps} → ${chain.topJumps}명` })
  for (const key of PARTS) {
    const part = passive[key] as (Record<string, unknown> & { name: string; minLevel: number }) | undefined
    if (!part) continue
    if (part.minLevel === level) {
      out.push({ kind: 'power', text: describe(key, part as never, level) })
      continue
    }
    if (level > part.minLevel) {
      for (const [field, value] of Object.entries(part)) {
        if (!Array.isArray(value) || value.length !== 4) continue
        const [before, after] = [atLevel(value as unknown as Leveled, level - 1), atLevel(value as unknown as Leveled, level)]
        if (before !== after) out.push({ kind: 'power', text: `${part.name} ${LABELS[field] ?? field} ${n(before)} → ${n(after)}` })
      }
    }
    if (key === 'companions' && passive.companions!.burstMinLevel === level) out.push({ kind: 'power', text: `${part.name}의 일격이 터짐 (주변 피해 ${passive.companions!.burstDamage})` })
    if (key === 'curse' && passive.curse!.spreadMinLevel === level) out.push({ kind: 'power', text: `${josa(part.name, '이')} 쓰러진 적에게서 옆 적으로 옮음` })
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

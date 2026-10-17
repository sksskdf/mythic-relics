import type { ChargeDef, RelicDef } from '../data/schema'
import { lookDef } from '../looks/catalog'
import { godDef } from '../relics/data'
import { pixelIcon } from './pixelIcon'

/** 무엇으로 충전되는지 한마디로 */
export function chargeText(charge: ChargeDef): string {
  switch (charge.by) {
    case 'combo':
      return '3연타'
    case 'kill':
      return `처치 ${charge.count}`
    case 'walk':
      return `${charge.meters}m 걷기`
    case 'time':
      return `${charge.seconds}초마다`
  }
}

/** 핵심 수치: 행동 연동 효과의 피해와 범위 */
export function numbersText(def: RelicDef): string {
  const p = def.trigger.action.params
  const parts: string[] = []
  const damage = p.damage ?? p.blastDamage
  if (damage !== undefined) parts.push(`피해 ${damage}`)
  const radius = p.radius ?? p.blastRadius ?? p.range
  if (radius !== undefined) parts.push(`범위 ${radius}m`)
  if (p.life !== undefined) parts.push(`${p.life}초`)
  if (def.trigger.release.on === 'heroHit') parts.push(`받는 피해 ×${def.trigger.release.absorb}`)
  return parts.join(' · ')
}

const icons = new Map<string, string>()
export function relicIcon(def: RelicDef): string {
  let icon = icons.get(def.id)
  if (!icon) {
    icon = pixelIcon(def.icon, def.colors)
    icons.set(def.id, icon)
  }
  return icon
}

function line(parent: HTMLElement, className: string, text: string): HTMLElement {
  const el = document.createElement('div')
  el.className = className
  el.textContent = text
  parent.append(el)
  return el
}

/**
 * 유물 설명 카드. (E4-03) 이름, 신, 지속 효과, 행동 연동 효과(충전·핵심 수치), 외형.
 * 정보 화면이라 짧은 글을 쓴다. 한 줄은 25~30자 안팎.
 */
export function relicCard(def: RelicDef): HTMLElement {
  const god = godDef(def.god)
  const card = document.createElement('div')
  card.className = 'relic-card'
  card.style.setProperty('--god', god.color)
  const head = document.createElement('div')
  head.className = 'relic-card__head'
  const icon = document.createElement('img')
  icon.className = 'relic-card__icon'
  icon.src = relicIcon(def)
  icon.alt = ''
  const names = document.createElement('div')
  line(names, 'relic-card__name', def.name)
  line(names, 'relic-card__god', `${god.name}의 유물`)
  head.append(icon, names)
  card.append(head)
  line(card, 'relic-card__flavor', def.description)
  const passive = line(card, 'relic-card__row', '')
  passive.innerHTML = `<b>지속</b> `
  passive.append(def.passive.description)
  const trigger = line(card, 'relic-card__row', '')
  trigger.innerHTML = `<b>${def.trigger.name}</b> `
  trigger.append(def.trigger.description)
  line(card, 'relic-card__meta', `충전 ${chargeText(def.trigger.charge)} · ${numbersText(def)}`)
  line(card, 'relic-card__meta', `외형 ${lookDef(def.look).name}`)
  return card
}

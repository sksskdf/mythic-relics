import type { ChargeDef, RelicDef } from '../data/schema'
import { lookDef, SLOT_NAMES } from '../looks/catalog'
import { type God, godDef, RELIC_IDS, relicDef, type RelicId } from '../relics/data'
import type { LoadoutState } from '../myth/manifest'
import { relicIconRows } from '../relics/model'
import { pixelIcon } from './pixelIcon'

/** 카드가 놓인 자리와 지금 상태. 없으면 도감처럼 정보만 보여 준다. */
export interface RelicCardContext {
  /** 이 유물이 어디 있나 */
  place?: { kind: 'slot'; slot: number } | { kind: 'bag' } | { kind: 'ground' }
  /** 끼고 있으면 행동 연동 효과의 충전 정도 0~1 */
  charge?: number
  /** 지금 낀 유물들 (세트 표시) */
  equipped: readonly (RelicId | null)[]
  /** 가진 유물 전부 (칸 + 가방) */
  owned: ReadonlySet<RelicId>
  /** 지금 발현한 신과 그 레벨 (강화 조건 표시) */
  manifested: God | null
  level: number
  /** 끼면(또는 빼면) 발현·가호가 어떻게 되는지 */
  preview?: { before: LoadoutState; after: LoadoutState }
}

/** 무엇으로 충전되는지 한마디로 */
export function chargeText(charge: ChargeDef): string {
  switch (charge.by) {
    case 'combo':
      return '3연타의 마지막 타'
    case 'kill':
      return `적 ${charge.count}마리 처치`
    case 'walk':
      return `${charge.meters}m 걷기`
    case 'time':
      return `${charge.seconds}초마다 다시 참`
  }
}

/** 끼고 있을 때 지금 충전이 얼마나 찼는지 */
function chargeProgress(charge: ChargeDef, ratio: number): string {
  if (ratio >= 1) return '준비됨'
  switch (charge.by) {
    case 'combo':
      return `${Math.round(ratio * 3)}/3타`
    case 'kill':
      return `${Math.floor(ratio * charge.count + 1e-6)}/${charge.count}`
    case 'walk':
      return `${Math.floor(ratio * charge.meters)}/${charge.meters}m`
    case 'time':
      return `${((1 - ratio) * charge.seconds).toFixed(1)}초 뒤`
  }
}

/** 핵심 수치: 행동 연동 효과의 피해와 범위 */
export function numberStats(def: RelicDef): string[] {
  const p = def.trigger.action.params
  const stats: string[] = []
  const damage = p.damage ?? p.blastDamage
  if (damage !== undefined) stats.push(`피해 ${damage}`)
  const radius = p.radius ?? p.blastRadius ?? p.range
  if (radius !== undefined) stats.push(`범위 ${radius}m`)
  if (p.life !== undefined) stats.push(`지속 ${p.life}초`)
  if (def.trigger.release.on === 'heroHit') stats.push(`받는 피해 ×${def.trigger.release.absorb}`)
  return stats
}

const icons = new Map<string, string>()
export function relicIcon(def: RelicDef): string {
  let icon = icons.get(def.id)
  if (!icon) {
    const { rows, colors } = relicIconRows(def)
    icon = pixelIcon(rows, colors)
    icons.set(def.id, icon)
  }
  return icon
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/** 문장 속 숫자(10%, 1.5배, 12m, 4초 등)를 강조해 붙인다. 실제 게임 툴팁처럼 수치가 먼저 눈에 들어오게 한다. */
function withNumbers(parent: HTMLElement, text: string): HTMLElement {
  const pattern = /([×x]?\d+(?:\.\d+)?(?:%|배|m|초|마리|타)?)/g
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0
    if (at > last) parent.append(text.slice(last, at))
    parent.append(el('em', 'rc__num', match[0]))
    last = at + match[0].length
  }
  if (last < text.length) parent.append(text.slice(last))
  return parent
}

function stateLine(state: LoadoutState): string {
  return state.manifested ? `${godDef(state.manifested).name}의 신화 개방` : '신화 개방 없음'
}

/**
 * 유물 설명 카드. (E4-03, 실제 게임의 아이템 툴팁을 참고)
 * 위에서부터: 머리(그림·이름·종류) → 자리 → 지속 효과 → 행동 연동 효과(충전·수치·강화) → 같은 신의 유물(세트) → 바꿔 끼면 → 전해지는 이야기
 * - 이름은 신의 색, 수치는 밝게, 이야기는 맨 아래에 흐리게 둔다.
 * - 끼고 있으면 지금 충전 정도를, 아니면 끼었을 때 발현이 어떻게 되는지 보여 준다.
 */
export function relicCard(def: RelicDef, ctx?: RelicCardContext): HTMLElement {
  const god = godDef(def.god)
  const card = el('div', 'rc')
  card.style.setProperty('--god', god.color)

  // 머리: 그림, 이름, 종류
  const head = el('div', 'rc__head')
  const frame = el('div', 'rc__icon')
  const icon = el('img', '')
  icon.src = relicIcon(def)
  icon.alt = ''
  frame.append(icon)
  const names = el('div', 'rc__names')
  names.append(el('div', 'rc__name', def.name))
  names.append(el('div', 'rc__type', `${god.name}의 유물 · ${SLOT_NAMES[lookDef(def.look).slot]}`))
  head.append(frame, names)
  card.append(head)

  // 자리
  if (ctx?.place) {
    const place = ctx.place
    const text =
      place.kind === 'slot' ? `장착 중 · ${place.slot + 1}번 칸` : place.kind === 'bag' ? '가방에 있음' : '땅에 떨어져 있음 · 밟으면 줍습니다'
    card.append(el('div', `rc__place rc__place--${place.kind}`, text))
  }

  // 지속 효과
  const passive = el('section', 'rc__section')
  passive.append(el('div', 'rc__label', '지속 효과'))
  passive.append(withNumbers(el('p', 'rc__text'), def.passive.description))
  card.append(passive)

  // 행동 연동 효과
  const trigger = el('section', 'rc__section')
  const title = el('div', 'rc__label')
  title.append('행동 연동 · ', el('span', 'rc__skill', def.trigger.name))
  trigger.append(title)
  trigger.append(withNumbers(el('p', 'rc__text'), def.trigger.description))
  const charge = el('div', 'rc__charge')
  charge.append(el('span', 'rc__charge-label', '충전'), el('span', '', chargeText(def.trigger.charge)))
  if (ctx?.charge !== undefined) {
    const meter = el('div', 'rc__meter')
    const fill = el('div', `rc__meter-fill${ctx.charge >= 1 ? ' is-full' : ''}`)
    fill.style.width = `${Math.round(Math.min(1, ctx.charge) * 100)}%`
    meter.append(fill)
    charge.append(meter, el('span', 'rc__charge-now', chargeProgress(def.trigger.charge, ctx.charge)))
  }
  trigger.append(charge)
  const stats = el('div', 'rc__stats')
  for (const stat of numberStats(def)) stats.append(withNumbers(el('span', 'rc__stat'), stat))
  trigger.append(stats)
  // 발현 강화: 조건을 채우면 밝게
  for (const bonus of def.trigger.bonus) {
    const active = ctx !== undefined && ctx.manifested === bonus.manifested && ctx.level >= bonus.minLevel
    const who = godDef(bonus.manifested)
    const when = bonus.minLevel > 1 ? `${who.titles[bonus.minLevel - 1]}(${bonus.minLevel}단계) 이상` : `${who.name}의 신화 개방 중`
    const what: string[] = []
    if (bonus.damageScale !== 1) what.push(`피해 ×${bonus.damageScale}`)
    if (bonus.lightning !== undefined) what.push(bonus.lightning > 0 ? `번개 +${bonus.lightning}` : '번개 연출')
    trigger.append(withNumbers(el('div', `rc__bonus${active ? ' is-active' : ''}`), `${when}: ${what.join(', ')}`))
  }
  card.append(trigger)

  // 같은 신의 유물 (디아블로의 세트 아이템처럼)
  if (ctx) {
    const set = RELIC_IDS.filter((id) => relicDef(id).god === def.god)
    const wearing = set.filter((id) => ctx.equipped.includes(id)).length
    const section = el('section', 'rc__section rc__set')
    const need = 3
    section.append(
      el(
        'div',
        'rc__label',
        wearing >= need
          ? `${god.name}의 유물 ${wearing}/${need} · ${god.name}의 신화 개방 중`
          : `${god.name}의 유물 ${wearing}/${need} · ${need}개를 끼면 ${god.name}의 신화가 열린다`,
      ),
    )
    const list = el('ul', 'rc__set-list')
    for (const id of set) {
      const state = ctx.equipped.includes(id) ? 'is-on' : ctx.owned.has(id) ? 'is-owned' : ''
      list.append(el('li', `rc__set-item ${state}`, relicDef(id).name))
    }
    section.append(list)
    card.append(section)
  }

  // 바꿔 끼면
  if (ctx?.preview) {
    const { before, after } = ctx.preview
    const box = el('div', 'rc__preview')
    const changed = before.manifested !== after.manifested
    box.append(el('span', 'rc__label', ctx.place?.kind === 'slot' ? '빼면' : '끼우면'))
    box.append(el('span', changed ? (after.manifested ? 'rc__good' : 'rc__warn') : '', changed ? stateLine(after) : '신화는 그대로'))
    if (changed && before.manifested && !after.manifested) box.append(el('span', 'rc__warn', ` (${godDef(before.manifested).title} 풀림)`))
    card.append(box)
  }

  // 전해지는 이야기
  card.append(el('p', 'rc__flavor', def.description))
  return card
}

import { GRADE_COLORS } from '../art/palette'
import { DATA } from '../data'
import { AWAKEN_AT } from '../data/awakening'
import type { SourceId } from '../data/schema'
import { type GearItem, GEAR, gearName } from '../gear/roll'
import { statText } from '../myth/alwaysText'
import { iconFromGrid } from '../voxel/iconFromGrid'
import { gearGrid } from '../voxel/models/gearLooks'
import { pixelIcon } from './pixelIcon'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

const icons = new Map<string, string>()

/** 일반 장비의 12×12 그림 (사용자 의견 2026-10-28 「장비창에서 모양이 없다」): 땅에 떨어진 모델과 같은 격자를 옆에서 본 모습 */
export function gearIcon(item: GearItem): string {
  const key = `${item.part}:${item.base}:${item.grade}`
  let icon = icons.get(key)
  if (!icon) {
    const base = Math.max(0, GEAR.parts[item.part].bases.indexOf(item.base))
    const { rows, colors } = iconFromGrid(gearGrid(item.part, base, GRADE_COLORS[item.grade], item.grade === 'hero', false))
    icon = pixelIcon(rows, colors)
    icons.set(key, icon)
  }
  return icon
}

/** 같은 종류 수치를 비교한 줄: 지금 낀 것보다 크면 ▲, 작으면 ▼ (줄어드는 수치는 반대) */
export function delta(kind: string, value: number, other: number): { text: string; good: boolean } | null {
  const diff = value - other
  if (Math.abs(diff) < 1e-6) return null
  const lower = kind === 'damageTaken' || kind === 'lowHpGuard'
  const good = lower ? diff < 0 : diff > 0
  return { text: good ? '▲' : '▼', good }
}

/**
 * 일반 장비 설명 카드 (E13-07): 단계·등급·부위, 수치(지금 그 부위에 낀 것과 비교), 원천, 영웅 고유 효과.
 * worn은 같은 부위에 지금 낀 일반 장비 (없으면 비교하지 않는다).
 * sources는 지금 원천마다의 합: 있으면 원천 줄에 다음 각성까지 남은 수를 붙인다 (E21-05)
 */
export function gearCard(item: GearItem, worn?: GearItem | null, sources?: Readonly<Record<SourceId, number>>): HTMLElement {
  const card = el('div', 'rc gc')
  card.style.setProperty('--god', GRADE_COLORS[item.grade])
  const head = el('div', 'rc__head')
  const swatch = el('div', 'rc__icon gc__swatch')
  const icon = el('img', '')
  icon.src = gearIcon(item)
  icon.alt = ''
  swatch.append(icon)
  const names = el('div', 'rc__names')
  // 장비 단계 (E21-03): 나온 땅의 단계. 같은 등급이어도 단계가 높으면 수치가 크다
  names.append(el('div', 'rc__name', gearName(item)), el('div', 'rc__type', `${item.tier}단계 · ${GEAR.grades[item.grade].name} 장비 · ${GEAR.parts[item.part].name}`))
  head.append(swatch, names)
  card.append(head)

  const section = el('section', 'rc__section')
  section.append(el('div', 'rc__label', worn && worn.uid !== item.uid ? '수치 (지금 낀 것과 비교)' : '수치'))
  const list = el('ul', 'gc__stats')
  for (const s of item.stats) {
    const li = el('li', '', statText(s.kind, s.value))
    if (worn && worn.uid !== item.uid) {
      const same = worn.stats.find((w) => w.kind === s.kind)
      const d = same ? delta(s.kind, s.value, same.value) : { text: '새 수치', good: true }
      if (d) li.append(' ', el('span', d.good ? 'rc__good' : 'rc__warn', d.text))
    }
    list.append(li)
  }
  if (worn && worn.uid !== item.uid) for (const w of worn.stats) if (!item.stats.some((s) => s.kind === w.kind)) list.append(el('li', 'rc__warn', `${statText(w.kind, w.value)} 없어짐`))
  const source = DATA.classes.sources.find((x) => x.id === item.source.id)
  const name = source?.name ?? item.source.id
  const total = sources?.[item.source.id]
  const next = total === undefined ? undefined : AWAKEN_AT.find((at) => total < at)
  const until = total === undefined ? '' : next === undefined ? ' · 모두 깨어남' : ` · ${name} 각성까지 ${next - total}`
  list.append(el('li', 'gc__source', `원천 ${name} +${item.source.value}${until}`))
  section.append(list)
  card.append(section)

  if (item.unique) {
    const u = GEAR.uniques[item.unique]
    if (u) {
      const unique = el('section', 'rc__section')
      unique.append(el('div', 'rc__label', `영웅 고유 효과 · ${u.name}`), el('p', 'rc__text', u.text))
      card.append(unique)
    }
  }
  return card
}

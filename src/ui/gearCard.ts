import { GRADE_COLORS } from '../art/palette'
import { DATA } from '../data'
import { type GearItem, GEAR, gearName } from '../gear/roll'
import { statText } from '../myth/alwaysText'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/** 같은 종류 수치를 비교한 줄: 지금 낀 것보다 크면 ▲, 작으면 ▼ (줄어드는 수치는 반대) */
function delta(kind: string, value: number, other: number): { text: string; good: boolean } | null {
  const diff = value - other
  if (Math.abs(diff) < 1e-6) return null
  const lower = kind === 'damageTaken' || kind === 'lowHpGuard'
  const good = lower ? diff < 0 : diff > 0
  return { text: good ? '▲' : '▼', good }
}

/**
 * 일반 장비 설명 카드 (E13-07): 등급·부위, 수치(지금 그 부위에 낀 것과 비교), 원천, 영웅 고유 효과.
 * worn은 같은 부위에 지금 낀 일반 장비 (없으면 비교하지 않는다)
 */
export function gearCard(item: GearItem, worn?: GearItem | null): HTMLElement {
  const card = el('div', 'rc gc')
  card.style.setProperty('--god', GRADE_COLORS[item.grade])
  const head = el('div', 'rc__head')
  const swatch = el('div', 'rc__icon gc__swatch')
  const names = el('div', 'rc__names')
  names.append(el('div', 'rc__name', gearName(item)), el('div', 'rc__type', `${GEAR.grades[item.grade].name} 장비 · ${GEAR.parts[item.part].name}`))
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
  list.append(el('li', 'gc__source', `원천 ${source?.name ?? item.source.id} +${item.source.value}`))
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

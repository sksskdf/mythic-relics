import { gearIconRows } from '../art/gearIcons'
import { GRADE_COLORS } from '../art/palette'
import { DATA } from '../data'
import { AWAKEN_AT } from '../data/awakening'
import type { SourceId } from '../data/schema'
import { type GearItem, GEAR, gearName, gearScore } from '../gear/roll'
import { GRADES } from '../data/gearData'
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

/**
 * 일반 장비의 그림 (사용자 의견 2026-10-28 「장비창에서 모양이 없다」, 2026-10-29 「개성과 특징이 분명하게」):
 * 바탕마다 손으로 찍은 16×16 그림(art/gearIcons.ts), 등급은 색과 장식으로. 그림이 없는 바탕은 땅에 떨어진 모델을 옆에서 본 모습
 */
export function gearIcon(item: GearItem): string {
  const key = `${item.part}:${item.base}:${item.grade}`
  let icon = icons.get(key)
  if (!icon) {
    const base = Math.max(0, GEAR.parts[item.part].bases.indexOf(item.base))
    const { rows, colors } = gearIconRows(item.part, base, item.grade) ?? iconFromGrid(gearGrid(item.part, base, item.grade, false))
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
  // 한 줄 결론 (E303-02): 지금 낀 것보다 얼마나 좋은가, 등급이 다르면 몇 칸 위·아래
  if (worn && worn.uid !== item.uid) card.append(el('div', 'gc__verdict', verdict(item, worn)))

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
  const until = total === undefined ? '' : next === undefined ? ' · 모두 각성' : ` · ${name} 각성까지 ${next - total}`
  list.append(el('li', 'gc__source', `원천 ${name} +${item.source.value}${until}`))
  section.append(list)
  card.append(section)

  for (const id of [item.unique, item.unique2]) {
    const u = id ? GEAR.uniques[id] : undefined
    if (!u) continue
    const unique = el('section', 'rc__section')
    unique.append(el('div', 'rc__label', `${GEAR.grades[item.grade].name} 고유 효과 · ${u.name}`), el('p', 'rc__text', u.text))
    card.append(unique)
  }
  return card
}

/** 비교 카드의 한 줄 결론: 「지금 것보다 +12% · 한 칸 위」 */
export function verdict(item: GearItem, worn: GearItem): string {
  const a = gearScore(item)
  const b = gearScore(worn)
  const pct = b > 0 ? Math.round(((a - b) / b) * 100) : 100
  const steps = GRADES.indexOf(item.grade) - GRADES.indexOf(worn.grade)
  const grade = steps > 0 ? ` · ${steps === 1 ? '한' : steps === 2 ? '두' : `${steps}`} 칸 위` : steps < 0 ? ` · ${-steps === 1 ? '한' : -steps === 2 ? '두' : `${-steps}`} 칸 아래` : ''
  return `${pct === 0 ? '지금 것과 비슷' : `지금 것보다 ${pct > 0 ? '+' : '−'}${Math.abs(pct)}%`}${grade}`
}

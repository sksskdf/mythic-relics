import { DATA } from '../../data'
import { AWAKEN_AT, AWAKENING_TEXT } from '../../data/awakening'
import type { SourceId } from '../../data/schema'
import { THREAT_MAX } from '../../data/threat'
import { SOURCE_COLORS, sourceSigil } from '../sigils'
import { el, img, type TabContext } from './dom'

/** 원천 탭의 ? 설명 */
const SOURCE_HELP = {
  awaken: '원천 각성\n장비마다 붙은 원천 수치를 더한 값이 5·10·20을 넘을 때마다 그 원천이 한 단계씩 깨어난다. 한 원천에 몰면 3단계, 나누면 두 원천이 2단계쯤.',
  threat: '위협 단계\n세계 전체의 난이도. 오를수록 적이 세지고 정예가 늘며, 장비 등급과 재료가 좋아진다. 열린 가장 높은 단계에서 지역 보스를 이기면 다음 단계가 열린다. 마을 촌장에게서 고른다.',
  convenience: '편의\n같은 일을 여러 번 하면 손이 덜 가게 하나씩 열린다. 싸움은 그대로 내 몫이다.',
}

/**
 * 원천 탭 (E14): 원천 넷의 각성. 엔딩 뒤에는 세계 위협 단계와 편의 자동화도 (E21-06, 원천 갈래·공명은 E21-05에서 없앰).
 */
export function renderSources(ctx: TabContext, body: HTMLElement): void {
  const { sources } = ctx.host
  const wrap = el('div', 'menu-src')
  const sourceName = (id: SourceId) => DATA.classes.sources.find((x) => x.id === id)!.name
  /** 제목 옆의 ?: 올리거나 누르면 설명 */
  const titled = (text: string, help: string): HTMLElement => {
    const t = el('div', 'menu-src__title', text)
    const q = el('span', 'menu-src__help', '?')
    ctx.hintOn(q, help)
    t.append(q)
    return t
  }

  // 원천 각성: 넷의 카드
  const awaken = el('section', 'menu-src__panel')
  awaken.append(titled('원천 각성', SOURCE_HELP.awaken))
  const grid = el('div', 'menu-src__sources')
  for (const row of sources.rows()) {
    const card = el('section', `menu-src__source${row.level > 0 ? ' is-awake' : ''}`)
    card.style.setProperty('--god', SOURCE_COLORS[row.id]![0])
    const head = el('div', 'menu-src__head')
    head.append(img(sourceSigil(row.id)), el('b', '', sourceName(row.id)))
    const gems = el('div', 'ui-gems ui-gems--small')
    for (let i = 0; i < 3; i++) gems.append(el('i', i < row.level ? 'is-on' : ''))
    head.append(gems)
    card.append(head)
    const amount = el('div', 'menu-src__amount')
    amount.append(el('b', '', String(row.total)), el('span', '', row.flames > 0 ? `장비 + 불씨 ${row.flames}` : '장비'))
    card.append(amount)
    AWAKENING_TEXT[row.id].forEach((text, i) => card.append(el('div', `menu-src__line${i < row.level ? ' is-on' : ''}`, `${i + 1} · ${text}`)))
    const next = AWAKEN_AT.find((at) => row.total < at)
    card.append(el('div', 'menu-src__next', next === undefined ? '모두 깨어났다' : `다음 각성까지 ${next - row.total}`))
    grid.append(card)
  }
  awaken.append(grid)
  wrap.append(awaken)

  // 엔딩 뒤: 위협 단계와 편의 (E21-06)
  if (!ctx.host.afterEnding()) {
    body.append(wrap)
    return
  }
  const t = sources.threat
  const here = sources.here()
  const threat = el('section', 'menu-src__panel')
  threat.append(titled(`위협 단계 · ${t.level}단계`, SOURCE_HELP.threat))
  const levels = el('div', 'menu-src__levels')
  for (let n = 1; n <= Math.max(THREAT_MAX, t.unlocked); n++) {
    const b = el('button', `menu-src__level${n === t.level ? ' is-on' : ''}`, String(n))
    b.type = 'button'
    b.disabled = !here || n > t.unlocked
    if (n > t.unlocked) b.classList.add('is-locked')
    else if (n > t.reached) b.classList.add('is-next')
    b.addEventListener('click', () => sources.choose(n) && ctx.render())
    levels.append(b)
  }
  threat.append(levels)
  threat.append(el('div', 'menu-src__text', here ? '마을 촌장: 열린 단계 안에서 고를 수 있다' : '마을 촌장에게 가면 단계를 고를 수 있다'))
  threat.append(el('div', 'menu-src__text', t.unlocked >= t.max ? '가장 높은 단계까지 열었다' : `${t.unlocked}단계에서 지역 보스를 이기면 ${t.unlocked + 1}단계가 열린다`))
  wrap.append(threat)

  // 편의
  const conv = el('section', 'menu-src__panel')
  conv.append(titled('편의', SOURCE_HELP.convenience))
  for (const c of sources.conveniences()) {
    const line = el('div', `menu-src__conv${c.open ? ' is-on' : ''}`)
    line.append(el('b', '', c.name), el('small', '', c.open ? c.text : `${Math.min(c.have, c.need)} / ${c.need}`))
    if (c.id === 'autoSalvage' && c.open) {
      const toggle = el('button', 'ui-pill', sources.autoSalvage ? '켬' : '끔')
      toggle.type = 'button'
      toggle.addEventListener('click', () => {
        sources.autoSalvage = !sources.autoSalvage
        ctx.render()
      })
      line.append(toggle)
    }
    conv.append(line)
  }
  const warps = sources.warps()
  if (warps.length > 0) {
    const row = el('div', 'menu-src__warps')
    for (const w of warps) {
      const b = el('button', 'ui-pill', w.name)
      b.type = 'button'
      b.addEventListener('click', () => sources.warp(w.id) && ctx.close())
      row.append(b)
    }
    conv.append(row)
  }
  wrap.append(conv)
  body.append(wrap)
}

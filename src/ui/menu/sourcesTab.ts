import { DATA } from '../../data'
import { AWAKEN_AT, AWAKENING_TEXT } from '../../data/awakening'
import type { SourceId } from '../../data/schema'
import { DEPTH_LIMIT } from '../../data/depth'
import { SOURCE_COLORS, sourceSigil } from '../sigils'
import { el, img, type TabContext } from './dom'

/** 원천 탭의 ? 설명 */
const SOURCE_HELP = {
  awaken: '원천 각성\n장비마다 붙은 원천 수치를 더한 값이 5·10·20을 넘을 때마다 그 원천이 한 단계씩 깨어난다. 한 원천에 몰면 3단계, 나누면 두 원천이 2단계쯤.',
  depth: '깊이\n세계 전체의 난이도. 깊을수록 적이 세지고 정예가 늘며, 장비 등급과 재료가 좋아진다. 귀환 카드에서 다음 원정을 그대로나 한 걸음 더 깊이 고른다.',
  automation: '귀환이 여는 것\n귀환할수록 손이 덜 가는 일이 하나씩 저절로 된다. 엔딩을 봤으면 귀환 3 이상으로 친다. 싸움은 그대로 내 몫이다.',
}

/**
 * 원천 탭 (E14): 원천 넷의 각성과 귀환이 여는 것(자동화, 엔딩 전에도). 엔딩 뒤에는 깊이도 (읽기만, 고르기는 귀환 카드, E305-03).
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

  // 귀환이 여는 것 (E305-03, `CYCLE.md` 3.5): 귀환 1·2·3·엔딩, 켜진 것은 밝게
  const auto = el('section', 'menu-src__panel menu-src__auto')
  auto.append(titled(`귀환이 여는 것 · 귀환 ${sources.returns()}`, SOURCE_HELP.automation))
  for (const step of sources.automation()) {
    const line = el('div', `menu-src__conv${step.on ? ' is-on' : ''}`)
    line.append(el('b', '', step.name), el('small', '', step.lines.join(' · ')))
    auto.append(line)
  }
  wrap.append(auto)

  // 엔딩 뒤: 깊이 (읽기만, E21-06·E305-03)
  if (!ctx.host.afterEnding('depth')) {
    body.append(wrap)
    return
  }
  const d = sources.depth
  const depth = el('section', 'menu-src__panel menu-src__depth')
  depth.append(titled(`깊이 · ${d.level}`, SOURCE_HELP.depth))
  depth.append(el('div', 'menu-src__text', `가 본 가장 깊은 곳 ${d.reached} · 다음 원정의 깊이는 귀환 카드에서 고른다`))
  depth.append(el('div', 'menu-src__text', d.limitBroken ? '한계를 깼다: 깊이의 끝이 없다' : `깊이 ${DEPTH_LIMIT} 원정에서 장 보스나 수호자를 이기고 귀환하면 한계를 깬다`))
  wrap.append(depth)
  body.append(wrap)
}

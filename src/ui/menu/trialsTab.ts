import { el, type TabContext } from './dom'

/**
 * 시련 탭 (E16-04): 제약 여덟과 난이도 다섯, 내 기록과 영구 보상, 깬 수의 합 마일스톤.
 * 필드 성소 결계 안에서 난이도를 누르면 그 자리에서 시작한다. 다음 난이도는 앞 난이도를 깨야 열린다.
 */
export function renderTrials(ctx: TabContext, body: HTMLElement): void {
  const { trials } = ctx.host
  const wrap = el('div', 'menu-src')
  const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`
  const head = el('section', 'menu-src__panel')
  const title = el('div', 'menu-src__title', `시련 · 깬 난이도 ${trials.total()}`)
  head.append(title)
  const blocked = trials.blocked()
  head.append(el('div', 'menu-src__text', !trials.open() ? (blocked ?? '') : blocked ? `${blocked} · 고르면 바로 시작한다` : '성소 결계 안이다. 난이도를 누르면 바로 시작한다'))
  wrap.append(head)
  if (!trials.open()) {
    body.append(wrap)
    return
  }
  const grid = el('div', 'menu-trials')
  for (const t of trials.list()) {
    const card = el('section', `menu-src__source${t.cleared > 0 ? ' is-awake' : ''}`)
    card.style.setProperty('--god', 'var(--c-gold-soft)')
    const top = el('div', 'menu-src__head')
    top.append(el('b', '', t.name))
    const gems = el('div', 'ui-gems ui-gems--small')
    for (let i = 0; i < 5; i++) gems.append(el('i', i < t.cleared ? 'is-on' : ''))
    top.append(gems)
    card.append(top, el('div', 'menu-src__line is-on', t.rule), el('div', 'menu-src__line', `깬 단계마다 ${t.reward} ${t.per}`))
    const levels = el('div', 'menu-src__levels')
    for (let n = 1; n <= 5; n++) {
      const best = t.best[n - 1]
      const b = el('button', `menu-src__level${n <= t.cleared ? ' is-on' : n === t.cleared + 1 ? ' is-next' : ' is-locked'}`, String(n))
      b.type = 'button'
      b.disabled = blocked !== null || n > t.cleared + 1
      ctx.hintOn(b, `${t.name} ${n}단계\n${best ? `가장 빠른 기록 ${fmt(best)}` : n > t.cleared + 1 ? '앞 단계를 깨야 열린다' : '아직 기록 없음'}`)
      b.addEventListener('click', () => trials.start(t.id, n) && ctx.close())
      levels.append(b)
    }
    card.append(levels)
    grid.append(card)
  }
  wrap.append(grid)
  const ms = el('section', 'menu-src__panel')
  ms.append(el('div', 'menu-src__title', '깬 난이도의 합'))
  for (const m of trials.milestones()) {
    const line = el('div', `menu-src__conv${trials.total() >= m.at ? ' is-on' : ''}`)
    line.append(el('b', '', `${m.at} · ${m.name}`), el('small', '', m.text))
    ms.append(line)
  }
  ms.append(el('div', 'menu-src__text', `기록이 빠를수록 균열 보상이 커진다 (지금 ×${trials.riftScale().toFixed(2)})`))
  wrap.append(ms)
  body.append(wrap)
}

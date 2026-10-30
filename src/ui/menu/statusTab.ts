import { PER_LIT, PER_OPENED, PER_PROMOTION } from '../../myth/ClassProgress'
import { godDef, relicDef, type RelicId } from '../../relics/data'
import { classIcon } from '../classIcons'
import { relicIcon } from '../relicCard'
import { glyph, unknownSigil } from '../sigils'
import { el, img, pips, type TabContext } from './dom'

/** 능력치 그림의 밝은 색과 어두운 색 */
const STAT_TINT: Partial<Record<Parameters<typeof glyph>[0], [string, string]>> = {
  heart: ['#ff9a90', '#d9473f'],
  sword: ['#e9eef5', '#8e98a3'],
  shield: ['#c9d6ea', '#5b6a8a'],
  boot: ['#e0b080', '#8a6040'],
  push: ['#9fe3ff', '#3f8aa8'],
  stand: ['#e9dcc0', '#8a8273'],
  divine: ['#ffe27a', '#c9a24a'],
  promote: ['#ffd27a', '#a8862e'],
}

/** 지금의 나: 왼쪽에 초상·칭호·단계 보석, 오른쪽에 능력치와 무엇으로 얼마나 강해졌나 */
export function renderStatus(ctx: TabContext, body: HTMLElement): void {
  const { host } = ctx
  const stats = host.stats()
  const layout = el('div', 'menu-status')

  const who = el('section', 'menu-status__who')
  const current = host.loadout.manifested
  const portrait = el('div', 'ui-portrait ui-portrait--large')
  if (current) {
    const god = godDef(current)
    const level = host.progress.level(current)
    who.style.setProperty('--god', god.color)
    portrait.style.setProperty('--glow', god.color)
    portrait.append(img(classIcon(god.name)))
    who.append(portrait, el('div', 'menu-status__title', host.progress.title(current)), el('div', 'menu-status__name', god.name))
    const gems = pips(level)
    gems.classList.remove('ui-gems--small')
    who.append(gems)
    // 다음 단계는 귀환의 승천으로 (E305-03: 신화 경험치 막대는 없앰)
    if (level < host.progress.levelCap) ctx.hintOn(portrait, `성소 화로에서 원정을 마칠 때 「승천」을 고르면 ${god.titles[level]}`)
  } else {
    portrait.classList.add('is-empty')
    portrait.append(img(unknownSigil()))
    who.append(portrait, el('div', 'menu-status__title', '이름 없는 모험가'))
    ctx.hintOn(portrait, '신의 흔적·사냥·수호자, 조각 셋을 모으면 그 신이 깨어난다.')
  }
  const tags = el('div', 'menu-status__tags')
  for (const g of host.loadout.blessings) {
    const tag = el('span', 'ui-tag', `잠든 ${godDef(g).name}의 유물`)
    tag.style.setProperty('--tag', godDef(g).color)
    tags.append(tag)
  }
  who.append(tags)
  layout.append(who)

  const right = el('div', 'menu-status__right')
  const grid = el('div', 'menu-status__stats')
  const pct = (v: number) => `${v > 1 ? '+' : '−'}${Math.round(Math.abs(v - 1) * 100)}%`
  const row = (icon: Parameters<typeof glyph>[0], name: string, value: string, hint: string, delta?: { text: string; good: boolean }) => {
    const r = el('div', 'menu-status__stat')
    r.append(img(glyph(icon, ...STAT_TINT[icon]!)), el('span', '', name), el('b', '', value))
    if (delta) {
      const tag = el('span', 'ui-tag', delta.text)
      tag.style.setProperty('--tag', delta.good ? 'var(--c-good)' : 'var(--c-bad)')
      r.append(tag)
    }
    ctx.hintOn(r, hint.includes('\n') ? hint : `${name}\n${hint}`)
    grid.append(r)
  }
  const changed = (v: number, higherIsGood: boolean) => (Math.abs(v - 1) < 0.005 ? undefined : { text: pct(v), good: v > 1 === higherIsGood })
  row('heart', '생명', `${Math.round(stats.hp)} / ${stats.maxHp}`, `생명\n승천 하나마다 최대 생명 +${Math.round(PER_PROMOTION.maxHpPct * 100)}%, 깨운 신 하나마다 +${PER_OPENED.maxHp}. 오르면 가득 찬다.`)
  row('sword', '주는 피해', `×${stats.damage.toFixed(2)}`, `주는 피해\n승천 하나마다 ×${PER_PROMOTION.damage}, 유물표에 켠 칸 하나마다 +${Math.round(PER_LIT * 100)}%, 손에 쥔 신의 힘이 곱해진다.`, changed(stats.damage, true))
  row('shield', '받는 피해', `×${stats.damageTaken.toFixed(2)}`, '낀 유물의 지속 효과', changed(stats.damageTaken, false))
  row('boot', '이동 속도', `${Math.round(stats.moveSpeed * 100)}%`, '낀 유물의 지속 효과', changed(stats.moveSpeed, true))
  row('push', '밀쳐 내기', `×${stats.knockbackDealt.toFixed(2)}`, '내 공격이 적을 미는 힘', changed(stats.knockbackDealt, true))
  row('stand', '버티기', `×${stats.knockbackTaken.toFixed(2)}`, '내가 밀려나는 정도. 낮을수록 잘 버틴다.', changed(stats.knockbackTaken, false))
  row('divine', '궁극기 충전', `${Math.round(stats.divine * 100)}%`, '궁극기 충전\n스킬로 맞히고 적을 쓰러뜨릴수록 차오른다. 가득 차면 지금 신화의 궁극기가 저절로 나간다.')
  row('promote', '승천', `${stats.promotions}`, `승천\n어느 신이든 귀환할 때 승천을 고르면 그 신이 한 단계 오르고, 하나마다 최대 생명 +${Math.round(PER_PROMOTION.maxHpPct * 100)}%, 모든 피해 ×${PER_PROMOTION.damage}. 자리를 바꿔도 남는다.`)
  right.append(grid)

  // 주는 피해가 어디서 오나 (E301-01): 곱하는 층과 더하는 층, 합은 「주는 피해」 줄
  if (stats.layers.length > 0) {
    const list = el('div', 'menu-status__layers')
    for (const layer of stats.layers) list.append(el('span', 'ui-tag', `${layer.name} ${layer.text}`))
    ctx.hintOn(list, `주는 피해 ×${stats.damage.toFixed(2)}\n×는 서로 곱하고, +는 모두 더한 뒤 곱한다.`)
    right.append(list)
  }

  // 유물표 (E303-04): 켠 칸 하나마다 같은 덧셈, 열린 신화는 생명
  if (stats.collected > 0 || stats.lit > 0 || stats.powers.length > 0) {
    const list = el('div', 'menu-status__powers')
    if (stats.collected > 0 || stats.lit > 0) {
      const n = stats.collected
      const line = el('div', 'menu-status__power')
      const chip = el('span', 'ui-chip')
      chip.style.setProperty('--glow', 'var(--c-gilt)')
      chip.append(img(glyph('star', '#ffd27a', '#a8862e')))
      line.append(chip, el('span', '', '유물표'), el('em', '', `켠 칸 ${stats.lit} · 모든 피해 +${Math.round(stats.lit * PER_LIT * 100)}%, 깨운 신 ${n} · 최대 생명 +${n * PER_OPENED.maxHp}`))
      list.append(line)
    }
    for (const p of stats.powers) {
      const line = el('div', 'menu-status__power')
      const chip = el('span', 'ui-chip')
      chip.style.setProperty('--glow', p.color)
      chip.append(img(p.kind === 'god' ? classIcon(p.name) : relicIcon(relicDef(p.name as RelicId))))
      line.append(chip, el('span', '', p.label), el('em', '', p.what))
      list.append(line)
    }
    right.append(list)
  }
  layout.append(right)
  body.append(layout)
}

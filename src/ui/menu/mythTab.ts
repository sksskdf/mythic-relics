import { DATA } from '../../data'
import { collectionText, starText } from '../../myth/alwaysText'
import { allLevelGains, lendText, levelGains } from '../../myth/levelGains'
import { type God, godDef } from '../../relics/data'
import { classIcon } from '../classIcons'
import { glyph, SOURCE_COLORS, sourceSigil, unknownSigil } from '../sigils'
import { el, img, pips, type TabContext } from './dom'

/** 신화권 이름 (숙련 안내) */
const REALM_NAME: Readonly<Record<string, string>> = { norse: '북유럽', greek: '그리스', china: '중국', japan: '일본', korea: '한국' }

/** 신화 탭 (E12-06): 지금 신화, 눌러 본 신화의 카드, 원천 넷, 발견한 만큼 드러나는 신들의 지도 */
export class MythTab {
  /** 눌러 본 신화 (없으면 고른 신화) */
  selected: God | null = null

  constructor(private readonly ctx: TabContext) {}

  /**
   * 다음 단계까지의 두 걸음(숙련 채우기 → 전설)과, Lv1~4 단계마다 얻는 것.
   * 지난 단계는 밝게, 다음 단계는 금빛 테로 강조한다.
   */
  private promotionGuide(god: God): HTMLElement {
    const { progress } = this.ctx.host
    const def = godDef(god)
    const level = progress.level(god)
    const box = el('section', 'menu-promo')
    box.style.setProperty('--god', def.color)

    if (level < progress.levelCap) {
      const steps = el('div', 'menu-promo__steps')
      const ratio = progress.xpRatio(god)
      const ready = progress.readyToPromote(god)
      const step1 = el('div', `menu-promo__step${ready ? ' is-done' : ' is-now'}`)
      step1.append(el('span', 'menu-promo__no', '1'), el('span', '', '이 신을 신위 칸에 모신 채 싸워 경험치를 채운다 (빌린 칸은 절반)'))
      const bar = el('div', 'ui-bar ui-bar--thin')
      bar.style.setProperty('--fill', def.color)
      bar.style.setProperty('--pct', ratio.toFixed(3))
      step1.append(bar, el('b', '', `${Math.round(ratio * 100)}%`))
      const step2 = el('div', `menu-promo__step${ready ? ' is-now' : ''}`)
      step2.append(
        el('span', 'menu-promo__no', '2'),
        el('span', '', def.legend ? `성소의 결계에 들어가 전설 「${def.legend.name}」에서 이긴다` : '이 신의 전설은 아직 이 세계에 없다'),
      )
      steps.append(el('div', 'menu-promo__head', `다음 단계: ${level + 1}단계 ${def.titles[level]}`), step1, step2)
      box.append(steps)
    }

    const ladder = el('div', 'menu-promo__ladder')
    allLevelGains(god).forEach((gains, i) => {
      const lv = i + 1
      // 데모 끝 단계 위는 엔딩 뒤에 열린다 (E21-01)
      const later = lv > progress.levelCap
      const row = el('div', `menu-promo__level${lv <= level ? ' is-have' : ''}${lv === level + 1 && !later ? ' is-next' : ''}${later ? ' is-later' : ''}`)
      const head = el('div', 'menu-promo__lv')
      head.append(el('span', 'ui-tag' + (lv <= level ? ' ui-tag--solid' : ' ui-tag--plain'), `${lv}단계`), el('span', '', def.titles[i]!))
      if (later && lv > level) head.append(el('small', '', '엔딩 뒤'))
      const list = el('ul', '')
      for (const g of gains) list.append(el('li', `is-${g.kind}`, g.text))
      if (gains.length === 0) list.append(el('li', '', '신화 개방'))
      row.append(head, list)
      ladder.append(row)
    })
    box.append(ladder)
    return box
  }

  /**
   * 신위 칸 (E237): 주신·빌린 힘·빈 칸·잠긴 칸(열리는 때). 칸을 누르면 그 신의 카드
   */
  private slotRow(): HTMLElement {
    const { progress, myths } = this.ctx.host
    const { count, gods, locked } = myths.slots()
    const row = el('section', 'menu-slots')
    gods.forEach((god, i) => {
      const def = godDef(god)
      const b = el('button', `menu-slots__slot${i === 0 ? ' is-main' : ''}`)
      b.type = 'button'
      b.style.setProperty('--god', def.color)
      b.append(img(classIcon(def.name), 'menu-slots__emblem'))
      const words = el('span', 'menu-slots__words')
      words.append(el('small', '', i === 0 ? '주신' : '빌린 힘'), el('b', '', def.name))
      b.append(words)
      this.ctx.hintOn(b, i === 0 ? `주신 ${def.name}\n무기·궁극기·모습과 패시브 전부` : `빌린 힘 ${def.name}\n${lendText(god, progress.level(god))}`)
      b.addEventListener('click', () => {
        this.selected = god
        this.ctx.render()
      })
      row.append(b)
    })
    for (let i = gods.length; i < count; i++) {
      const empty = el('div', 'menu-slots__slot is-empty')
      empty.append(el('span', 'menu-slots__words', '빈 칸'))
      this.ctx.hintOn(empty, '빈 칸\n깨운 신의 카드에서 「빌린 칸에 넣기」')
      row.append(empty)
    }
    for (const when of locked) {
      const slot = el('div', 'menu-slots__slot is-locked')
      slot.append(el('span', 'menu-slots__words', when))
      row.append(slot)
    }
    return row
  }

  /**
   * 한 신화 카드 (E12-06): 단계·칭호, 수집 보너스(열려 있으면 늘), 추가 효과(고르면), 다음 단계 조건, 고르기 단추.
   */
  private mythCard(god: God): HTMLElement {
    const { progress, myths, loadout } = this.ctx.host
    const def = godDef(god)
    const level = progress.level(god)
    const star = myths.star(god)
    const chosen = loadout.manifested === god
    // 신위 칸 (E237): 빌린 칸에 든 신인가, 빈 칸이 있는가
    const slots = myths.slots()
    const lent = !chosen && slots.gods.includes(god)
    const room = slots.gods.length < slots.count
    const card = el('section', `menu-myth${level === 0 ? ' is-closed' : ''}`)
    card.style.setProperty('--god', def.color)

    const head = el('div', 'menu-myth__head')
    head.append(img(level > 0 ? classIcon(def.name) : unknownSigil(), 'menu-myth__emblem'))
    const name = el('div', 'menu-myth__name')
    const title = el('div', 'menu-classes__title', level > 0 ? progress.title(god) : def.name)
    if (level > 0) title.append(pips(level))
    name.append(title, el('small', '', level > 0 ? def.name : '아직 열리지 않은 신화'))
    head.append(name)
    if (chosen) head.append(el('span', 'ui-tag ui-tag--solid menu-myth__chosen', '주신'))
    else if (lent) head.append(el('span', 'ui-tag ui-tag--solid menu-myth__chosen', '빌린 힘'))
    card.append(head)

    // 수집 보너스 (E21-02): 열린 신화면 고르지 않아도 늘 붙는다. 별을 밝힌 신화는 그 신화의 수치도 (엔딩 뒤)
    const always = el('div', 'menu-myth__part')
    always.append(el('b', '', '수집 보너스'), el('small', '', '열려 있으면 늘'))
    const alwaysList = el('ul', '')
    alwaysList.append(el('li', level > 0 ? 'is-on' : '', collectionText()))
    if (star > 0) alwaysList.append(el('li', star >= 3 ? 'is-on' : '', `별: ${starText(god, star)}${star >= 3 ? '' : ' (3단계부터)'}`))
    always.append(alwaysList)
    card.append(always)

    // 주신일 때: 무기·패시브 전부·궁극기
    const extra = el('div', `menu-myth__part${chosen ? '' : ' is-dim'}`)
    extra.append(el('b', '', '주신일 때'), el('small', '', '신위 칸 첫째'))
    const extraList = el('ul', '')
    for (const g of levelGains(god, 1)) if (g.kind === 'power' || g.kind === 'damage') extraList.append(el('li', chosen ? 'is-on' : '', g.text))
    extraList.append(el('li', chosen ? 'is-on' : '', `궁극기 「${def.ultimate.name}」`))
    extra.append(extraList)
    card.append(extra)

    // 빌린 힘일 때 (E237): 대표 패시브 하나와 유물의 깨어남
    const lendPart = el('div', `menu-myth__part${lent ? '' : ' is-dim'}`)
    lendPart.append(el('b', '', '빌린 힘일 때'), el('small', '', '신위 칸 둘째부터'))
    const lendList = el('ul', '')
    lendList.append(el('li', lent ? 'is-on' : '', lendText(god, Math.max(1, level))), el('li', lent ? 'is-on' : '', '이 신의 유물이 깨어난다'))
    lendPart.append(lendList)
    card.append(lendPart)

    // 신위 칸 바꾸기: 열린 신화만, 마을·성소에서만
    if (level > 0 && !chosen) {
      const can = myths.canChoose()
      const buttons = el('div', 'menu-myth__buttons')
      const button = (label: string, run: () => boolean, ok: boolean, why: string) => {
        const b = el('button', 'menu-myth__choose', label)
        b.type = 'button'
        b.disabled = !can || !ok
        if (can && ok) b.addEventListener('click', () => run() && this.ctx.render())
        else this.ctx.hintOn(b, can ? why : '신위 칸은 마을이나 성소 곁에서만 바꿀 수 있다.')
        buttons.append(b)
      }
      button('주신으로', () => myths.choose(god), true, '')
      if (lent) button('빌린 칸에서 빼기', () => myths.lend(god, false), true, '')
      else button('빌린 칸에 넣기', () => myths.lend(god, true), room, '빈 칸이 없다. 빌린 신 하나를 먼저 뺀다.')
      card.append(buttons)
    }

    // 다음 단계: 못 연 신화는 여는 법, 연 신화는 경험치와 전설
    if (level === 0) {
      const open = el('div', 'menu-myth__part')
      open.append(el('b', '', '여는 법'))
      const how = def.hidden ? '숨겨진 신화. 이 신의 유물을 모두 모으면 열린다.' : `${def.name}의 유물을 손에 넣으면 열린다. 고른 신화가 없을 때는 ${REALM_NAME[def.realm] ?? '그 신화권'} 몬스터를 잡아도 경험치가 찬다.`
      open.append(el('p', '', how))
      if (!def.hidden) {
        const bar = el('div', 'ui-bar ui-bar--thin')
        bar.style.setProperty('--fill', def.color)
        bar.style.setProperty('--pct', progress.xpRatio(god).toFixed(3))
        open.append(bar)
      }
      card.append(open)
    } else card.append(this.promotionGuide(god))
    return card
  }

  /**
   * 신들의 지도. 처음부터 모든 체계를 늘어놓지 않고, 발견한 만큼만 드러난다.
   * - 아는 땅(유물이 이 세계에 있는 신화권)은 신 넷이 자리로 보이고, 깨운 신은 칭호가, 나머지는 ?가 된다.
   * - 모르는 땅은 문장 하나(?)로만 보인다.
   * - 높은 자리(원천·신화권의 상위)는 그 길에 처음 발을 디딘 뒤에야 ?로 나타난다.
   * - 숨겨진 별은 이름 없이 흐리게 떠 있다.
   * 모든 ?는 올리거나 누르면 그 신화의 이야기로 된 힌트를 보여 준다.
   */
  render(body: HTMLElement): void {
    const { progress, loadout } = this.ctx.host
    const tree = DATA.classes
    const wrap = el('div', 'menu-classes')
    const levelOf = (god: God | undefined): number => (god ? progress.level(god) : 0)

    // 지금 클래스: 문장, 칭호, 레벨 점, 경험치 막대, 승급 전설 두루마리
    const now = el('section', 'menu-classes__now')
    const current = loadout.manifested
    if (current) {
      const god = godDef(current)
      const level = progress.level(current)
      now.style.setProperty('--god', god.color)
      now.append(img(classIcon(god.name), 'menu-classes__emblem'))
      const info = el('div', 'menu-classes__info')
      const title = el('div', 'menu-classes__title', progress.title(current))
      title.append(pips(level))
      info.append(title)
      if (level < progress.levelCap) {
        const bar = el('div', 'ui-bar ui-bar--thin menu-classes__xp')
        bar.style.setProperty('--fill', god.color)
        bar.style.setProperty('--pct', progress.xpRatio(current).toFixed(3))
        info.append(bar)
      }
      now.append(info)
      if (level < progress.levelCap) {
        const ready = progress.readyToPromote(current)
        const scroll = el('span', `menu-classes__legend${ready ? ' is-ready' : ''}`)
        scroll.append(img(glyph('scroll', ready ? '#ffd27a' : '#5d6876', ready ? '#6b5622' : '#222a36')))
        const next = god.titles[level]!
        this.ctx.hintOn(
          scroll,
          ready
            ? god.legend
              ? `「${god.legend.name}」\n성소의 결계 안에서 증명하면 ${next}`
              : `다음 시련은 아직 이 세계에 없다.\n${next}`
            : `싸워서 이름을 더 떨쳐야 한다.\n${Math.round(progress.xpRatio(current) * 100)}%`,
        )
        now.append(scroll)
      }
    } else {
      now.classList.add('is-empty')
      now.append(img(unknownSigil(), 'menu-classes__emblem'))
      const info = el('div', 'menu-classes__info')
      info.append(el('div', 'menu-classes__title', '이름 없는 모험가'))
      // 처음 여는 사람도 무엇을 하면 되는지 바로 알게 (체크리스트 QA, 2026-10-27)
      info.append(el('p', 'menu-classes__how', '몬스터를 잡아 그 신화권의 경험치를 채우거나, 보스가 떨어뜨린 신의 유물을 주우면 신화가 열린다.'))
      now.append(info)
      this.ctx.hintOn(now, '한 신의 유물을 손에 넣으면 그 신의 힘이 깨어난다.')
    }
    wrap.append(now)
    if (current) wrap.append(this.slotRow())

    // 눌러 본 신화(없으면 고른 신화)의 카드: 상시·추가 효과, 다음 단계, 고르기 (E12-06)
    const focus = this.selected ?? current
    if (focus) wrap.append(this.mythCard(focus))

    // 원천 넷: 이름, 차오르는 때, 지금 각성 단계는 보석 점으로
    const sigils = el('div', 'menu-classes__sources')
    const rows = this.ctx.host.sources.rows()
    for (const x of tree.sources) {
      const value = rows.find((r) => r.id === x.id)?.level ?? 0
      const known = tree.mythologies.some((m) => m.classes.some((c) => c.source === x.id && levelOf(c.god) > 0))
      const cell = el('span', `menu-classes__source${known ? ' is-known' : ''}`)
      cell.style.setProperty('--god', SOURCE_COLORS[x.id]![0])
      cell.append(img(sourceSigil(x.id, known)))
      const words = el('span', 'menu-classes__source-words')
      words.append(el('b', '', x.name), el('small', '', x.gain))
      cell.append(words)
      if (value > 0) cell.append(pips(value, 3))
      this.ctx.hintOn(cell, `${x.name}\n${x.gain} 차오르는 힘. 장비에 붙은 ${x.name} 수치가 5·10·20을 넘으면 깨어난다.${value > 0 ? `\n각성 ${value}단계` : ''}`)
      sigils.append(cell)
    }
    wrap.append(sigils)

    // 신들의 지도
    const node = (open: boolean, label: string, hint: string, extra = '', color?: string, icon?: string, god?: God): HTMLElement => {
      const chip = el('button', `menu-tree__node${open ? ' is-open' : ''}${extra}${god && god === focus ? ' is-selected' : ''}`)
      chip.type = 'button'
      // 게임에 들어 있는 신화는 누르면 위 카드로 본다
      if (god)
        chip.addEventListener('click', () => {
          this.selected = god
          this.ctx.render()
        })
      if (open) {
        if (icon) chip.append(img(icon))
        chip.append(label)
      }
      else chip.append(img(unknownSigil(extra.includes('is-near') ? '#8d98a6' : '#3a4558')))
      if (color) chip.style.setProperty('--god', color)
      chip.setAttribute('aria-label', open ? label : '알 수 없는 자리')
      this.ctx.hintOn(chip, hint)
      return chip
    }
    const map = el('div', 'menu-tree')
    const unknownLands = el('div', 'menu-tree__lands')
    for (const myth of tree.mythologies) {
      const near = myth.classes.some((c) => c.god !== undefined)
      const found = myth.classes.filter((c) => levelOf(c.god) > 0).length
      if (!near && found === 0) {
        // 모르는 땅: 문장 하나
        unknownLands.append(node(false, myth.name, '아직 닿지 않은 땅. 그곳에도 신들이 잠들어 있다.', ' is-land'))
        continue
      }
      const land = el('div', 'menu-tree__land')
      land.append(el('div', 'menu-tree__land-name', myth.name))
      const gods = el('div', 'menu-tree__gods')
      for (const c of myth.classes) {
        const level = levelOf(c.god)
        const color = c.god ? godDef(c.god).color : undefined
        const title = c.titles[Math.max(0, level - 1)]!
        gods.append(
          level > 0
            ? node(true, title, `${c.name}\n${c.hint}`, '', color, classIcon(c.name), c.god)
            : node(false, c.name, c.hint, c.god ? ' is-near' : '', undefined, undefined, c.god),
        )
      }
      land.append(gods)
      // 신화권의 높은 자리: 그 땅의 신을 둘 이상 깨운 뒤에 나타난다.
      if (found >= 2) {
        const done = myth.classes.filter((c) => levelOf(c.god) >= 3).length
        land.append(node(done >= 4, myth.upper.name, myth.upper.hint, ' is-crown'))
      }
      map.append(land)
    }
    wrap.append(map)

    // 원천의 높은 자리: 그 원천의 신이 한 번이라도 승급한 뒤에 나타난다. 짝은 두 원천 모두 승급한 뒤에.
    const heights = el('div', 'menu-tree__heights')
    const count = (source: string, minLevel: number) =>
      [...tree.mythologies.flatMap((m) => m.classes), ...tree.hidden].filter((c) => c.source === source && levelOf(c.god) >= minLevel).length
    for (const x of tree.sources) {
      if (count(x.id, 2) === 0) continue
      const pair = el('span', 'menu-tree__height')
      pair.append(img(sourceSigil(x.id)))
      pair.append(node(count(x.id, 3) >= 2, x.upper.name, x.upper.hint))
      heights.append(pair)
    }
    for (const p of tree.pairs) {
      if (p.sources.some((s) => count(s, 2) === 0)) continue
      const pair = el('span', 'menu-tree__height')
      pair.append(img(sourceSigil(p.sources[0])), img(sourceSigil(p.sources[1])))
      pair.append(node(p.sources.every((s) => count(s, 3) >= 1), p.name, p.hint))
      heights.append(pair)
    }
    if (heights.childElementCount > 0) wrap.append(heights)
    if (unknownLands.childElementCount > 0) wrap.append(unknownLands)

    // 숨겨진 별
    const stars = el('div', 'menu-tree__stars')
    for (const h of tree.hidden) {
      const level = levelOf(h.god)
      const star = node(level > 0, h.titles[Math.max(0, level - 1)]!, level > 0 ? `${h.name}\n${h.hint}` : h.hint, ' is-star')
      if (level === 0) star.replaceChildren(el('span', 'menu-tree__star', '✦'))
      if (h.god && level > 0) star.style.setProperty('--god', godDef(h.god).color)
      stars.append(star)
    }
    wrap.append(stars)
    body.append(wrap)
  }
}

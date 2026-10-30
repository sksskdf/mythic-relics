import { ATTACK_NAMES } from '../../combat/styles'
import { DATA } from '../../data'
import { collectionText } from '../../myth/alwaysText'
import { allLevelGains, lendText, levelGains } from '../../myth/levelGains'
import { type God, godDef, relicDef } from '../../relics/data'
import { relicMyth, stageName } from '../../gear/mythRelic'
import { DEMO_MAX_LEVEL, MAX_LEVEL, PER_LIT } from '../../myth/ClassProgress'
import { awakenDef } from '../../data/awaken'
import { josa } from '../josa'
import { relicIcon } from '../relicCard'
import { classIcon } from '../classIcons'
import { glyph, sourceSigil, unknownSigil } from '../sigils'
import { WardrobePane } from '../WardrobePane'
import { el, img, pips, type TabContext } from './dom'

/** 신 탭 안의 두 보기: 자리(자리 셋·유물표·신의 카드·신들의 지도)와 외형 */
export type GodsView = 'slots' | 'looks'

/**
 * 신 탭 (E305-04, `CYCLE.md` 7장): 옛 신화 탭과 외형 탭을 합쳤다.
 * 「자리 · 외형」 알약 둘로 나눈다: 자리는 지금 신·깨우는 신·신의 자리 셋·유물표·눌러 본 신의 카드, 맨 아래 접힌 신들의 지도.
 * 외형은 `WardrobePane`을 따로 둔 칸에 그린다 (받은 칸을 통째로 비우므로). 미리 보기는 외형을 보는 동안만 돈다
 */
export class GodsTab {
  /** 눌러 본 신 (없으면 손의 신) */
  selected: God | null = null
  /** 보고 있는 쪽 */
  view: GodsView = 'slots'
  /** 새 외형을 얻었다: 「외형」 알약에 표시 (외형을 보면 지운다) */
  looksNew = false
  /** 신들의 지도를 펴 두었나 (다시 그려도 그대로) */
  private atlasOpen = false
  /** 외형 보관함 (미리 보기의 WebGL을 한 번만 만들게 하나만 둔다) */
  private readonly wardrobe: WardrobePane

  constructor(private readonly ctx: TabContext) {
    this.wardrobe = new WardrobePane(ctx.host.wardrobe, (target, text) => ctx.hintOn(target, text))
  }

  /**
   * 다음 단계로 오르는 길(귀환의 승천, 상한은 장 정복)과, Lv1~4 단계마다 얻는 것.
   * 지난 단계는 밝게, 다음 단계는 금빛 테로 강조한다.
   */
  private promotionGuide(god: God): HTMLElement {
    const { progress } = this.ctx.host
    const def = godDef(god)
    const level = progress.level(god)
    const box = el('section', 'menu-promo')
    box.style.setProperty('--god', def.color)

    {
      // 단계는 귀환할 때 고르는 승천으로만 오른다 (E304, E305-03: 엔딩 뒤도 같다). 데모의 상한은 장을 정복할 때마다 하나씩
      const boss = this.ctx.host.nextConquest()
      const steps = el('div', 'menu-promo__steps')
      const how =
        level < progress.levelCap
          ? '성소 화로에서 원정을 마칠 때 「승천」을 고른다 (자리에 든 신만)'
          : boss && level < DEMO_MAX_LEVEL
            ? `${josa(boss, '을')} 이기면 이 신을 더 올릴 수 있다`
            : level < MAX_LEVEL
              ? '더 높은 단계는 엔딩 뒤에 열린다'
              : ''
      const step = el('div', `menu-promo__step${level < progress.levelCap ? ' is-now' : ''}`)
      step.append(el('span', 'menu-promo__no', '↑'), el('span', '', how))
      if (level < MAX_LEVEL) steps.append(el('div', 'menu-promo__head', `다음 단계: ${level + 1}단계 ${def.titles[level]}`), step)
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
      const boss = this.ctx.host.nextConquest()
      if (later && lv > level) head.append(el('small', '', lv <= DEMO_MAX_LEVEL && boss ? `${josa(boss, '을')} 이기면` : '엔딩 뒤'))
      const list = el('ul', '')
      for (const g of gains) list.append(el('li', `is-${g.kind}`, g.text))
      if (gains.length === 0) list.append(el('li', '', '신화 개방'))
      row.append(head, list)
      ladder.append(row)
    })
    box.append(ladder)
    return box
  }

  /** 깨우는 중인 신 (E238): 조각 셋 가운데 모은 것, 빌린 힘, 다음 할 일 */
  private wakingBox(): HTMLElement | null {
    const waking = this.ctx.host.gods.waking()
    if (!waking) return null
    const def = godDef(waking.god)
    const box = el('section', 'menu-waking')
    box.style.setProperty('--god', def.color)
    box.append(img(classIcon(def.name), 'menu-slots__emblem'))
    const words = el('div', 'menu-waking__words')
    words.append(el('small', '', `깨우는 신 · 조각 ${waking.fragments}/3`), el('b', '', def.name))
    const pieces = el('div', 'menu-waking__pieces')
    for (const [i, name] of ['흔적', '사냥', '수호자'].entries()) pieces.append(el('span', i < waking.fragments ? 'is-have' : i === waking.fragments ? 'is-now' : '', name))
    words.append(pieces, el('p', '', `빌린 힘: ${lendText(waking.god, 1)}`), el('p', 'menu-waking__next', `다음: ${waking.next}`))
    box.append(words)
    return box
  }

  /**
   * 신의 자리 셋 (E302): 손·심장·숨(빈 칸·잠긴 칸). 자리를 누르면 그 신의 카드
   */
  private slotRow(): HTMLElement {
    const { pantheon } = this.ctx.host.gods
    const view = pantheon()
    const row = el('section', 'menu-slots')
    const slot = (label: string, god: God | null, empty: string, hint: string) => {
      if (!god) {
        const box = el('div', 'menu-slots__slot is-empty')
        const words = el('span', 'menu-slots__words')
        words.append(el('small', '', label), el('b', '', empty))
        box.append(words)
        this.ctx.hintOn(box, `${label}\n${hint}`)
        row.append(box)
        return
      }
      const def = godDef(god)
      const b = el('button', `menu-slots__slot${view.focus === god ? ' is-main' : ''}`)
      b.type = 'button'
      b.style.setProperty('--god', def.color)
      b.append(img(classIcon(def.name), 'menu-slots__emblem'))
      const words = el('span', 'menu-slots__words')
      words.append(el('small', '', label), el('b', '', def.name))
      b.append(words)
      this.ctx.hintOn(b, `${label} ${def.name}\n${hint}`)
      b.addEventListener('click', () => {
        this.selected = god
        this.ctx.render()
      })
      row.append(b)
    }
    slot('손', view.hand, '낡은 검', '기본 공격 동작·리듬·무기')
    slot('심장', view.heart, '비었음', '궁극기')
    for (const god of view.breath) slot('숨', god, '', lendText(god, Math.max(1, this.ctx.host.progress.level(god))))
    for (let i = view.breath.length; i < view.count; i++) slot('숨', null, '빈 칸', '깨운 신의 카드에서 「숨에 넣기」')
    for (const when of view.locked) {
      const box = el('div', 'menu-slots__slot is-locked')
      box.append(el('span', 'menu-slots__words', when))
      row.append(box)
    }
    return row
  }

  /**
   * 한 신화 카드 (E12-06 → E302): 단계·칭호, 열린 신화의 생명, 손·심장·숨에 끼면 얻는 것, 자리 바꾸기, 다음 단계 조건.
   */
  private mythCard(god: God): HTMLElement {
    const { progress, gods } = this.ctx.host
    const def = godDef(god)
    const level = progress.level(god)
    const view = gods.pantheon()
    const inHand = view.hand === god
    const inHeart = view.heart === god
    const inBreath = view.breath.includes(god)
    const room = view.breath.length < view.count
    const card = el('section', `menu-myth${level === 0 ? ' is-closed' : ''}`)
    card.style.setProperty('--god', def.color)

    const head = el('div', 'menu-myth__head')
    head.append(img(level > 0 ? classIcon(def.name) : unknownSigil(), 'menu-myth__emblem'))
    const name = el('div', 'menu-myth__name')
    const title = el('div', 'menu-classes__title', level > 0 ? progress.title(god) : def.name)
    if (level > 0) title.append(pips(level))
    name.append(title, el('small', '', level > 0 ? def.name : '아직 열리지 않은 신화'))
    head.append(name)
    const tags = [inHand && '손', inHeart && '심장', inBreath && '숨'].filter(Boolean) as string[]
    if (view.focus === god) head.append(el('span', 'ui-tag ui-tag--solid menu-myth__chosen', '한 신에 몰기'))
    else if (tags.length) head.append(el('span', 'ui-tag ui-tag--solid menu-myth__chosen', tags.join('·')))
    card.append(head)

    // 열린 신화 (E21-02 → E303-04): 자리에 없어도 늘 붙는다(최대 생명)
    const always = el('div', 'menu-myth__part')
    always.append(el('b', '', '열린 신화'), el('small', '', '열려 있으면 늘'))
    const alwaysList = el('ul', '')
    alwaysList.append(el('li', level > 0 ? 'is-on' : '', collectionText()))
    always.append(alwaysList)
    card.append(always)

    // 자리마다 얻는 것 (E302): 손 = 공격 동작·배율, 심장 = 궁극기, 숨 = 패시브
    const part = (label: string, on: boolean, lines: string[]) => {
      const box = el('div', `menu-myth__part${on ? '' : ' is-dim'}`)
      box.append(el('b', '', label))
      const list = el('ul', '')
      for (const line of lines) list.append(el('li', on ? 'is-on' : '', line))
      box.append(list)
      card.append(box)
    }
    const damage = levelGains(god, 1).filter((g) => g.kind === 'damage').map((g) => g.text)
    part('손에 쥐면', inHand, [`기본 공격: ${ATTACK_NAMES[def.attack]}`, ...damage])
    part('심장에 두면', inHeart, [`궁극기 「${def.ultimate.name}」`])
    // 공격 동작은 손의 몫이라 빼고, 대표 힘과 겹치는 줄은 한 번만
    const breathLines = [lendText(god, Math.max(1, level)), ...levelGains(god, 1).filter((g) => g.kind === 'power' && !g.text.startsWith('공격')).map((g) => g.text)]
    part('숨에 넣으면', inBreath, [...new Set(breathLines), '이 신의 유물이 깨어난다'])
    if (view.focus !== god && level > 0) card.append(el('p', 'menu-myth__hint', '손·심장·숨을 모두 이 신으로 채우면 한 신에 몰기: 효과 단계 +1, 이 신의 모습'))

    // 자리 바꾸기 (E302): 어디서나, 전설 중에는 못 바꾼다
    if (level > 0) {
      const can = gods.canSwap()
      const buttons = el('div', 'menu-myth__buttons')
      const button = (label: string, run: () => boolean, ok: boolean, why: string) => {
        const b = el('button', 'menu-myth__choose', label)
        b.type = 'button'
        b.disabled = !can || !ok
        if (can && ok) b.addEventListener('click', () => run() && this.ctx.render())
        else this.ctx.hintOn(b, can ? why : '전설 중에는 자리를 바꿀 수 없다.')
        buttons.append(b)
      }
      if (!inHand) button('손에 쥐기', () => gods.place('hand', god), true, '')
      if (!inHeart) button('심장에 두기', () => gods.place('heart', god), true, '')
      if (inBreath) button('숨에서 빼기', () => gods.unplace(god), true, '')
      else button('숨에 넣기', () => gods.place('breath', god), room, '빈 숨 칸이 없다. 숨에서 하나를 먼저 뺀다.')
      if (view.focus !== god) button('한 신에 몰기', () => gods.choose(god), true, '')
      card.append(buttons)
    }

    // 다음 단계: 못 연 신화는 여는 법(조각 셋, E305-03: 신화 경험치는 없앰), 연 신화는 승천
    if (level === 0) {
      const open = el('div', 'menu-myth__part')
      open.append(el('b', '', '여는 법'))
      const path = awakenDef(god)
      const how = path
        ? `${path.trace.name}에서 흔적을 지키는 것들을 물리치고, 그 땅에서 사냥하고, ${josa(path.guardian.name, '을')} 쓰러뜨리면 깨어난다.`
        : def.hidden
          ? '숨겨진 신화. 엔딩 뒤 이 신의 유물을 모두 모으면 열린다.'
          : `엔딩 뒤 ${def.name}의 유물을 손에 넣으면 열린다.`
      open.append(el('p', '', how))
      card.append(open)
    } else card.append(this.promotionGuide(god))
    return card
  }

  /**
   * 유물표 (E303-04, `CYCLE.md` 4.4): 신화의 유물과 처음 만든 고유 효과. 켠 칸마다 모든 피해 +1%.
   * 못 켠 칸은 실루엣, 켰는데 그 신이 자리에 없으면 흐리게
   */
  private relicTable(): HTMLElement {
    const { relics, uniques } = this.ctx.host.gods.table()
    const box = el('section', 'menu-table')
    const lit = relics.filter((r) => r.lit).length + uniques.filter((u) => u.lit).length
    box.append(el('div', 'menu-table__head', `유물표 · ${lit}칸 켬 · 모든 피해 +${Math.round(lit * PER_LIT * 100)}%`))
    const grid = el('div', 'menu-table__grid')
    for (const r of relics) {
      const def = relicDef(r.id)
      const owner = godDef(relicMyth(r.id)!)
      const cell = el('span', `menu-table__cell${r.lit ? ' is-lit' : ''}${r.awake ? ' is-awake' : ''}`)
      cell.style.setProperty('--god', owner.color)
      cell.append(img(r.lit ? relicIcon(def) : unknownSigil('#3a4558')))
      if (r.lit && r.stage > 1) cell.append(el('small', '', String(r.stage)))
      this.ctx.hintOn(cell, r.lit ? `${stageName(r.id, r.stage)}\n${r.awake ? `${josa(owner.name, '이')} 자리에 있어 깨어났다` : `${josa(owner.name, '을')} 자리에 넣으면 깨어난다`}` : `???\n${owner.name}의 조각을 모으면 켜진다`)
      grid.append(cell)
    }
    for (const u of uniques) {
      const cell = el('span', `menu-table__cell menu-table__cell--unique${u.lit ? ' is-lit' : ''}`)
      cell.append(img(u.lit ? glyph('star', '#ffd27a', '#a8862e') : unknownSigil('#3a4558')))
      this.ctx.hintOn(cell, u.lit ? `${u.name}\n${u.text}` : '???\n영웅 장비를 합쳐 만들면 켜진다')
      grid.append(cell)
    }
    box.append(grid)
    return box
  }

  /** 지금 신: 문장, 칭호, 단계 점, 다음 단계로 오르는 길 */
  private nowBox(): HTMLElement {
    const { progress, loadout } = this.ctx.host
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
      // 다음 단계는 귀환의 승천으로 (E305-03: 신화 경험치 막대·전설 두루마리는 없앰)
      if (level < progress.levelCap) info.append(el('p', 'menu-classes__how', `성소 화로에서 원정을 마칠 때 「승천」을 고르면 ${god.titles[level]}`))
      now.append(info)
    } else {
      now.classList.add('is-empty')
      now.append(img(unknownSigil(), 'menu-classes__emblem'))
      const info = el('div', 'menu-classes__info')
      info.append(el('div', 'menu-classes__title', '이름 없는 모험가'))
      // 처음 여는 사람도 무엇을 하면 되는지 바로 알게 (체크리스트 QA, 2026-10-27). 신은 조각 셋으로 깨운다 (E238)
      info.append(el('p', 'menu-classes__how', '신의 흔적·사냥·수호자, 조각 셋을 모으면 그 신이 깨어난다.'))
      now.append(info)
      this.ctx.hintOn(now, '흔적에 커서를 올리면 그 신이 무엇을 주는지 보인다.')
    }
    return now
  }

  /**
   * 신들의 지도 (신 탭 맨 아래 접힌 칸, E305-04). 처음부터 모든 체계를 늘어놓지 않고, 발견한 만큼만 드러난다.
   * - 아는 땅(유물이 이 세계에 있는 신화권)은 신 넷이 자리로 보이고, 깨운 신은 칭호가, 나머지는 ?가 된다.
   * - 모르는 땅은 문장 하나(?)로만 보인다.
   * - 높은 자리(원천·신화권의 상위)는 그 길에 처음 발을 디딘 뒤에야 ?로 나타난다.
   * - 숨겨진 별은 이름 없이 흐리게 떠 있다.
   * 모든 ?는 올리거나 누르면 그 신화의 이야기로 된 힌트를 보여 준다.
   */
  private atlas(focus: God | null): HTMLElement {
    const { progress } = this.ctx.host
    const tree = DATA.classes
    const levelOf = (god: God | undefined): number => (god ? progress.level(god) : 0)
    const box = el('details', 'menu-gods__atlas')
    box.open = this.atlasOpen
    box.addEventListener('toggle', () => (this.atlasOpen = box.open))
    box.append(el('summary', '', '신들의 지도'))
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
    box.append(map)

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
    if (heights.childElementCount > 0) box.append(heights)
    if (unknownLands.childElementCount > 0) box.append(unknownLands)

    // 숨겨진 별
    const stars = el('div', 'menu-tree__stars')
    for (const h of tree.hidden) {
      const level = levelOf(h.god)
      const star = node(level > 0, h.titles[Math.max(0, level - 1)]!, level > 0 ? `${h.name}\n${h.hint}` : h.hint, ' is-star')
      if (level === 0) star.replaceChildren(el('span', 'menu-tree__star', '✦'))
      if (h.god && level > 0) star.style.setProperty('--god', godDef(h.god).color)
      stars.append(star)
    }
    box.append(stars)
    return box
  }

  /** 「자리 · 외형」 알약 */
  private views(): HTMLElement {
    const row = el('div', 'menu-gods__views')
    for (const [id, label] of [['slots', '자리'], ['looks', '외형']] as const) {
      const pill = el('button', `ui-pill${this.view === id ? ' is-on' : ''}${id === 'looks' && this.looksNew ? ' is-new' : ''}`, label)
      pill.type = 'button'
      pill.addEventListener('click', () => {
        this.view = id
        this.ctx.render()
      })
      row.append(pill)
    }
    return row
  }

  render(body: HTMLElement): void {
    const wrap = el('div', 'menu-classes')
    wrap.append(this.views())
    if (this.view === 'looks') {
      this.looksNew = false
      const pane = el('div', 'menu-gods__looks')
      wrap.append(pane)
      body.append(wrap)
      this.wardrobe.render(pane)
      return
    }
    wrap.append(this.nowBox())
    const waking = this.wakingBox()
    if (waking) wrap.append(waking)
    const current = this.ctx.host.loadout.manifested
    if (current) wrap.append(this.slotRow())
    wrap.append(this.relicTable())
    // 눌러 본 신(없으면 손의 신)의 카드: 자리마다 얻는 것, 자리 바꾸기, 다음 단계
    const focus = this.selected ?? current
    if (focus) wrap.append(this.mythCard(focus))
    wrap.append(this.atlas(focus))
    body.append(wrap)
  }
}

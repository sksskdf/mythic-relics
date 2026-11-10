import { wakeDef, LATER_TEXT, type TraceState } from '../data/wake'
import { levelGains, lendText } from '../myth/levelGains'
import { type God, godDef } from '../relics/data'
import { classIcon } from './classIcons'
import { josa } from './josa'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/** 흔적 카드에 보일 지금 상태: 흔적의 형편, 깨우는 신이면 모은 조각과 사냥한 수 */
export interface TraceCardContext {
  state: TraceState
  /** 잠잠한 흔적이 응답하는 때 (「성소 화로에서 원정을 마치면 응답한다」 E305-03, 「기세 3에 응답한다」 E306) */
  sealedText: string
  /** 지금 깨우는 신 (다른 신을 깨우는 중일 때 이름을 댄다) */
  waking: God | null
  fragments: number
  hunt: number
  /** 조각 2까지 잡아야 하는 수 (깨운 차례대로, E306) */
  need: number
}

/**
 * 신의 흔적 카드 (E238, `DESIGN.md` 4.2.2): 컴퓨터는 흔적에 커서를 올리면, 휴대폰은 주인공이 흔적에 다가가면 뜬다
 * (톡은 그리로 걷는 지시일 뿐이다. 한 번 읽은 흔적은 곁에 가만히 서야 다시 뜬다. 띄우는 규칙은 `HoverCards`, E307).
 * 무엇을 고르는지 알고 고르게 그 신의 무기·궁극기 한 줄과 빌려주는 힘 한 줄, 지금 할 일을 보인다.
 * 화면이 낮은 휴대폰에서는 주인공을 가리지 않게 아래쪽 단락(이야기)부터 접힌다 (`RelicTooltip`)
 */
export function traceCard(god: God, ctx: TraceCardContext): HTMLElement {
  const def = godDef(god)
  const path = wakeDef(god)
  const card = el('div', 'rc')
  card.style.setProperty('--god', def.color)

  const head = el('div', 'rc__head')
  const frame = el('div', 'rc__icon')
  const icon = el('img', '')
  icon.src = classIcon(def.name)
  icon.alt = ''
  frame.append(icon)
  const names = el('div', 'rc__names')
  names.append(el('div', 'rc__name', path?.trace.name ?? def.name), el('div', 'rc__type', `${def.name}의 흔적`))
  head.append(frame, names)
  card.append(head)

  const now =
    ctx.state === 'awake'
      ? '깨어난 신'
      : ctx.state === 'waking'
        ? ctx.fragments >= 2
          ? `조각 2/3 · ${path ? josa(path.guardian.name, '을') : '수호자를'} 쓰러뜨린다`
          : `조각 1/3 · 사냥 ${ctx.hunt}/${ctx.need}`
        : ctx.state === 'later'
          ? LATER_TEXT
          : ctx.state === 'busy' && ctx.waking
            ? `${josa(godDef(ctx.waking).name, '이')} 깨어난 뒤에 응답한다`
            : ctx.state === 'sealed'
              ? ctx.sealedText
              : '다가가면 흔적을 지키는 것들이 깨어난다'
  card.append(el('div', `rc__place${ctx.state === 'open' ? ' rc__place--ground' : ''}`, now))

  // 깨우면 얻는 것: 손(무기)과 심장(궁극기)
  const weapon = levelGains(god, 1).find((g) => g.kind === 'power')?.text ?? ''
  const main = el('section', 'rc__section')
  main.append(el('div', 'rc__label', '깨우면 손과 심장'), el('p', 'rc__text', `${weapon} · 궁극기 「${def.ultimate.name}」`))
  card.append(main)

  // 빌려주는 힘: 첫 조각부터 켜진다
  const lend = el('section', 'rc__section')
  lend.append(el('div', 'rc__label', '빌려주는 힘 · 첫 조각부터'), el('p', 'rc__text', lendText(god, 1)))
  card.append(lend)

  if (path) {
    const lore = el('section', 'rc__section')
    lore.append(el('p', 'rc__type', path.lore))
    card.append(lore)
  }
  return card
}

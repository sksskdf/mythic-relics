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

/** 흔적 카드에 보일 지금 상태: 흔적의 형편, 깨우는 신 */
export interface TraceCardContext {
  state: TraceState
  /** 잠잠한 흔적이 응답하는 때 (「성소 화로에서 원정을 마치면 응답한다」, E305-03) */
  sealedText: string
  /** 지금 깨우는 신 (다른 신을 깨우는 중일 때 이름을 댄다) */
  waking: God | null
}

/**
 * 신의 흔적 카드 (E238, `DESIGN.md` 4.2.2): 컴퓨터는 흔적에 커서를 올리면, 휴대폰은 주인공이 흔적에 다가가면 뜬다
 * (톡은 그리로 걷는 지시일 뿐이다. 한 번 읽은 흔적은 곁에 가만히 서야 다시 뜬다. 띄우는 규칙은 `HoverCards`, E307).
 * 무엇을 고르는지 알고 고르게 그 신의 무기·궁극기 한 줄과 빌려주는 힘 한 줄, 지금 할 일을 보인다.
 * 글은 처음 보는 사람이 읽는다 (E307 손 QA): 「손과 심장」 같은 자리 이름 대신 얻는 것(무기·궁극기)을, 지금 할 일은 무엇을 하면 무엇이 되는지를 적는다 (`TRACE_WORDS`)
 * 화면이 낮은 휴대폰에서는 주인공을 가리지 않게 아래쪽 단락(이야기)부터 접힌다 (`RelicTooltip`)
 */
/** 흔적 카드의 정해진 글 */
export const TRACE_WORDS = {
  /** 응답하는 흔적의 「지금 할 일」: 다가가면 싸움이 붙고, 이기면 그 신의 힘을 빌린다 */
  open: '다가가면 지키는 것들이 깨어난다 · 물리치면 힘을 빌린다',
  /** 깨우면 얻는 것 (손 = 무기, 심장 = 궁극기) */
  gain: '깨우면 얻는 무기와 궁극기',
  /** 빌려주는 힘 (흔적의 무리를 물리치면 바로) */
  lend: '흔적에서 빌리는 힘',
} as const

/** 흔적 카드의 「지금 할 일」 한 줄: 흔적의 형편마다 */
export function traceNow(god: God, ctx: TraceCardContext): string {
  const path = wakeDef(god)
  if (ctx.state === 'awake') return '깨어난 신'
  if (ctx.state === 'waking') return `${path ? josa(path.guardian.name, '을') : '수호자를'} 쓰러뜨리면 깨어난다`
  if (ctx.state === 'later') return LATER_TEXT
  if (ctx.state === 'busy' && ctx.waking) return `${josa(godDef(ctx.waking).name, '이')} 깨어난 뒤에 응답한다`
  return ctx.state === 'sealed' ? ctx.sealedText : TRACE_WORDS.open
}

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

  card.append(el('div', `rc__place${ctx.state === 'open' ? ' rc__place--ground' : ''}`, traceNow(god, ctx)))

  // 깨우면 얻는 것: 손(무기)과 심장(궁극기)
  const weapon = levelGains(god, 1).find((g) => g.kind === 'power')?.text ?? ''
  const main = el('section', 'rc__section')
  main.append(el('div', 'rc__label', TRACE_WORDS.gain), el('p', 'rc__text', `${weapon} · 궁극기 「${def.ultimate.name}」`))
  card.append(main)

  // 빌려주는 힘: 흔적의 무리를 물리치면 켜진다
  const lend = el('section', 'rc__section')
  lend.append(el('div', 'rc__label', TRACE_WORDS.lend), el('p', 'rc__text', lendText(god, 1)))
  card.append(lend)

  if (path) {
    const lore = el('section', 'rc__section')
    lore.append(el('p', 'rc__type', path.lore))
    card.append(lore)
  }
  return card
}

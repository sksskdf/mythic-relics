import { wakeDef, LATER_TEXT, type TraceState } from '../data/wake'
import { type God, godDef } from '../relics/data'
import { classIcon } from './classIcons'
import { josa } from './josa'

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.className = className
  if (text !== undefined) e.textContent = text
  return e
}

/** 흔적 카드에 보일 지금 상태: 흔적의 형편과 그 흔적에서 이미 힘을 골랐는가 (다른 신을 깨우는 중이어도 흔적은 응답하니 차례를 말하는 글은 없다, 2026-11-22) */
export interface TraceCardContext {
  state: TraceState
  /** 그 흔적의 카드에서 이미 골랐다 (P5): 다시 서면 카드 없이 지키는 것들만 깨어난다 */
  claimed?: boolean
}

/** 흔적 카드의 정해진 글 (P5 손 QA: 옛 규칙 「물리치면 힘을 빌린다」와 숫자는 걷었다) */
export const TRACE_WORDS = {
  /** 아직 고르지 않은 흔적: 고리 안에 가만히 서면 그 신이 힘 셋을 내민다 */
  open: '고리 안에 서면 힘 셋을 내민다',
  /** 이미 고른 흔적 (무리에 지고 다시 섬): 지키는 것들만 다시 깨어난다 */
  again: '고리 안에 서면 지키는 것들이 다시 깨어난다',
} as const

/** 흔적 카드의 「지금 할 일」 한 줄: 흔적의 형편마다 */
export function traceNow(god: God, ctx: TraceCardContext): string {
  const path = wakeDef(god)
  if (ctx.state === 'awake') return '깨어난 신'
  if (ctx.state === 'waking') return `${path ? josa(path.guardian.name, '을') : '수호자를'} 쓰러뜨리면 깨어난다`
  if (ctx.state === 'later') return LATER_TEXT
  return ctx.claimed ? TRACE_WORDS.again : TRACE_WORDS.open
}

/**
 * 신의 흔적 카드 (E238, `DESIGN.md` 4.2.2): 컴퓨터는 흔적에 커서를 올리면, 휴대폰은 주인공이 흔적에 다가가면 뜬다
 * (톡은 그리로 걷는 지시일 뿐이다. 한 번 읽은 흔적은 곁에 가만히 서야 다시 뜬다. 띄우는 규칙은 `HoverCards`, E307).
 * 그 신의 이름, 지금 할 일 한 줄, 이야기만 둔다: 무엇을 얻는지는 서면 뜨는 힘 카드가 보인다 (P5, 숫자 없음)
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
  names.append(el('div', 'rc__name', def.name), el('div', 'rc__type', path?.trace.name ?? `${def.name}의 흔적`))
  head.append(frame, names)
  card.append(head)

  card.append(el('div', `rc__place${ctx.state === 'open' ? ' rc__place--ground' : ''}`, traceNow(god, ctx)))

  if (path) {
    const lore = el('section', 'rc__section')
    lore.append(el('p', 'rc__type', path.lore))
    card.append(lore)
  }
  return card
}

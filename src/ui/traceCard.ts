import { awakenDef, HUNT_KILLS, type TraceState } from '../data/awaken'
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
  /** 잠잠한 흔적이 응답하는 주신 단계 */
  sealedUntil: number
  /** 지금 깨우는 신 (다른 신을 깨우는 중일 때 이름을 댄다) */
  waking: God | null
  fragments: number
  hunt: number
}

/**
 * 신의 흔적 카드 (E238, MYTHBUILD.md 3.2): 커서를 올리거나 톡 누르면 뜬다. 무엇을 고르는지 알고 고르게
 * 그 신의 무기·궁극기 한 줄과 빌려주는 힘 한 줄, 지금 할 일을 보인다.
 */
export function traceCard(god: God, ctx: TraceCardContext): HTMLElement {
  const def = godDef(god)
  const path = awakenDef(god)
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
          : `조각 1/3 · 사냥 ${ctx.hunt}/${HUNT_KILLS}`
        : ctx.state === 'busy' && ctx.waking
          ? `${josa(godDef(ctx.waking).name, '이')} 깨어난 뒤에 응답한다`
          : ctx.state === 'sealed'
            ? `손에 쥔 신이 ${ctx.sealedUntil}단계가 되면 응답한다 (성소의 전설)`
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

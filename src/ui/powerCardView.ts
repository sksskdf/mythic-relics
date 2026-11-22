/** 힘 카드의 한 줄 (P5): 누를 것 하나 */
export interface PowerRow {
  id: string
  /** 종류 표시: 무기 · 궁극기 · 힘 */
  kind: string
  name: string
  /** 화면에서 무엇이 달라지나 한 줄 */
  line: string
  /** 그 힘의 신의 색 */
  color: string
  /** 고르면 켜지는 조합의 이름 */
  combo?: string
  /** 칸이 차서 가진 힘으로만 남는다 */
  spare?: boolean
}

/** 힘 카드에 보일 것: 머리줄(그 신의 이름과 한마디)과 세로로 셋 */
export interface PowerCardView {
  /** 머리줄의 이름 (흔적·빛의 신) */
  title: string
  /** 짧은 한마디 */
  say: string
  color: string
  icon?: string
  rows: readonly PowerRow[]
}

const escape = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

/**
 * 힘 카드의 마크업 (DOM 없이 글로 짓는다: 게임의 `PowerCard`와 잘린 것 검사 `tests/cuts.test.mjs`가 같은 것을 쓴다).
 * 줄마다 단추 하나, 닫기 단추는 없다 (골라야 닫힌다)
 */
export function powerCardMarkup(view: PowerCardView): string {
  const head = `<div class="power-card__head" style="--god:${escape(view.color)}">${view.icon ? `<img src="${escape(view.icon)}" alt="">` : ''}<div><b class="power-card__title">${escape(view.title)}</b><span class="power-card__say">${escape(view.say)}</span></div></div>`
  const rows = view.rows
    .map((r) => {
      const notes = [r.combo ? `<span class="power-card__combo">조합 · ${escape(r.combo)}</span>` : '', r.spare ? '<span class="power-card__spare">칸이 차서 가진 힘으로 남는다</span>' : ''].join('')
      return `<button type="button" class="power-card__row" data-power="${escape(r.id)}" style="--god:${escape(r.color)}"><span class="power-card__kind">${escape(r.kind)}</span><b>${escape(r.name)}</b><small>${escape(r.line)}</small>${notes}</button>`
    })
    .join('')
  return `${head}<div class="power-card__rows">${rows}</div>`
}

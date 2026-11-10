import { CARD_HOLD } from '../data/moments'

/** 카드 크기: 오른쪽 위 작은 카드, 가운데 큰 카드, 새 탭 (가운데 떴다가 메뉴 단추로 날아 들어간다) */
export type GainsSize = keyof typeof CARD_HOLD

/** 얻은 것 카드 한 장 */
export interface GainsCard {
  kind: string
  title: string
  color: string
  icon: string
  lines: readonly string[]
  size: GainsSize
  /** 줄에 선 같은 종류와 한 장으로 묶어도 되는 카드인가 (장비의 일, `src/data/moments.ts`의 BUNDLED). 줄마다 설명이 있는 카드는 묶지 않는다 */
  bundles?: boolean
  /** 한 장으로 묶인 카드들의 이름 (둘 이상일 때만). 묶인 카드는 「장비 셋」처럼 뜨고 줄마다 이름 하나 */
  bundle?: string[]
}

/** 카드가 화면에 떠 있는 시간 (ms): 이 뒤에는 사라져 있다. 작은 카드는 5초에서 줄였다 (E307). `hud.css`의 움직임이 이 길이를 받는다 */
export const GAINS_LIFE: Readonly<Record<GainsSize, number>> = { card: 3200, big: 5000, tab: 3600 }
/**
 * 뒤에 기다리는 카드가 있을 때 장비 카드(`bundles`)가 자리를 지키는 시간 (ms): 줄이 밀리면 빨리 넘긴다.
 * 이름과 수치뿐이라 한눈에 읽힌다. 설명이 달린 작은 카드(자동화·탈것·맹세를 걺·깊이·신이 열림)는 서두르지 않는다
 */
export const GAINS_RUSH_MS = 1200
/** 묶인 카드의 줄 수: 이름이 이보다 많으면 마지막 줄은 「외 N」 (카드가 길어져 싸움을 덮지 않게) */
const BUNDLE_LINES = 3

const COUNT_WORDS = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열']

/** 「장비 셋」의 셋: 열까지는 우리말 수, 넘으면 숫자 */
export const countWord = (n: number): string => COUNT_WORDS[n] ?? `${n}개`

/**
 * 화면에 그릴 모양: 묶인 카드는 이름 자리에 「종류 + 수」, 줄에 묶인 이름들.
 * 종류 자리에는 가운뎃점 뒤의 말만 남긴다 (「더 좋은 장비 · 가방」 → 「가방」 위에 「더 좋은 장비 셋」: 같은 말을 두 번 하지 않는다)
 */
export function gainsView(card: GainsCard): { kind: string; title: string; lines: readonly string[] } {
  const names = card.bundle
  if (!names || names.length < 2) return { kind: card.kind, title: card.title, lines: card.lines }
  const [what, ...rest] = card.kind.split(' · ')
  const lines = names.length > BUNDLE_LINES ? [...names.slice(0, BUNDLE_LINES - 1), `외 ${countWord(names.length - BUNDLE_LINES + 1)}`] : names
  return { kind: rest.join(' · '), title: `${what} ${countWord(names.length)}`, lines }
}

/**
 * 얻은 것 카드의 줄 (E23-01 → E307 카드 예산). 카드는 한 장씩 차례로 뜬다:
 * - 같은 종류의 장비 카드(`bundles`)가 줄에 서 있으면 한 장으로 묶는다 (「장비 셋」): 희귀 장비 넷을 이어 주워도 카드는 두 장
 * - 뒤에 기다리는 카드가 있으면 장비 카드는 빨리 넘긴다 (`GAINS_RUSH_MS`). 설명이 달린 작은 카드·큰 카드·새 탭 카드는 제 시간을 다 채운다
 *   (귀환마다 귀환 큰 카드 앞에 서는 자동화 카드의 설명 두 줄이 1초 만에 지나가지 않게)
 * - 정보 화면·일시 정지가 화면을 덮은 동안에는 넘기지 않는다 (뒤에서 못 본 채 지나가지 않게). 닫으면 밀린 같은 종류는 묶인 한 장으로 뜬다.
 *   덮일 때 떠 있던 작은 카드는 본 것으로 치고(「더 좋은 장비」를 보고 창을 연 것이다), 새 탭 카드도 그렇다(카드가 부른 대로 메뉴 단추를 누른 것이고,
 *   단추와 탭의 표시는 그 탭을 볼 때까지 남는다). 제 시간을 못 채운 큰 카드만 닫은 뒤 다시 뜬다
 * 시계는 부르는 쪽이 넘긴다 (ms). 언제 다시 볼지(타이머)와 그리기는 `Hud`가 한다
 */
export class GainsLine {
  /** 기다리는 카드 (앞에서부터 뜬다) */
  readonly waiting: GainsCard[] = []
  /** 지금 떠 있는 카드와 띄운 때 */
  private current: GainsCard | null = null
  shownAt = -Infinity

  /** 카드를 줄에 세운다. 묶어도 되는 카드이고 같은 종류가 기다리고 있으면 그 카드에 묶는다 */
  push(card: GainsCard): void {
    const same = card.bundles && card.size === 'card' ? this.waiting.find((w) => w.bundles && w.size === 'card' && w.kind === card.kind) : undefined
    if (!same) {
      this.waiting.push({ ...card })
      return
    }
    same.bundle ??= [same.title]
    same.bundle.push(...(card.bundle ?? [card.title]))
  }

  /** 지금 카드가 다음 카드에 자리를 내주기까지 (ms) */
  get hold(): number {
    if (!this.current) return 0
    if (this.current.bundles && this.current.size === 'card' && this.waiting.length > 0) return GAINS_RUSH_MS
    return CARD_HOLD[this.current.size] * 1000
  }

  /** 다음 카드를 띄울 수 있을 때까지 남은 시간 (ms, 0 이하면 지금). 기다리는 카드가 없으면 null */
  wait(now: number): number | null {
    if (this.waiting.length === 0) return null
    return this.shownAt + this.hold - now
  }

  /** 다음 카드를 꺼내 지금 카드로 삼는다 */
  take(now: number): GainsCard {
    this.current = this.waiting.shift()!
    this.shownAt = now
    return this.current
  }

  /** 줄에 선 카드가 있거나, 지금 카드가 아직 자리를 지키는 중인가 */
  busy(now: number): boolean {
    return this.waiting.length > 0 || now - this.shownAt < this.hold
  }

  /** 지금 떠 있는 카드의 크기. 다 사라졌으면 null */
  showing(now: number): GainsSize | null {
    return this.current && now - this.shownAt <= GAINS_LIFE[this.current.size] ? this.current.size : null
  }

  /**
   * 화면이 덮였다 (정보 화면·일시 정지): 떠 있던 카드는 내린다.
   * 작은 카드와 새 탭 카드는 본 것으로 친다. 큰 카드가 제 시간을 못 채웠으면 줄 맨 앞으로 되돌려, 닫은 뒤 다시 뜨게 한다
   */
  cover(now: number): void {
    const card = this.current
    this.current = null
    if (card && card.size === 'big' && now - this.shownAt < CARD_HOLD.big * 1000) this.waiting.unshift(card)
    this.shownAt = -Infinity
  }
}

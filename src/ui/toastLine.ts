import { countWord } from './gainsLine'

/** 작은 알림이 화면에 떠 있는 시간 (ms). `hud.css`의 hud-toast 움직임 길이와 같다 */
export const TOAST_LIFE = 1800
/** 뒤에 기다리는 알림이 있을 때 알림 하나가 자리를 지키는 시간 (ms): 읽을 틈은 주되 줄이 밀리지 않게 (밀린 장비 카드와 같은 1.2초) */
export const TOAST_HOLD = 1200

/** 묶인 알림의 글: 수(「둘」·「셋」)를 받아 만든다 (`src/data/moments.ts`의 TOAST_BUNDLES) */
export type ToastBundle = (count: string) => string

interface Toast {
  kind: string
  text: string
  count: number
}

/** 화면 위의 상자 (px) */
export interface ScreenBox {
  top: number
  bottom: number
  left: number
  right: number
}

/**
 * 알림을 땅의 카드 위로 얼마나 올릴까 (px, E307). toast는 올리지 않았을 때 알림의 상자, card는 떠 있는 땅의 카드(없으면 null).
 * 카드에 가리면 카드 위 끝에서 gap만큼 위로 올리고, 올릴 자리가 화면 밖이면 그대로 둔다.
 * held는 이 알림이 이미 올라가 있는 높이: 떠 있는 알림은 올라가기만 한다. 읽는 도중에 카드가 닫혀도(걷기 시작·몇 초 뒤)
 * 190px 아래 제자리로 뛰어내리지 않는다. 새 알림은 held 0으로 다시 잰다
 */
export function toastLift(toast: ScreenBox, card: ScreenBox | null, gap: number, held = 0): number {
  let lift = 0
  if (card) {
    const hidden = card.top < toast.bottom && card.bottom > toast.top && card.left < toast.right && card.right > toast.left
    if (hidden && card.top - gap - (toast.bottom - toast.top) >= 0) lift = Math.round(toast.bottom - (card.top - gap))
  }
  return Math.max(lift, held)
}

/**
 * 작은 알림의 줄 (E307). 알림 자리는 한 줄이라, 같은 때 온 알림이 서로 덮으면 마지막 하나만 보였다
 * (한자리의 장비 넷을 주우면 「낌」 넷 가운데 하나만, 「더 좋은 장비」는 뒤따른 「합치기」에 바로 덮였다).
 * - 알림은 온 차례대로 하나씩 뜨고, 뒤에 기다리는 알림이 있으면 `TOAST_HOLD` 뒤에 자리를 내준다 (없으면 제 시간을 다 떠 있다)
 * - 기다리는 동안 같은 종류가 또 오면 한 줄로 묶는다 (「장비 셋 · 낌」). 묶는 글이 없는 종류는 새 글이 기다리던 글을 바꾼다
 *   (줄에는 종류마다 하나만 서니 밀려도 몇 초다)
 * 시계는 부르는 쪽이 넘긴다 (ms). 언제 다시 볼지(타이머)와 그리기는 `Hud`가 한다
 */
export class ToastLine {
  /** 기다리는 알림 (앞에서부터 뜬다) */
  readonly waiting: Toast[] = []
  private shownAt = -Infinity

  /** 알림을 줄에 세운다. kind는 묶는 단위(순간 id), bundle은 같은 종류를 묶은 글 */
  push(kind: string, text: string, bundle?: ToastBundle): void {
    const same = this.waiting.find((w) => w.kind === kind)
    if (!same) {
      this.waiting.push({ kind, text, count: 1 })
      return
    }
    same.count += 1
    same.text = bundle ? bundle(countWord(same.count)) : text
  }

  /** 다음 알림을 띄울 수 있을 때까지 남은 시간 (ms, 0 이하면 지금). 기다리는 알림이 없으면 null */
  wait(now: number): number | null {
    return this.waiting.length === 0 ? null : this.shownAt + TOAST_HOLD - now
  }

  /** 다음 알림을 꺼낸다 (그 글) */
  take(now: number): string {
    this.shownAt = now
    return this.waiting.shift()!.text
  }
}

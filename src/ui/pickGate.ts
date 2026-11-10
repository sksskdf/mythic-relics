/** 고르는 카드가 뜬 뒤 이만큼(ms)은 누름을 받지 않는다: 싸우던 클릭·톡이 방금 뜬 카드에 떨어져 고른 것이 되지 않게 (E307) */
export const PICK_ARM_MS = 500

/**
 * 고르는 카드의 누름 규칙 (E307, 두 갈래·귀환·맹세 출발 카드가 함께 쓴다). 고른 것으로 치는 누름은 하나뿐이다:
 * 카드가 뜨고 `PICK_ARM_MS`가 지난 뒤에, 카드 위에서 시작된 누름.
 * - 뜬 직후의 누름은 버린다 (싸우며 이어 누르던 클릭·톡)
 * - 카드가 뜨기 전에 게임 화면에서 시작된 누름은, 손을 뗄 때 click이 카드에 떨어져도 버린다 (카드 위에서 시작되지 않았다)
 * - 코드가 낸 click(봇의 `answerSwap`, 점검 스크립트의 `el.click()`)은 사람 손이 아니니 그대로 받는다
 * - 누름 없이 온 click(키보드의 Enter·Space, 화면 읽기 도구)은 잠금이 풀린 뒤에 받는다
 * 새 단추나 두 번 누르기를 더하지 않는다. 언제 열리는지(타이머)와 DOM은 `PickCardGuard`가 맡는다
 */
export class PickGate {
  private armed = false
  private pressed = false

  /** 카드가 떴다: 다시 잠근다 */
  show(): void {
    this.armed = false
    this.pressed = false
  }

  /** 뜬 뒤 `PICK_ARM_MS`가 지났다: 이제부터 시작된 누름을 받는다 */
  arm(): void {
    this.armed = true
  }

  /** 카드 위에서 누름이 시작됐다 */
  press(): void {
    this.pressed = this.armed
  }

  /** 이 click을 고른 것으로 받는가 (byCode: 코드가 낸 click, keyed: 누름 없이 온 click). 한 번 물으면 그 누름은 쓴 것이다 */
  take(byCode = false, keyed = false): boolean {
    const ok = byCode || this.pressed || (keyed && this.armed)
    this.pressed = false
    return ok
  }
}

/**
 * 고르는 카드 하나에 누름 규칙을 건다: 띄우면 잠깐 흐리게(`is-arming`, pickCard.css) 두었다가 누름을 받는다.
 * 흐린 동안 단추는 누름을 받지 않고 카드 판이 대신 받아, 그 톡이 뒤의 게임 화면(이동·공격 지시)으로 새지 않는다
 */
export class PickCardGuard {
  private readonly gate = new PickGate()
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private readonly root: HTMLElement) {
    // 카드 위에서 시작된 누름만 센다 (안쪽 단추보다 먼저 듣는다)
    root.addEventListener('pointerdown', () => this.gate.press(), true)
  }

  /** 카드를 띄운다 */
  open(): void {
    this.gate.show()
    this.root.classList.add('is-arming')
    this.root.hidden = false
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      this.gate.arm()
      this.root.classList.remove('is-arming')
    }, PICK_ARM_MS)
  }

  /** 카드를 닫는다 */
  close(): void {
    this.root.hidden = true
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  /** 단추에 고르는 일을 건다: 규칙을 지킨 누름일 때만 act */
  on(button: HTMLElement, act: () => void): void {
    button.addEventListener('click', (e) => {
      e.stopPropagation()
      // detail이 0인 click은 포인터가 낸 것이 아니다 (키보드·화면 읽기 도구)
      if (this.gate.take(!e.isTrusted, e.detail === 0)) act()
    })
  }
}

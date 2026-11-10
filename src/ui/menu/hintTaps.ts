/**
 * 손가락으로 누른 힌트 칸의 말풍선을 언제 띄울지 정한다 (E307, 정보 화면).
 * 손가락에는 커서가 없어 누르는 것이 곧 「이게 무엇인지」 묻는 일이다. 그런데 누르면 일을 하는 단추에까지 설명을 띄우면
 * 탭을 바꿀 때마다 그 탭 설명이 새 내용의 첫 줄을 덮고, 다시 그려 떼어진 옛 단추의 설명이 화면 구석에 뜬다.
 * - 설명만 있는 칸(단추가 아니거나 눌 수 없는 단추): 손을 떼는 순간 띄운다. 눌 수 없는 단추에는 click이 오지 않는다.
 * - 일을 하는 단추: 그 톡의 click이 단추의 일을 다 마친 뒤에 본다. 그사이 창을 다시 그렸으면(탭 바꾸기·행동 단추) 띄우지 않고,
 *   그대로면(「한 번 더 누르면」의 첫 톡, 아직 익히지 못하는 마디) 띄운다.
 * - 다른 곳에서 누른 채 끌려 와 뗀 손가락은 띄우지 않는다.
 * 칸(T)은 무엇이든 된다. 정보 화면은 그 칸의 「띄우기」 함수를 넣는다.
 */
export class HintTaps<T> {
  /** 지금 손가락이 누르고 있는 힌트 칸과, 누를 때의 창 그리기 번호 */
  private held: { target: T; drawn: number } | null = null

  /** 창 어디든 손가락이 닿았다(또는 누름이 취소됐다): 앞 톡에서 남은 것을 잊는다 */
  begin(): void {
    this.held = null
  }

  /** 손가락이 힌트 칸을 눌렀다 (drawn: 지금 창 그리기 번호) */
  press(target: T, drawn: number): void {
    this.held = { target, drawn }
  }

  /** 그 칸에서 손가락을 뗐다 (acts: 누르면 일을 하는 단추인가). 지금 띄울 것이면 true */
  lift(target: T, acts: boolean): boolean {
    if (this.held?.target !== target || acts) return false
    this.held = null
    return true
  }

  /** 그 톡의 click이 단추를 거쳐 창까지 올라왔다 (drawn: 지금 창 그리기 번호). 힌트를 띄울 칸이 있으면 그 칸 */
  click(drawn: number): T | null {
    const held = this.held
    this.held = null
    return held && held.drawn === drawn ? held.target : null
  }
}

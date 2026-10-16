/**
 * 게임 동작. 조작 최소화 원칙에 따라 플레이어가 직접 하는 동작은 이동 하나뿐이다.
 * 게임 로직은 키가 아니라 이 동작 이름만 보고 판단하므로, 나중에 터치를 붙일 때는 바인딩만 추가하면 된다.
 */
export type Action = 'move'

/** 입력 장치의 버튼 이름. 키보드는 KeyboardEvent.code, 마우스는 Mouse0(왼쪽)·Mouse2(오른쪽). */
export type InputCode = string

export type Bindings = Readonly<Record<InputCode, Action>>

/** 기본 조작: 마우스 왼쪽·오른쪽 어느 버튼이든 클릭한 곳으로 이동 */
export const DEFAULT_BINDINGS: Bindings = {
  Mouse0: 'move',
  Mouse2: 'move',
}

/** 마우스 버튼 번호를 입력 이름으로 바꾼다. */
export function mouseCode(button: number): InputCode {
  return `Mouse${button}`
}

/** 입력 이름에 묶인 동작을 찾는다. */
export function resolveAction(bindings: Bindings, code: InputCode): Action | undefined {
  return bindings[code]
}

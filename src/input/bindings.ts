/**
 * 게임 동작. 게임 로직은 키가 아니라 이 동작 이름만 보고 판단한다.
 * 나중에 게임패드나 터치를 붙일 때는 바인딩만 추가하면 된다.
 */
export type Action =
  | 'move'
  | 'attack'
  | 'dodge'
  | 'skill1'
  | 'skill2'
  | 'skill3'
  | 'skill4'
  | 'ultimate'

/** 입력 장치의 버튼 이름. 키보드는 KeyboardEvent.code, 마우스는 Mouse0(왼쪽)·Mouse2(오른쪽). */
export type InputCode = string

export type Bindings = Readonly<Record<InputCode, Action>>

/** 기본 조작: 우클릭 이동, 좌클릭 기본 공격, Space 회피, Q/W/E/R 유물 스킬, F 궁극기 */
export const DEFAULT_BINDINGS: Bindings = {
  Mouse2: 'move',
  Mouse0: 'attack',
  Space: 'dodge',
  KeyQ: 'skill1',
  KeyW: 'skill2',
  KeyE: 'skill3',
  KeyR: 'skill4',
  KeyF: 'ultimate',
}

export const SKILL_ACTIONS = ['skill1', 'skill2', 'skill3', 'skill4'] as const

/** 마우스 버튼 번호를 입력 이름으로 바꾼다. */
export function mouseCode(button: number): InputCode {
  return `Mouse${button}`
}

/** 입력 이름에 묶인 동작을 찾는다. */
export function resolveAction(bindings: Bindings, code: InputCode): Action | undefined {
  return bindings[code]
}

/** 동작에 묶인 키 이름을 화면 표시용으로 돌려준다 (예: KeyQ → Q). */
export function keyLabel(bindings: Bindings, action: Action): string {
  const code = Object.keys(bindings).find((c) => bindings[c] === action)
  if (!code) return ''
  if (code.startsWith('Key')) return code.slice(3)
  if (code === 'Mouse0') return '좌클릭'
  if (code === 'Mouse2') return '우클릭'
  return code
}

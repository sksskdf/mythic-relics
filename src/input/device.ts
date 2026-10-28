/**
 * 휴대폰·태블릿 알아보기 (E235). 주 포인터가 손가락이면 터치 기기다. 주소에 ?touch를 붙이면 컴퓨터에서도 켜 볼 수 있다.
 * 터치 기기는 세로 화면만 맞춘다 (사용자 결정 2026-10-28): 가로로 들면 돌려 달라고 안내한다.
 */
export function detectTouch(search: string, coarse: boolean): boolean {
  return new URLSearchParams(search).has('touch') || coarse
}

/** 이 브라우저의 주 포인터가 손가락인가 */
export function coarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
}

/** 터치 기기를 가로로 들었나 (세로로 돌려 달라고 안내할 때) */
export function wantsPortrait(touch: boolean, width: number, height: number): boolean {
  return touch && width > height
}

/** 지금 화면이 휴대폰 조작인가 (main이 html에 단 is-touch). 커서가 없어 올려 보기 대신 누르기로 보여 줄 때 */
export function touchUi(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('is-touch')
}

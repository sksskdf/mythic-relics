/**
 * 휴대폰·태블릿 알아보기 (E235). 주 포인터가 손가락이면 터치 기기다. 주소에 ?touch를 붙이면 컴퓨터에서도 켜 볼 수 있다.
 * 휴대폰은 세로 화면만 맞춘다 (사용자 결정 2026-10-28): 가로로 들면 돌려 달라고 안내한다.
 * 태블릿·터치 노트북(짧은 변이 PHONE_SHORT_SIDE 이상)은 가로로 두어도 컴퓨터 배치에 손가락 조작으로 한다 (기본안)
 */
export function detectTouch(search: string, coarse: boolean): boolean {
  return new URLSearchParams(search).has('touch') || coarse
}

/** 이 브라우저의 주 포인터가 손가락인가 */
export function coarsePointer(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches
}

/** 화면 짧은 변(CSS px)이 이보다 작으면 휴대폰으로 본다 */
export const PHONE_SHORT_SIDE = 600

/** 휴대폰을 가로로 들었나 (세로로 돌려 달라고 안내할 때). 태블릿은 가로로 두어도 된다 */
export function wantsPortrait(touch: boolean, width: number, height: number): boolean {
  return touch && width > height && Math.min(width, height) < PHONE_SHORT_SIDE
}

/** 지금 화면이 휴대폰 조작인가 (main이 html에 단 is-touch). 커서가 없어 올려 보기 대신 누르기로 보여 줄 때 */
export function touchUi(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('is-touch')
}

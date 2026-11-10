/**
 * 명암비 (E307): 두 색이 서로 얼마나 구분되는가 (WCAG 2의 상대 휘도와 명암비, 1~21).
 * 지도 표시처럼 작은 그림이 바탕에 묻히지 않는지 수치로 볼 때 쓴다. 표시·그림은 3:1이 기준이다.
 */

/** 색 (0xRRGGBB 숫자나 "#rrggbb" 글) → 숫자 */
function rgb(color: number | string): number {
  return typeof color === 'number' ? color : parseInt(color.replace('#', ''), 16)
}

/** 상대 휘도 0(검정)~1(흰색) */
export function luminance(color: number | string): number {
  const c = rgb(color)
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel((c >> 16) & 255) + 0.7152 * channel((c >> 8) & 255) + 0.0722 * channel(c & 255)
}

/** 두 색의 명암비 (1 = 같은 밝기, 21 = 검정과 흰색) */
export function contrast(a: number | string, b: number | string): number {
  const la = luminance(a)
  const lb = luminance(b)
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

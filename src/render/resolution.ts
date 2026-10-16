/** 저해상도 렌더링의 기준 세로 픽셀 수. 1920×1080 화면에서 정확히 4배 확대된다. */
export const TARGET_RENDER_HEIGHT = 270

export interface RenderSize {
  /** 저해상도 렌더 타깃의 가로 픽셀 수 */
  width: number
  /** 저해상도 렌더 타깃의 세로 픽셀 수 */
  height: number
  /** 화면에 그릴 때의 정수 확대 배율 */
  scale: number
}

/**
 * 화면 크기에 맞는 저해상도 렌더 크기를 계산한다.
 * 확대 배율을 정수로 고정해서, 모든 픽셀이 같은 크기로 또렷하게 보이게 한다.
 */
export function computeRenderSize(
  screenWidth: number,
  screenHeight: number,
  targetHeight = TARGET_RENDER_HEIGHT,
): RenderSize {
  const safeWidth = Math.max(1, Math.floor(screenWidth))
  const safeHeight = Math.max(1, Math.floor(screenHeight))
  const scale = Math.max(1, Math.round(safeHeight / targetHeight))
  return {
    width: Math.ceil(safeWidth / scale),
    height: Math.ceil(safeHeight / scale),
    scale,
  }
}

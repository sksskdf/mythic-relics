/** 저해상도 렌더링의 기준 세로 픽셀 수. 1920×1080 화면에서 정확히 4배 확대된다. */
export const TARGET_RENDER_HEIGHT = 270

/**
 * 픽셀 하나가 덮는 월드 크기(미터). 시야 16m를 270픽셀로 그리던 프로토타입의 밀도.
 * 확대·축소해도 이 밀도를 지키도록 렌더 해상도를 함께 바꾼다. (멀리 볼 때 복셀이 한 픽셀보다 작아져 뭉개지지 않게)
 */
export const METERS_PER_PIXEL = 16 / TARGET_RENDER_HEIGHT

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

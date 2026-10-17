/** 가장 가까이 볼 때(시야 12m)의 렌더 세로 픽셀 수. 이 때의 픽셀 크기가 그래픽의 기준이다. */
export const BASE_VIEW_HEIGHT = 12
export const BASE_RENDER_HEIGHT = 180
/** ?res= 를 주지 않았을 때 쓰는 기본값 (점검용 옵션과 호환) */
export const TARGET_RENDER_HEIGHT = BASE_RENDER_HEIGHT

/**
 * 축소할 때 렌더 해상도를 얼마나 따라 올릴지 (0~1).
 * - 0: 화면에 보이는 픽셀 크기가 시야와 상관없이 같다. 대신 멀리 볼수록 복셀이 픽셀보다 작아져 뭉개진다.
 * - 1: 픽셀 하나가 덮는 월드 크기가 같다. 대신 멀리 볼수록 화면의 픽셀이 작아져 더 매끈(선명)해진다.
 * 기준(가장 크게 확대한 모습)의 픽셀 크기를 최대한 지키면서 뭉개지지 않을 만큼만 올린다.
 */
export const ZOOM_DETAIL = 0.3

/**
 * 시야 높이(m)에 맞는 렌더 세로 픽셀 수.
 * 시야 12m에서 baseHeight, 넓어질수록 (시야 / 12)^ZOOM_DETAIL 배로 천천히 늘어난다.
 */
export function renderHeightFor(viewHeight: number, baseHeight = BASE_RENDER_HEIGHT): number {
  return Math.round(baseHeight * Math.pow(viewHeight / BASE_VIEW_HEIGHT, ZOOM_DETAIL))
}

export interface RenderSize {
  /** 저해상도 렌더 타깃의 가로 픽셀 수 */
  width: number
  /** 저해상도 렌더 타깃의 세로 픽셀 수 */
  height: number
  /** 화면에 그릴 때의 확대 배율 (정수가 아닐 수 있다. 세로는 화면에 꼭 맞는다) */
  scale: number
}

/**
 * 화면 크기에 맞는 저해상도 렌더 크기를 계산한다.
 * 세로 픽셀 수는 targetHeight로 고정하고(= 픽셀 밀도 고정), 화면 세로에 꼭 맞도록 배율을 정한다.
 * 가로는 화면을 다 덮도록 올림한다. 정수가 아닌 배율에서도 픽셀이 고르게 보이도록 합성 단계에서 경계만 부드럽게 다듬는다.
 */
export function computeRenderSize(screenWidth: number, screenHeight: number, targetHeight = TARGET_RENDER_HEIGHT): RenderSize {
  const safeWidth = Math.max(1, Math.floor(screenWidth))
  const safeHeight = Math.max(1, Math.floor(screenHeight))
  const height = Math.max(1, Math.round(targetHeight))
  const scale = safeHeight / height
  return {
    width: Math.max(1, Math.ceil(safeWidth / scale)),
    height,
    scale,
  }
}

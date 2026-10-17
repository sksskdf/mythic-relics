/** ?res= 로 저해상도 기준 높이를 정할 때 쓰는 기본값 (시야 16m를 이 픽셀 수로 그린다) */
export const TARGET_RENDER_HEIGHT = 240

/**
 * 픽셀 하나가 덮는 월드 크기(미터). 가장 가까이 볼 때(시야 12m)를 180픽셀로 그리는 밀도다.
 * 확대·축소해도 이 밀도를 그대로 지키므로, 복셀 하나는 언제나 같은 수의 픽셀로 그려지고 그림이 달라지지 않는다.
 * 보이는 범위가 바뀌면 그 그림을 화면에 맞게 키우거나 줄일 뿐이다.
 */
export const METERS_PER_PIXEL = 12 / 180

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

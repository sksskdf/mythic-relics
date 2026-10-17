/** 화면 세로 방향에 보이는 범위(미터)의 기본값과 확대·축소 한계 */
export const VIEW_HEIGHT = { initial: 19, min: 12, max: 34 }

export interface Settings {
  /** 확대·축소 정도: 화면 세로 방향에 보이는 범위 (미터) */
  viewHeight: number
}

// 기본 시야를 19m로 바꾸며 키를 새로 했다. (예전 설정에 남은 22m 대신 새 기본값으로 시작)
const KEY = 'mythic-relics/settings-v2'

export function clampViewHeight(value: number): number {
  return Math.min(VIEW_HEIGHT.max, Math.max(VIEW_HEIGHT.min, value))
}

/** 설정은 진행 상황과 따로 저장한다. 새로 하기를 해도 그대로 남는다. */
export const settingsStorage = {
  load(): Settings {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>
      const view = typeof raw.viewHeight === 'number' && Number.isFinite(raw.viewHeight) ? raw.viewHeight : VIEW_HEIGHT.initial
      return { viewHeight: clampViewHeight(view) }
    } catch {
      return { viewHeight: VIEW_HEIGHT.initial }
    }
  },
  save(settings: Settings): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      // 저장소를 못 쓰면 이번 실행에서만 유지된다.
    }
  },
}

/** 화면 세로 방향에 보이는 범위(미터)의 기본값과 확대·축소 한계 */
export const VIEW_HEIGHT = { initial: 19, min: 12, max: 34 }

/** 렌더 해상도: 낮을수록 픽셀이 굵고 가볍다 */
export type RenderQuality = 'low' | 'normal' | 'high'
export const RENDER_QUALITIES: readonly RenderQuality[] = ['low', 'normal', 'high']
/** 기준 렌더 세로 픽셀 수에 곱하는 값 */
export const RENDER_SCALE: Record<RenderQuality, number> = { low: 0.75, normal: 1, high: 1.3 }

export interface Settings {
  /** 확대·축소 정도: 화면 세로 방향에 보이는 범위 (미터) */
  viewHeight: number
  /** 음량 0~1 (E5-05) */
  volume: { master: number; music: number; sfx: number }
  /** 화면 흔들림 */
  shake: boolean
  /** 화면 번쩍임 (발현·승급 때 화면 전체가 번쩍인다) */
  flash: boolean
  quality: RenderQuality
  /** 화질을 설정에서 골랐나 (E306 D22). 고르지 않았으면 기기의 기본값(휴대폰은 낮음)을 쓴다 */
  qualityChosen: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  viewHeight: VIEW_HEIGHT.initial,
  volume: { master: 0.8, music: 0.6, sfx: 0.8 },
  shake: true,
  flash: true,
  quality: 'normal',
  qualityChosen: false,
}

/** 기기의 기본 설정 (E306 D22): 휴대폰은 화질 「낮음」 (그림자 패스를 빼 가볍게), 컴퓨터·태블릿은 「보통」 */
export function deviceDefaults(phone: boolean): Settings {
  return phone ? { ...DEFAULT_SETTINGS, quality: 'low' } : DEFAULT_SETTINGS
}

// 기본 시야를 19m로 바꾸며 키를 새로 했다. (예전 설정에 남은 22m 대신 새 기본값으로 시작)
const KEY = 'mythic-relics/settings-v2'

export function clampViewHeight(value: number): number {
  return Math.min(VIEW_HEIGHT.max, Math.max(VIEW_HEIGHT.min, value))
}

const unit = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback)

/**
 * 저장된 값을 검사한다. 없거나 틀린 값은 기본값(base: 기기의 기본 설정)으로.
 * 화질은 고른 것만 지킨다: 고른 표시가 없는 옛 설정의 low·high는 메뉴로만 생기니 고른 것으로 보고,
 * normal은 확대·축소가 함께 저장해 둔 값일 수 있어 고르지 않은 것으로 본다 (설정 키는 그대로, E306 D22)
 */
export function parseSettings(raw: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Settings, unknown>>
  const v = (r.volume && typeof r.volume === 'object' ? r.volume : {}) as Partial<Record<keyof Settings['volume'], unknown>>
  const d = base
  const saved = RENDER_QUALITIES.includes(r.quality as RenderQuality) ? (r.quality as RenderQuality) : null
  const chosen = saved !== null && (typeof r.qualityChosen === 'boolean' ? r.qualityChosen : saved !== 'normal')
  return {
    viewHeight: clampViewHeight(typeof r.viewHeight === 'number' && Number.isFinite(r.viewHeight) ? r.viewHeight : d.viewHeight),
    volume: { master: unit(v.master, d.volume.master), music: unit(v.music, d.volume.music), sfx: unit(v.sfx, d.volume.sfx) },
    shake: typeof r.shake === 'boolean' ? r.shake : d.shake,
    flash: typeof r.flash === 'boolean' ? r.flash : d.flash,
    quality: chosen && saved ? saved : d.quality,
    qualityChosen: chosen,
  }
}

/** 설정은 진행 상황과 따로 저장한다. 진행 상황(슬롯)을 지워도 그대로 남는다. */
export const settingsStorage = {
  /** 기기의 기본 설정 (main이 시작할 때 휴대폰인지 보고 넣는다). load·update가 늘 같은 값을 쓴다 */
  defaults: DEFAULT_SETTINGS,
  /** 이 기기가 휴대폰인가에 따라 기본 설정을 고른다 (E306 D22) */
  useDevice(phone: boolean): void {
    this.defaults = deviceDefaults(phone)
  },
  load(): Settings {
    try {
      return parseSettings(JSON.parse(localStorage.getItem(KEY) ?? '{}'), this.defaults)
    } catch {
      return parseSettings({}, this.defaults)
    }
  },
  save(settings: Settings): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings))
    } catch {
      // 저장소를 못 쓰면 이번 실행에서만 유지된다.
    }
  },
  /** 일부만 바꿔 저장하고, 바뀐 전체를 돌려준다 */
  update(patch: Partial<Settings>): Settings {
    const next = parseSettings({ ...this.load(), ...patch }, this.defaults)
    this.save(next)
    return next
  },
}

/**
 * 색 팔레트와 연출 색 규칙 (E9-02·04, `ART.md`).
 * 게임 화면에 그리는 색 가운데 "무엇을 뜻하는지"가 있는 색은 여기 모은다. UI 토큰(`src/ui/theme.css`)도 같은 값을 쓴다.
 * 신의 색은 `gods.json`에 있고, 연출에 쓰이므로 아래 위험 규칙을 지켜야 한다 (tests/art.test.ts).
 */

/**
 * 연출 언어: 색만 보고 무엇인지 안다.
 * - 위험(적 공격 예고): 붉은 주황, 바닥에 깔리고 안쪽이 차오른다. 이 색은 적만 쓴다
 * - 내 스킬: 그 신의 색, 공중에서 번쩍이거나 날아간다
 * - 회복: 연두, 위로 떠오른다
 * - 안내(유물·성소·출구): 금빛 또는 갈 곳의 신화권 색, 위로 솟는 빛기둥
 */
export const VFX = {
  danger: 0xff5a3c,
  heal: 0x8fe07a,
  guide: 0xffd27a,
} as const

/** 위험색과 이만큼(색상환 각도) 떨어져야 내 연출이 예고로 보이지 않는다. 채도가 낮은 색은 예외 */
export const DANGER_HUE_GAP = 25
/** 이 채도 아래는 흰빛·잿빛이라 예고와 헷갈리지 않는다 */
export const DANGER_SATURATION = 0.45

/** 신화권 색: 출구 빛기둥, 작은 지도, 지역 이름 (마을은 모닥불 빛) */
export const REALM_COLORS = {
  norse: 0x7fd4ff,
  greek: 0xfff0a0,
  china: 0xffc83a,
  japan: 0xff9ac0,
  korea: 0x9fe0c0,
  hub: 0xffd0b0,
} as const

/**
 * 원천의 색 (밝은 색, 어두운 색, 속 색). 원천 결정은 작은 불티로 떠올라 주인공에게 날아가므로
 * 바닥 예고와 모양이 달라 사냥(붉은색)도 그대로 둔다.
 */
export const SOURCE_COLORS: Readonly<Record<string, readonly [string, string, string]>> = {
  flame: ['#ffb84a', '#d9542a', '#fff0a8'],
  hunt: ['#ff7a7a', '#a3141c', '#ffd0d0'],
  wind: ['#9fe3ff', '#3f8aa8', '#e9f6ff'],
  stone: ['#c9c2b0', '#6a6658', '#efe8d6'],
}

/** 하늘에서 내리치는 공격(패시브·궁극기)의 빛 */
export const SKY_COLORS = { lightning: 0x9fe3ff, sun: 0xffd27a, moon: 0xd8e4ff, stone: 0xa89a80, water: 0x6fc3ff, fire: 0xffb02a } as const

/** 신화권 문장(픽셀 그림)에 칠할 밝은 색·어두운 색 */
export function realmInk(realm: string): { light: string; dark: string } {
  const c = REALM_COLORS[realm as keyof typeof REALM_COLORS] ?? REALM_COLORS.hub
  const hex = (v: number) => `#${v.toString(16).padStart(6, '0')}`
  const dark = (((c >> 16) & 255) * 0.45) << 16 | (((c >> 8) & 255) * 0.45) << 8 | ((c & 255) * 0.45)
  return { light: hex(c), dark: hex(dark) }
}

/** 색상환 각도(0~360), 채도, 밝기 */
export function hsv(color: number): { h: number; s: number; v: number } {
  const r = ((color >> 16) & 255) / 255
  const g = ((color >> 8) & 255) / 255
  const b = (color & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
  }
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : d / max, v: max }
}

/** 이 색으로 그린 내 연출이 적 공격 예고처럼 보이는가 */
export function readsAsDanger(color: number): boolean {
  const c = hsv(color)
  const danger = hsv(VFX.danger)
  const gap = Math.min(Math.abs(c.h - danger.h), 360 - Math.abs(c.h - danger.h))
  return gap < DANGER_HUE_GAP && c.s >= DANGER_SATURATION && c.v >= 0.5
}

/** 장비 등급 색 (E13-02): 땅의 빛기둥과 장비 그림. 화면 글은 theme.css의 --c-grade-* 토큰 */
export const GRADE_COLORS = { common: '#c9ccd2', good: '#7fd47a', rare: '#5aa8ff', hero: '#c58aff' } as const

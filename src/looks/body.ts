/**
 * 처음에 고르는 기본 모습: 피부, 머리카락, 옷 색. 외형 칸(유물·발현 외형)과 따로, 모든 모델의 색을 바꿔 칠한다.
 * 모델은 기본 색으로 만들고, 메쉬를 만들 때 원래 색 → 고른 색으로 바꾼다.
 */
export interface BodyLook {
  skin: number
  hair: number
  cloth: number
}

export const DEFAULT_BODY: BodyLook = { skin: 0, hair: 0, cloth: 0 }

/** 원래 색 (모델에 칠한 색) */
const SKIN = 0xe2b38c
const SKIN_SHADE = 0xc28d6a
const HAIR = 0x4a3222
const HAIR_SHADE = 0x35231a
const OLIVE = 0x6b7a4a
const OLIVE_DARK = 0x4f5c34

/** 고를 수 있는 색. 첫째가 기본 */
export const BODY_OPTIONS = {
  skin: [
    [SKIN, SKIN_SHADE],
    [0xf3d4b8, 0xd9b090],
    [0xc08a62, 0x9a6a48],
    [0x8a5a3c, 0x6a412a],
  ],
  // 머리카락은 바탕과 그늘 두 색 (E24-06: 쓰개를 벗어 머리카락이 보인다)
  hair: [
    [HAIR, HAIR_SHADE],
    [0x1d1a1c, 0x0f0d0f],
    [0xd9b45a, 0xa8833a],
    [0xa8462a, 0x7a2f1c],
    [0xd8dde6, 0xa3a9b4],
  ],
  cloth: [
    [OLIVE, OLIVE_DARK],
    [0x3f5f8f, 0x2c4468],
    [0x8a3a32, 0x652822],
    [0x6a6e78, 0x4a4e58],
    [0x5e4a7a, 0x423458],
  ],
} as const satisfies Record<keyof BodyLook, readonly (readonly number[])[]>

export const BODY_PARTS = ['skin', 'hair', 'cloth'] as const satisfies readonly (keyof BodyLook)[]
export const BODY_PART_NAMES: Record<keyof BodyLook, string> = { skin: '피부', hair: '머리카락', cloth: '옷' }

/** 원래 색 → 바꿀 색. 기본 모습이면 빈 표 */
export function bodyPalette(body: BodyLook): Map<number, number> {
  const out = new Map<number, number>()
  for (const part of BODY_PARTS) {
    const from = BODY_OPTIONS[part][0]!
    const to = BODY_OPTIONS[part][body[part]] ?? from
    from.forEach((hex, i) => hex !== to[i] && out.set(hex, to[i]!))
  }
  return out
}

export function bodyKey(body: BodyLook): string {
  return `${body.skin}${body.hair}${body.cloth}`
}

/** 저장된 값을 검사한다. 틀린 값은 기본으로 */
export function parseBody(raw: unknown): BodyLook {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const pick = (part: keyof BodyLook) => {
    const v = o[part]
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < BODY_OPTIONS[part].length ? v : 0
  }
  return { skin: pick('skin'), hair: pick('hair'), cloth: pick('cloth') }
}

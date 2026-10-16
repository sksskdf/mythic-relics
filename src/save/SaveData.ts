import { GODS, type God, isRelicId, type RelicId } from '../relics/data'

/** 저장 형식 버전. 형식이 바뀌면 올리고, 옛 형식을 옮기는 코드를 둔다. */
export const SAVE_VERSION = 1

export interface SaveData {
  version: typeof SAVE_VERSION
  /** 유물 슬롯 4칸 */
  slots: (RelicId | null)[]
  /** 슬롯이 꽉 차서 못 낀 유물 */
  bag: RelicId[]
  /** 땅에 떨어져 있던 유물 */
  ground: { id: RelicId; x: number; z: number }[]
  /** 클래스별 레벨과 경험치 */
  classes: Partial<Record<God, { level: number; xp: number }>>
  /** 불운 보정: 마지막 유물 뒤로 놓친 횟수 */
  dropMisses: number
  /** 신위 게이지 */
  divine: number
}

const isRelic = isRelicId
const isGod = (v: string): v is God => Object.hasOwn(GODS, v)
const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback

/**
 * 저장된 글을 읽어 검사한다. 깨졌거나 모르는 형식이면 null (새로 시작).
 * 알 수 없는 유물이나 값은 버리고, 숫자는 범위 안으로 맞춘다.
 */
export function parseSave(text: string | null): SaveData | null {
  if (!text) return null
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const data = raw as Record<string, unknown>
  if (data.version !== SAVE_VERSION) return null

  const seen = new Set<RelicId>()
  const unique = (id: unknown): id is RelicId => {
    if (!isRelic(id) || seen.has(id)) return false
    seen.add(id)
    return true
  }
  const slotsRaw = Array.isArray(data.slots) ? data.slots : []
  const slots = [0, 1, 2, 3].map((i) => (unique(slotsRaw[i]) ? (slotsRaw[i] as RelicId) : null))
  const bag = (Array.isArray(data.bag) ? data.bag : []).filter(unique)
  const ground = (Array.isArray(data.ground) ? data.ground : [])
    .filter((g): g is { id: RelicId; x: number; z: number } => {
      const item = g as Record<string, unknown>
      return typeof g === 'object' && g !== null && typeof item.x === 'number' && typeof item.z === 'number' && unique(item.id)
    })
    .map((g) => ({ id: g.id, x: num(g.x, -100, 100, 0), z: num(g.z, -100, 100, 0) }))

  const classes: SaveData['classes'] = {}
  if (typeof data.classes === 'object' && data.classes !== null) {
    for (const [god, value] of Object.entries(data.classes as Record<string, unknown>)) {
      if (!isGod(god) || typeof value !== 'object' || value === null) continue
      const record = value as Record<string, unknown>
      classes[god] = { level: Math.round(num(record.level, 1, 4, 1)), xp: num(record.xp, 0, 1e6, 0) }
    }
  }

  return {
    version: SAVE_VERSION,
    slots,
    bag,
    ground,
    classes,
    dropMisses: Math.round(num(data.dropMisses, 0, 1000, 0)),
    divine: num(data.divine, 0, 1, 0),
  }
}

const KEY = 'mythic-relics/save'

/**
 * 브라우저 저장소. 사생활 보호 모드 등에서 저장소를 못 쓰면 조용히 넘어간다. (저장 없이도 게임은 돌아간다)
 */
export const saveStorage = {
  load(): SaveData | null {
    try {
      return parseSave(localStorage.getItem(KEY))
    } catch {
      return null
    }
  },
  save(data: SaveData): boolean {
    try {
      localStorage.setItem(KEY, JSON.stringify(data))
      return true
    } catch {
      return false
    }
  },
  clear(): void {
    try {
      localStorage.removeItem(KEY)
    } catch {
      // 저장소를 못 쓰면 지울 것도 없다.
    }
  },
}

import { REGIONS } from '../data/regions'
import { CHOSEN_SLOTS } from '../myth/ClassProgress'
import { legacyManifest } from '../myth/manifest'
import { type CycleData, parseCycle } from '../progress/Cycle'
import { type BodyLook, parseBody } from '../looks/body'
import { isLookId, lookDef, type LookSlot, STARTING_LOOKS, WARDROBE_SLOTS } from '../looks/catalog'
import type { LookChoice } from '../looks/outfit'
import { GODS, godDef, type God, isRelicId, relicDef, type RelicId } from '../relics/data'

/**
 * 저장 형식 버전. 형식이 바뀌면 올리고, 옛 형식을 옮기는 코드를 둔다.
 * - v1: 유물, 클래스, 드랍 보정, 신위
 * - v2: 외형 보관함(얻은 외형, 칸마다 고른 것) 추가 (E3)
 * - v3: 지금 있는 지역과 자리 (E7). 옛 저장은 마을에서 시작
 */
export const SAVE_VERSION = 3

export interface SaveData {
  version: typeof SAVE_VERSION
  /** 유물 슬롯 4칸 */
  slots: (RelicId | null)[]
  /** 슬롯이 꽉 차서 못 낀 유물 */
  bag: RelicId[]
  /** 땅에 떨어져 있던 유물 */
  ground: { id: RelicId; x: number; z: number }[]
  /** 신화별 개방 단계(0~4)와 신화 숙련 */
  classes: Partial<Record<God, { level: number; xp: number }>>
  /** 고른 신화 (E12-04). 옛 저장은 1차 스프린트 발현 규칙으로 정한다 */
  chosen: God[]
  /** 불운 보정: 마지막 유물 뒤로 놓친 횟수 */
  dropMisses: number
  /** 신위 게이지 */
  divine: number
  /** 외형 보관함: 얻은 외형과 칸마다 고른 것 ('auto', 외형 id, 비우기 null) */
  looks: { unlocked: string[]; choices: Partial<Record<LookSlot, LookChoice>> }
  /** 처음에 고른 기본 모습. 옛 저장에는 없어서 기본값 */
  body: BodyLook
  /** 순환 성장 (E4.5). 옛 저장에는 없어서 처음 상태 */
  cycle: CycleData
  /** 지금 있는 지역과 자리 (E7). 옛 저장이거나 모르는 지역이면 null (마을에서 시작) */
  region: { id: string; x: number; z: number } | null
  /** 본 대화 장면 (E12-10). 옛 저장에는 없어서 빈 목록 */
  scenes: string[]
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
  if (data.version !== SAVE_VERSION && data.version !== 1 && data.version !== 2) return null

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
      // 개방 단계 0은 숙련만 쌓이고 아직 못 연 신화 (E12-02)
      classes[god] = { level: Math.round(num(record.level, 0, 4, 1)), xp: num(record.xp, 0, 1e6, 0) }
    }
  }

  return {
    version: SAVE_VERSION,
    slots,
    bag,
    ground,
    classes,
    chosen: parseChosen(data.chosen, slots, classes),
    dropMisses: Math.round(num(data.dropMisses, 0, 1000, 0)),
    divine: num(data.divine, 0, 1, 0),
    looks: data.version === 1 ? migrateLooks(slots, bag, classes) : parseLooks(data.looks),
    body: parseBody(data.body),
    cycle: parseCycle(data.cycle),
    region: parseRegion(data.region),
    scenes: Array.isArray(data.scenes) ? [...new Set(data.scenes.filter((s): s is string => typeof s === 'string' && s.length < 40))] : [],
  }
}

/** 고른 신화: 열린 신화만. 없으면(옛 저장) 칸의 유물로 1차 스프린트 발현 규칙을 따른다 */
function parseChosen(raw: unknown, slots: readonly (RelicId | null)[], classes: SaveData['classes']): God[] {
  const open = (god: God) => (classes[god]?.level ?? 0) >= 1
  if (Array.isArray(raw)) return [...new Set(raw.filter((g): g is God => isGod(g) && open(g)))].slice(0, CHOSEN_SLOTS)
  const legacy = legacyManifest(slots)
  return legacy && open(legacy) ? [legacy] : []
}

function parseRegion(raw: unknown): SaveData['region'] {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const region = typeof r.id === 'string' ? REGIONS[r.id] : undefined
  if (!region) return null
  const h = region.halfExtent
  return { id: region.id, x: num(r.x, -h, h, region.spawn.x), z: num(r.z, -h, h, region.spawn.z) }
}

/** v1 → v2: 그때까지 가진 유물과 발현해 본 클래스의 외형을 얻은 것으로 친다. 고른 것은 모두 "자동" */
function migrateLooks(slots: (RelicId | null)[], bag: RelicId[], classes: SaveData['classes']): SaveData['looks'] {
  const unlocked = new Set(STARTING_LOOKS)
  for (const id of [...slots, ...bag]) if (id) unlocked.add(relicDef(id).look)
  for (const god of Object.keys(classes)) for (const look of Object.values(godDef(god).looks)) unlocked.add(look)
  return { unlocked: [...unlocked], choices: {} }
}

function parseLooks(raw: unknown): SaveData['looks'] {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const unlocked = new Set(STARTING_LOOKS)
  for (const id of Array.isArray(o.unlocked) ? o.unlocked : []) if (isLookId(id)) unlocked.add(id)
  const choices: SaveData['looks']['choices'] = {}
  const rawChoices = (typeof o.choices === 'object' && o.choices !== null ? o.choices : {}) as Record<string, unknown>
  for (const slot of WARDROBE_SLOTS) {
    const choice = rawChoices[slot]
    if (choice === null) choices[slot] = null
    // 얻지 않았거나 다른 칸의 외형이면 버린다. ("자동"은 적지 않아도 기본값)
    else if (isLookId(choice) && unlocked.has(choice) && lookDef(choice).slot === slot) choices[slot] = choice
  }
  return { unlocked: [...unlocked], choices }
}

/** 게임에서 「처음 화면으로」를 누르면 남기는 표시 (다시 불러온 뒤 슬롯 고르기를 띄운다) */
export const TITLE_REQUEST = 'mythic-relics/to-title'

/** 저장 슬롯 수 */
export const SLOT_COUNT = 3
const LEGACY_KEY = 'mythic-relics/save'
const LAST_KEY = 'mythic-relics/last-slot'
const slotKey = (slot: number) => `mythic-relics/save/${slot}`

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * 브라우저 저장소. 슬롯 3개, 마지막으로 플레이한 슬롯을 기억해 다음 실행에 바로 이어 간다.
 * 사생활 보호 모드 등에서 저장소를 못 쓰면 조용히 넘어간다. (저장 없이도 게임은 돌아간다)
 */
export const saveStorage = {
  /** 지금 쓰는 슬롯. 고르기 전(-1)에는 저장하지 않는다. */
  slot: -1,
  /** 마지막으로 플레이한 슬롯. 한 번도 안 했으면 null. 슬롯이 없던 옛 저장은 0번으로 옮긴다. */
  lastSlot(): number | null {
    const legacy = read(LEGACY_KEY)
    if (legacy !== null && read(slotKey(0)) === null) {
      try {
        localStorage.setItem(slotKey(0), legacy)
        localStorage.removeItem(LEGACY_KEY)
        localStorage.setItem(LAST_KEY, '0')
      } catch {
        // 옮기지 못하면 다음 실행에 다시 해 본다.
      }
    }
    const n = Number(read(LAST_KEY))
    return read(LAST_KEY) !== null && Number.isInteger(n) && n >= 0 && n < SLOT_COUNT ? n : null
  },
  /** 이 슬롯으로 플레이한다. 다음 실행에 바로 이어 간다. */
  use(slot: number): void {
    saveStorage.slot = slot
    try {
      localStorage.setItem(LAST_KEY, String(slot))
    } catch {
      // 기억하지 못하면 다음 실행에 슬롯을 다시 고른다.
    }
  },
  load(slot?: number): SaveData | null {
    return parseSave(read(slotKey(slot ?? saveStorage.slot)))
  },
  save(data: SaveData): boolean {
    if (saveStorage.slot < 0) return false
    try {
      localStorage.setItem(slotKey(saveStorage.slot), JSON.stringify(data))
      return true
    } catch {
      return false
    }
  },
  clear(slot?: number): void {
    const n = slot ?? saveStorage.slot
    try {
      localStorage.removeItem(slotKey(n))
      if (read(LAST_KEY) === String(n)) localStorage.removeItem(LAST_KEY)
    } catch {
      // 저장소를 못 쓰면 지울 것도 없다.
    }
  },
}

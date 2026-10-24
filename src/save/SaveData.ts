import { REGIONS } from '../data/regions'
import { CHOSEN_SLOTS } from '../myth/ClassProgress'
import { SLOT_PARTS } from '../data/gearData'
import { STAT_KINDS, type StatKind } from '../data/mythAlways'
import { isMythRelic } from '../gear/mythRelic'
import { type GearItem, parseGearItem } from '../gear/roll'
import { hiddenUnlocked, legacyManifest } from '../myth/manifest'
import { relicGods } from '../relics/model'
import { type ConvenienceData, parseConveniences } from '../progress/Conveniences'
import { parseThreat, type ThreatData } from '../progress/Threat'
import { parseTrials, type TrialData } from '../progress/Trials'
import { parseRift, type RiftData } from '../progress/Rift'
import { type BodyLook, parseBody } from '../looks/body'
import { isLookId, lookDef, type LookSlot, STARTING_LOOKS, WARDROBE_SLOTS } from '../looks/catalog'
import type { LookChoice } from '../looks/outfit'
import { GODS, godDef, type God, isRelicId, relicDef, type RelicId } from '../relics/data'

/**
 * 저장 형식 버전. 형식이 바뀌면 올리고, 옛 형식을 옮기는 코드를 둔다.
 * - v1: 유물, 클래스, 드랍 보정, 신위
 * - v2: 외형 보관함(얻은 외형, 칸마다 고른 것) 추가 (E3)
 * - v3: 지금 있는 지역과 자리 (E7). 옛 저장은 마을에서 시작
 * - v4: 신화 (E12-05). classes는 개방 단계 0~4와 신화 숙련, chosen은 고른 신화.
 *   옛 저장은 가진 유물의 신화를 1단계로 열고(히든은 유물 수), 고른 신화는 1차 발현 규칙으로 정한다
 * - v5: 장비 (E13-06). 칸 7(유물 id 또는 장비 id), 일반 장비, 유물 단계, 재료.
 *   옛 저장의 재료가 된 유물(E13-03)은 재료로 옮기고, 신화의 유물은 1단계로 그 부위 칸에 다시 낀다
 * - v6: 위협 단계·원천 숙련(E14-03·04)과 편의 자동화(E14-05). 순환 성장(E4.5)을 없앴다.
 *   옛 저장의 원천 결정은 100개마다 서리 조각 하나, 윤회의 재는 셋마다 거인 왕의 심장 하나로 바꿔 준다 (E14-06)
 * - v7: 시련 기록 (E16). 옛 저장에는 없어서 깬 시련 없음
 * - v8: 균열 기록과 성좌판 (E17). 1차 스프린트 별자리에서 밝힌 별은 그 수만큼 성좌판의 별로 돌려준다
 */
export const SAVE_VERSION = 8

/** 옛 순환 성장 → 재료 (E14-06) */
export const CYCLE_REFUND = { essencePer: 100, essenceTo: 'frostShard', essenceMax: 300, ashPer: 3, ashTo: 'giantHeart', ashMax: 20 } as const

export interface SaveData {
  version: typeof SAVE_VERSION
  /** 장비 칸 7 (유물 id 또는 일반 장비 id). 불러올 때 그 부위 칸에 다시 낀다 */
  slots: (string | null)[]
  /** 가방 (유물 id 또는 일반 장비 id) */
  bag: string[]
  /** 가진 일반 장비의 내용 (칸·가방·땅에 있는 것) */
  gear: GearItem[]
  /** 유물 단계 2~4 (1단계는 적지 않는다) */
  stages: Partial<Record<RelicId, number>>
  /** 재료 개수 */
  materials: Record<string, number>
  /** 대장간 유물이 바탕 장비에서 물려받은 수치 (E13-05) */
  inherited: Partial<Record<RelicId, { kind: StatKind; value: number }>>
  /** 땅에 떨어져 있던 유물·장비 */
  ground: { id: string; x: number; z: number }[]
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
  /** 세계 위협 단계와 원천 숙련 (E14). 옛 저장에는 없어서 1단계 */
  threat: ThreatData
  /** 편의 자동화 (E14-05) */
  conveniences: ConvenienceData
  /** 시련: 깬 난이도와 기록 (E16) */
  trials: TrialData
  /** 균열 기록과 성좌판 (E17) */
  rift: RiftData
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
  if (data.version !== SAVE_VERSION && ![1, 2, 3, 4, 5, 6, 7].includes(data.version as number)) return null
  const old = (data.version as number) < 5

  // 일반 장비 (v5)
  const gearById = new Map<string, GearItem>()
  for (const g of Array.isArray(data.gear) ? data.gear : []) {
    const item = parseGearItem(g)
    if (item && !gearById.has(item.uid)) gearById.set(item.uid, item)
  }
  // 재료: v5는 저장된 것, 옛 저장은 재료가 된 유물을 여기로 옮긴다
  const materials: Record<string, number> = {}
  if (!old && typeof data.materials === 'object' && data.materials !== null) {
    for (const [id, n] of Object.entries(data.materials as Record<string, unknown>)) {
      if (id.length <= 40 && typeof n === 'number' && n >= 1) materials[id] = Math.min(9999, Math.round(n))
    }
  }
  if ((data.version as number) < 6) refundCycle(data.cycle, materials)

  const seen = new Set<string>()
  /** 칸·가방·땅에 들어갈 수 있는 것: 신화의 유물이나 가진 일반 장비, 한 번씩만 */
  const unique = (id: unknown, ground = false): id is string => {
    if (typeof id !== 'string' || seen.has(id)) return false
    // 재료가 된 유물: 땅에는 그대로, 옛 저장의 칸·가방에 있던 것은 재료로
    if (isRelic(id) && !isMythRelic(id) && !ground) {
      if (old) materials[id] = (materials[id] ?? 0) + 1
      return false
    }
    if (!isRelic(id) && !gearById.has(id)) return false
    seen.add(id)
    return true
  }
  const slotsRaw = Array.isArray(data.slots) ? data.slots : []
  const slots = Array.from({ length: SLOT_PARTS.length }, (_, i) => (unique(slotsRaw[i]) ? (slotsRaw[i] as string) : null))
  // 옛 저장(칸 4)의 남은 칸도 놓치지 않는다
  for (let i = SLOT_PARTS.length; i < slotsRaw.length; i++) if (unique(slotsRaw[i])) slots.push(slotsRaw[i] as string)
  const bag = (Array.isArray(data.bag) ? data.bag : []).filter((id): id is string => unique(id))
  const ground = (Array.isArray(data.ground) ? data.ground : [])
    .filter((g): g is { id: string; x: number; z: number } => {
      const item = g as Record<string, unknown>
      return typeof g === 'object' && g !== null && typeof item.x === 'number' && typeof item.z === 'number' && unique(item.id, true)
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

  const relicsOwned = [...slots, ...bag].filter((id): id is RelicId => !!id && isRelic(id))
  const myths = (data.version as number) < 4 ? openOwned(classes, [...relicsOwned, ...Object.keys(materials)]) : classes
  // 유물 단계: 가진 신화의 유물만, 2~4
  const stages: SaveData['stages'] = {}
  if (!old && typeof data.stages === 'object' && data.stages !== null) {
    for (const [id, n] of Object.entries(data.stages as Record<string, unknown>)) {
      if (isRelic(id) && isMythRelic(id) && typeof n === 'number' && n >= 2) stages[id] = Math.min(4, Math.round(n))
    }
  }
  const keep = new Set([...slots, ...bag, ...ground.map((g) => g.id)])
  return {
    version: SAVE_VERSION,
    slots: slots.slice(0, SLOT_PARTS.length),
    bag: [...bag, ...slots.slice(SLOT_PARTS.length).filter((id): id is string => id !== null)],
    gear: [...gearById.values()].filter((g) => keep.has(g.uid)),
    stages,
    materials,
    inherited: parseInherited(data.inherited),
    ground,
    classes: myths,
    chosen: parseChosen(data.chosen, legacySlots(data.slots), myths),
    dropMisses: Math.round(num(data.dropMisses, 0, 1000, 0)),
    divine: num(data.divine, 0, 1, 0),
    looks: data.version === 1 ? migrateLooks(legacySlots(data.slots), legacySlots(data.bag) as RelicId[], classes) : parseLooks(data.looks),
    body: parseBody(data.body),
    threat: parseThreat(data.threat),
    conveniences: parseConveniences(data.conveniences),
    trials: parseTrials(data.trials),
    rift: parseRift(data.rift, (data.version as number) < 6 ? oldStars(data.cycle) : 0),
    region: parseRegion(data.region),
    scenes: Array.isArray(data.scenes) ? [...new Set(data.scenes.filter((s): s is string => typeof s === 'string' && s.length < 40))] : [],
  }
}

/** v5 이하 → v6: 원천 결정과 윤회의 재를 재료로 바꿔 준다 */
function refundCycle(raw: unknown, materials: Record<string, number>): void {
  if (typeof raw !== 'object' || raw === null) return
  const o = raw as Record<string, unknown>
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0)
  const essence = typeof o.essence === 'object' && o.essence !== null ? Object.values(o.essence as Record<string, unknown>).reduce<number>((a, v) => a + n(v), 0) : 0
  const r = CYCLE_REFUND
  const shards = Math.min(r.essenceMax, Math.floor(essence / r.essencePer))
  const hearts = Math.min(r.ashMax, Math.floor(n(o.ash) / r.ashPer))
  if (shards > 0) materials[r.essenceTo] = Math.min(9999, (materials[r.essenceTo] ?? 0) + shards)
  if (hearts > 0) materials[r.ashTo] = Math.min(9999, (materials[r.ashTo] ?? 0) + hearts)
}

/** v5 이하의 별자리(E4.5)에서 밝힌 별 수 → 성좌판의 별 (E17-05) */
function oldStars(raw: unknown): number {
  if (typeof raw !== 'object' || raw === null) return 0
  const stars = (raw as Record<string, unknown>).stars
  if (typeof stars !== 'object' || stars === null) return 0
  return Object.values(stars as Record<string, unknown>).reduce<number>((s, v) => s + (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(10, Math.round(v)) : 0), 0)
}

/** 물려받은 수치: 신화의 유물에, 아는 수치 종류만 */
function parseInherited(raw: unknown): SaveData['inherited'] {
  const out: SaveData['inherited'] = {}
  if (typeof raw !== 'object' || raw === null) return out
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    const s = v as Record<string, unknown> | null
    if (!isRelic(id) || !isMythRelic(id) || !s || !STAT_KINDS.includes(s.kind as StatKind) || typeof s.value !== 'number' || !Number.isFinite(s.value)) continue
    out[id] = { kind: s.kind as StatKind, value: s.value }
  }
  return out
}

/** 옛 저장의 칸 그대로 (1차 발현 규칙으로 고른 신화를 정할 때) */
function legacySlots(raw: unknown): (RelicId | null)[] {
  return (Array.isArray(raw) ? raw : []).map((id) => (isRelic(id) ? id : null))
}

/** v3 → v4: 가진 유물의 신화를 1단계로 연다 (E12-04 규칙: 그 신 유물을 손에 넣으면 열린다. 히든은 유물 수) */
function openOwned(classes: SaveData['classes'], owned: readonly (RelicId | null)[]): SaveData['classes'] {
  const out: SaveData['classes'] = { ...classes }
  const gods = new Set<God>(hiddenUnlocked(owned))
  for (const id of owned) if (id) for (const god of relicGods(relicDef(id))) if (!godDef(god).hidden) gods.add(god)
  for (const god of gods) if ((out[god]?.level ?? 0) < 1) out[god] = { level: 1, xp: 0 }
  return out
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

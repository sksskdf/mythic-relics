import { REGIONS } from '../data/regions'
import { fromChosen, MAX_BREATH, type Pantheon } from '../myth/pantheon'
import { SLOT_PARTS } from '../data/gearData'
import { isMythRelic } from '../gear/mythRelic'
import { GEAR, type GearItem, parseGearItem } from '../gear/roll'
import { MATERIAL_CAP } from '../gear/Loadout'
import { legacyManifest } from '../myth/manifest'
import { type ChapterData, parseChapterData } from '../progress/Chapters'
import { type AutomationData, parseAutomation } from '../progress/Automation'
import { parseWaypoints } from '../progress/Waypoints'
import { type DepthData, parseDepth } from '../progress/Depth'
import { type OathData, oathsFromTrials, parseOaths } from '../progress/Oaths'
import { parseEndless, type EndlessData } from '../progress/Endless'
import { parseTraining, type TrainingData } from '../progress/Training'
import { type ExpeditionData, parseExpedition } from '../progress/Expedition'
import { parseTabs } from '../progress/Tabs'
import { type AwakenData, parseAwaken } from '../progress/Awakening'
import { type BodyLook, parseBody } from '../looks/body'
import { isLookId, lookDef, type LookSlot, STARTING_LOOKS, WARDROBE_SLOTS } from '../looks/catalog'
import type { LookChoice } from '../looks/outfit'
import { GODS, type God, isRelicId, type RelicId } from '../relics/data'
import { legacySlots, legacyStarRenown, migrateLooks, oldChapters, oldThreat, oldTrainingXp, oldVisited, fillEmptySlots, meltOverflow, openOwned, realmToPrototype, refundCycle, refundMythMaterials } from './migrate/legacy'

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
 *   (E19의 세계 자리는 지역 id와 그 지역 기준 자리라 형식을 바꾸지 않았다)
 * - v9: 세 축 정리 (E21). 엔딩을 보았나(ending). 신화 고유 재료는 그 신의 신화권 재료로 바꾸고,
 *   물려받은 수치·원천 숙련·전투 경험은 버린다. 위협 단계·시련·균열을 해 본 옛 저장은 엔딩 뒤로 친다 (그 장치를 숨기지 않게)
 * - v10: 장 진행 (E22). 들어서 본 땅과 보스를 이긴 땅. 옛 저장은 있던 땅·찾은 성소를 들어서 본 땅으로,
 *   위협 단계에서 이겼거나 보스 재료·그 신화권 유물을 가진 신화권의 보스를 이긴 것으로 친다 (지나온 장에 다시 막히지 않게)
 * - v11: 수련 (E236). 모은 경험치와 익힌 마디. 옛 저장은 신화 경험치에서 모은 경험치를 짐작하고 마디는 비워 둔다 (깨달음은 그대로 쓸 수 있다).
 *   차례로 연 정보 화면 탭(E236-05). 옛 저장은 탭을 모두 연 것으로 친다
 * - v12: 신위 칸 (E237). chosen은 첫째가 주신(고른 신화), 그 뒤가 빌린 신(넷까지). 옛 저장은 주신 하나뿐이라 그대로 읽는다
 * - v13: 신을 깨우는 조각 (E238). 깨우는 신과 모은 조각·사냥한 수. 옛 저장은 깨우는 신 없이 (이미 연 신은 그대로)
 * - v14: 신의 자리 셋 (E302). chosen(주신 + 빌린 신) → pantheon(손·심장·숨). 옛 주신은 손·심장·숨 첫 칸으로(한 신에 몰기), 빌린 신은 숨 칸으로
 * - v15: 원형과 유물표 (E303-04). 신화권 재료 → 원형 셋씩(대장간 값 ×3), 12칸을 넘친 가방의 일반 장비는 낮은 등급부터 녹여 원형으로.
 *   칸·가방의 신화 유물은 유물표(lit)로 옮기고 빈 칸은 가방의 가장 좋은 장비로 채운다. 가진 장비의 고유 효과도 유물표에 켠다
 * - v16: 원정 (E304). 원정 번호·명성·원천 불씨·기록·가보. 옛 저장은 첫 원정에서 이어 간다(신 단계는 그대로라 명성 없이도 힘이 같다)
 * - v17: 맹세 (E305-01). 시련 기록(trials) → 맹세 기록(oaths), 원정에 건 맹세(expedition.oath). 한 단계라도 깬 시련은 짝인 맹세를 지킨 것으로.
 *   균열의 성좌판을 걷었다(E305-03): rift는 깊이 기록만, 밝힌 별과 남은 별 하나마다 명성 20
 *   위협 단계는 깊이로(E305-03): 키 threat는 그대로 {level, reached, limitBroken}, 열린 단계·신화권마다 이긴 단계는 버린다(v9 이하 옮기기만 `oldThreat`로 읽는다)
 *   편의는 자동화로(E305-03): 키 conveniences는 그대로 {counters:{pickups}}만, 켠 성소(visited)는 새 키 waypoints로. 원정에 지난번 갈래(expedition.lastBranch)
 */
export const SAVE_VERSION = 17

export interface SaveData {
  version: typeof SAVE_VERSION
  /** 장비 칸 7 (일반 장비 id). 불러올 때 그 부위 칸에 다시 낀다 */
  slots: (string | null)[]
  /** 가방 (일반 장비 id) */
  bag: string[]
  /** 유물표에 켠 신화의 유물 (E303-04, 얻은 차례) */
  lit: RelicId[]
  /** 유물표에 켠 고유 효과 (처음 만든 영웅·전설의 것) */
  uniques: string[]
  /** 가진 일반 장비의 내용 (칸·가방·땅에 있는 것) */
  gear: GearItem[]
  /** 유물 단계 2~4 (1단계는 적지 않는다) */
  stages: Partial<Record<RelicId, number>>
  /** 재료 개수 */
  materials: Record<string, number>
  /** 땅에 떨어져 있던 유물·장비 */
  ground: { id: string; x: number; z: number }[]
  /** 신화별 개방 단계(0~4)와 신화 숙련 */
  classes: Partial<Record<God, { level: number; xp: number }>>
  /** 신의 자리 셋 (E302): 손·심장·숨에 낀 신. 열린 신만 */
  pantheon: Pantheon
  /** 불운 보정: 마지막 유물 뒤로 놓친 횟수 */
  dropMisses: number
  /** 신위 게이지 */
  divine: number
  /** 외형 보관함: 얻은 외형과 칸마다 고른 것 ('auto', 외형 id, 비우기 null) */
  looks: { unlocked: string[]; choices: Partial<Record<LookSlot, LookChoice>> }
  /** 처음에 고른 기본 모습. 옛 저장에는 없어서 기본값 */
  body: BodyLook
  /** 깊이 (E305-03, 옛 위협 단계 E14라 키 이름은 그대로). 옛 저장에는 없어서 1 */
  threat: DepthData
  /** 자동화 세기 (E305-03, 옛 편의 E14-05라 키 이름은 그대로): 주운 수만. 나머지 자동화는 귀환 횟수·엔딩에서 셈한다 */
  conveniences: AutomationData
  /** 웨이포인트: 밟아 켠 성소의 땅 (E239-05, E305-03에서 편의에서 뗌). 없으면 옛 편의의 visited에서 */
  waypoints: string[]
  /** 맹세: 지킨 맹세와 기록 (E305-01, v16 이하는 시련 기록에서) */
  oaths: OathData
  /** 끝없는 원정 기록 (E17 균열, 성좌판은 E305-03에서 걷음). 키는 옛 이름 그대로 */
  rift: EndlessData
  /** 첫 엔딩을 보았나 (E21-06): 엔딩 뒤 장치를 연다 */
  ending: boolean
  /** 장 진행 (E22): 들어서 본 땅, 보스를 이긴 땅 */
  chapters: ChapterData
  /** 수련 (E236): 모은 경험치와 찍은 마디 */
  training: TrainingData
  /** 원정 (E304): 원정 번호·명성·원천 불씨·기록·가보. 옛 저장은 첫 원정 */
  expedition: ExpeditionData
  /** 차례로 연 정보 화면 탭 (E236-05) */
  tabs: string[]
  /** 신을 깨우는 진행 (E238): 깨우는 신과 모은 조각 */
  awaken: AwakenData
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
  if (data.version !== SAVE_VERSION && ![1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16].includes(data.version as number)) return null
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
      if (id.length <= 40 && typeof n === 'number' && n >= 1) materials[id] = Math.min(MATERIAL_CAP, Math.round(n))
    }
  }
  if ((data.version as number) < 6) refundCycle(data.cycle, materials)
  if ((data.version as number) < 9) refundMythMaterials(materials)
  if ((data.version as number) < 15) realmToPrototype(materials)

  const seen = new Set<string>()
  // 유물표 (E303-04): v15는 저장된 것, 옛 저장은 칸·가방에 있던 신화의 유물
  const lit: RelicId[] = []
  const light = (id: unknown) => {
    if (typeof id === 'string' && isRelic(id) && isMythRelic(id) && !lit.includes(id)) lit.push(id)
  }
  // 유물표가 없는 저장(v14 이하, 그리고 유물표 전의 v15 개발판)은 칸·가방의 신화 유물을 옮긴다
  const hasLit = (data.version as number) >= 15 && Array.isArray(data.lit)
  if (hasLit) (data.lit as unknown[]).forEach(light)
  /** 칸·가방·땅에 들어갈 수 있는 것: 가진 일반 장비(땅에는 유물도), 한 번씩만 */
  const unique = (id: unknown, ground = false): id is string => {
    if (typeof id !== 'string' || seen.has(id)) return false
    // 재료가 된 유물: 땅에는 그대로, 옛 저장의 칸·가방에 있던 것은 재료로
    if (isRelic(id) && !isMythRelic(id) && !ground) {
      if (old) materials[id] = (materials[id] ?? 0) + 1
      return false
    }
    // 신화의 유물은 칸·가방을 떠나 유물표로 (옛 저장). 이미 켠 유물은 땅에도 없다
    if (isRelic(id) && isMythRelic(id) && ground && lit.includes(id)) return false
    if (isRelic(id) && isMythRelic(id) && !ground) {
      if (!hasLit) light(id)
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

  const relicsOwned = [...lit]
  // 옛 순환에서 돌려받은 재료(서리 조각 등)는 유물이 아니라 신화를 여는 데 세지 않는다
  const myths = (data.version as number) < 4 ? openOwned(classes, [...relicsOwned, ...Object.keys(materials).filter(isRelic)]) : classes
  // 유물 단계: 가진 신화의 유물만, 2~4
  const stages: SaveData['stages'] = {}
  if (!old && typeof data.stages === 'object' && data.stages !== null) {
    for (const [id, n] of Object.entries(data.stages as Record<string, unknown>)) {
      if (isRelic(id) && isMythRelic(id) && typeof n === 'number' && n >= 2) stages[id] = Math.min(4, Math.round(n))
    }
  }
  let fullBag = [...bag, ...slots.slice(SLOT_PARTS.length).filter((id): id is string => id !== null)]
  // 유물이 비운 칸은 가방의 가장 좋은 장비로 채우고(v15), 그래도 12칸을 넘친 가방은 녹인다
  if (!hasLit) fullBag = fillEmptySlots(slots, fullBag, gearById)
  // 12칸을 넘친 가방은 옛 저장에서만 녹인다 (지금은 가방이 차면 더 넣지 않는다)
  if ((data.version as number) < 15) fullBag = meltOverflow(fullBag, gearById, materials)
  const keep = new Set([...slots.slice(0, SLOT_PARTS.length), ...fullBag, ...ground.map((g) => g.id)])
  const threat = parseDepth(data.threat)
  const oaths = (data.version as number) < 17 ? oathsFromTrials(data.trials) : parseOaths(data.oaths)
  const rift = parseEndless(data.rift)
  // 엔딩 뒤 장치를 해 본 옛 저장은 엔딩 뒤로 친다 (E21-06). 옛 위협 단계는 열린 단계(unlocked)까지 본다
  const oldDanger = (data.version as number) < 10 ? oldThreat(data.threat) : null
  const tried = threat.limitBroken || (oldDanger?.unlocked ?? 1) > 1 || oaths.kept.length > 0 || rift.best > 0
  const region = parseRegion(data.region)
  // 웨이포인트는 키가 있는지로 옛 모양을 알아본다 (E305-03 전의 v17 개발판도 편의에 담았다)
  const waypoints = Array.isArray(data.waypoints) ? parseWaypoints(data.waypoints) : oldVisited(data.conveniences)
  const chapters = oldDanger ? oldChapters(region, waypoints, oldDanger.cleared, materials, relicsOwned) : parseChapterData(data.chapters)
  const awaken = openedAwaken(parseAwaken(data.awaken), myths)
  return {
    version: SAVE_VERSION,
    slots: slots.slice(0, SLOT_PARTS.length),
    bag: fullBag,
    lit,
    uniques: parseUniques(data.uniques, hasLit ? [] : [...gearById.values()].filter((g) => keep.has(g.uid))),
    gear: [...gearById.values()].filter((g) => keep.has(g.uid)),
    stages,
    materials,
    ground,
    classes: myths,
    pantheon: (data.version as number) < 14 ? fromChosen(parseChosen(data.chosen, legacySlots(data.slots), myths)) : parsePantheon(data.pantheon, myths, awaken.fragments >= 2 ? awaken.waking : null),
    dropMisses: Math.round(num(data.dropMisses, 0, 1000, 0)),
    divine: num(data.divine, 0, 1, 0),
    looks: data.version === 1 ? migrateLooks(legacySlots(data.slots), legacySlots(data.bag) as RelicId[], classes) : parseLooks(data.looks),
    body: parseBody(data.body),
    threat,
    conveniences: parseAutomation(data.conveniences),
    waypoints,
    oaths,
    rift,
    ending: data.ending === true || ((data.version as number) < 9 && tried),
    chapters,
    expedition: oldExpedition(data),
    training: parseTraining(data.training, (data.version as number) < 11 ? oldTrainingXp(myths) : 0),
    tabs: parseTabs(data.tabs, (data.version as number) < 11),
    awaken,
    region,
    scenes: Array.isArray(data.scenes) ? [...new Set(data.scenes.filter((s): s is string => typeof s === 'string' && s.length < 40))] : [],
  }
}

/** 원정 기록. v16 이하는 성좌판의 별을 명성으로 돌려준다 (v17, E305-03) */
function oldExpedition(data: Record<string, unknown>): ExpeditionData {
  const expedition = parseExpedition(data.expedition)
  const version = data.version as number
  if (version < 17) expedition.renown = Math.min(1e7, expedition.renown + legacyStarRenown(data.rift, data.cycle, version))
  return expedition
}

/** 유물표의 고유 효과: 있는 것만 한 번씩. 옛 저장은 가진 장비의 고유 효과로 (E303-04) */
function parseUniques(raw: unknown, owned: readonly GearItem[]): string[] {
  const out = new Set<string>()
  for (const id of Array.isArray(raw) ? raw : []) if (typeof id === 'string' && GEAR.uniques[id]) out.add(id)
  for (const g of owned) for (const u of [g.unique, g.unique2]) if (u) out.add(u)
  return [...out]
}

/** 깨우는 신이 이미 열린 신이면 (어긋난 저장) 처음으로 */
function openedAwaken(awaken: AwakenData, classes: SaveData['classes']): AwakenData {
  return awaken.waking && (classes[awaken.waking]?.level ?? 0) >= 1 ? { waking: null, fragments: 0, hunt: 0 } : awaken
}

/** 고른 신화: 열린 신화만. 없으면(옛 저장) 칸의 유물로 1차 스프린트 발현 규칙을 따른다 */
function parseChosen(raw: unknown, slots: readonly (RelicId | null)[], classes: SaveData['classes']): God[] {
  const open = (god: God) => (classes[god]?.level ?? 0) >= 1
  if (Array.isArray(raw)) return [...new Set(raw.filter((g): g is God => isGod(g) && open(g)))].slice(0, MAX_BREATH)
  const legacy = legacyManifest(slots)
  return legacy && open(legacy) ? [legacy] : []
}

/** 신의 자리 셋 (v14): 열린 신만(손은 조각 2를 모은 깨우는 신도), 숨은 겹치지 않게 넷까지 */
function parsePantheon(raw: unknown, classes: SaveData['classes'], holding: God | null): Pantheon {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const open = (g: unknown): g is God => typeof g === 'string' && isGod(g) && (classes[g]?.level ?? 0) >= 1
  return {
    // 손은 조각 2를 모은 깨우는 신도 쥘 수 있다 (E302)
    hand: open(o.hand) || (holding !== null && o.hand === holding) ? (o.hand as God) : null,
    heart: open(o.heart) ? o.heart : null,
    breath: Array.isArray(o.breath) ? [...new Set(o.breath.filter(open))].slice(0, MAX_BREATH) : [],
  }
}

function parseRegion(raw: unknown): SaveData['region'] {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const region = typeof r.id === 'string' ? REGIONS[r.id] : undefined
  if (!region) return null
  const h = region.halfExtent
  return { id: region.id, x: num(r.x, -h, h, region.spawn.x), z: num(r.z, -h, h, region.spawn.z) }
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
 * 옛 버전 저장을 처음 옮길 때 원본을 그 버전 이름으로 한 번 남긴다 (E301-03, 예: `…:v13.bak`).
 * 순환 재편으로 저장 모양이 크게 바뀌므로, 옮기기가 잘못되어도 되살릴 수 있게
 */
function keepOld(key: string, text: string): void {
  const version = Number(/"version"\s*:\s*(\d+)/.exec(text)?.[1])
  if (!Number.isInteger(version) || version >= SAVE_VERSION) return
  const backup = `${key}:v${version}.bak`
  try {
    if (localStorage.getItem(backup) === null) localStorage.setItem(backup, text)
  } catch {
    // 남기지 못해도 옮기기는 그대로 한다
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
    const key = slotKey(slot ?? saveStorage.slot)
    const text = read(key)
    try {
      const data = parseSave(text)
      if (data && text) keepOld(key, text)
      return data
    } catch (e) {
      // 읽지 못하는 저장 때문에 게임이 뜨지 않으면 안 된다: 빈 슬롯처럼 다루고, 원본은 옆에 남겨 둔다 (새 게임이 덮어써도 되살릴 수 있게)
      console.warn('저장을 읽지 못했습니다', e)
      try {
        if (text) localStorage.setItem(`${key}:broken`, text)
      } catch {}
      return null
    }
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

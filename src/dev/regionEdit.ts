import { PROP_KINDS, type PropKind, type RegionDef, type Spot } from '../data/regions'

/**
 * 지도 편집기의 편집 동작 (E7-01). 화면 없이 지역 데이터(regions.json의 한 지역, 검사 전 모양)만 고친다.
 * 편집기 화면(RegionEditor)이 클릭을 이것으로 바꾸고, 고친 뒤에는 parseRegions로 검사해서 통과할 때만 맵에 반영한다.
 */

/** 지역 데이터를 고칠 수 있는 모양 (검사 전 JSON) */
export type RegionDraft = Omit<RegionDef, 'id' | 'sanctuary' | 'boss'> & { sanctuary?: RegionDef['sanctuary']; boss?: RegionDef['boss'] }

/** 편집 도구: 소품 종류 하나씩, 그리고 무리·보스·성소·시작점·연못·출구, 지우기·옮기기 */
export type EditTool = PropKind | 'camp' | 'boss' | 'sanctuary' | 'spawn' | 'pond' | 'exit' | 'erase' | 'move'

export const EDIT_TOOLS: readonly EditTool[] = [...PROP_KINDS, 'camp', 'boss', 'sanctuary', 'spawn', 'pond', 'exit', 'erase', 'move']

export const TOOL_NAMES: Readonly<Record<EditTool, string>> = {
  pine: '전나무',
  rock: '바위',
  mound: '눈 둔덕',
  ruin: '무너진 기둥',
  deadTree: '마른 나무',
  bush: '덤불',
  runestone: '룬스톤',
  brazier: '화로',
  olive: '올리브 나무',
  cypress: '사이프러스',
  column: '대리석 기둥',
  peach: '복숭아나무',
  spire: '기암',
  bamboo: '대숲',
  cherry: '벚나무',
  torii: '도리이',
  lantern: '석등',
  maple: '단풍나무',
  cairn: '돌탑',
  jangseung: '장승',
  house: '집',
  campfire: '모닥불',
  well: '우물',
  fence: '울타리',
  palisade: '목책',
  watchtower: '망루',
  longhouse: '긴 집',
  house2: '이층집',
  forge: '대장간',
  stall: '노점',
  bridge: '다리',
  camp: '졸개 무리',
  boss: '보스 자리',
  sanctuary: '성소',
  spawn: '시작점',
  pond: '연못',
  exit: '출구',
  erase: '지우기',
  move: '옮기기',
}

/** 지도 위의 것 하나를 가리킨다 */
export type ItemRef = { list: 'props' | 'camps' | 'ponds' | 'exits'; index: number } | { single: 'spawn' | 'sanctuary' | 'boss' }

/** 놓을 때 고르는 값 */
export interface PlaceOptions {
  /** 무리의 졸개 수 */
  campCount: number
  /** 출구가 이어질 지역 */
  exitTo: string
  /** 소품 크기·회전에 쓰는 난수 (0~1) */
  random: () => number
}

const round = (v: number) => Math.round(v * 100) / 100

/** 클릭한 곳에 도구가 놓는 것을 놓는다. 지우기·옮기기는 여기서 하지 않는다. 고쳤으면 true */
export function place(draft: RegionDraft, tool: EditTool, x: number, z: number, options: PlaceOptions): boolean {
  const at = { x: round(x), z: round(z) }
  switch (tool) {
    case 'camp':
      draft.camps.push({ ...at, count: options.campCount })
      return true
    case 'pond':
      draft.ponds.push({ ...at, radius: 3 })
      return true
    case 'exit':
      if (!options.exitTo) return false
      draft.exits.push({ ...at, to: options.exitTo })
      return true
    case 'boss':
    case 'spawn':
      draft[tool] = at
      return true
    case 'sanctuary':
      draft.sanctuary = { ...at, radius: draft.sanctuary?.radius ?? 10 }
      return true
    case 'erase':
    case 'move':
      return false
    default:
      draft.props.push({ kind: tool, ...at, size: round(0.8 + options.random() * 0.6), rotation: round(options.random() * Math.PI * 2) })
      return true
  }
}

function spotOf(draft: RegionDraft, ref: ItemRef): Spot | null {
  return 'single' in ref ? (draft[ref.single] ?? null) : draft[ref.list][ref.index]!
}

/** (x, z)에서 within m 안의 가장 가까운 것. 소품보다 무리·보스 같은 표지를 먼저 고른다 */
export function nearestItem(draft: RegionDraft, x: number, z: number, within = 2, singles = true): ItemRef | null {
  let best: ItemRef | null = null
  let bestDist = within
  const consider = (ref: ItemRef, bias = 0) => {
    const s = spotOf(draft, ref)
    if (!s) return
    const d = Math.hypot(s.x - x, s.z - z) - bias
    if (d < bestDist) {
      best = ref
      bestDist = d
    }
  }
  if (singles) for (const single of ['spawn', 'sanctuary', 'boss'] as const) consider({ single }, 0.5)
  for (const list of ['camps', 'exits', 'ponds'] as const) draft[list].forEach((_, index) => consider({ list, index }, 0.5))
  draft.props.forEach((_, index) => consider({ list: 'props', index }))
  return best
}

/** 가장 가까운 것을 지운다. 시작점·성소·보스는 하나뿐이라 지우지 않는다. 지웠으면 true */
export function eraseNear(draft: RegionDraft, x: number, z: number, within = 2): boolean {
  const ref = nearestItem(draft, x, z, within, false)
  if (!ref || 'single' in ref) return false
  draft[ref.list].splice(ref.index, 1)
  return true
}

/** 가리킨 것을 (x, z)로 옮긴다 */
export function moveItem(draft: RegionDraft, ref: ItemRef, x: number, z: number): void {
  const s = spotOf(draft, ref)
  if (!s) return
  s.x = round(x)
  s.z = round(z)
}

/** 가리킨 것을 사람이 읽는 이름으로 (편집기 상태 줄) */
export function itemName(draft: RegionDraft, ref: ItemRef): string {
  if ('single' in ref) return TOOL_NAMES[ref.single]
  if (ref.list === 'props') return TOOL_NAMES[draft.props[ref.index]!.kind]
  return TOOL_NAMES[ref.list === 'camps' ? 'camp' : ref.list === 'ponds' ? 'pond' : 'exit']
}

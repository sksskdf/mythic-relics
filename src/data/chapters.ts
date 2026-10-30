/**
 * 장 흐름 (E22-01, TIMELINE.md 4·7장): 서장 → 제1장 북유럽 → 제2장 그리스 → 종장 (막간은 E238에서 없앰).
 * 장마다 열리는 땅과 그 땅의 적 지수(처음 땅 = 1), 땅 단계(= 장비 단계), 차례로 할 일을 적는다.
 * 할 일의 마지막이 그 장을 끝내는 일이다. 끝내면 다음 장이 열리고 그 장의 땅이 열린다.
 */
import { DataError, list, num, type Obj, obj, oneOf, onlyKeys, str, table } from './check'
import raw from './chapters.json'
import { REGIONS } from './regions'

/** 할 일의 종류: 땅에 들어섬, 그 신화권 신화를 고름, 신화 단계, 땅의 보스를 이김, 유물을 벼림 */
export const STEP_KINDS = ['enter', 'choose', 'awaken', 'level', 'boss', 'forge', 'return'] as const
export type StepKind = (typeof STEP_KINDS)[number]

/**
 * 땅 적 피해가 적 지수를 따르는 정도: 생명은 적 지수만큼, 피해는 적 지수의 0.55제곱만큼 (주인공 생명은 공격만큼 크게 늘지 않는다).
 * E22-06 곡선: 0.5면 그 땅 보통 적에게 맞고 버티는 대가 10~18이라 목표(들어설 때 8, 떠날 때 12)보다 길어 올렸다
 */
export const LAND_DAMAGE_EXPONENT = 0.55

/** 땅 세기(적 지수) → 그 땅 적의 생명·피해 배율 (E22-02) */
export function landScale(power: number): { hp: number; damage: number } {
  return { hp: power, damage: power ** LAND_DAMAGE_EXPONENT }
}

/** 목표 한 줄의 글자 수 상한 (HUD 한 줄에 들어가게) */
export const GOAL_MAX_CHARS = 24

export interface ChapterStep {
  kind: StepKind
  /** 가야 할 땅 (지도 표시) */
  region: string
  /** choose: 그 신화권 */
  realm?: string
  /** level: 신화 단계, forge: 유물 단계 */
  n?: number
  /** boss: 이기면 그 신화권의 닫힌 신화가 모두 열린다 (E22-03) */
  opens?: string
  /** HUD 목표 한 줄 */
  goal: string
}

export interface ChapterDef {
  id: string
  /** 장 제목 띠의 앞: "제1장" */
  title: string
  /** 장 제목 띠의 뒤: "서리 거인의 땅" */
  name: string
  /** 이 장 땅의 단계 (장비 단계) */
  tier: number
  /** 이 장에 열리는 땅과 그 땅 보통 적의 세기 (처음 땅 = 1) */
  lands: Record<string, number>
  steps: ChapterStep[]
}

const REALMS = [...new Set(Object.values(REGIONS).flatMap((r) => (r.realm ? [r.realm] : [])))]

export function parseChapters(rawChapters: unknown, regions = REGIONS, path = 'chapters.json'): ChapterDef[] {
  const out: ChapterDef[] = []
  /** 앞 장까지 열린 땅 (들어서는 일은 열린 땅에만) */
  const open = new Set(Object.values(regions).filter((r) => r.kind === 'hub').map((r) => r.id))
  for (const [id, o] of table(rawChapters, path)) {
    const p = `${path}.${id}`
    onlyKeys(o, p, ['title', 'name', 'tier', 'lands', 'steps'])
    const tier = num(o, 'tier', p, { min: 1, max: 9 })
    const lands: Record<string, number> = {}
    for (const [land, power] of Object.entries(obj(o.lands, `${p}.lands`))) {
      const region = regions[land]
      if (!region) throw new DataError(`${p}.lands.${land}`, '없는 지역입니다')
      if (region.kind === 'hub') throw new DataError(`${p}.lands.${land}`, '마을은 늘 열려 있습니다')
      if (open.has(land)) throw new DataError(`${p}.lands.${land}`, '앞 장에서 이미 열린 땅입니다')
      if (typeof power !== 'number' || !(power > 0)) throw new DataError(`${p}.lands.${land}`, '적 지수는 0보다 큰 숫자여야 합니다')
      lands[land] = power
      open.add(land)
    }
    const rows = list(o, 'steps', p)
    if (rows.length === 0) throw new DataError(`${p}.steps`, '할 일이 하나는 있어야 합니다')
    const steps = rows.map((row, i): ChapterStep => {
      const sp = `${p}.steps[${i}]`
      const s: Obj = obj(row, sp)
      onlyKeys(s, sp, ['kind', 'region', 'realm', 'n', 'opens', 'goal'])
      const kind = oneOf(s, 'kind', sp, STEP_KINDS)
      const regionId = str(s, 'region', sp)
      const region = regions[regionId]
      if (!region) throw new DataError(`${sp}.region`, `없는 지역입니다 ("${regionId}")`)
      if (!open.has(regionId)) throw new DataError(`${sp}.region`, `이 장까지 열리지 않은 땅입니다 ("${regionId}")`)
      const goal = str(s, 'goal', sp)
      if ([...goal].length > GOAL_MAX_CHARS) throw new DataError(`${sp}.goal`, `목표는 ${GOAL_MAX_CHARS}자 안이어야 합니다 (${[...goal].length}자)`)
      const step: ChapterStep = { kind, region: regionId, goal }
      if (kind === 'choose' || kind === 'awaken') step.realm = oneOf(s, 'realm', sp, REALMS)
      else if (s.realm !== undefined) throw new DataError(`${sp}.realm`, '신화권은 choose·awaken에만 씁니다')
      if (kind === 'level' || kind === 'forge' || kind === 'awaken' || kind === 'return') step.n = num(s, 'n', sp, kind === 'level' ? { min: 2, max: 4 } : { min: 1, max: kind === 'return' ? 9 : 4 })
      else if (s.n !== undefined) throw new DataError(`${sp}.n`, '단계·수는 level·forge·awaken·return에만 씁니다')
      if (kind === 'return' && !region.sanctuary) throw new DataError(`${sp}.region`, `귀환은 성소 화로에서 합니다 ("${regionId}")`)
      if (kind === 'boss' && !region.boss) throw new DataError(`${sp}.region`, `보스가 없는 땅입니다 ("${regionId}")`)
      if (kind === 'boss' && s.opens !== undefined) step.opens = oneOf(s, 'opens', sp, REALMS)
      else if (s.opens !== undefined) throw new DataError(`${sp}.opens`, '여는 신화권은 boss에만 씁니다')
      if (kind === 'choose' && !region.sanctuary) throw new DataError(`${sp}.region`, `성소가 없는 땅입니다 ("${regionId}")`)
      if (kind === 'forge' && region.kind !== 'hub') throw new DataError(`${sp}.region`, '유물은 마을 대장간에서 벼립니다')
      return step
    })
    out.push({ id, title: str(o, 'title', p), name: str(o, 'name', p), tier, lands, steps })
  }
  if (out.length === 0) throw new DataError(path, '장이 하나는 있어야 합니다')
  const last = out.at(-1)!.steps.at(-1)!
  if (last.kind !== 'boss' || !regions[last.region]?.finale) throw new DataError(path, '마지막 장은 마지막 무대의 보스로 끝나야 합니다')
  return out
}

export const CHAPTERS: readonly ChapterDef[] = parseChapters(raw)

/** 장 흐름의 땅 가운데 가장 센 땅의 적 지수 (장 흐름 밖의 들판은 엔딩 뒤라 이만큼) */
export const TOP_POWER = Math.max(...CHAPTERS.flatMap((c) => Object.values(c.lands)))

/** 그 땅이 열리는 장 (장 흐름에 없는 땅은 null: 엔딩 뒤) */
export function chapterOf(region: string, chapters: readonly ChapterDef[] = CHAPTERS): ChapterDef | null {
  return chapters.find((c) => region in c.lands) ?? null
}

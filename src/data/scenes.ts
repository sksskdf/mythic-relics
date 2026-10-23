/**
 * 대화 장면 데이터 (E12-10, DESIGN.md 9.5). 장면마다 그 지역의 말하는 인물과 대사, 짧은 몸짓 하나를 적는다.
 * 대사는 대화 상자에 한 자씩 써진다. 글은 대화 상자 안에만 둔다 (텍스트 최소화의 예외).
 */
import { DataError, list, type Obj, obj, oneOf, onlyKeys, str, table } from './check'
import { REGIONS } from './regions'
import raw from './scenes.json'

/** 말하는 인물의 몸짓: 주인공 쪽으로 돌아보기, 고개 끄덕이기 */
export const SCENE_POSES = ['turn', 'nod'] as const
export type ScenePose = (typeof SCENE_POSES)[number]

/** 대사 한 줄의 글자 수 상한 (대화 상자 한 줄에 들어가게) */
export const LINE_MAX_CHARS = 32
/** 한 장면의 대사 수 상한 (짧게) */
export const SCENE_MAX_LINES = 6

export interface SceneLine {
  /** 말하는 사람: 그 지역 마을 사람의 이름 */
  who: string
  text: string
  pose?: ScenePose
}

export interface SceneDef {
  id: string
  /** 장면이 벌어지는 지역 (말하는 사람을 찾는 곳) */
  region: string
  lines: SceneLine[]
}

export function parseScenes(rawScenes: unknown, path = 'scenes.json'): Record<string, SceneDef> {
  const out: Record<string, SceneDef> = {}
  for (const [id, o] of table(rawScenes, path)) {
    const p = `${path}.${id}`
    onlyKeys(o, p, ['region', 'lines'])
    const regionId = str(o, 'region', p)
    const region = REGIONS[regionId]
    if (!region) throw new DataError(`${p}.region`, `없는 지역입니다 ("${regionId}")`)
    const names = new Set(region.npcs.map((n) => n.name))
    const rows = list(o, 'lines', p)
    if (rows.length === 0 || rows.length > SCENE_MAX_LINES) throw new DataError(`${p}.lines`, `대사는 1~${SCENE_MAX_LINES}줄이어야 합니다`)
    const lines = rows.map((row, i): SceneLine => {
      const lp = `${p}.lines[${i}]`
      const l: Obj = obj(row, lp)
      onlyKeys(l, lp, ['who', 'text', 'pose'])
      const who = str(l, 'who', lp)
      if (!names.has(who)) throw new DataError(`${lp}.who`, `${region.name}에 없는 사람입니다 ("${who}")`)
      const text = str(l, 'text', lp)
      if ([...text].length > LINE_MAX_CHARS) throw new DataError(`${lp}.text`, `대사는 ${LINE_MAX_CHARS}자 안이어야 합니다 (${[...text].length}자)`)
      return { who, text, ...(l.pose !== undefined ? { pose: oneOf(l, 'pose', lp, SCENE_POSES) } : {}) }
    })
    out[id] = { id, region: regionId, lines }
  }
  return out
}

export const SCENES: Readonly<Record<string, SceneDef>> = parseScenes(raw)

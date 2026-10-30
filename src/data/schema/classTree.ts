/** 클래스 트리 (classes.json)와 원천의 형식과 검사 */

import { DataError, list, obj, oneOf, onlyKeys, str } from '../check'
import type { GodDef } from './gods'

// ───────────────────────────── 클래스 트리 ─────────────────────────────

/** (DESIGN.md 6장, CLASSES.md 1장) */
/** 원천 넷: 불꽃(때릴수록), 사냥(쓰러뜨릴수록), 바람(걸을수록), 바위(버틸수록) */
export const SOURCE_IDS = ['flame', 'hunt', 'wind', 'stone'] as const
export type SourceId = (typeof SOURCE_IDS)[number]

export interface TreeClass {
  name: string
  /** Lv1~Lv4 칭호 */
  titles: readonly [string, string, string, string]
  /** 잠겨 있을 때 보여 주는 힌트. 조건을 바로 말하지 않고 그 신화의 이야기로 암시한다 */
  hint: string
}

export interface BaseClass extends TreeClass {
  source: SourceId
  /** 게임에 들어 있는 신이면 gods.json의 id */
  god?: string
}

export interface ClassTree {
  /** 원천 넷과 그 상위 클래스 (같은 원천 클래스 둘을 Lv3) */
  sources: readonly { id: SourceId; name: string; gain: string; upper: TreeClass }[]
  /** 원천 짝 여섯: 두 원천의 클래스를 하나씩 Lv3 */
  pairs: readonly (TreeClass & { sources: readonly [SourceId, SourceId] })[]
  mythologies: readonly { id: string; name: string; stage: string; classes: readonly BaseClass[]; upper: TreeClass }[]
  /** 히든 클래스. 원천이 없으면 그때 가장 높은 숙련을 쓴다 */
  hidden: readonly (TreeClass & { source: SourceId | null; god?: string })[]
}

function treeClass(raw: unknown, path: string, extra: readonly string[] = []): TreeClass {
  const o = obj(raw, path)
  onlyKeys(o, path, ['name', 'titles', 'hint', ...extra])
  const titles = list(o, 'titles', path)
  if (titles.length !== 4 || titles.some((t) => typeof t !== 'string' || t.trim() === '')) {
    throw new DataError(`${path}.titles`, '1~4단계 칭호 네 개여야 합니다')
  }
  return { name: str(o, 'name', path), titles: titles as [string, string, string, string], hint: str(o, 'hint', path) }
}

/** 클래스 트리 (CLASSES.md를 옮긴 것). 게임에 들어 있는 신은 gods.json과 원천·칭호가 맞아야 한다. */
export function parseClassTree(raw: unknown, gods: Record<string, GodDef>, path = 'classes.json'): ClassTree {
  const o = obj(raw, path)
  onlyKeys(o, path, ['sources', 'pairs', 'mythologies', 'hidden'])
  const sources = list(o, 'sources', path).map((a, i) => {
    const p = `${path}.sources[${i}]`
    const ao = obj(a, p)
    onlyKeys(ao, p, ['id', 'name', 'gain', 'upper'])
    return { id: oneOf(ao, 'id', p, SOURCE_IDS), name: str(ao, 'name', p), gain: str(ao, 'gain', p), upper: treeClass(ao.upper, `${p}.upper`) }
  })
  if (sources.map((x) => x.id).join() !== SOURCE_IDS.join()) throw new DataError(`${path}.sources`, `원천 ${SOURCE_IDS.join(', ')}이 이 순서로 모두 있어야 합니다`)
  const seenPairs = new Set<string>()
  const pairs = list(o, 'pairs', path).map((x, i) => {
    const p = `${path}.pairs[${i}]`
    const base = treeClass(x, p, ['sources'])
    const two = list(obj(x, p), 'sources', p)
    if (two.length !== 2 || two.some((v) => !(SOURCE_IDS as readonly unknown[]).includes(v)) || two[0] === two[1]) {
      throw new DataError(`${p}.sources`, '서로 다른 원천 둘이어야 합니다')
    }
    const key = [...two].sort().join()
    if (seenPairs.has(key)) throw new DataError(`${p}.sources`, '같은 원천 짝이 두 번 나옵니다')
    seenPairs.add(key)
    return { ...base, sources: two as [SourceId, SourceId] }
  })
  if (pairs.length !== 6) throw new DataError(`${path}.pairs`, '원천 짝 여섯이 모두 있어야 합니다')
  const linked = new Set<string>()
  const mythologies = list(o, 'mythologies', path).map((m, i) => {
    const p = `${path}.mythologies[${i}]`
    const mo = obj(m, p)
    onlyKeys(mo, p, ['id', 'name', 'stage', 'classes', 'upper'])
    const classes = list(mo, 'classes', p).map((c, j): BaseClass => {
      const cp = `${p}.classes[${j}]`
      const base = treeClass(c, cp, ['source', 'god'])
      const co = obj(c, cp)
      const source = oneOf(co, 'source', cp, SOURCE_IDS)
      if (co.god === undefined) return { ...base, source }
      const god = str(co, 'god', cp)
      const def = gods[god]
      if (!def) throw new DataError(`${cp}.god`, `gods.json에 없는 신입니다 ("${god}")`)
      if (def.source !== source) throw new DataError(`${cp}.source`, `gods.json의 원천(${def.source})과 다릅니다`)
      if (def.titles.join() !== base.titles.join()) throw new DataError(`${cp}.titles`, 'gods.json의 칭호와 다릅니다')
      linked.add(god)
      return { ...base, source, god }
    })
    return { id: str(mo, 'id', p), name: str(mo, 'name', p), stage: str(mo, 'stage', p), classes, upper: treeClass(mo.upper, `${p}.upper`) }
  })
  const link = (god: string, base: TreeClass, source: SourceId | null, cp: string): void => {
    const def = gods[god]
    if (!def) throw new DataError(`${cp}.god`, `gods.json에 없는 신입니다 ("${god}")`)
    if (source !== null && def.source !== source) throw new DataError(`${cp}.source`, `gods.json의 원천(${def.source})과 다릅니다`)
    if (def.titles.join() !== base.titles.join()) throw new DataError(`${cp}.titles`, 'gods.json의 칭호와 다릅니다')
    linked.add(god)
  }
  const hidden = list(o, 'hidden', path).map((h, i) => {
    const p = `${path}.hidden[${i}]`
    const ho = obj(h, p)
    const base = treeClass(h, p, ['source', 'god'])
    const source = ho.source === null ? null : oneOf(ho, 'source', p, SOURCE_IDS)
    if (ho.god === undefined) return { ...base, source }
    const god = str(ho, 'god', p)
    link(god, base, source, p)
    if (!gods[god]!.hidden) throw new DataError(`${p}.god`, '히든 신화에는 hidden 신만 이을 수 있습니다')
    return { ...base, source, god }
  })
  for (const god of Object.keys(gods)) {
    if (!linked.has(god)) throw new DataError(path, `gods.json의 "${god}"이(가) 신화 트리에 없습니다`)
  }
  return { sources, pairs, mythologies, hidden }
}

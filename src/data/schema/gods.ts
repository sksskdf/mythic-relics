/** 신·클래스 데이터 (gods.json)의 형식과 검사 (E301-04에서 schema.ts를 나눔) */

import { ATTACK_STYLES, type AttackStyle } from '../../combat/styles'
import { LOOK_SLOTS, LOOKS, type LookSlot } from '../../looks/catalog'
import { bool, color, DataError, list, num, obj, oneOf, onlyKeys, optNum, str, table } from '../check'
import { type MythAlways, parseAlways } from '../mythAlways'
import { type ClassPassive, nonDecreasing, PASSIVE_PARTS, type PassivePart, parsePassive, parseUltimate, type Realm, REALMS, type UltimateDef } from '../classKit'
import { SOURCE_IDS, type SourceId } from './classTree'

// ───────────────────────────── 신·클래스 ─────────────────────────────

export interface GodDef {
  id: string
  /** 신 이름 (토르) */
  name: string
  /** 발현했을 때의 클래스 이름 (Lv1 칭호) */
  title: string
  /** Lv1~Lv4 칭호 */
  titles: readonly [string, string, string, string]
  /** 원천 (DESIGN.md 6장): 힘을 모으는 방식. 같은 원천끼리 숙련을 나눠 쓴다. */
  source: SourceId
  /** 발현 연출과 HUD에 쓰는 대표 색 */
  color: string
  /** 클래스 창 트리에서의 자리 (E4) */
  tree: { column: number; row: number }
  /** 발현 패시브 (고른 신화의 추가 효과) */
  passive: ClassPassive
  /** 빌린 힘 칸에 들면 빌려주는 대표 패시브 부품 하나 (E237, MYTHBUILD.md 3.1) */
  lend: PassivePart
  /** 열린 신화의 상시 효과 (E12-01, DESIGN.md 4.2.1) */
  always: MythAlways
  /** 발현했을 때의 외형 (칸 → 외형 id) */
  looks: Readonly<Partial<Record<LookSlot, string>>>
  /** 신화권 (드랍과 지역) */
  realm: Realm
  /** 발현 표식: 이 클래스의 정체성을 드러내는 고정 외형 (등에 붙고 기운 연출이 딸린다) */
  mark: string
  /** 히든 클래스의 신. 유물이 무작위로 떨어지지 않는다 */
  hidden: boolean
  /** 발현에 필요한 같은 신 유물 수 (보통 3, 아수라 4) */
  manifestCount: number
  /** 궁극기 (E6: 클래스마다 다르다) */
  ultimate: UltimateDef
  /** 공격 모션 (E6-10, src/combat/styles.ts) */
  attack: AttackStyle
  /** 이 신화의 유물 (E13-03: 신화마다 하나, 대장간에서 4단계까지 올린다) */
  relic: string
}

/** 외형 id가 있고, 그 외형이 그 칸의 것인지 검사한다. */
export function lookOf(id: unknown, slot: LookSlot | null, path: string): string {
  if (typeof id !== 'string' || !Object.hasOwn(LOOKS, id)) throw new DataError(path, `없는 외형입니다 ("${String(id)}", src/looks/catalog.ts)`)
  const def = LOOKS[id]!
  if (slot && def.slot !== slot) throw new DataError(path, `${slot} 칸의 외형이 아닙니다 ("${id}"는 ${def.slot})`)
  return id
}

function parseLooks(raw: unknown, path: string): Partial<Record<LookSlot, string>> {
  const o = obj(raw, path)
  onlyKeys(o, path, LOOK_SLOTS)
  const out: Partial<Record<LookSlot, string>> = {}
  for (const slot of LOOK_SLOTS) if (o[slot] !== undefined) out[slot] = lookOf(o[slot], slot, `${path}.${slot}`)
  return out
}

export function parseGods(raw: unknown, path = 'gods.json'): Record<string, GodDef> {
  const out: Record<string, GodDef> = {}
  for (const [id, o] of table(raw, path)) {
    const p = `${path}.${id}`
    onlyKeys(o, p, ['name', 'titles', 'source', 'color', 'tree', 'passive', 'lend', 'always', 'looks', 'mark', 'hidden', 'manifestCount', 'ultimate', 'attack', 'realm', 'relic'])
    const titles = list(o, 'titles', p)
    if (titles.length !== 4 || titles.some((t) => typeof t !== 'string' || t.trim() === '')) {
      throw new DataError(`${p}.titles`, '1~4단계 칭호 네 개여야 합니다')
    }
    const tree = obj(o.tree, `${p}.tree`)
    onlyKeys(tree, `${p}.tree`, ['column', 'row'])
    const passive = parsePassive(o.passive, `${p}.passive`)
    if (passive.companions) nonDecreasing(passive.companions.counts, `${p}.passive.companions.counts`)
    if (passive.orbit) nonDecreasing(passive.orbit.count, `${p}.passive.orbit.count`)
    const lend = oneOf(o, 'lend', p, PASSIVE_PARTS)
    if (!passive[lend]) throw new DataError(`${p}.lend`, `빌려주는 힘 "${lend}"가 passive에 없습니다`)
    out[id] = {
      id,
      name: str(o, 'name', p),
      title: titles[0] as string,
      titles: titles as [string, string, string, string],
      source: oneOf(o, 'source', p, SOURCE_IDS),
      color: color(o, 'color', p),
      tree: { column: num(tree, 'column', `${p}.tree`), row: num(tree, 'row', `${p}.tree`) },
      passive,
      lend,
      always: parseAlways(o.always, `${p}.always`),
      looks: parseLooks(o.looks ?? {}, `${p}.looks`),
      realm: oneOf(o, 'realm', p, REALMS),
      mark: lookOf(o.mark, 'mark', `${p}.mark`),
      hidden: bool(o, 'hidden', p),
      manifestCount: optNum(o, 'manifestCount', p, { min: 2, max: 4 }) ?? 3,
      ultimate: parseUltimate(o.ultimate, `${p}.ultimate`),
      attack: oneOf(o, 'attack', p, ATTACK_STYLES),
      relic: str(o, 'relic', p),
    }
    if (out[id]!.looks.mark !== undefined) throw new DataError(`${p}.looks.mark`, '표식은 looks가 아니라 mark에 적습니다')
  }
  if (Object.keys(out).length === 0) throw new DataError(path, '신이 하나도 없습니다')
  return out
}

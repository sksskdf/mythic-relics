import { DATA } from '../data'
import materialsJson from '../data/materials.json'
import { DataError, onlyKeys, str, table } from '../data/check'
import { REALMS } from '../data/classKit'
import { type God, GODS, isRelicId, relicDef, RELIC_IDS } from '../relics/data'

/**
 * 재료 (E13-04, DESIGN.md 4.4·9.3): 신화권 공통 5, 신화 고유 21, 지역 보스의 귀한 재료 5.
 * 무게 없이 개수만 센다. 재료가 된 유물(E13-03)도 같은 주머니에 든다.
 */
export type MaterialKind = 'realm' | 'myth' | 'boss'

export interface MaterialDef {
  id: string
  name: string
  kind: MaterialKind
  /** 신화권 공통 재료의 신화권 */
  realm?: string
  /** 신화 고유 재료의 신 */
  god?: God
  /** 보스의 귀한 재료를 떨어뜨리는 보스 이름 (enemies.json의 boss) */
  boss?: string
}

/** 한 번 잡을 때 재료가 나올 확률 (보스는 늘) */
export const MATERIAL_DROPS = {
  /** 그 신화권 공통 재료 */
  realm: 0.25,
  /** 그 신화권 신 하나의 고유 재료 (고른 신화가 그 신화권이면 반은 그 신화로) */
  myth: 0.15,
  /** 정예가 더 주는 공통 재료 */
  elite: 2,
  /** 보스가 주는 공통 재료 */
  boss: 3,
  /** 히든 신화의 고유 재료: 어디서나 아주 드물게 */
  hidden: 0.01,
} as const

export function parseMaterials(raw: unknown, path = 'materials.json'): Record<string, MaterialDef> {
  const bosses = new Set(Object.values(DATA.enemies).flatMap((e) => (e.boss ? [e.boss] : [])))
  const out: Record<string, MaterialDef> = {}
  for (const [id, o] of table(raw, path)) {
    const p = `${path}.${id}`
    onlyKeys(o, p, ['name', 'kind', 'realm', 'god', 'boss'])
    if (RELIC_IDS.includes(id)) throw new DataError(p, '유물 id와 겹칩니다 (같은 주머니에 든다)')
    const kind = str(o, 'kind', p) as MaterialKind
    const def: MaterialDef = { id, name: str(o, 'name', p), kind }
    if (kind === 'realm') {
      const realm = str(o, 'realm', p)
      if (!(REALMS as readonly string[]).includes(realm)) throw new DataError(`${p}.realm`, `없는 신화권입니다 ("${realm}")`)
      def.realm = realm
    } else if (kind === 'myth') {
      const god = str(o, 'god', p)
      if (!GODS[god]) throw new DataError(`${p}.god`, `gods.json에 없는 신입니다 ("${god}")`)
      def.god = god
    } else if (kind === 'boss') {
      const boss = str(o, 'boss', p)
      if (!bosses.has(boss)) throw new DataError(`${p}.boss`, `enemies.json에 없는 보스입니다 ("${boss}")`)
      def.boss = boss
    } else throw new DataError(`${p}.kind`, `realm·myth·boss 가운데 하나여야 합니다 ("${String(o.kind)}")`)
    out[id] = def
  }
  for (const god of Object.keys(GODS)) {
    if (!Object.values(out).some((m) => m.god === god)) throw new DataError(path, `${god}의 고유 재료가 없습니다`)
  }
  return out
}

export const MATERIALS: Readonly<Record<string, MaterialDef>> = parseMaterials(materialsJson)

/** 재료 이름 (재료가 된 유물이면 유물 이름) */
export function materialName(id: string): string {
  return MATERIALS[id]?.name ?? (isRelicId(id) ? relicDef(id).name : id)
}

/** 그 신화권의 공통 재료, 그 신의 고유 재료, 그 보스의 귀한 재료 */
export const realmMaterial = (realm: string): string | undefined => Object.values(MATERIALS).find((m) => m.kind === 'realm' && m.realm === realm)?.id
export const mythMaterial = (god: God): string | undefined => Object.values(MATERIALS).find((m) => m.kind === 'myth' && m.god === god)?.id
export const bossMaterial = (boss: string): string | undefined => Object.values(MATERIALS).find((m) => m.kind === 'boss' && m.boss === boss)?.id

/**
 * 몬스터 하나를 잡았을 때 나오는 재료 (E13-04-1).
 * - 그 신화권 공통 재료 25% (정예 +2, 보스 +3)
 * - 그 신화권 신 하나의 고유 재료 15% (고른 신화가 그 신화권이면 반은 그 신화, 보스는 늘)
 * - 지역 보스는 그 보스의 귀한 재료 하나
 * - 히든 신화의 고유 재료 1% (어디서나)
 */
export function rollMaterials(rng: () => number, kill: { realm?: string; elite: boolean; boss?: string }, chosen: God | null): { id: string; count: number }[] {
  const out: { id: string; count: number }[] = []
  const realm = kill.realm
  if (realm) {
    const common = realmMaterial(realm)
    const count = (rng() < MATERIAL_DROPS.realm ? 1 : 0) + (kill.elite ? MATERIAL_DROPS.elite : 0) + (kill.boss ? MATERIAL_DROPS.boss : 0)
    if (common && count > 0) out.push({ id: common, count })
    if (kill.boss || rng() < MATERIAL_DROPS.myth) {
      const gods = Object.values(GODS).filter((g) => g.realm === realm && !g.hidden)
      const own = chosen && gods.some((g) => g.id === chosen) && rng() < 0.5 ? chosen : gods[Math.floor(rng() * gods.length)]?.id
      const id = own ? mythMaterial(own) : undefined
      if (id) out.push({ id, count: 1 })
    }
  }
  if (kill.boss) {
    const id = bossMaterial(kill.boss)
    if (id) out.push({ id, count: 1 })
  }
  for (const g of Object.values(GODS)) {
    if (!g.hidden || rng() >= MATERIAL_DROPS.hidden) continue
    const id = mythMaterial(g.id)
    if (id) out.push({ id, count: 1 })
  }
  return out
}

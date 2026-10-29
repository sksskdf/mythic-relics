import { DATA } from '../data'
import materialsJson from '../data/materials.json'
import { DataError, onlyKeys, str, table } from '../data/check'
import { REALMS } from '../data/classKit'
import { isRelicId, relicDef, RELIC_IDS } from '../relics/data'

/**
 * 재료 (E13-04 → E21-04 → E303-04, `CYCLE.md` 5.5): 둘뿐이다. 원형(신화권을 가리지 않는 재료, 몬스터·녹인 장비)과 보스 재료 5(장 보스).
 * 신화권 재료 5는 옛 저장을 옮길 때만 쓴다(원형으로 하나씩 바꿔 준다, 저장 v15).
 * 무게 없이 개수만 센다. 재료가 된 유물은 엔딩 뒤에만 떨어지며 같은 주머니에 든다 (히든 신화를 여는 열쇠).
 */
export type MaterialKind = 'prototype' | 'realm' | 'boss'

/** 원형의 재료 id */
export const PROTOTYPE = 'prototype'

export interface MaterialDef {
  id: string
  name: string
  kind: MaterialKind
  /** 신화권 재료의 신화권 */
  realm?: string
  /** 보스 재료를 떨어뜨리는 보스 이름 (enemies.json의 boss) */
  boss?: string
}

/** 한 번 잡을 때 원형이 나오는 수 (보스 재료는 그 보스가 늘 하나). 대장간 값이 셋 배가 되어 셋 배로 (E303) */
export const MATERIAL_DROPS = {
  /** 졸개가 원형 하나를 줄 확률 */
  realm: 0.75,
  /** 정예가 더 주는 원형 */
  elite: 6,
  /** 보스가 주는 원형 */
  boss: 9,
} as const

export function parseMaterials(raw: unknown, path = 'materials.json'): Record<string, MaterialDef> {
  const bosses = new Set(Object.values(DATA.enemies).flatMap((e) => (e.boss ? [e.boss] : [])))
  const out: Record<string, MaterialDef> = {}
  for (const [id, o] of table(raw, path)) {
    const p = `${path}.${id}`
    onlyKeys(o, p, ['name', 'kind', 'realm', 'boss'])
    if (RELIC_IDS.includes(id)) throw new DataError(p, '유물 id와 겹칩니다 (같은 주머니에 든다)')
    const kind = str(o, 'kind', p) as MaterialKind
    const def: MaterialDef = { id, name: str(o, 'name', p), kind }
    if (kind === 'realm') {
      const realm = str(o, 'realm', p)
      if (!(REALMS as readonly string[]).includes(realm)) throw new DataError(`${p}.realm`, `없는 신화권입니다 ("${realm}")`)
      def.realm = realm
    } else if (kind === 'boss') {
      const boss = str(o, 'boss', p)
      if (!bosses.has(boss)) throw new DataError(`${p}.boss`, `enemies.json에 없는 보스입니다 ("${boss}")`)
      def.boss = boss
    } else if (kind !== 'prototype') throw new DataError(`${p}.kind`, `prototype·realm·boss 가운데 하나여야 합니다 ("${String(o.kind)}")`)
    out[id] = def
  }
  for (const realm of REALMS.filter((r) => r !== 'hidden')) {
    if (!Object.values(out).some((m) => m.realm === realm)) throw new DataError(path, `${realm} 신화권 재료가 없습니다 (옛 저장 옮기기에 쓴다)`)
  }
  if (out[PROTOTYPE]?.kind !== 'prototype') throw new DataError(path, '원형(prototype)이 없습니다')
  return out
}

export const MATERIALS: Readonly<Record<string, MaterialDef>> = parseMaterials(materialsJson)

/** 재료 이름 (재료가 된 유물이면 유물 이름) */
export function materialName(id: string): string {
  return MATERIALS[id]?.name ?? (isRelicId(id) ? relicDef(id).name : id)
}

/** 그 신화권의 재료, 그 보스의 재료 */
export const realmMaterial = (realm: string): string | undefined => Object.values(MATERIALS).find((m) => m.kind === 'realm' && m.realm === realm)?.id
export const bossMaterial = (boss: string): string | undefined => Object.values(MATERIALS).find((m) => m.kind === 'boss' && m.boss === boss)?.id

/**
 * 몬스터 하나를 잡았을 때 나오는 재료 (E13-04-1 → E21-04 → E303-04).
 * - 원형: 졸개 75%로 하나, 정예 +6, 보스 +9 (신화권을 가리지 않는다)
 * - 장 보스는 그 보스의 재료 하나
 */
export function rollMaterials(rng: () => number, kill: { realm?: string; elite: boolean; boss?: string }): { id: string; count: number }[] {
  const out: { id: string; count: number }[] = []
  const count = (rng() < MATERIAL_DROPS.realm ? 1 : 0) + (kill.elite ? MATERIAL_DROPS.elite : 0) + (kill.boss ? MATERIAL_DROPS.boss : 0)
  if (count > 0) out.push({ id: PROTOTYPE, count })
  const boss = kill.boss ? bossMaterial(kill.boss) : undefined
  if (boss) out.push({ id: boss, count: 1 })
  return out
}

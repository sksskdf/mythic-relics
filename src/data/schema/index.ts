/**
 * 게임 데이터(유물, 신·클래스, 적)의 형식과 검사.
 * 데이터 파일은 src/data/*.json 이고, 여기서 형식을 검사해 게임이 쓰는 모양으로 바꾼다.
 * 잘못된 데이터는 어느 파일의 어느 값이 왜 틀렸는지 알려 주며 실패한다. (빌드와 테스트가 함께 실패)
 *
 * 이 폴더는 three.js 등 다른 모듈에 기대지 않는다. (빌드 설정에서도 불러 쓴다)
 * E301-04: 파일 하나(875줄)를 데이터 파일마다 나눴다. 밖에서는 지금처럼 `data/schema`에서 불러 쓴다.
 */

import { LOOKS, type LookSlot } from '../../looks/catalog'
import { DataError } from '../check'
import { type GodDef, parseGods } from './gods'
import { type RelicDef, parseRelics } from './relics'
import { type GiantSpec, parseEnemies } from './enemies'
import { type ClassTree, parseClassTree } from './classTree'

export type { ClassPassive, LegendDef, Realm, UltimateDef } from '../classKit'
export { DataError } from '../check'
export * from './gods'
export * from './relics'
export * from './enemies'
export * from './classTree'

// ───────────────────────────── 전체 ─────────────────────────────

export interface GameData {
  gods: Record<string, GodDef>
  relics: Record<string, RelicDef>
  enemies: Record<string, GiantSpec>
  classes: ClassTree
}

/**
 * 유물·클래스·외형의 정합 (DESIGN.md 10.4)
 * - 유물의 외형은 표식 칸일 수 없다.
 * - 같은 신의 유물끼리는 부위가 겹치지 않는다.
 * - 신화 외형은 그 신화의 유물(gods.relic)이 차지한 부위를 덮지 않는다. (나머지 유물은 E13부터 재료라 끼지 않는다)
 * - 발현에 필요한 유물 수만큼 그 신의 유물이 있어야 한다. (아직 없는 유물은 히든이 아닌 신만 허용: 신화권이 다 들어오기 전)
 */
function checkLookHarmony(gods: Record<string, GodDef>, relics: Record<string, RelicDef>): void {
  for (const god of Object.values(gods)) {
    // 함께 쓰는 유물(also)도 그 신의 유물로 센다 (쿠사나기·토츠카는 스사노오와 아수라왕 둘 다)
    const own = Object.values(relics).filter((r) => r.god === god.id || r.also.includes(god.id))
    const used = new Map<LookSlot, string>()
    for (const relic of own) {
      const slot = LOOKS[relic.look]!.slot
      if (slot === 'mark') throw new DataError(`relics.json.${relic.id}.look`, '유물 외형은 표식 칸일 수 없습니다')
      const other = used.get(slot)
      if (other) throw new DataError(`relics.json.${relic.id}.look`, `같은 신의 유물 "${other}"와 부위(${slot})가 겹칩니다`)
      used.set(slot, relic.id)
      if (relic.id === god.relic && god.looks[slot] !== undefined) {
        throw new DataError(`gods.json.${god.id}.looks.${slot}`, `${god.id}의 유물 "${relic.id}"가 차지한 부위라 신화 외형을 둘 수 없습니다`)
      }
    }
    if (god.hidden && own.length < god.manifestCount) {
      throw new DataError(`gods.json.${god.id}.manifestCount`, `히든 신화인데 유물이 ${own.length}개뿐입니다 (${god.manifestCount}개 필요)`)
    }
  }
}

/** 코드가 이름으로 직접 쓰는 적 (맵 배치, 승급 전설). 데이터에서 빠지면 안 된다. */
export const REQUIRED_ENEMIES = ['grunt', 'king', 'utgardKing'] as const

/** 데이터 파일 세 개를 한꺼번에 검사한다. 서로 가리키는 값(유물의 신 등)도 확인한다. */
export function parseGameData(
  raw: { gods: unknown; relics: unknown; enemies: unknown; classes: unknown },
  models?: readonly string[],
): GameData {
  const gods = parseGods(raw.gods)
  const relics = parseRelics(raw.relics, { gods: Object.keys(gods), ...(models ? { models } : {}) })
  checkLookHarmony(gods, relics)
  const enemies = parseEnemies(raw.enemies)
  for (const enemy of Object.values(enemies)) {
    if (enemy.fixedDrop !== undefined && !relics[enemy.fixedDrop]) {
      throw new DataError(`enemies.json.${enemy.id}.fixedDrop`, `relics.json에 없는 유물입니다 ("${enemy.fixedDrop}")`)
    }
    if (enemy.fixedDrop !== undefined && enemy.boss === undefined) {
      throw new DataError(`enemies.json.${enemy.id}.fixedDrop`, '확정 드랍은 보스(boss)에게만 줄 수 있습니다')
    }
  }
  for (const id of REQUIRED_ENEMIES) {
    if (!enemies[id]) throw new DataError(`enemies.json.${id}`, '게임이 직접 쓰는 적이라 빠지면 안 됩니다')
  }
  // 신화의 유물 (E13-03): 그 신의 유물이어야 하고, 두 신화가 같은 유물을 쓰지 않는다
  const taken = new Map<string, string>()
  for (const god of Object.values(gods)) {
    const relic = relics[god.relic]
    const p = `gods.json.${god.id}.relic`
    if (!relic) throw new DataError(p, `relics.json에 없는 유물입니다 ("${god.relic}")`)
    if (relic.god !== god.id && !relic.also.includes(god.id)) throw new DataError(p, `${god.id}의 유물이 아닙니다 ("${god.relic}")`)
    if (taken.has(god.relic)) throw new DataError(p, `${taken.get(god.relic)}의 유물과 겹칩니다`)
    taken.set(god.relic, god.id)
  }
  for (const relic of Object.values(relics)) {
    if (relic.stages && !taken.has(relic.id)) throw new DataError(`relics.json.${relic.id}.stages`, '단계 이름은 신화의 유물에만 씁니다')
  }
  const classes = parseClassTree(raw.classes, gods)
  return { gods, relics, enemies, classes }
}

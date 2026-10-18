import type { RelicDef } from '../data/schema'
import { iconFromGrid } from '../voxel/iconFromGrid'
import { LOOK_MODELS } from '../voxel/models/looks'
import { RELIC_MODELS } from '../voxel/models/relics'
import type { VoxelGrid } from '../voxel/VoxelGrid'

/** 땅에 떨어진 유물의 모델: 따로 만든 것이 없으면 외형 모델 (E6-11) */
export function relicGrid(def: RelicDef): VoxelGrid {
  const build = RELIC_MODELS[def.model] ?? LOOK_MODELS[def.model] ?? LOOK_MODELS[def.look]
  if (!build) throw new Error(`유물 모델이 없습니다: ${def.id}`)
  return build()
}

/** 유물의 12×12 그림: 데이터에 없으면 모델을 옆에서 본 모습 */
export function relicIconRows(def: RelicDef): { rows: readonly string[]; colors: Readonly<Record<string, string>> } {
  if (def.icon && def.colors) return { rows: def.icon, colors: def.colors }
  return iconFromGrid(LOOK_MODELS[def.look]?.() ?? relicGrid(def))
}

/** 이 유물이 발현 수에 세어지는 신들 */
export const relicGods = (def: RelicDef): readonly string[] => [def.god, ...def.also]

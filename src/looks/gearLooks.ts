import gearJson from '../data/gear.json'
import { GRADES, type Grade } from '../data/gearData'
import type { LookDef } from './catalog'

/**
 * 일반 장비의 외형 이름 (E18-04-5). 모델은 src/voxel/models/gearLooks.ts.
 * 부위·바탕·등급마다 하나씩 (gear-<부위>-<바탕 번호>-<등급>). 보관함에는 넣지 않는다: 장비를 끼고 있는 동안만 보인다.
 */
export const GEAR_LOOK_PARTS = { weapon: 'weapon', head: 'head', body: 'torso', hands: 'arms', feet: 'legs' } as const
export type GearLookPart = keyof typeof GEAR_LOOK_PARTS

const slots = gearJson.slots as Record<string, { bases: string[] }>
const grades = gearJson.grades as Record<string, { name: string }>

export const gearLookId = (part: GearLookPart, base: number, grade: Grade): string => `gear-${part}-${base}-${grade}`

export const GEAR_LOOKS: readonly LookDef[] = (Object.keys(GEAR_LOOK_PARTS) as GearLookPart[]).flatMap((part) =>
  slots[part]!.bases.flatMap((name, base) => GRADES.map((grade): LookDef => ({ id: gearLookId(part, base, grade), slot: GEAR_LOOK_PARTS[part], name: `${name} · ${grades[grade]!.name}` }))),
)

/** 이 외형 id가 장비 외형이면 [부위, 바탕 번호, 등급] */
export function parseGearLook(id: string): [GearLookPart, number, Grade] | null {
  const m = /^gear-(weapon|head|body|hands|feet)-(\d+)-(common|good|rare|hero)$/.exec(id)
  return m ? [m[1] as GearLookPart, Number(m[2]), m[3] as Grade] : null
}

/** 낀 장비 → 몸에 보일 외형 id (장신구는 없음). 모르는 바탕이면 그 부위 첫 모양 */
export function gearLook(item: { part: string; base: string; grade: Grade }): string | null {
  if (!Object.hasOwn(GEAR_LOOK_PARTS, item.part)) return null
  const base = Math.max(0, slots[item.part]!.bases.indexOf(item.base))
  return gearLookId(item.part as GearLookPart, base, item.grade)
}

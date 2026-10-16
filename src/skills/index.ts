import type * as THREE from 'three'

import type { RelicId } from '../relics/data'
import { IronCatch } from './Jarngreipr'
import { IllusionClone } from './LokiMask'
import { MightUnleashed } from './Megingjord'
import { MjolnirThrow } from './Mjolnir'
import type { Skill } from './Skill'

/** 유물에 딸린 자동 스킬을 만든다. 유물 1개 = 스킬 1개 */
export function createSkill(relic: RelicId, fx: THREE.Object3D): Skill {
  switch (relic) {
    case 'mjolnir':
      return new MjolnirThrow(fx)
    case 'megingjord':
      return new MightUnleashed(fx)
    case 'jarngreipr':
      return new IronCatch(fx)
    case 'lokiMask':
      return new IllusionClone(fx)
  }
}

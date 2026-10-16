import type * as THREE from 'three'

import type { RelicId } from '../relics/data'
import { IronCatch } from './Jarngreipr'
import { IllusionClone } from './LokiMask'
import { MightUnleashed } from './Megingjord'
import { MjolnirThrow } from './Mjolnir'
import type { RelicEffect } from './Skill'

/** 유물에 딸린 효과를 만든다. 유물 1개 = 지속 효과 + 행동 연동 효과 (DESIGN.md 8.3) */
export function createEffect(relic: RelicId, fx: THREE.Object3D): RelicEffect {
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

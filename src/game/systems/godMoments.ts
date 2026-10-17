import * as THREE from 'three'

import { type God, godDef } from '../../relics/data'
import type { GameContext } from '../context'

/**
 * 신마다 다른 발현·승급 순간 (E6-06). strength는 1(발현)~4(Lv4 승급): 클수록 크고 많다.
 * - 천둥: 하늘에서 번개 기둥, 둘레에 번개
 * - 변신술사: 그림자 분신이 사방으로 흩어진다
 * - 아수라왕: 여섯 칼날이 사방을 벤다
 */
export function godMoment(ctx: GameContext, god: God, strength: number): void {
  const { fx, hero, powers, skills } = ctx
  const p = hero.object.position
  switch (godDef(god).ultimate) {
    case 'thunderJudgement': {
      fx.lightning.fromSky(p.clone(), 0.32)
      const bolts = strength > 1 ? 3 + strength : 0
      for (let i = 0; i < bolts; i++) {
        const a = (i / bolts) * Math.PI * 2
        fx.lightning.fromSky(new THREE.Vector3(p.x + Math.sin(a) * 2, p.y, p.z + Math.cos(a) * 2), 0.18)
      }
      break
    }
    case 'illusionLegion':
      powers.classPassives.burst(skills, 4 + strength * 2)
      break
    case 'bladeDance': {
      const blades = 6 * Math.min(2, strength)
      for (let i = 0; i < blades; i++) {
        fx.slashes.spawn(p, (i / blades) * Math.PI * 2, 2.6 + (i % 2) * 0.8, 0.5, true, i % 2 ? 0xff4a5a : 0xb0101c)
      }
      break
    }
  }
}

import * as THREE from 'three'

import { type God, godDef } from '../../relics/data'
import type { GameContext } from '../context'

/**
 * 신마다 다른 발현·승급 순간 (E6-06). strength는 1(발현)~4(Lv4 승급): 클수록 크고 많다.
 * 궁극기 종류를 따른다: 하늘 폭격은 하늘에서 내리꽂는 기둥, 군단은 사방으로 흩어지는 분신·동료,
 * 난무는 사방을 베는 칼날, 파도는 퍼지는 고리, 비는 둘레로 쏟아지는 빛
 */
export function godMoment(ctx: GameContext, god: God, strength: number): void {
  const { fx, hero, powers, skills } = ctx
  const p = hero.object.position
  const def = godDef(god)
  const ult = def.ultimate
  const tint = new THREE.Color(ult.color).getHex()
  switch (ult.kind) {
    case 'skyBarrage': {
      const bolts = strength > 1 ? 3 + strength : 0
      const points = [p.clone(), ...Array.from({ length: bolts }, (_, i) => {
        const a = (i / bolts) * Math.PI * 2
        return new THREE.Vector3(p.x + Math.sin(a) * 2, p.y, p.z + Math.cos(a) * 2)
      })]
      for (const [i, at] of points.entries()) {
        if (ult.style === 'lightning') fx.lightning.fromSky(at, i === 0 ? 0.32 : 0.18)
        else fx.power.burst(at, ult.color, i === 0 ? 4 : 2)
      }
      break
    }
    case 'legion': {
      const comp = def.passive.companions
      powers.classPassives.burst(skills, 4 + strength * 2, comp?.look ?? (ult.style as never) ?? 'shadow', comp?.color ?? ult.color)
      break
    }
    case 'bladeDance': {
      const blades = 6 * Math.min(2, strength)
      for (let i = 0; i < blades; i++) fx.slashes.spawn(p, (i / blades) * Math.PI * 2, 2.6 + (i % 2) * 0.8, 0.5, true, i % 2 ? tint : new THREE.Color(ult.color).multiplyScalar(0.6).getHex())
      break
    }
    case 'wave':
      for (let i = 0; i < 1 + strength; i++) fx.slashes.spawn(p, 0, 2.2 + i * 1.1, Math.PI, true, tint)
      fx.puffs.burst(p, 20 + strength * 6, 3 + strength)
      break
    case 'rain':
      for (let i = 0; i < 6 + strength * 3; i++) {
        const a = Math.random() * Math.PI * 2
        const r = 1 + Math.random() * 3
        const at = new THREE.Vector3(p.x + Math.sin(a) * r, p.y, p.z + Math.cos(a) * r)
        fx.shots.fire(new THREE.Vector3(at.x - 1.5, at.y + 7, at.z - 1), at, tint, 0.15 + Math.random() * 0.2)
      }
      break
  }
}

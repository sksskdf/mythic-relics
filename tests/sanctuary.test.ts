import { describe, expect, it } from 'vitest'

import { Sanctuary } from '../src/game/Sanctuary'

describe('성소 (돌 고리·빛기둥·귀환 화로, E305-03)', () => {
  it('성소가 없는 지역이면 성소를 감춘다', () => {
    const sanctuary = new Sanctuary({ x: 0, z: 0 }, 11)
    sanctuary.moveTo(null)
    expect(sanctuary.present).toBe(false)
    expect(sanctuary.object.visible).toBe(false)
  })

  it('성소를 옮기면 한가운데(화로)와 반지름이 바뀐다', () => {
    const sanctuary = new Sanctuary({ x: 0, z: 0 }, 11)
    sanctuary.moveTo({ x: 5, z: -5 }, 8)
    expect(sanctuary.present).toBe(true)
    expect(sanctuary.center).toEqual({ x: 5, z: -5 })
    expect(sanctuary.radius).toBe(8)
    expect(sanctuary.object.position.x).toBe(5)
    expect(sanctuary.object.position.z).toBe(-5)
  })

  it('돌 고리는 룬스톤 여섯이 화로 둘레에 선다', () => {
    const sanctuary = new Sanctuary({ x: 2, z: 3 }, 9)
    const stones = sanctuary.object.children.filter((c) => c.castShadow)
    expect(stones).toHaveLength(6)
    for (const stone of stones) expect(Math.hypot(stone.position.x, stone.position.z)).toBeCloseTo(3.4, 5)
  })

  it('빛기둥은 원정이 무르익었고(beacon) 성소가 있을 때만 선다', () => {
    const sanctuary = new Sanctuary({ x: 0, z: 0 }, 11)
    expect(sanctuary.lit).toBe(false)
    sanctuary.beacon = true
    sanctuary.update(1 / 30)
    expect(sanctuary.lit).toBe(true)
    sanctuary.moveTo(null)
    expect(sanctuary.lit).toBe(false)
  })
})

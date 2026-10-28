import { afterEach, describe, expect, it } from 'vitest'
import { parseRegions } from '../src/data/regions'
import { baseHeightAt, cliffColliders, FLAT_LAND, heightAt, highestLand, type Land, onStairs, rayToLand, setLand, setTerrainOrigin } from '../src/world/terrain'

/** 가로세로 10m 네모 땅 (높이 2m), 남쪽 변 가운데로 오르는 계단 하나 (z 8 → 3, 너비 2) */
const plaza: Land = {
  ponds: [],
  terraces: [
    {
      points: [
        { x: -5, z: -5 },
        { x: 5, z: -5 },
        { x: 5, z: 5 },
        { x: -5, z: 5 },
      ],
      height: 2,
      stairs: [{ from: { x: 0, z: 8 }, to: { x: 0, z: 3 }, width: 2 }],
    },
  ],
}

describe('계단식 땅 (E24-07)', () => {
  afterEach(() => {
    setTerrainOrigin(0, 0)
    setLand(FLAT_LAND)
  })

  it('계단식 땅 위는 평평한 윗면, 밖은 바탕 땅, 바닥 판은 늘 바탕 땅', () => {
    setLand(plaza)
    expect(heightAt(0, 0)).toBe(2)
    expect(heightAt(-4, 4)).toBe(2)
    expect(Math.abs(heightAt(-8, 0))).toBeLessThan(0.3)
    expect(Math.abs(baseHeightAt(0, 0))).toBeLessThan(0.3)
    expect(highestLand()).toBe(2)
  })

  it('계단은 발치에서 윗면까지 고르게 오른다', () => {
    setLand(plaza)
    const foot = heightAt(0, 8)
    expect(Math.abs(foot - baseHeightAt(0, 8))).toBeLessThan(0.05)
    expect(heightAt(0, 5.5)).toBeCloseTo((foot + 2) / 2, 5)
    expect(heightAt(0, 3)).toBeCloseTo(2, 5)
    expect(onStairs(0, 6)).toBe(true)
    expect(onStairs(1.5, 6)).toBe(false)
    // 계단 옆은 그대로 절벽: 계단식 땅 안은 2, 밖은 바탕
    expect(heightAt(2, 4.5)).toBe(2)
    expect(Math.abs(heightAt(2, 5.5))).toBeLessThan(0.3)
  })

  it('절벽은 둥근 충돌로 줄지어 막고, 계단이 지나는 곳만 트여 있다', () => {
    setLand(plaza)
    const cliffs = cliffColliders(plaza)
    // 둘레 40m를 0.5m마다 (꼭짓점은 두 변이 함께 세어 조금 겹친다)
    expect(cliffs.length).toBeGreaterThan(70)
    const southGap = cliffs.filter((c) => Math.abs(c.z - 5) < 0.01 && Math.abs(c.x) < 1)
    expect(southGap).toHaveLength(0)
    expect(cliffs.some((c) => Math.abs(c.z - 5) < 0.01 && Math.abs(c.x - 3) < 0.01)).toBe(true)
    expect(cliffs.some((c) => Math.abs(c.x + 5) < 0.01 && Math.abs(c.z) < 0.01)).toBe(true)
  })

  it('높이가 같은 땅끼리 맞닿은 변은 절벽이 아니다', () => {
    const twins: Land = {
      ponds: [],
      terraces: [
        { points: [{ x: -6, z: -2 }, { x: 0, z: -2 }, { x: 0, z: 2 }, { x: -6, z: 2 }], height: 1.5, stairs: [] },
        { points: [{ x: 0, z: -2 }, { x: 6, z: -2 }, { x: 6, z: 2 }, { x: 0, z: 2 }], height: 1.5, stairs: [] },
      ],
    }
    setLand(twins)
    const shared = cliffColliders(twins).filter((c) => Math.abs(c.x) < 0.01 && Math.abs(c.z) < 1.9)
    expect(shared).toHaveLength(0)
  })

  it('지금 땅의 원점이 옮겨져도 지역 안 좌표의 높이는 같다', () => {
    setTerrainOrigin(100, -40)
    setLand(plaza)
    expect(heightAt(0, 0)).toBe(2)
    expect(heightAt(0, 3)).toBeCloseTo(2, 5)
  })

  it('화면에서 쏜 광선은 계단식 땅의 윗면에 먼저 닿는다', () => {
    setLand(plaza)
    // 쿼터뷰처럼 비스듬히 내려다보는 광선: 윗면 (0, 0)을 지나간다
    const dir = { x: 0, y: -0.7, z: -0.7 }
    const origin = { x: 0, y: 2 + 7, z: 0 + 7 }
    const hit = rayToLand(origin, dir, { x: 0, y: 0, z: 0 })!
    expect(hit.y).toBe(2)
    expect(Math.abs(hit.x)).toBeLessThan(0.05)
    expect(Math.abs(hit.z)).toBeLessThan(0.1)
    // 계단식 땅 밖을 가리키면 바탕 땅
    const away = rayToLand({ x: -9, y: 7, z: 7 }, dir, { x: 0, y: 0, z: 0 })!
    expect(Math.abs(away.y)).toBeLessThan(0.3)
    expect(away.z).toBeGreaterThan(-1)
  })

  it('지역 데이터 검사: 높이는 0.5m 단위, 계단 윗끝은 안·발치는 밖', () => {
    const base = {
      name: '시험 마을',
      kind: 'hub',
      theme: 'village',
      cell: { col: 0, row: 0 },
      halfExtent: 20,
      seed: 1,
      spawn: { x: 0, z: 12 },
    }
    const square = [{ x: -5, z: -5 }, { x: 5, z: -5 }, { x: 5, z: 5 }, { x: -5, z: 5 }]
    const ok = parseRegions({ village: { ...base, terraces: [{ points: square, height: 1.5, stairs: [{ from: { x: 0, z: 8 }, to: { x: 0, z: 3 }, width: 2 }] }] } })
    expect(ok.village!.terraces[0]!.stairs[0]!.width).toBe(2)
    expect(() => parseRegions({ village: { ...base, terraces: [{ points: square, height: 1.2 }] } })).toThrow(/0.5m 단위/)
    expect(() => parseRegions({ village: { ...base, terraces: [{ points: square, height: 1, stairs: [{ from: { x: 0, z: 1 }, to: { x: 0, z: 3 }, width: 2 }] }] } })).toThrow(/발치/)
    expect(() => parseRegions({ village: { ...base, terraces: [{ points: square, height: 1, stairs: [{ from: { x: 0, z: 9 }, to: { x: 0, z: 7 }, width: 2 }] }] } })).toThrow(/윗끝/)
  })
})

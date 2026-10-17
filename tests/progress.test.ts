import { describe, expect, it } from 'vitest'

import { ClassProgress, XP_TO_PROMOTE } from '../src/progress/ClassProgress'
import { DropTable } from '../src/relics/DropTable'
import type { RelicId } from '../src/relics/data'

describe('클래스 성장', () => {
  it('경험치 바가 가득 차야 승급할 수 있고, 가득 찬 뒤에는 더 쌓이지 않는다', () => {
    const progress = new ClassProgress()
    expect(progress.title('thor')).toBe('천둥의 신')
    progress.addXp('thor', 100)
    expect(progress.promote('thor')).toBe(false)
    progress.addXp('thor', 99999)
    expect(progress.record('thor').xp).toBe(XP_TO_PROMOTE[0])
    expect(progress.readyToPromote('thor')).toBe(true)
    expect(progress.promote('thor')).toBe(true)
    expect(progress.title('thor')).toBe('천둥군주')
    expect(progress.record('thor').xp).toBe(0)
  })

  it('승급하면 그 원천 숙련과 총 승급 횟수가 오른다', () => {
    const progress = new ClassProgress()
    progress.addXp('thor', 99999)
    progress.promote('thor')
    expect(progress.mastery('flame')).toBe(1)
    expect(progress.mastery('wind')).toBe(0)
    expect(progress.promotions).toBe(1)
  })
})

/** 정해진 값을 차례로 돌려주는 가짜 난수 */
function sequence(...values: number[]) {
  let i = 0
  return () => values[i++ % values.length]!
}

describe('유물 드랍', () => {
  it('거인 왕은 묠니르가 없으면 반드시 떨어뜨린다', () => {
    const drops = new DropTable(sequence(0.99))
    expect(drops.roll(new Set(), 'giantKing')).toBe('mjolnir')
  })

  it('이미 가진 유물은 나오지 않는다', () => {
    const drops = new DropTable(sequence(0, 0))
    const owned = new Set<RelicId>(['mjolnir', 'megingjord', 'jarngreipr'])
    for (const id of ['lokiMask', 'laevateinn', 'mistletoe'] as const) {
      expect(drops.roll(owned)).toBe(id)
      owned.add(id)
    }
    expect(drops.roll(owned)).toBeNull()
  })

  it('이미 유물을 가진 신의 남은 유물이 더 잘 나온다', () => {
    // 후보: 메긴교르드(토르, 가중치 1 + 2), 로키 유물 셋(각 1). 합 6에서 0.3이면 앞쪽 1.8이라 메긴교르드
    const drops = new DropTable(sequence(0, 0.3))
    expect(drops.roll(new Set<RelicId>(['jarngreipr']))).toBe('megingjord')
  })

  it('안 나올수록 확률이 오르고, 나오면 처음으로 돌아간다 (불운 보정)', () => {
    const drops = new DropTable(sequence(0.5))
    const start = drops.chance
    for (let i = 0; i < 5; i++) expect(drops.roll(new Set())).toBeNull()
    expect(drops.chance).toBeGreaterThan(start)
    // 확률이 0.5를 넘으면 나온다.
    let got = null
    for (let i = 0; i < 300 && !got; i++) got = drops.roll(new Set())
    expect(got).not.toBeNull()
    expect(drops.chance).toBe(start)
  })
})

import { describe, expect, it } from 'vitest'

import { ENEMIES, Giant } from '../src/enemies/Giant'
import { ELITE_KINDS } from '../src/enemies/elite'
import { gradeOf } from '../src/enemies/grade'

describe('몬스터 등급 (E12-09)', () => {
  it('보통 몬스터는 「보통」, 정예는 「정예·종류」, 보스는 「보스」', () => {
    expect(gradeOf(new Giant(ENEMIES.grunt!, { x: 0, z: 0 })).label).toBe('보통')
    const elite = new Giant(ENEMIES.draugr!, { x: 0, z: 0 })
    elite.makeElite('fierce')
    expect(gradeOf(elite)).toMatchObject({ kind: 'elite', label: '정예·사나움' })
    expect(gradeOf(new Giant(ENEMIES.king!, { x: 0, z: 0 }))).toMatchObject({ kind: 'boss', label: '보스' })
  })

  it('모든 몬스터가 이름을 갖고, 지역 보스와 전설 보스는 모두 보스 등급이다', () => {
    for (const spec of Object.values(ENEMIES)) {
      expect(spec.name.length, spec.id).toBeGreaterThan(0)
      if (spec.role === 'boss') expect(gradeOf({ spec, elite: null }).kind, spec.id).toBe('boss')
    }
    for (const kind of ELITE_KINDS) expect(gradeOf({ spec: ENEMIES.grunt!, elite: kind }).tone).toBe(`var(--c-elite-${kind})`)
  })

  it('지운 몬스터(지역 이동·전설 실패)는 쓰러진 것으로 보여 이름표가 남지 않는다', () => {
    const giant = new Giant(ENEMIES.grunt!, { x: 0, z: 0 })
    expect(giant.alive).toBe(true)
    giant.dispose()
    expect(giant.alive).toBe(false)
  })
})

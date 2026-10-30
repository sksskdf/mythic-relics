import { describe, expect, it } from 'vitest'

import { collectionText, statText } from '../src/myth/alwaysText'

describe('신화 수치 글 (E12-06, E21)', () => {
  it('수치는 비율이면 %, 생명 같은 수는 그대로, 줄어드는 수치는 −', () => {
    expect(statText('bossDamage', 0.1)).toBe('정예·보스에게 피해 +10%')
    expect(statText('maxHp', 20)).toBe('최대 생명 +20')
    expect(statText('regen', 0.5)).toBe('초당 생명 재생 +0.5')
    expect(statText('damageTaken', -0.06)).toBe('받는 피해 −6%')
  })

  it('열린 신화 하나마다 같은 한 줄 (피해는 유물표로 옮겼다, E303-04)', () => {
    expect(collectionText()).toBe('최대 생명 +5')
  })
})

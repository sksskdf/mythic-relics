import { describe, expect, it } from 'vitest'

import { alwaysLines, echoText, statText } from '../src/myth/alwaysText'
import { GODS } from '../src/relics/data'

describe('상시 효과 글 (E12-06)', () => {
  it('수치는 비율이면 %, 생명 같은 수는 그대로, 줄어드는 수치는 −', () => {
    expect(statText('bossDamage', 0.1)).toBe('정예·보스에게 피해 +10%')
    expect(statText('maxHp', 20)).toBe('최대 생명 +20')
    expect(statText('regen', 0.5)).toBe('초당 생명 재생 +0.5')
    expect(statText('damageTaken', -0.06)).toBe('받는 피해 −6%')
  })

  it('메아리는 터지는 때에 맞는 말로', () => {
    expect(echoText('thor', 1)).toBe('기본 공격 5번에 1번 작은 번개')
    expect(echoText('thor', 2)).toBe('기본 공격 3번에 1번 작은 번개')
    expect(echoText('zeus', 1)).toBe('8초마다 벼락 한 번')
    expect(echoText('susanoo', 1)).toBe('때릴 때 20% 확률로 칼 한 자루')
    expect(echoText('nezha', 1)).toBe('걷는 동안 3초마다 풍화륜 불길')
  })

  it('모든 신화가 두 줄: 메아리는 1단계부터, 수치는 3단계부터 작동', () => {
    for (const god of Object.keys(GODS)) {
      const [echo, stat] = alwaysLines(god, 2)
      expect(echo!.active, god).toBe(true)
      expect(stat!.active, god).toBe(false)
      expect(alwaysLines(god, 4)[1]!.active, god).toBe(true)
      expect(echo!.text, god).not.toContain('undefined')
    }
  })
})

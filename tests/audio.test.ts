import { describe, expect, it } from 'vitest'

import { distanceGain, HEARING, MAX_SAME, MAX_VOICES, VoiceLimiter } from '../src/audio/limits'
import { SOUND_CUES, SOUNDS } from '../src/audio/sounds'
import { DEFAULT_SETTINGS, parseSettings } from '../src/save/settings'

describe('동시 재생 제한', () => {
  it('같은 소리는 한꺼번에 MAX_SAME개까지만 난다', () => {
    const v = new VoiceLimiter()
    let admitted = 0
    for (let i = 0; i < 10; i++) if (v.admit('hit', i * 0.05, 1)) admitted++
    expect(admitted).toBe(MAX_SAME)
  })

  it('한 프레임에 같은 소리를 여러 번 부르면 한 번만 난다', () => {
    const v = new VoiceLimiter()
    expect(v.admit('thunder', 1, 0.3)).toBe(true)
    expect(v.admit('thunder', 1.01, 0.3)).toBe(false)
  })

  it('전체 소리 수는 MAX_VOICES를 넘지 않고, 끝난 소리 자리는 다시 쓴다', () => {
    const v = new VoiceLimiter()
    for (let i = 0; i < 40; i++) v.admit(`cue${i}`, 0, 1)
    expect(v.active(0)).toBe(MAX_VOICES)
    expect(v.admit('late', 0.5, 1)).toBe(false)
    expect(v.admit('late', 1.2, 1)).toBe(true)
    expect(v.active(1.2)).toBe(1)
  })

  it('가까운 소리는 그대로, 멀어질수록 작아지다가 들리지 않는다', () => {
    expect(distanceGain(0)).toBe(1)
    expect(distanceGain(HEARING.near)).toBe(1)
    expect(distanceGain(12)).toBeGreaterThan(distanceGain(18))
    expect(distanceGain(HEARING.far)).toBe(0)
  })

  it('모든 소리는 길이와 크기가 있다', () => {
    for (const cue of SOUND_CUES) {
      expect(SOUNDS[cue].duration).toBeGreaterThan(0)
      expect(SOUNDS[cue].volume).toBeGreaterThan(0)
      expect(SOUNDS[cue].volume).toBeLessThanOrEqual(1)
    }
  })
})

describe('설정', () => {
  it('빈 저장은 기본값, 예전 설정(시야만 있음)은 시야를 지키고 나머지는 기본값', () => {
    expect(parseSettings({})).toEqual(DEFAULT_SETTINGS)
    const old = parseSettings({ viewHeight: 25 })
    expect(old.viewHeight).toBe(25)
    expect(old.volume).toEqual(DEFAULT_SETTINGS.volume)
  })

  it('저장한 값을 그대로 되읽고, 틀린 값은 고친다', () => {
    const s = { viewHeight: 20, volume: { master: 0.5, music: 0, sfx: 1 }, shake: false, flash: false, quality: 'low' as const }
    expect(parseSettings(JSON.parse(JSON.stringify(s)))).toEqual(s)
    const odd = parseSettings({ viewHeight: 999, volume: { master: 3, music: -1, sfx: 'x' }, shake: 'no', quality: 'ultra' })
    expect(odd.viewHeight).toBe(34)
    expect(odd.volume).toEqual({ master: 1, music: 0, sfx: DEFAULT_SETTINGS.volume.sfx })
    expect(odd.shake).toBe(true)
    expect(odd.quality).toBe('normal')
  })
})

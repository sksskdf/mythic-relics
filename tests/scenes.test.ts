import { describe, expect, it } from 'vitest'

import { DataError } from '../src/data/check'
import { parseScenes, SCENES } from '../src/data/scenes'
import raw from '../src/data/scenes.json'

const clone = () => JSON.parse(JSON.stringify(raw)) as Record<string, { region: string; lines: Record<string, unknown>[] }>

describe('대화 장면 데이터 (E12-10)', () => {
  it('첫 장면이 있고, 마을 촌장이 짧게 말한다', () => {
    const opening = SCENES.opening!
    expect(opening.region).toBe('village')
    expect(opening.lines.length).toBeGreaterThan(1)
    expect(opening.lines.every((l) => l.who === '촌장')).toBe(true)
  })

  it.each([
    ['없는 지역', (d: ReturnType<typeof clone>) => (d.opening!.region = 'nowhere'), /opening\.region: 없는 지역/],
    ['그 지역에 없는 사람', (d: ReturnType<typeof clone>) => (d.opening!.lines[0]!.who = '토르'), /lines\[0\]\.who: 모닥불 마을에 없는 사람/],
    ['너무 긴 대사', (d: ReturnType<typeof clone>) => (d.opening!.lines[0]!.text = '가'.repeat(40)), /lines\[0\]\.text: 대사는 32자 안/],
    ['모르는 몸짓', (d: ReturnType<typeof clone>) => (d.opening!.lines[0]!.pose = 'dance'), /lines\[0\]\.pose/],
    ['빈 장면', (d: ReturnType<typeof clone>) => (d.opening!.lines = []), /opening\.lines: 대사는 1~6줄/],
  ])('틀린 데이터는 어디가 왜 틀렸는지 알린다: %s', (_name, breakIt, message) => {
    const data = clone()
    breakIt(data)
    const run = () => parseScenes(data)
    expect(run).toThrow(DataError)
    expect(run).toThrow(message)
  })
})

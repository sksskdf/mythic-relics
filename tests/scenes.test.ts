import { describe, expect, it } from 'vitest'

import { DataError } from '../src/data/check'
import { parseScenes, SCENES } from '../src/data/scenes'
import raw from '../src/data/scenes.json'
import { ENEMIES } from '../src/enemies/Giant'
import { REGIONS, START_REGION } from '../src/data/regions'
import { GODS, RELICS } from '../src/relics/data'
import { POWERS } from '../src/data/powers'

const clone = () => JSON.parse(JSON.stringify(raw)) as Record<string, { region: string; lines: Record<string, unknown>[] }>

describe('대화 장면 데이터 (E12-10)', () => {
  it('첫 장면이 있고, 마을 촌장이 짧게 말한다', () => {
    const opening = SCENES.opening!
    expect(opening.region).toBe('village')
    expect(opening.lines.length).toBeGreaterThan(1)
    expect(opening.lines.every((l) => l.who === '촌장')).toBe(true)
  })

  it('대화 네 곳이 빠짐없이 있다 (E15-06): 신화 개방 21, 보스 다섯, 마을 사람마다, 대장장이 (촌장의 위협 단계 글은 E305-03에서 걷음)', () => {
    const cap = (id: string) => id.charAt(0).toUpperCase() + id.slice(1)
    for (const god of Object.keys(GODS)) expect(SCENES[`myth${cap(god)}`], god).toBeDefined()
    for (const r of Object.values(REGIONS)) if (r.boss) expect(SCENES[`boss${cap(r.boss.enemy ?? 'king')}`], r.id).toBeDefined()
    const talks = Object.values(SCENES).filter((s) => s.id.startsWith('talk'))
    for (const npc of REGIONS[START_REGION]!.npcs) expect(talks.some((s) => s.lines[0]!.who === npc.name), npc.name).toBe(true)
    expect(SCENES.threatUp).toBeUndefined()
    expect(SCENES.forgeFirst?.lines[0]?.who).toBe('대장장이')
    // 신화·보스 장면은 어디서나 열리고, 말하는 사람은 그 신화·보스다
    expect(SCENES.mythThor!.region).toBeNull()
    expect(SCENES.mythThor!.lines[0]!.who).toBe(GODS.thor!.name)
    expect(SCENES.bossOrochi!.lines[0]!.who).toBe(ENEMIES.orochi!.name)
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

describe('흔적의 장면과 고른 힘 (P5 손 QA)', () => {
  it('흔적에서 그 신이 하는 말은 특정 힘·유물을 말하지 않는다: 카드에서 무엇을 골랐든 어긋나지 않게 (전: 창을 골랐는데 「후긴과 무닌을 네 곁에 보내 주마」)', () => {
    const traces = Object.values(SCENES).filter((sc) => sc.id.startsWith('trace'))
    expect(traces.length).toBeGreaterThan(0)
    const names = [...POWERS.map((p) => p.name), ...Object.values(RELICS).map((r) => r.name), '망치', '창', '가면', '검은', '삼지창', '활은', '투구']
    for (const sc of traces) {
      // 첫 줄은 그 자리를 말한다 (「이 나무에 아직 내 번개가 남아 있었군」): 그 뒤의 줄이 힘을 건네는 말이다
      for (const line of sc.lines.slice(1)) for (const name of names) expect(line.text.includes(name), `${sc.id}: ${line.text} (${name})`).toBe(false)
    }
  })
})

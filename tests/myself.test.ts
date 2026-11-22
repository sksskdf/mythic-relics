import { describe, expect, it } from 'vitest'

import { CONQUESTS, conquestBoss } from '../src/data/chapters'
import { REGIONS } from '../src/data/regions'
import { ENEMIES } from '../src/enemies/Giant'
import { GODS, godDef } from '../src/relics/data'
import type { SaveData } from '../src/save/SaveData'
import { mythCaption } from '../src/ui/menu/godsTab'
import { slotSummary } from '../src/ui/slotSummary'
import { confirmsDelete, DELETE_ARMED_MS, DELETE_GUARD_MS, pressDelete } from '../src/ui/TitleScreen'

/**
 * 내 모습 (E307, 사용자 의견 4): 신을 깨워도 화면은 나를 그 신의 칭호로 부르지 않고, 「한 신에 몰기」라는 이름을 쓰지 않는다.
 * 옷이 저절로 바뀌지 않는 규칙은 `looks.test.ts`의 「외형 시스템」이 지킨다
 */

/** 화면에 글을 내는 코드 (주석은 뺀다: 까닭을 적은 주석에는 옛 이름이 남아도 된다) */
const sources = import.meta.glob(['../src/ui/**/*.ts', '../src/game/**/*.ts', '../src/main.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')

describe('화면 글 (E307)', () => {
  it('읽을 파일이 잡힌다', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(80)
    expect(Object.keys(sources).some((p) => p.endsWith('/ui/menu/godsTab.ts'))).toBe(true)
  })

  it('「몰기」라는 말이 화면 글에 없다 (카드·꼬리표·단추·힌트)', () => {
    const found = Object.entries(sources).filter(([, text]) => code(text).includes('몰기')).map(([path]) => path)
    expect(found).toEqual([])
  })

  it('신의 칭호를 화면에 쓰지 않는다: 카드·초상·탭은 신의 이름으로 (승천 기록 `promoted`만 봇 기록용으로 남는다)', () => {
    const reads = /\.titles\b|\.title\(|\bgod\.title\b|\bdef\.title\b/
    const found = Object.entries(sources)
      .flatMap(([path, text]) => code(text).split('\n').filter((line) => reads.test(line)).map((line) => `${path.split('/src/')[1]}: ${line.trim()}`))
      .filter((line) => !line.includes("bus.emit('promoted'"))
    expect(found).toEqual([])
  })

  it('조각 2 카드는 유물을 얻었다고 한다 (가방·장비 탭도, 처음 보는 사람이 모르는 「유물표」도 아니다)', () => {
    const wake = code(sources[Object.keys(sources).find((p) => p.endsWith('/game/systems/Wake.ts'))!]!)
    expect(wake).toContain('얻었다`')
    expect(wake).not.toMatch(/유물표에 켜졌다/)
    expect(wake).not.toMatch(/가방에 들어왔다|장비 탭에서 낀다/)
  })
})

describe('신의 카드 (E307)', () => {
  it('이름 아래 작은 글은 칭호 대신 신화권과 단계: 신화권이 없는 숨겨진 신화는 개발 패널의 묶음 이름 「히든」을 쓰지 않는다', () => {
    expect(mythCaption('thor', 1)).toBe('북유럽의 신 · 1단계')
    expect(mythCaption('zeus', 3)).toBe('그리스의 신 · 3단계')
    expect(mythCaption('asura', 2)).toBe('숨겨진 신 · 2단계')
    for (const god of Object.keys(GODS)) expect(mythCaption(god, 1), god).not.toContain('히든')
  })

  it('단계 사다리·숨 칸·흔적이 다음 장 정복 보스를 같은 이름으로 부른다: 보스 이름이 빠진 우트가르드는 거인 왕 (「엔딩 뒤」가 아니다)', () => {
    expect(CONQUESTS.map((region) => ENEMIES[conquestBoss(region)]?.name)).toEqual(['거인 왕', '키마이라'])
  })
})

describe('저장 슬롯 카드 (E307)', () => {
  const save = (over: Partial<SaveData>): SaveData =>
    ({
      slots: ['gear-1', null, null, null, null, null, null],
      bag: ['gear-2'],
      lit: [],
      classes: {},
      pantheon: { hand: null, heart: null, breath: [] },
      body: { skin: 2, hair: 1, cloth: 3 },
      region: null,
      ...over,
    }) as SaveData

  it('유물은 유물표에서 센다 (칸·가방에는 일반 장비뿐이라 거기서 세면 늘 0이었다)', () => {
    expect(slotSummary(save({})).meta).toBe('깨운 신 0 · 유물 0개')
    const two = slotSummary(save({ lit: ['mjolnir', 'gungnir'], classes: { thor: { level: 2 }, odin: { level: 1 }, loki: { level: 0 } }, pantheon: { hand: 'thor', heart: 'thor', breath: ['thor', 'odin'] } }))
    expect(two.meta).toBe('깨운 신 2 · 유물 2개')
    // 조각 2만 모은 신: 유물은 켜졌지만 아직 깨어나지 않았다
    expect(slotSummary(save({ lit: ['mjolnir'], pantheon: { hand: 'thor', heart: null, breath: [] } })).meta).toBe('깨운 신 0 · 유물 1개')
  })

  it('나를 신의 칭호로 부르지 않는다: 큰 글은 지금 있는 땅, 초상은 내 기본 모습, 손에 쥔 신은 테의 색으로만', () => {
    const titles = new Set(Object.values(GODS).flatMap((g) => g.titles))
    for (const god of Object.keys(GODS)) {
      const s = slotSummary(save({ classes: { [god]: { level: 3 } }, pantheon: { hand: god, heart: god, breath: [god] }, region: { id: 'midgard', x: 0, z: 0 } }))
      expect(titles.has(s.title), god).toBe(false)
      expect(s.title).toBe(REGIONS.midgard!.name)
      expect(s.meta).not.toContain(godDef(god).name)
      expect(s.color).toBe(godDef(god).color)
      expect(s.body).toEqual({ skin: 2, hair: 1, cloth: 3 })
    }
    // 저장한 땅이 없으면 마을, 손이 비었으면 색 없음
    const fresh = slotSummary(save({}))
    expect(fresh.title).toBe(REGIONS.village!.name)
    expect(fresh.color).toBe('')
  })

  it('「×」를 켠 바로 뒤의 둘째 누름은 지우지 않는다: 급히 두 번 누른 것이 저장을 지우지 않게', () => {
    // 두 번 누르기(더블 클릭)로 치는 사이보다 길고, 켜진 것이 저절로 꺼지는 때보다 넉넉히 짧다
    expect(DELETE_GUARD_MS).toBeGreaterThanOrEqual(400)
    expect(DELETE_GUARD_MS).toBeLessThanOrEqual(1000)
    expect(DELETE_ARMED_MS).toBeGreaterThanOrEqual(DELETE_GUARD_MS * 4)
    expect(confirmsDelete(1000, 1000)).toBe(false)
    expect(confirmsDelete(1000, 1000 + 250)).toBe(false)
    expect(confirmsDelete(1000, 1000 + DELETE_GUARD_MS - 1)).toBe(false)
    expect(confirmsDelete(1000, 1000 + DELETE_GUARD_MS)).toBe(true)
    expect(confirmsDelete(1000, 1000 + 2000)).toBe(true)
  })

  it('지우기는 「×」 칸을 두 번 눌렀을 때뿐이다: 첫 누름은 켜기만, 급한 둘째 누름은 그대로, 틈을 둔 둘째 누름에 지운다 (E307 손 QA)', () => {
    // 첫 누름: 켜진다
    expect(pressDelete(null, 1000)).toEqual({ armedAt: 1000, remove: false })
    // 급히 이어 누른 것(280ms): 켜진 채 그대로, 지우지 않는다
    expect(pressDelete(1000, 1280)).toEqual({ armedAt: 1000, remove: false })
    // 글을 보고 다시 누른 것: 지우고 꺼진다
    expect(pressDelete(1000, 1000 + DELETE_GUARD_MS)).toEqual({ armedAt: null, remove: true })
    expect(pressDelete(1000, 1800)).toEqual({ armedAt: null, remove: true })
    // 다른 곳을 눌러 꺼진 뒤(null)의 누름은 다시 첫 누름이다: 손 QA에서는 카드 오른쪽 끝을 0.8초 사이로 두 번 누르면 지워졌다
    expect(pressDelete(null, 1800).remove).toBe(false)
    // 꺼질 때를 넘긴 켜짐(타이머가 밀린 탭)도 첫 누름으로 친다
    expect(pressDelete(1000, 1000 + DELETE_ARMED_MS)).toEqual({ armedAt: 1000 + DELETE_ARMED_MS, remove: false })
    expect(pressDelete(1000, 1000 + DELETE_ARMED_MS - 1).remove).toBe(true)
  })
})

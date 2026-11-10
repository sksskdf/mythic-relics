import { describe, expect, it } from 'vitest'

import enemies from '../src/data/enemies.json'
import { bossFights, bossText, DUMMY_HP, finishRate, hitStats, indexRows, layerText, median, OLD_DUMMY_HP, rowsAround, runFile, STANDARD_FOE, STANDARD_POISE, timelineOf, wasClipped } from '../scripts/lib/curve.mjs'

describe('곡선 재기의 셈 (E307 0B)', () => {
  it('표준 허수아비의 생명은 땅 세기와 무관하게 고정이고, 옛 표준 적이면 잘렸을 줄을 가린다', () => {
    // 센 빌드가 20초에 12만을 줘도 허수아비는 죽지 않는다
    expect(DUMMY_HP).toBeGreaterThan(120000 * 1000)
    // 옛 표준 적: 80 × 60 × 땅 세기. 미드가르드(1)는 4800, 철의 숲(1.25)은 6000에서 잘렸다
    expect(OLD_DUMMY_HP).toBe(4800)
    expect(wasClipped(4800, 1)).toBe(true)
    expect(wasClipped(4799, 1)).toBe(false)
    expect(wasClipped(5999, 1.25)).toBe(false)
    expect(wasClipped(20000, 1.25)).toBe(true)
    // 센 땅(올림포스 11.7)에서는 같은 피해가 잘리지 않았다
    expect(wasClipped(20000, 11.7)).toBe(false)
  })

  it('공격 지수는 첫 줄 대비 배율이고, 층 곱의 비율과 층 밖에서 큰 몫을 함께 낸다', () => {
    const rows = indexRows([
      { damage20: 500, maxHp: 100, per100: 100, build: { damageScale: 1 } },
      { damage20: 1500, maxHp: 150, per100: 75, build: { damageScale: 1.5 } },
      { damage20: 6000, maxHp: 150, per100: 75, build: { damageScale: 3 } },
    ])
    expect(rows.map((r) => r.attack)).toEqual([1, 3, 12])
    expect(rows.map((r) => r.layerScale)).toEqual([1, 1.5, 3])
    // 공격 3배 가운데 층이 1.5배면 층 밖이 2배
    expect(rows.map((r) => r.outside)).toEqual([1, 2, 4])
    // 방어: 유효 생명(최대 생명 ÷ 한 대에 깎이는 몫)의 비율
    expect(rows.map((r) => r.defense)).toEqual([1, 2, 2])
  })

  it('지수의 기준은 첫 줄(0:00 맨몸)이라, 첫 2분에 얻은 것이 달라도 같은 빌드는 같은 지수가 된다', () => {
    // 두 판: 0:00은 같고(맨몸 546), 2분 줄은 한 판만 수련·장비를 얻었다. 넷째 분에는 같은 빌드다
    const one = indexRows([{ damage20: 546, maxHp: 100, per100: 100 }, { damage20: 546, maxHp: 100, per100: 100 }, { damage20: 642, maxHp: 100, per100: 100 }])
    const two = indexRows([{ damage20: 546, maxHp: 100, per100: 100 }, { damage20: 573, maxHp: 100, per100: 100 }, { damage20: 642, maxHp: 100, per100: 100 }])
    expect(one[2].attack).toBe(two[2].attack)
    expect(two[1].attack).toBe(1.05)
  })

  it('장부가 없는 옛 줄은 공격·방어만 낸다', () => {
    const rows = indexRows([
      { damage20: 500, maxHp: 100, per100: 100 },
      { damage20: 1000, maxHp: 100, per100: 100 },
    ])
    expect(rows[1].attack).toBe(2)
    expect(rows[1].layerScale).toBeNull()
    expect(rows[1].outside).toBeNull()
    expect(indexRows([])).toEqual([])
  })

  it('맞는 적이 공격을 끝낸 비율: 시작한 공격 가운데 끝까지 나간 몫, 시작한 것이 없으면 없음', () => {
    expect(finishRate(8, 6)).toBe(0.75)
    expect(finishRate(5, 0)).toBe(0)
    expect(finishRate(3, 3)).toBe(1)
    expect(finishRate(0, 0)).toBeNull()
  })

  it('끝낸 비율을 줄끼리 견주는 고정 적은 근접·표준 문턱·방패 없는 적이다', () => {
    const foe = enemies[STANDARD_FOE]
    expect(foe).toBeDefined()
    expect(foe.poise).toBe(STANDARD_POISE)
    expect(foe.role).toBe('brute')
    expect(foe.guard).toBeUndefined()
  })

  it('맞은 한 대들: 가운데 값과 휘청임 문턱 이상인 몫', () => {
    expect(hitStats([10, 12, 30, 40])).toEqual({ count: 4, median: 21, staggerShare: 0.5 })
    expect(hitStats([25, 30], 20).staggerShare).toBe(1)
    expect(hitStats([5, 6, 7]).staggerShare).toBe(0)
    expect(hitStats([])).toEqual({ count: 0, median: null, staggerShare: null })
  })

  it('가운데 값은 숫자만 본다', () => {
    expect(median([3, null, 1, undefined, 2])).toBe(2)
    expect(median([1, 4])).toBe(2.5)
    expect(median([null])).toBeNull()
  })

  it('층 목록을 한 줄 글로: 그대로인 층은 뺀다', () => {
    const layers = [
      { id: 'promotion', name: '승천', kind: 'mul', value: 1.35 },
      { id: 'gear', name: '장비', kind: 'add', value: 0 },
      { id: 'training', name: '수련', kind: 'add', value: 0.23 },
      { id: 'myth', name: '손의 신', kind: 'mul', value: 1 },
    ]
    expect(layerText(layers)).toBe('승천 ×1.35 · 수련 +23%')
    expect(layerText([])).toBe('')
  })
})

describe('사건 앞 줄·뒤 줄 (E307 0B)', () => {
  // 귀환이 915.8초, 2분 저장 셋 (줄 시각은 반올림한 초)
  const log = [
    { t: 712.6, type: 'open', detail: 'thor' },
    { t: 915.8, type: 'return', detail: '1:ascend:thor' },
    { t: 1193.2, type: 'merge', detail: 'hero' },
  ]

  it('저장까지 남은 기록 수로 가른다: 사건 바로 뒤에 찍힌 저장은 뒤 줄이다', () => {
    // 가운데 저장은 귀환 0.5초 뒤(916.3초 → 916)에 찍혔다: 승천이 든 뒤의 줄이다
    const rows = [
      { t: 798, attack: 4.16, logged: 1 },
      { t: 916, attack: 10.96, logged: 2 },
      { t: 1033, attack: 10.57, logged: 2 },
    ]
    const { before, after } = rowsAround(rows, log, 915.8)
    expect([before.attack, after.attack]).toEqual([4.16, 10.96])
  })

  it('사건과 같은 시각의 저장도 차례로 가른다 (봇이 생각하는 걸음의 귀환은 바로 앞 저장과 같은 시각에 찍힌다)', () => {
    // 저장이 915.8초(→ 916)에 찍히고 바로 다음 걸음에 귀환을 골랐다: 그 저장은 귀환 앞이다
    const rows = [
      { t: 798, attack: 4.16, logged: 1 },
      { t: 916, attack: 4.35, logged: 1 },
      { t: 1033, attack: 10.96, logged: 2 },
    ]
    const { before, after } = rowsAround(rows, log, 915.8)
    expect([before.attack, after.attack]).toEqual([4.35, 10.96])
  })

  it('사건 앞이나 뒤에 줄이 없으면 비운다', () => {
    const rows = [{ t: 0, attack: 1, logged: 0 }, { t: 115, attack: 1.05, logged: 0 }]
    expect(rowsAround(rows, log, 712.6)).toEqual({ before: rows[1], after: null })
    expect(rowsAround([{ t: 1300, attack: 11, logged: 3 }], log, 1193.2).before).toBeNull()
    expect(rowsAround(rows, log, undefined)).toEqual({ before: null, after: null })
  })

  it('기록 수가 없는 옛 파일은 시각으로 가른다 (저장이 사건 1초 뒤까지면 앞)', () => {
    const rows = [
      { t: 798, attack: 4.16 },
      { t: 915, attack: 4.35 },
      { t: 1033, attack: 10.96 },
    ]
    const { before, after } = rowsAround(rows, log, 915.8)
    expect([before.attack, after.attack]).toEqual([4.35, 10.96])
    // 기록에 없는 시각도 같다
    expect(rowsAround([{ t: 798, attack: 4.16, logged: 1 }, { t: 1033, attack: 10.96, logged: 2 }], log, 900).before.attack).toBe(4.16)
  })
})

describe('여러 판의 결과 파일 (E307 0B)', () => {
  it('첫 판은 준 이름 그대로, 둘째부터 이름 뒤에 번호를 붙인다', () => {
    expect(runFile('test-results/power-curve.json', 1)).toBe('test-results/power-curve.json')
    expect(runFile('test-results/power-curve.json', 2)).toBe('test-results/power-curve-2.json')
    expect(runFile('test-results/baseline/pc.json', 3)).toBe('test-results/baseline/pc-3.json')
    expect(runFile('out/curve', 2)).toBe('out/curve-2.json')
  })
})

describe('판 기록 → 시각표와 보스 싸움 (E307 0B)', () => {
  const log = [
    { t: 5, type: 'chapter', detail: 'north' },
    { t: 6, type: 'region', detail: 'midgard' },
    { t: 300, type: 'region', detail: 'serpentCoast' },
    { t: 350, type: 'kill' },
    { t: 500, type: 'region', detail: 'midgard' },
    { t: 540, type: 'region', detail: 'serpentCoast' },
    { t: 560, type: 'kill' },
    { t: 580, type: 'kill' },
    { t: 650, type: 'open', detail: 'thor' },
    { t: 880, type: 'return', detail: '1:ascend:thor' },
    { t: 900, type: 'merge', detail: 'hero' },
    { t: 1000, type: 'region', detail: 'utgard' },
    { t: 1400, type: 'bossKill', detail: 'giantKing' },
    { t: 1400, type: 'chapter', detail: 'greek' },
    { t: 1500, type: 'mount' },
    { t: 1600, type: 'oath', detail: 'silence:win:420' },
    { t: 2000, type: 'ending' },
  ]

  it('시각표: 귀환(번호·갈래), 깨어난 신, 첫 영웅, 장마다 들어선 때·끝낸 때', () => {
    const tl = timelineOf(log)
    expect(tl.returns).toEqual([{ n: 1, t: 880, branch: 'ascend:thor' }])
    expect(tl.awakened).toEqual({ thor: 650 })
    expect(tl.firstHero).toBe(900)
    expect(tl.bosses).toEqual({ giantKing: 1400 })
    expect(tl.mount).toBe(1500)
    expect(tl.oathKept).toBe(1600)
    expect(tl.chapters).toEqual([
      { id: 'north', from: 5, to: 1400 },
      { id: 'greek', from: 1400, to: 2000 },
    ])
  })

  it('보스 싸움: 그 땅에 들어서 처음 때릴 때까지와 처음 때려 쓰러질 때까지', () => {
    const fights = bossFights(log, [
      // 수호자: 바닷가에 두 번 들어섰고, 둘째로 들어선 뒤 60초에 처음 때려 25초에 잡았다
      { id: 'jormungandr', role: 'guardian', region: 'serpentCoast', firstHit: 600, lastStart: 600, resets: 0, killed: 625 },
      // 장 보스: 한 번 물러났다 되차서 마지막 시도는 100초
      { id: 'king', role: 'boss', region: 'utgard', firstHit: 1200, lastStart: 1300, resets: 1, killed: 1400 },
      // 아직 못 잡은 싸움
      { id: 'typhon', role: 'guardian', region: 'olympus', firstHit: 1900, lastStart: 1900, resets: 0 },
    ])
    expect(fights[0]).toMatchObject({ id: 'jormungandr', entered: 540, approach: 60, sinceFirstEnter: 300, killsBefore: 2, fight: 25, lastFight: 25, resets: 0 })
    expect(fights[1]).toMatchObject({ id: 'king', entered: 1000, approach: 200, killsBefore: 0, fight: 200, lastFight: 100, resets: 1 })
    // 들어선 기록이 없는 땅·못 잡은 싸움은 비운다
    expect(fights[2]).toMatchObject({ id: 'typhon', entered: null, approach: null, killsBefore: null, fight: null, killed: null })
    expect(bossText(fights)).toBe('jormungandr 다가가기 60초(처치 2) · 싸움 25초, king 다가가기 200초(처치 0) · 싸움 200초(되참 1, 마지막 100초), typhon 다가가기 -(처치 -) · 싸움 - 못 잡음')
  })
})

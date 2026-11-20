import { describe, expect, it } from 'vitest'

import enemies from '../src/data/enemies.json'
import { bossFights, bossText, DUMMY_HP, finishRate, hitStats, indexRows, isKill, killGap, killWatchStart, layerText, median, OATH_LIMIT, oathBotRun, oathRuns, oathText, OLD_DUMMY_HP, rowsAround, runFile, STANDARD_FOE, STANDARD_POISE, strikeDummy, timelineOf, wasClipped } from '../scripts/lib/curve.mjs'
import { OATH, OATH_IDS } from '../src/data/oaths'

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

describe('처치가 끊긴 가장 긴 구간 (E241, E307 0C: playtest·power-curve가 함께 쓴다)', () => {
  // 첫 신이 600초에 깨어났고, 그 뒤 처치는 620·650·1000(보스)·1010초, 판은 1100초에 끝났다.
  // 첫 신 전에는 맨몸으로 100 → 590초(490초) 동안 처치가 끊겼다: 그 뒤의 가장 긴 끊김(350초)보다 길어야
  // 「재기 시작한 때부터」가 빠진 셈이 이 시험에서 드러난다
  const log = [
    { t: 6, type: 'region', detail: 'midgard' },
    { t: 100, type: 'kill' },
    { t: 500, type: 'region', detail: 'serpentshore' },
    { t: 590, type: 'kill' },
    { t: 600, type: 'open', detail: 'thor' },
    { t: 620, type: 'kill' },
    { t: 650, type: 'kill' },
    { t: 700, type: 'region', detail: 'utgard' },
    { t: 1000, type: 'bossKill', detail: 'giantKing' },
    { t: 1010, type: 'kill' },
  ]

  it('재기 시작한 때 뒤의 처치와 처치 사이에서 가장 긴 구간과, 그 구간이 시작한 때의 땅', () => {
    // 650 → 1000초가 가장 길다 (보스 처치도 처치다). 그 구간이 시작한 650초에는 바닷가에 있었다
    expect(killGap(log, 600, 1100)).toEqual({ seconds: 350, at: 650, region: 'serpentshore' })
    expect(isKill({ type: 'bossKill' })).toBe(true)
    expect(isKill({ type: 'hurt' })).toBe(false)
  })

  it('재기 시작하기 전의 끊김(첫 신 전의 100 → 590초)은 더 길어도 세지 않는다', () => {
    const gap = killGap(log, 600, 1020)
    expect(gap.seconds).toBe(350)
    // 구간은 재기 시작한 때 뒤에서 시작한다
    expect(gap.at).toBeGreaterThanOrEqual(600)
    // 처음부터 재면 그 구간이 가장 길다 (유물을 끼고 시작하는 판·깊이 봇)
    expect(killGap(log, 0, 1100)).toEqual({ seconds: 490, at: 100, region: 'midgard' })
    expect(killGap(log.slice(0, 4), 0, 600)).toEqual({ seconds: 490, at: 100, region: 'midgard' })
  })

  it('재기 시작한 때에서 그 뒤 첫 처치까지도 구간이다 (시작 전 마지막 처치부터가 아니다)', () => {
    // 595초부터 재면 첫 구간은 595 → 620초의 25초다 (590 → 620초의 30초가 아니다)
    expect(killGap(log.slice(0, 6), 595, 621)).toEqual({ seconds: 25, at: 595, region: 'serpentshore' })
  })

  it('마지막 처치에서 판이 끝날 때까지도 구간이다 (멈춘 채 끝난 판)', () => {
    expect(killGap(log, 600, 1500)).toEqual({ seconds: 490, at: 1010, region: 'utgard' })
  })

  it('처치가 하나도 없으면 재기 시작한 때부터 끝까지가 구간이다', () => {
    expect(killGap([{ t: 3, type: 'region', detail: 'midgard' }], 0, 240)).toEqual({ seconds: 240, at: 0, region: null })
    // 땅에 들어선 기록이 없을 때의 땅은 부르는 쪽이 준다 (--region으로 세운 판)
    expect(killGap([], 0, 240, 'olympus').region).toBe('olympus')
  })

  it('재기 시작한 때가 없으면(첫 신 전에 끝난 판) 구간도 없다', () => {
    expect(killGap(log, undefined, 1100)).toBeNull()
  })

  it('처치를 걸러 낸 기록으로 셈하면 판 전체가 한 구간이 된다: 걸러 내기 전의 기록을 줘야 한다', () => {
    const filtered = log.filter((e) => e.type !== 'kill')
    expect(killGap(filtered, 600, 1100).seconds).toBe(400)
    expect(killGap(log, 600, 1100).seconds).toBe(350)
  })

  it('재기 시작하는 때는 첫 신을 손에 쥔 때, 그 기록이 없으면 첫 신이 깨어난 때다', () => {
    expect(killWatchStart(log)).toBe(600)
    expect(killWatchStart([{ t: 590, type: 'open', detail: 'thor' }, { t: 595, type: 'manifest', detail: 'thor' }])).toBe(595)
    expect(killWatchStart([{ t: 6, type: 'region', detail: 'midgard' }])).toBeUndefined()
  })
})

describe('맹세 봇의 판 기록 (E307 0C: 엔딩 뒤 꼴)', () => {
  const demo = ['silence', 'emptyHand', 'alone']
  // 침묵을 10초에 걸어 105초에 지켰고, 타는 모래시계는 400초에 걸어 1000초에 깨졌고, 무거운 발은 걸기만 했다
  const log = [
    { t: 105, type: 'oath', detail: 'silence:win:95' },
    { t: 300, type: 'oath', detail: 'emptyHand:win:150' },
    { t: 1000, type: 'oath', detail: 'timed:fail:600' },
  ]
  const sworn = [
    { id: 'silence', t: 10.2 },
    { id: 'emptyHand', t: 150 },
    { id: 'timed', t: 400 },
    { id: 'slow', t: 1001 },
  ]

  it('건 맹세마다 건 때·끝난 때·건 뒤의 초·지켰나를 붙이고, 데모 셋을 가린다', () => {
    const runs = oathRuns(log, sworn, demo)
    expect(runs[0]).toEqual({ id: 'silence', demo: true, sworn: 10, ended: 105, seconds: 95, win: true })
    expect(runs[1]).toMatchObject({ id: 'emptyHand', demo: true, seconds: 150, win: true })
    expect(runs[2]).toEqual({ id: 'timed', demo: false, sworn: 400, ended: 1000, seconds: 600, win: false })
    // 아직 안 끝난 맹세는 건 때만
    expect(runs[3]).toEqual({ id: 'slow', demo: false, sworn: 1001 })
  })

  it('건 때보다 앞선 같은 맹세의 기록은 붙이지 않는다', () => {
    const again = oathRuns([{ t: 50, type: 'oath', detail: 'silence:fail:40' }, { t: 200, type: 'oath', detail: 'silence:win:90' }], [{ id: 'silence', t: 110 }], demo)
    expect(again[0]).toMatchObject({ ended: 200, seconds: 90, win: true })
  })

  it('한 줄 글: 지킴·깨짐·못 끝냄', () => {
    expect(oathText(oathRuns(log, sworn, demo))).toBe('silence 지킴 95초, emptyHand 지킴 150초, timed 깨짐 600초, slow 못 끝냄')
    expect(oathText([])).toBe('-')
  })

  it('건 직후 도는 숨 칸 수와 봇이 푼 맹세(상한을 넘김)를 그대로 싣는다', () => {
    const runs = oathRuns([{ t: 130, type: 'oath', detail: 'alone:win:30' }], [{ id: 'alone', t: 100, breath: 1 }, { id: 'noHeal', t: 180, breath: 4, gaveUp: 661 }], demo)
    expect(runs[0]).toEqual({ id: 'alone', demo: true, sworn: 100, breath: 1, ended: 130, seconds: 30, win: true })
    // 푼 맹세는 끝난 기록이 없다: 지킨 것도 깨진 것도 아니다
    expect(runs[1]).toEqual({ id: 'noHeal', demo: false, sworn: 180, breath: 4, gaveUp: 661 })
    expect(oathText(runs)).toBe('alone 지킴 30초, noHeal 못 끝냄(661초에 풂)')
  })
})

describe('맹세 봇의 한 구간 (E307 0C: 페이지 안에서 도는 셈)', () => {
  const demo = ['silence', 'emptyHand', 'alone']

  /**
   * 게임 흉내: 봇이 1초 돌 때마다 시계가 1초 가고, 건 맹세는 fights[맹세]초 뒤 보스를 이겨 지켜진다 (없으면 영영 못 이긴다: 생명이 안 차 쉬기만 하는 마른 샘).
   * 이긴 보스는 respawn초 뒤 다시 선다. 타는 모래시계는 원정 시계가 OATH.timed를 넘으면 게임이 깬다
   */
  function fakeGame(fights, { respawn = 3, breath = ['thor', 'odin', 'loki', 'freyr'] } = {}) {
    const calls = []
    let down = 0
    const game = {
      calls,
      time: 0,
      expedition: { oath: null, elapsed: 0 },
      encounter: { boss: { alive: true } },
      powers: { loadout: { pantheon: { breath: [...breath] } } },
      oathSystem: {
        available: () => [...OATH_IDS],
        swear: (id) => {
          game.expedition.oath = id
          // 홀로는 숨 칸 하나만 돈다
          game.powers.loadout.pantheon.breath = id === 'alone' ? breath.slice(0, 1) : [...breath]
          calls.push(`swear ${id} t=${game.time} elapsed=${game.expedition.elapsed}`)
        },
      },
    }
    const bot = {
      run: (seconds) => {
        game.time += seconds
        game.expedition.elapsed += seconds
        const oath = game.expedition.oath
        if (!game.encounter.boss.alive && (down -= seconds) <= 0) game.encounter.boss.alive = true
        else if (oath && fights[oath] !== undefined && game.expedition.elapsed >= fights[oath]) {
          calls.push(`kept ${oath} t=${game.time}`)
          game.expedition.oath = null
          game.encounter.boss.alive = false
          down = respawn
        } else if (oath === 'timed' && game.expedition.elapsed > OATH.timed) {
          calls.push(`broken ${oath} t=${game.time}`)
          game.expedition.oath = null
        }
      },
    }
    return { game, bot, sworn: [] }
  }

  /** 페이지로 넘어간 것처럼: 글로 바꿨다 다시 만든 함수를 이 파일의 다른 것이 안 보이는 자리에서 돌린다 */
  const inPage = (world, arg) => {
    globalThis.window = { __game: world.game, __autoplay: world.bot, __oathSworn: world.sworn }
    try {
      return new Function(`return (${oathBotRun})`)()(arg)
    } finally {
      delete globalThis.window
    }
  }

  it('걸린 맹세가 없고 보스가 서 있으면 다음 맹세를 건다: 원정 시계를 0으로, 건 때와 건 직후 도는 숨 칸 수를 적는다', () => {
    const world = fakeGame({ silence: 10, emptyHand: 10, alone: 10 })
    world.game.expedition.elapsed = 77
    const out = inPage(world, { seconds: 30, limit: OATH_LIMIT, demo })
    // 침묵을 0초에 걸어 10초에 지키고, 보스가 다시 선 13초에 빈 손, 26초에 홀로 (보스가 쓰러져 있는 동안에는 걸지 않는다)
    expect(world.game.calls).toEqual(['swear silence t=0 elapsed=0', 'kept silence t=10', 'swear emptyHand t=13 elapsed=0', 'kept emptyHand t=23', 'swear alone t=26 elapsed=0'])
    expect(world.sworn).toEqual([
      { id: 'silence', t: 0, breath: 4 },
      { id: 'emptyHand', t: 13, breath: 4 },
      { id: 'alone', t: 26, breath: 1 },
    ])
    // 홀로가 걸려 있다: 데모 셋이 아직 안 끝났다
    expect(out).toEqual({ left: true, demoLeft: true })
    // 홀로를 지키면(36초) 데모 셋은 끝, 다음 맹세가 남았다
    expect(inPage(world, { seconds: 10, limit: OATH_LIMIT, demo })).toEqual({ left: true, demoLeft: false })
  })

  it('건 뒤 상한이 지나도 걸려 있는 맹세(생명이 안 차 쉬기만 하는 마른 샘)는 풀고 다음 맹세로 간다', () => {
    const world = fakeGame({ silence: 5, emptyHand: 5, alone: 5, crowd: 5 }, { respawn: 1 })
    inPage(world, { seconds: 200, limit: 60, demo })
    const noHeal = world.sworn.find((s) => s.id === 'noHeal')
    // 마른 샘을 건 뒤 61초(상한 60초를 넘긴 첫 걸음)에 풀고, 같은 걸음에 두 배의 무리를 건다
    expect(noHeal.gaveUp).toBe(61)
    expect(world.game.calls).toContain(`swear null t=${noHeal.t + 61} elapsed=61`)
    expect(world.game.calls).toContain(`swear crowd t=${noHeal.t + 61} elapsed=0`)
    // 지킨 맹세에는 gaveUp이 없다
    expect(world.sworn.filter((s) => s.gaveUp !== undefined).map((s) => s.id)).toEqual(['noHeal', 'timed'])
    // 뒤의 맹세도 건다: 풀지 않으면 마른 샘에서 판이 끝나지 않는다
    expect(world.sworn.map((s) => s.id)).toEqual(['silence', 'emptyHand', 'alone', 'noHeal', 'crowd', 'timed', 'glass'])
  })

  it('상한은 타는 모래시계가 스스로 깨지는 10분보다 길다: 그 맹세는 게임이 먼저 끝낸다', () => {
    expect(OATH_LIMIT).toBeGreaterThan(OATH.timed)
    // 앞의 다섯은 곧 지키고, 타는 모래시계만 못 이긴다
    const world = fakeGame({ silence: 5, emptyHand: 5, alone: 5, noHeal: 5, crowd: 5, glass: 5, slow: 5 }, { respawn: 1 })
    const out = inPage(world, { seconds: 700, limit: OATH_LIMIT, demo })
    const timed = world.sworn.find((s) => s.id === 'timed')
    expect(world.game.calls).toContain(`broken timed t=${timed.t + OATH.timed + 1}`)
    expect(world.game.calls.some((c) => c.startsWith('swear null'))).toBe(false)
    expect(world.sworn.every((s) => s.gaveUp === undefined)).toBe(true)
    // 여덟을 다 걸어 봤고 걸린 맹세가 없으면 끝
    expect(world.sworn.map((s) => s.id)).toEqual([...OATH_IDS])
    expect(out).toEqual({ left: false, demoLeft: false })
  })

  it('데모 셋 가운데 하나를 풀었어도 걸어 봤으면 데모 셋은 끝난 것이다 (지켰는지는 판 기록이 가린다)', () => {
    const world = fakeGame({ silence: 5, alone: 5 }, { respawn: 1 })
    const out = inPage(world, { seconds: 100, limit: 30, demo })
    expect(world.sworn.find((s) => s.id === 'emptyHand').gaveUp).toBe(31)
    expect(out.demoLeft).toBe(false)
    expect(out.left).toBe(true)
  })
})

describe('표준 허수아비 치기 (E307 0C: 페이지 안에서 도는 셈)', () => {
  /** 게임 흉내: 주인공이 1초에 두 번, 한 대 perHit씩 누른 적을 친다. 한 일을 차례로 적는다 */
  function fakeGame(perHit) {
    const calls = []
    let pressed = null
    const game = {
      calls,
      combat: { godMode: false, health: { reset: () => calls.push('heal') } },
      hero: { object: { position: { x: 4, z: 7 } } },
      orders: {
        clear: () => calls.push('clear-orders'),
        press: (_, foe) => {
          pressed = foe
          calls.push('press')
        },
      },
      encounter: {
        clearAll: () => calls.push('clear-foes'),
        spawnById: (id, at, awake) => {
          calls.push(`spawn ${id} ${at.x},${at.z} ${awake}`)
          return {
            health: { max: 100, hp: 100 },
            update: () => calls.push('foe-moved'),
            takeHit(amount) {
              this.health.hp -= amount
              return amount
            },
          }
        },
      },
      // 진짜 게임처럼 걸음마다 적의 update를 부른다: 허수아비가 서 있기만 하는지(update를 비웠는지)가 여기서 갈린다
      advance: (seconds) => {
        calls.push(`advance ${seconds} god=${game.combat.godMode}`)
        for (let i = 0; i < seconds * 2; i++) {
          pressed.update(0.5)
          pressed.takeHit(perHit, 0, 0, 0)
        }
      },
    }
    return game
  }

  /** 페이지로 넘어간 것처럼: 글로 바꿨다 다시 만든 함수를 이 파일의 다른 것이 안 보이는 자리에서 돌린다 */
  const inPage = (game, arg) => {
    globalThis.window = { __game: game }
    try {
      return new Function(`return (${strikeDummy})`)()(arg)
    } finally {
      delete globalThis.window
    }
  }

  it('20초 동안 준 피해와 20초 몫, 맞은 한 대들을 돌려준다', () => {
    const out = inPage(fakeGame(13.75), { hp: DUMMY_HP, seconds: 20 })
    // 1초에 두 대 × 20초 = 마흔 대
    expect(out.dealt).toBe(550)
    expect(out.damage20).toBe(550)
    expect(out.hits).toHaveLength(40)
    // 한 대는 소수 첫째 자리까지
    expect(out.hits[0]).toBe(13.8)
  })

  it('치는 초가 달라도 20초 몫으로 고쳐 낸다', () => {
    expect(inPage(fakeGame(10), { hp: DUMMY_HP, seconds: 10 })).toMatchObject({ dealt: 200, damage20: 400 })
  })

  it('둘레를 비우고, 쓰러지지 않게 둔 채, 서 있기만 하는 허수아비를 1.8m 앞에 세워 누른다. 끝나면 비우고 되돌린다', () => {
    const game = fakeGame(10)
    inPage(game, { hp: DUMMY_HP, seconds: 20 })
    expect(game.calls).toEqual(['clear-foes', 'heal', 'clear-orders', 'spawn grunt 5.8,7 true', 'press', 'advance 20 god=true', 'clear-foes'])
    // 허수아비는 치는 동안 한 번도 움직이지 않는다 (공격·물러서기·밀려남이 20초 피해를 흔들지 않게)
    expect(game.calls).not.toContain('foe-moved')
    // 쓰러지지 않게 한 것은 치기 전의 값으로 되돌린다
    expect(game.combat.godMode).toBe(false)
    const kept = fakeGame(10)
    kept.combat.godMode = true
    inPage(kept, { hp: DUMMY_HP, seconds: 20 })
    expect(kept.combat.godMode).toBe(true)
  })

  it('허수아비는 생명이 고정이라 센 빌드가 쳐도 20초 안에 죽지 않는다', () => {
    // 한 대 3000(20초에 12만)이어도 준 피해가 그대로 찍힌다
    expect(inPage(fakeGame(3000), { hp: DUMMY_HP, seconds: 20 }).dealt).toBe(120000)
  })
})

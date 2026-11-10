// 플레이 시간대별로 얼마나 강해지는가 (3차 스프린트 타임라인 설계의 기준선).
// 1) 봇이 처음부터 플레이하며 0:00(걷기 전)과 그 뒤 2분마다 저장(snapshot)을 남긴다.
// 2) 저장마다 새 창에서 그 저장을 불러, 같은 표준 허수아비에게 20초 동안 준 피해(공격)와 표준 한 대에 깎이는 생명(방어)을 재고,
//    그때 그 땅의 적 생명·한 대 피해로 "그 자리 적 하나를 잡는 시간"과 "몇 대 맞으면 쓰러지나"를 구한다.
// 사용법: npm run build && node scripts/power-curve.mjs [분=40] [--depth=N] [--shots] [--runs=N] [--out=파일]   결과: test-results/power-curve.json
// 재는 방법 (E307 0B 「재는 자」, 셈은 scripts/lib/curve.mjs):
// - 표준 허수아비는 생명이 고정(DUMMY_HP)이라 땅 세기·깊이와 무관하고 20초 안에 죽지 않는다. 옛 표준 적(80 × 60 × 땅 세기)이면
//   잘렸을 줄은 clippedBefore로 남긴다 (옛 기준선과 견줄 때). 「적 잡는 초·버티는 대」는 지금대로 그 땅의 적을 따른다
// - 줄마다 build(층 목록과 층 밖 수치, `game.dev.buildSheet()`), layerScale(층 곱의 비율)·outside(층 밖에서 큰 몫 = 공격 ÷ layerScale)
// - 공격·방어 지수의 기준(첫 줄)은 0:00의 맨몸이다: 봇이 걷기 전에 한 번 저장한다 (--shots 판의 첫 눈금과 같다).
//   첫 2분 저장을 기준으로 삼으면 그때까지 얻은 수련 마디·장비에 따라 판마다 기준이 달라진다. 기준 줄의 20초 피해는 결과의 standard.baseDamage20
// - 줄마다 「맞는 적이 공격을 끝낸 비율」: 적 하나를 쓰러지지 않게(생명 고정) 세워 FINISH_SECONDS초 싸우며 적이 시작한 공격(예고) 가운데
//   끝까지 나간 몫. 끊긴 것은 휘청임·밀침뿐이다. 두 가지로 잰다:
//   · standardFinishRate: 고정 적(STANDARD_FOE = 서리 거인, 근접·문턱 20). 줄끼리 견주는 칸이다
//     (휘청임 문턱이 절대값이라 한 대 피해가 20을 넘으면 0으로 떨어진다)
//   · finishRate: 그 땅의 가장 흔한 보통 적. 땅마다 재는 적이 달라(문턱 20~45, 방패, 거리 두기) 같은 땅·같은 적끼리만 견준다
//   hits는 표준 허수아비가 맞은 한 대들 (가운데 값, 표준 문턱 20 이상인 몫)
// - 판 기록: 제 판의 시각표(timeline·ending, playtest.mjs와 같은 모양)와 보스·수호자 싸움 초(bossFights)를 함께 남겨,
//   `node scripts/timeline-check.mjs --curve`가 같은 판의 시각과 공격 지수를 견준다. 줄의 logged는 그 저장까지 기록(log)에 남은 사건 수라
//   사건 앞 줄·뒤 줄을 차례로 가른다 (시각은 반올림해 남겨서 사건 직후의 저장을 못 가른다)
// --runs=N: N판을 이어 돌린다 (같은 판 기준선 세 판). 둘째 판부터는 power-curve-2.json처럼 옆에 남기고, 판을 쓸 때마다 첫 파일의 siblings에 적는다
// --out=파일: 결과 파일 (기본 test-results/power-curve.json, 없는 폴더는 만든다)
// --depth=N: 엔딩 뒤에서 원정이 무르익을 때마다 귀환하며 깊이를 하나씩 내려가 N까지 (E305-03, 옛 --threat)
// --shots: 90분 사람 눈 QA (E306 D24). 봇 창을 1280×720으로 열고 5초씩 감으며 2분 눈금·등급 2 이상 순간의 카드·고르는 카드(귀환·맹세·두 갈래)를 찍고,
//   봇이 끝난 뒤 2분 저장마다 휴대폰(390×844 터치)으로 불러 찍으며 잘린 요소를 센다. 결과는 test-results/timeline/
//   (tick-MMSS-땅.jpg·card-MMSS-종류.jpg·moment-MMSS-n.jpg·phone-MMSS.jpg, 썸네일 sheet-*.png, timeline.json의 눈금·순간·자동 표시).
//   평가가 잦아 봇 시각이 조금 바뀌니 시각 판정에는 쓰지 않는다 (시각은 playtest.mjs --ending 세 판이나 --shots 없는 --runs=3으로)
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname } from 'node:path'
import { chromium } from 'playwright-core'
import { findCuts } from './lib/cuts.mjs'
import { bossFights, bossText, DUMMY_HP, finishRate, hitStats, indexRows, layerText, runFile, STANDARD_FOE, STANDARD_POISE, timelineOf, wasClipped } from './lib/curve.mjs'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const flag = (name) => process.argv.find((a) => a.startsWith(name))?.slice(name.length)
const LIMIT_MIN = Number(args[0] ?? 40)
const DEPTH = Number(flag('--depth=') ?? 0)
const SHOTS = process.argv.includes('--shots')
/** 이어 돌릴 판 수 (같은 판 기준선 세 판은 --runs=3). --shots는 한 판만 */
const RUNS = SHOTS ? 1 : Math.max(1, Number(flag('--runs=') ?? 1))
const OUT_FILE = flag('--out=') ?? 'test-results/power-curve.json'
/** 표준 허수아비를 치는 시간 (초): 공격 지수의 뜻 (`TIMELINE.md` 4장) */
const ATTACK_SECONDS = 20
/** 「맞는 적이 공격을 끝낸 비율」을 재는 싸움의 길이 (초) */
const FINISH_SECONDS = 40
/** 판 기록에 남길 사건 (처치·피격은 많아서 뺀다) */
const LOG_TYPES = ['open', 'fragment', 'promote', 'forge', 'gear', 'bossKill', 'depth', 'region', 'death', 'chapter', 'ending', 'return', 'merge', 'oath', 'mount']
const EVERY = 120
const PORT = 4199
const BASE = `http://localhost:${PORT}/`
const OUT = 'test-results/timeline'
/** --shots: 한 번에 감는 게임 초 (탭 카드는 microtask라 감기가 끝나야 뜬다, Tabs.ts) */
const CHUNK = 5
/** 카드가 나타난 뒤 이만큼(ms) 기다려 찍는다 (날아 들어오는 움직임이 멎을 때) */
const CARD_SETTLE = 600
/** 같은 종류·제목의 작은 카드는 이만큼까지만 찍는다 (큰 카드는 모두) */
const CARD_REPEAT = 3
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}
const fmt = (t) => `${Math.floor(Math.round(t) / 60)}:${String(Math.round(t) % 60).padStart(2, '0')}`
const stamp = (t) => fmt(t).replace(':', '').padStart(4, '0')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** 봇 판을 끝낼 때: 제한 시간, 깊이 봇은 그 깊이에 닿음, 처음부터 하는 판은 엔딩 */
const done = (s) => s.t > LIMIT_MIN * 60 || (DEPTH > 0 && s.reached >= DEPTH) || (DEPTH === 0 && s.ending)

/** 몇 프레임 그려질 때까지 기다린다 (찍기 전) */
async function frames(page, n = 2) {
  const f = await page.evaluate(() => window.__game.frame)
  await page.waitForFunction((x) => window.__game.frame >= x, f + n, { timeout: 60000 })
}

/** 저장을 불러 연 새 창 (휴대폰이면 터치 세로) */
async function openSave(browser, save, viewport, phone = false) {
  const p = await browser.newPage({ viewport, ...(phone ? { hasTouch: true, isMobile: true } : {}) })
  await p.addInitScript((data) => {
    if (sessionStorage.getItem('loaded')) return
    sessionStorage.setItem('loaded', '1')
    localStorage.clear()
    localStorage.setItem('mythic-relics/save/0', data)
    localStorage.setItem('mythic-relics/last-slot', '0')
  }, JSON.stringify(save))
  await p.goto(`${BASE}?noscenes`, { timeout: 90000 })
  await p.waitForFunction(() => (window.__game?.frame ?? 0) > 2 && window.__game.playing, null, { timeout: 90000 })
  return p
}

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) break
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  const browser = await chromium.launch({
    executablePath: existsSync(BROWSER) ? BROWSER : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  // 결과 폴더는 판을 돌리기 전에 만든다 (긴 판을 다 돌린 뒤 쓰다가 죽지 않게)
  mkdirSync(dirname(OUT_FILE), { recursive: true })
  const written = []
  /** 첫 판의 결과: 뒤 판을 쓸 때마다 siblings를 더해 다시 쓴다 */
  let first = null
  for (let run = 1; run <= RUNS; run++) {
    if (RUNS > 1) console.log(`\n── 판 ${run} / ${RUNS} ──`)
    // 1) 봇 플레이와 0:00·2분마다 저장
    const play = await playRun(browser)
    // 2) 저장마다 힘 재기
    const rows = await measure(browser, play.snaps)
    // 3) --shots: 휴대폰으로 다시 찍기와 썸네일·자동 표시
    if (play.shots) await finishShots(browser, play.shots, rows, play.snaps)
    const log = play.log.filter((e) => LOG_TYPES.includes(e.type))
    // 줄마다 그 저장까지 남긴 기록(log)의 사건 수: 사건 앞 줄·뒤 줄을 차례로 가른다 (`rowsAround`)
    for (const [i, s] of play.snaps.entries()) rows[i].logged = play.log.slice(0, s.events).filter((e) => LOG_TYPES.includes(e.type)).length
    const result = {
      every: EVERY,
      /**
       * 재는 방법 (E307 0B): 표준 허수아비의 생명·치는 초, 끝낸 비율을 재는 싸움의 초·고정 적·표준 휘청임 문턱,
       * 지수의 기준인 첫 줄(0:00 맨몸)의 20초 피해 (판 사이를 지수 말고 damage20으로 견줄 때)
       */
      standard: { dummyHp: DUMMY_HP, seconds: ATTACK_SECONDS, finishSeconds: FINISH_SECONDS, foe: STANDARD_FOE, poise: STANDARD_POISE, baseDamage20: rows[0]?.damage20 ?? null },
      run,
      rows,
      log,
      // 제 판의 시각표 (playtest.mjs의 판과 같은 모양: timeline-check가 판으로 읽는다)
      ending: play.log.find((e) => e.type === 'ending')?.t,
      timeline: timelineOf(play.log),
      deaths: play.log.filter((e) => e.type === 'death').length,
      stallBreaks: play.stallBreaks,
      // 보스·수호자 싸움마다: 그 땅에 들어서 처음 때릴 때까지·처음 때려 쓰러질 때까지의 초
      bossFights: bossFights(play.log, play.fights),
    }
    writeFileSync(runFile(OUT_FILE, run), JSON.stringify(result, null, 2))
    written.push(runFile(OUT_FILE, run))
    // 둘째 판부터는 쓸 때마다 첫 파일에 그 파일을 적는다 (timeline-check --curve가 따라 읽는다. 뒤 판이 죽어도 끝난 판은 읽히게)
    if (run === 1) first = result
    else {
      first.siblings = written.slice(1).map((f) => basename(f))
      writeFileSync(OUT_FILE, JSON.stringify(first, null, 2))
    }
    report(result)
  }
  await browser.close()
  console.log(`\n결과: ${written.join(', ')}  (시각표와 견주기: node scripts/timeline-check.mjs --curve${OUT_FILE === 'test-results/power-curve.json' ? '' : ` ${OUT_FILE}`})`)

  /** 봇 한 판: 2분마다 저장(snaps), 플레이 기록 전부(log), 보스·수호자 싸움(fights), --shots면 찍은 것(shots) */
  async function playRun(browser) {
    const page = await browser.newPage({ viewport: SHOTS ? { width: 1280, height: 720 } : { width: 640, height: 360 } })
    await page.goto(`${BASE}?fresh&autoplay`)
    await page.waitForFunction(() => window.__autoplay && window.__game.frame > 2, null, { timeout: 60000 })
    if (DEPTH > 0) await page.evaluate(() => {
      // 깊이는 엔딩 뒤 장치 (E21-06): 귀환 카드에서 「+1」
      window.__game.reachEnding()
      Object.assign(window.__autoplay, { deepen: true })
    })
    // 처음부터 하는 판은 장 흐름의 목표를 따라 엔딩까지 (E22-06)
    else await page.evaluate(() => (window.__autoplay.chapters = true))
    const snaps = []
    // 판의 지금 상태 (페이지 안에서 window.__state()로 읽는다)
    await page.evaluate(() => {
      window.__state = () => {
        const g = window.__game
        return {
          t: g.time,
          region: g.region.id,
          depth: g.depth.level,
          reached: g.depth.reached,
          chosen: g.powers.manifested,
          opened: g.progress.opened.length,
          level: g.powers.manifested ? g.progress.level(g.powers.manifested) : 0,
          chapter: g.chapters.chapter?.id ?? 'end',
          ending: g.ending.reached,
        }
      }
    })
    const shots = SHOTS ? await shootRun(page, snaps) : null
    if (!SHOTS) {
      /** 봇을 seconds초 돌리고 남기는 저장 (events: 그때까지의 플레이 기록 수) */
      const take = (seconds) =>
        page.evaluate((sec) => {
          window.__autoplay.run(sec)
          return { ...window.__state(), save: window.__game.snapshot(), events: window.__game.log.length }
        }, seconds)
      // 0:00 줄 (한 걸음 뒤): 지수의 기준인 맨몸. 그 뒤로는 2분마다
      snaps.push(await take(1 / 30))
      let next = 0
      for (;;) {
        const s = await take(EVERY)
        if (s.t >= next) {
          snaps.push(s)
          next += EVERY
          console.log(`저장 ${fmt(s.t)} ${s.chapter} ${s.region} 깊이 ${s.depth} 신화 ${s.opened}(${s.chosen ?? '-'} ${s.level}단계)`)
        }
        if (done(s)) break
      }
    }
    const { log, fights, stallBreaks } = await page.evaluate(() => ({ log: window.__game.log, fights: [...window.__autoplay.bossFights], stallBreaks: window.__autoplay.stallBreaks }))
    await page.close()
    return { snaps, log, fights, stallBreaks, shots }
  }

  /** 저장마다 새 창에서 불러 잰 줄들 */
  async function measure(browser, snaps) {
    const rows = []
    for (const s of snaps) {
      const p = await openSave(browser, s.save, { width: 640, height: 360 })
      const m = await p.evaluate(
        ([dummyHp, attackSeconds, finishSeconds, standardFoe]) => {
          const g = window.__game
          // 그 땅의 적: 살아 있는 무리의 생명(깊이·땅 세기 포함)과 한 대 피해
          const foes = g.encounter.alive.filter((e) => e.spec.role !== 'boss')
          const foeHp = foes.length ? foes.reduce((n, e) => n + e.health.max, 0) / foes.length : 0
          const foeHit = foes.length ? foes.reduce((n, e) => n + Math.max(...e.spec.attacks.map((a) => a.damage ?? 0)) * e.damageScale, 0) / foes.length : 0
          // 끝낸 비율을 잴 적의 후보: 그 땅의 보통 적 (수호자·정예는 빼고, 부르는 적은 다른 것이 없을 때만)
          const plain = foes.filter((e) => e.spec.role !== 'guardian' && !e.elite)
          const melee = plain.filter((e) => e.spec.role !== 'summoner')
          const foeIds = (melee.length ? melee : plain).map((e) => e.spec.id)
          // 그때의 빌드 장부와 땅 세기 (재는 싸움이 사냥 각성 등을 움직이기 전에)
          const build = g.dev.buildSheet()
          const landPower = g.encounter.landPower(g.region.id)
          // 재는 동안은 무리가 다시 서지 않게 (비운 무리는 25초 뒤 다시 서서 재는 싸움에 끼어든다)
          g.encounter.crowd = 0
          // 공격: 표준 허수아비(생명 고정, 서 있기만)를 친다. 땅 세기·깊이와 무관하게 같은 적이다
          g.encounter.clearAll()
          g.combat.health.reset()
          g.combat.godMode = true
          g.orders.clear()
          const p = g.hero.object.position
          const t = g.encounter.spawnById('grunt', { x: p.x + 1.8, z: p.z }, true)
          t.health.max = dummyHp
          t.health.hp = dummyHp
          t.update = () => {}
          // 맞은 한 대마다의 피해 (휘청임 문턱과 견준다)
          const hits = []
          const takeHit = t.takeHit.bind(t)
          t.takeHit = (...hit) => {
            const dealt = takeHit(...hit)
            if (dealt > 0) hits.push(Math.round(dealt * 10) / 10)
            return dealt
          }
          g.orders.press(null, t)
          g.advance(attackSeconds, 1 / 30)
          const dealt = dummyHp - t.health.hp
          g.encounter.clearAll()
          // 방어: 표준 한 대(피해 100)에 깎이는 생명
          g.combat.godMode = false
          g.combat.health.reset()
          const before = g.combat.health.hp
          g.combat.takeHit(100, p.x + 1, p.z, 0)
          const lost = Math.max(1e-6, before - g.combat.health.hp)
          const maxHp = g.combat.health.max
          // 맞는 적이 공격을 끝낸 비율: 적 하나를 쓰러지지 않게(생명 고정) 세워 싸우며 적이 시작한 공격(예고)과 끝까지 나간 공격을 센다.
          // 쓰러지지 않으니 끝나지 못한 공격은 휘청임·밀침에 끊긴 것뿐이다 (적이 얼마나 빨리 쓰러지는지는 killSeconds가 따로 잰다).
          // 주인공도 쓰러지지 않게 둔다
          const fight = (id) => {
            g.combat.godMode = true
            g.combat.health.reset()
            g.orders.clear()
            const q = g.hero.object.position
            const foe = g.encounter.spawnById(id, { x: q.x + 1.8, z: q.z }, true)
            foe.health.max = dummyHp
            foe.health.hp = dummyHp
            g.orders.press(null, foe)
            g.advance(finishSeconds, 1 / 30)
            // 끝날 때 예고 중이던 공격은 세지 않는다 (끊긴 것도 끝난 것도 아니다)
            const counted = { foe: id, poise: foe.spec.poise, seconds: finishSeconds, begun: foe.attacksBegun - (foe.state === 'windup' ? 1 : 0), struck: foe.attacksStruck }
            g.encounter.clearAll()
            return counted
          }
          // 고정 적 (줄끼리 견주는 칸): 어느 땅에서나 같은 적이라 빌드만 다르다. 생명을 고정하니 땅 세기도 들지 않는다
          const standardFinish = fight(standardFoe)
          // 그 땅의 가장 흔한 보통 적 (땅마다 적이 달라 같은 땅·같은 적끼리만 견준다). 고정 적과 같으면 다시 재지 않는다
          const counts = new Map()
          for (const id of foeIds) counts.set(id, (counts.get(id) ?? 0) + 1)
          const foeId = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
          const finish = foeId === null ? null : foeId === standardFoe ? standardFinish : fight(foeId)
          return { damage20: Math.round((dealt / attackSeconds) * 20), maxHp: Math.round(maxHp), per100: Math.round(lost * 10) / 10, foeHp: Math.round(foeHp), foeHit: Math.round(foeHit * 10) / 10, foes: foes.length, landPower, build, hits, standardFinish, finish }
        },
        [DUMMY_HP, ATTACK_SECONDS, FINISH_SECONDS, STANDARD_FOE],
      )
      await p.close()
      const dps = m.damage20 / 20
      const { hits, standardFinish, finish, build, ...base } = m
      rows.push({
        t: Math.round(s.t),
        region: s.region,
        depth: s.depth,
        opened: s.opened,
        chosen: s.chosen,
        level: s.level,
        ...base,
        /** 공격·방어 지수 (첫 저장 = 1), 층 곱의 비율, 층 밖에서 큰 몫 (공격 ÷ 층 곱) */
        attack: 0,
        defense: 0,
        layerScale: null,
        outside: null,
        /** 옛 표준 적(80 × 60 × 땅 세기)이면 20초 안에 죽어 잘렸을 줄 (옛 기준선의 이 줄은 견주지 않는다) */
        clippedBefore: wasClipped(m.damage20, m.landPower),
        /** 그 땅 보통 적 하나를 잡는 데 걸리는 초 */
        killSeconds: m.foeHp && dps ? Math.round((m.foeHp / dps) * 10) / 10 : null,
        /** 그 땅 보통 적에게 몇 대 맞으면 쓰러지나 */
        hitsToDie: m.foeHit ? Math.round((m.maxHp / (m.foeHit * (m.per100 / 100))) * 10) / 10 : null,
        /** 맞는 적이 공격을 끝낸 비율, 고정 적(서리 거인, 문턱 20): 줄끼리 견주는 칸. 그 싸움 (적·휘청임 문턱·시작한 공격·끝난 공격) */
        standardFinishRate: finishRate(standardFinish.begun, standardFinish.struck),
        standardFinish,
        /** 같은 비율, 그 땅의 가장 흔한 보통 적: 땅마다 적이 달라 같은 땅·같은 적끼리만 견준다. 그 땅에 보통 적이 없으면 null */
        finishRate: finish ? finishRate(finish.begun, finish.struck) : null,
        finish,
        /** 표준 허수아비가 맞은 한 대들: 횟수·가운데 값·표준 문턱(20) 이상인 몫 */
        hits: hitStats(hits),
        /** 빌드 장부: 층 목록과 층 밖 수치 */
        build,
      })
    }
    return indexRows(rows)
  }

  /** 한 판의 표를 화면에 */
  function report(result) {
    const { rows } = result
    const pad = (x, n) => String(x ?? '-').padStart(n)
    console.log(`\n공격·방어 지수의 기준: 첫 줄 ${fmt(rows[0].t)} (20초 피해 ${rows[0].damage20}). 끝낸 비율은 고정 적(${STANDARD_FOE})과 그 땅의 적 둘`)
    console.log('시간   땅            깊이 신화 단계  공격  층 곱  층 밖   방어  적 잡는 초  버티는 대  끝낸 비율: 고정 적   그 땅(끝/시작 적)         한 대(문턱 이상)  옛 잘림')
    for (const r of rows) {
      const f = r.finish
      const sf = r.standardFinish
      console.log(
        `${fmt(r.t).padStart(5)}  ${r.region.padEnd(13)} ${pad(r.depth, 2)}  ${pad(r.opened, 3)}  ${pad(r.level, 3)}  ${pad(r.attack, 5)} ${pad(r.layerScale, 5)} ${pad(r.outside, 5)}  ${pad(r.defense, 5)}  ${pad(r.killSeconds, 8)}  ${pad(r.hitsToDie, 8)}  ` +
          `${pad(r.standardFinishRate, 5)} ${`(${sf.struck}/${sf.begun})`.padEnd(9)} ${pad(r.finishRate, 5)} ${(f ? `(${f.struck}/${f.begun} ${f.foe})` : '').padEnd(20)} ${pad(r.hits.median, 6)}(${pad(r.hits.staggerShare, 4)})  ${r.clippedBefore ? '잘림' : ''}`,
      )
    }
    // 층 목록은 바뀐 줄만
    console.log('\n층 목록 (바뀐 줄만):')
    let last = null
    for (const r of rows) {
      const text = layerText(r.build.layers) || '(층 없음)'
      if (text !== last) console.log(`${fmt(r.t).padStart(5)}  ×${Math.round(r.build.damageScale * 100) / 100}  ${text}`)
      last = text
    }
    const clipped = rows.filter((r) => r.clippedBefore)
    console.log(`\n옛 방법이면 잘렸을 줄 ${clipped.length} / ${rows.length}${clipped.length ? `: ${clipped.map((r) => fmt(r.t)).join(' ')}` : ''}`)
    if (result.ending !== undefined) console.log(`엔딩 ${fmt(result.ending)} · 쓰러짐 ${result.deaths}`)
    if (result.bossFights.length) console.log(`보스·수호자: ${bossText(result.bossFights)}`)
  }

  /**
   * --shots의 봇 판 (E306 D24): 5초씩 감고, 감는 사이에는 세계를 멈춘다(timeScale 0, HUD 카드는 실제 시간으로 흐름).
   * 2분 눈금마다 저장·찍기, 새 카드는 하나씩 나타난 뒤 찍고, 고르는 카드는 봇이 고르기 전 그 걸음에서 멈춰 찍는다
   */
  async function shootRun(page, snaps) {
    rmSync(OUT, { recursive: true, force: true })
    mkdirSync(OUT, { recursive: true })
    // 보인 순간을 한도 없이 모은다 (MomentSystem.shown은 200개에서 오래된 것을 버린다): 때·id·등급·카드 제목·땅
    await page.evaluate(() => {
      const g = window.__game
      const ms = g.moments
      const present = ms.present.bind(ms)
      window.__moments = []
      window.__cardShot = null
      ms.present = (m) => {
        present(m)
        const tier = ms.shown.at(-1)?.tier ?? 0
        window.__moments.push({ t: Math.round(g.time * 10) / 10, id: m.id, tier, title: m.card?.title ?? m.text ?? '', region: g.region.id })
      }
    })
    const ticks = []
    const cards = []
    const picks = []
    const seen = new Map()
    let lastShownAt = null
    let next = 0
    let moments = 0
    /** 고르는 카드가 떠 있어 줄을 다 찍지 못했다: 봇이 카드를 닫은 다음 걸음에서 다시 찍는다 */
    let drainPending = false
    const shoot = async (file) => {
      await page.evaluate(() => window.__game.view.jumpTo(window.__game.hero.object.position))
      await frames(page)
      await page.screenshot({ path: `${OUT}/${file}`, type: 'jpeg', quality: 70 })
      return file
    }
    /** HUD 줄에 선 카드를 하나씩, 나타난 뒤 찍는다 (세계는 멈춘 채) */
    const drainCards = async () => {
      const until = Date.now() + 90000
      while (Date.now() < until) {
        const h = await page.evaluate(() => {
          const hud = window.__game.hud
          const el = document.querySelector('.hud__gains')
          const lines = (node) => (node?.innerText ?? '').split('\n').map((x) => x.trim()).filter(Boolean).join(' · ')
          const choosing = document.querySelector('.pick-card:not([hidden])') !== null
          return { queue: hud.gainsQueue.length, at: hud.gainsShownAt, size: hud.gainsShowing, kind: lines(el?.querySelector('.hud__gains-head')), text: lines(el).slice(0, 90), choosing }
        })
        // 고르는 카드(귀환·맹세 출발)가 떠 있는 동안 HUD는 얻은 것 카드를 숨기고 줄을 내보내지 않는다:
        // 세계가 멈춘 채 기다리지 않고 봇이 고른 뒤에 다시 찍는다
        if (h.choosing) {
          drainPending = true
          return
        }
        if (h.size && h.at !== lastShownAt) {
          lastShownAt = h.at
          await sleep(CARD_SETTLE)
          const t = await page.evaluate(() => window.__game.time)
          const key = `${h.size}:${h.text}`
          const n = (seen.get(key) ?? 0) + 1
          seen.set(key, n)
          const row = { t: Math.round(t), size: h.size, kind: h.kind, text: h.text, file: null }
          if (h.size === 'big' || n <= CARD_REPEAT) row.file = await shoot(`moment-${stamp(t)}-${cards.length}.jpg`)
          cards.push(row)
          continue
        }
        if (h.queue === 0) {
          drainPending = false
          return
        }
        await sleep(250)
      }
    }
    for (;;) {
      const s = await page.evaluate(
        ([nextTick, chunk]) => {
          const g = window.__game
          const kind = () => (g.returnCardOpen ? 'return' : g.oathCardOpen ? 'oath' : g.swapOpen ? 'swap' : null)
          g.timeScale = 1
          window.__autoplay.run(Math.max(1 / 30, Math.min(chunk, nextTick - g.time)), () => {
            const k = kind()
            if (!k) window.__cardShot = null
            return k !== null && window.__cardShot !== k
          })
          g.timeScale = 0
          const pick = kind()
          return { ...window.__state(), pick: pick !== window.__cardShot ? pick : null, moments: window.__moments.length }
        },
        [next, CHUNK],
      )
      // 고르는 카드: 봇이 고르기 전에 찍는다
      if (s.pick) {
        const file = await shoot(`card-${stamp(s.t)}-${s.pick}.jpg`)
        picks.push({ t: Math.round(s.t), kind: s.pick, file })
        await page.evaluate((k) => (window.__cardShot = k), s.pick)
        console.log(`고르는 카드 ${fmt(s.t)} ${s.pick}`)
      }
      // 이번에 새로 보인 등급 2 이상 순간이 있으면 카드를 하나씩
      let drain = drainPending
      if (s.moments > moments) {
        drain ||= await page.evaluate((from) => window.__moments.slice(from).some((m) => m.tier >= 2), moments)
        moments = s.moments
      }
      if (drain) await drainCards()
      // 2분 눈금: 저장과 찍기, 목표 한 줄·연 탭·원정
      if (s.t >= next) {
        const extra = await page.evaluate(() => {
          const g = window.__game
          return {
            save: g.snapshot(),
            events: g.log.length,
            goal: (document.querySelector('.chapter-goal')?.textContent ?? '').trim().replace(/\s+/g, ' '),
            tabs: g.tabs.toData(),
            expedition: g.expedition.count,
            returns: g.expedition.returns,
          }
        })
        const file = await shoot(`tick-${stamp(s.t)}-${s.region}.jpg`)
        const { save, events, ...rest } = extra
        snaps.push({ ...s, save, events })
        ticks.push({ t: Math.round(s.t), region: s.region, chapter: s.chapter, ...rest, file })
        next += EVERY
        console.log(`눈금 ${fmt(s.t)} ${s.chapter} ${s.region} 「${rest.goal}」 탭 ${rest.tabs.length} 원정 ${rest.expedition}`)
      }
      if (done(s)) break
    }
    const momentLog = await page.evaluate(() => window.__moments)
    return { ticks, cards, picks, moments: momentLog }
  }

  /** --shots 마무리: 휴대폰 다시 찍기(잘림 수), 눈금에 곡선 값 붙이기, 자동 표시, 썸네일 */
  async function finishShots(browser, shots, rows, snaps) {
    const { ticks, cards, picks, moments } = shots
    for (const [i, s] of snaps.entries()) {
      const p = await openSave(browser, s.save, { width: 390, height: 844 }, true)
      await p.evaluate(() => {
        const g = window.__game
        g.stage.flush()
        g.encounter.flushNeighbors()
        g.view.jumpTo(g.hero.object.position)
      })
      await frames(p, 3)
      const file = `phone-${stamp(s.t)}.jpg`
      await p.screenshot({ path: `${OUT}/${file}`, type: 'jpeg', quality: 70 })
      const cut = await p.evaluate(findCuts)
      const quality = await p.evaluate(() => window.__game.viewport.settings.quality)
      await p.close()
      Object.assign(ticks[i] ?? {}, { phone: file, cuts: cut, phoneQuality: quality })
    }
    // 눈금마다 곡선 값과 그 2분의 순간
    for (const [i, tk] of ticks.entries()) {
      const r = rows[i]
      if (r) Object.assign(tk, { attack: r.attack, defense: r.defense, killSeconds: r.killSeconds, hitsToDie: r.hitsToDie, standardFinishRate: r.standardFinishRate, finishRate: r.finishRate })
      tk.moments = moments.filter((m) => m.t >= tk.t && m.t < tk.t + EVERY).map((m) => `${m.id}(${m.tier})${m.title ? ` ${m.title}` : ''}`)
    }
    const flags = autoFlags(moments)
    writeFileSync(`${OUT}/timeline.json`, JSON.stringify({ every: EVERY, ticks, cards, picks, moments, flags }, null, 2))
    // 썸네일: 눈금(데스크톱)·휴대폰·카드
    const sheet = async (name, items, cols, thumb) => {
      const per = cols * 4
      for (let k = 0; k * per < items.length; k++) {
        const part = items.slice(k * per, (k + 1) * per)
        const cells = part
          .map((it) => {
            const src = `data:image/jpeg;base64,${readFileSync(`${OUT}/${it.file}`).toString('base64')}`
            return `<figure><img src="${src}" style="width:${thumb.w}px;height:${thumb.h}px"><figcaption>${it.caption}</figcaption></figure>`
          })
          .join('')
        const p = await browser.newPage({ viewport: { width: cols * (thumb.w + 8) + 8, height: 400 } })
        await p.setContent(
          `<html><body style="margin:0;padding:4px;background:#111;color:#ddd;font:12px sans-serif;display:grid;grid-template-columns:repeat(${cols},${thumb.w + 8}px)">` +
            `<style>figure{margin:4px}figcaption{height:30px;overflow:hidden;line-height:15px}</style>${cells}</body></html>`,
        )
        await p.screenshot({ path: `${OUT}/sheet-${name}-${k + 1}.png`, fullPage: true })
        await p.close()
      }
    }
    await sheet(
      'tick',
      ticks.map((tk) => ({ file: tk.file, caption: `${fmt(tk.t)} ${tk.region} · 공격 ${tk.attack ?? '-'} · 「${tk.goal}」` })),
      3,
      { w: 420, h: 236 },
    )
    await sheet(
      'phone',
      ticks.filter((tk) => tk.phone).map((tk) => ({ file: tk.phone, caption: `${fmt(tk.t)} ${tk.region} · 잘림 ${tk.cuts.length} · ${tk.phoneQuality}` })),
      6,
      { w: 195, h: 422 },
    )
    await sheet(
      'card',
      [...picks.map((c) => ({ ...c, caption: `${fmt(c.t)} 고르는 카드 ${c.kind}` })), ...cards.filter((c) => c.file).map((c) => ({ ...c, caption: `${fmt(c.t)} ${c.size} ${c.text}` }))].sort((a, b) => a.t - b.t),
      3,
      { w: 420, h: 236 },
    )
    const cutTicks = ticks.filter((tk) => tk.cuts?.length)
    console.log(`\n90분 스크린숏: 눈금 ${ticks.length} · 카드 ${cards.length}(찍음 ${cards.filter((c) => c.file).length}) · 고르는 카드 ${picks.length} · 순간 ${moments.length} → ${OUT}/`)
    console.log(`휴대폰 잘림: ${cutTicks.length ? cutTicks.map((tk) => `${fmt(tk.t)} ${tk.cuts.length}`).join(', ') : '모든 눈금 0'}`)
    console.log(`자동 표시: 새 장치 60초 안 ${flags.mechanisms.close.length} · ★ ${flags.stars.list.length}(간격 밖 ${flags.stars.off.length}) · 정신없다 ${flags.busy.length} · 단계가 없다 ${flags.quiet.length}`)
  }
} finally {
  stop()
}

/**
 * 체크리스트 셋을 거드는 자동 표시 (E306 D24, 봇 분 기준):
 * - 새 장치(탭마다 처음 열림·탈것·첫 맹세·첫 합치기·첫 귀환)끼리 60초 안에 붙었나
 * - ★ 여섯(첫 신·깨어남·장 보스·엔딩)이 다 있고 간격이 봇 10~14분(사람 13~18분 × 0.78)인가
 * - 「정신없다」: 2분 창 하나에 등급 2 이상이 넷을 넘거나, 큰 카드(등급 3 이상) 둘이 10초 안
 * - 「단계가 없다」: 등급 1 이상 순간 없이 2.3분(사람 3분 × 0.78)을 넘김
 */
function autoFlags(moments) {
  const firsts = []
  const firstOf = (pred, name) => {
    const m = moments.find(pred)
    if (m) firsts.push({ t: m.t, name })
  }
  for (const title of new Set(moments.filter((m) => m.id === 'tabOpened').map((m) => m.title))) firstOf((m) => m.id === 'tabOpened' && m.title === title, `탭 ${title}`)
  firstOf((m) => m.id === 'mountGained', '탈것')
  firstOf((m) => m.id === 'oathSworn', '첫 맹세')
  firstOf((m) => m.id === 'merged' || m.id === 'mergedHigh', '첫 합치기')
  firstOf((m) => m.id === 'returned', '첫 귀환')
  firsts.sort((a, b) => a.t - b.t)
  const close = firsts.slice(1).flatMap((m, i) => (m.t - firsts[i].t < 60 ? [{ a: firsts[i], b: m, gap: Math.round(m.t - firsts[i].t) }] : []))
  // ★: 첫 신(장면)·깨어남(큰 카드)·장 보스(장면)·엔딩. 마지막 장 보스 바로 뒤의 엔딩은 하나로 친다
  const starIds = new Set(['mythChosen', 'godAwakened', 'chapterBoss', 'ending'])
  const stars = []
  for (const m of moments.filter((x) => starIds.has(x.id))) {
    const last = stars.at(-1)
    if (last && m.id === 'ending' && last.id === 'chapterBoss' && m.t - last.t < 60) stars[stars.length - 1] = m
    else stars.push(m)
  }
  const gaps = stars.slice(1).map((m, i) => ({ from: stars[i].id, to: m.id, at: m.t, minutes: Math.round(((m.t - stars[i].t) / 60) * 10) / 10 }))
  const off = gaps.filter((g) => g.minutes < 10 || g.minutes > 14)
  // 정신없다: 2분 창(1분씩 밀며)·큰 카드 둘이 10초 안
  const busy = []
  const tier2 = moments.filter((m) => m.tier >= 2)
  for (let from = 0; from <= (moments.at(-1)?.t ?? 0); from += 60) {
    const inWin = tier2.filter((m) => m.t >= from && m.t < from + 120)
    if (inWin.length > 4) busy.push({ kind: '2분에 카드 넷 넘게', from, count: inWin.length, ids: inWin.map((m) => m.id) })
  }
  const big = moments.filter((m) => m.tier >= 3)
  for (let i = 1; i < big.length; i++) if (big[i].t - big[i - 1].t < 10) busy.push({ kind: '큰 카드 둘이 10초 안', from: big[i - 1].t, ids: [big[i - 1].id, big[i].id] })
  // 단계가 없다: 순간 사이 2.3분
  const quiet = []
  const any = moments.filter((m) => m.tier >= 1)
  for (let i = 1; i < any.length; i++) if (any[i].t - any[i - 1].t > 138) quiet.push({ from: any[i - 1].t, to: any[i].t, seconds: Math.round(any[i].t - any[i - 1].t), region: any[i - 1].region })
  return { mechanisms: { list: firsts, close }, stars: { list: stars.map((m) => ({ t: m.t, id: m.id, title: m.title })), gaps, off }, busy, quiet }
}

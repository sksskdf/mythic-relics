// 자동 플레이 검증: 봇이 이동 명령만으로 처음부터 승급까지 플레이하고, 걸린 시간과 흐름을 기록한다.
// 사용법: npm run build && node scripts/playtest.mjs [반복 횟수=3] [제한 시간(분)=45]
// --gate 를 붙이면 승급하지 못했거나 오류가 난 판이 있을 때 실패로 끝난다. (CI)
// --god=loki 를 붙이면 그 신 유물만 끼고 승급까지 간다.
// --loops=N 을 붙이면 봇이 단련하고 윤회까지 하며, 윤회 N번이 될 때까지 회차마다 걸린 시간을 잰다. (순환 성장 곡선)
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const GATE = process.argv.includes('--gate')
const RUNS = Number(args[0] ?? 3)
const LIMIT_MIN = Number(args[1] ?? 45)
const LOOPS = Number(process.argv.find((a) => a.startsWith('--loops='))?.slice(8) ?? 0)
/** --god=loki 처럼 붙이면 봇이 그 신 유물만 끼고 승급까지 간다 (E6-08) */
const GOD = process.argv.find((a) => a.startsWith('--god='))?.slice(6) ?? null
/** --relics=kusanagi,totsuka,... 처럼 붙이면 그 유물을 끼고(발현한 채) 시작해 제한 시간 동안 처치 속도를 잰다 (클래스 비교) */
const RELICS = process.argv.find((a) => a.startsWith('--relics='))?.slice(9) ?? null
/** 기록할 유물: 데이터 파일에 있는 유물 전부 */
const RELIC_IDS = Object.keys(JSON.parse(readFileSync(new globalThis.URL('../src/data/relics.json', import.meta.url), 'utf8')))
/** --region=midgard 처럼 붙이면 그 지역에서 시작해 떠나지 않는다 (신화 비교를 같은 땅에서) */
const REGION = process.argv.find((a) => a.startsWith('--region='))?.slice(9) ?? null
const PORT = 4183
const URL = (RELICS ? `http://localhost:${PORT}/?relics=${RELICS}&autoplay` : `http://localhost:${PORT}/?fresh&autoplay`) + (REGION ? `&region=${REGION}` : '')
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(URL)).ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('미리보기 서버가 뜨지 않았습니다.')
}

// 초를 먼저 반올림해야 7:60 같은 표시가 나오지 않는다.
const fmt = (t) => (t === undefined ? '-' : `${Math.floor(Math.round(t) / 60)}:${String(Math.round(t) % 60).padStart(2, '0')}`)

const results = []
try {
  await waitForServer()
  const browser = await chromium.launch({
    executablePath: existsSync(BROWSER) ? BROWSER : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  for (let run = 1; run <= RUNS; run++) {
    const page = await browser.newPage({ viewport: { width: 640, height: 360 } })
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(URL)
    await page.waitForFunction(() => window.__autoplay && window.__game.frame > 2, null, { timeout: 30000 })
    if (LOOPS > 0) await page.evaluate(() => (window.__autoplay.cycle = true))
    if (GOD) await page.evaluate((god) => (window.__autoplay.god = god), GOD)
    if (REGION) await page.evaluate(() => (window.__autoplay.stay = true))
    let done = false
    while (!done) {
      const state = await page.evaluate(() => {
        window.__autoplay.run(30)
        const g = window.__game
        return { t: g.time, promoted: g.progress.promotions >= 1, rebirths: window.__autoplay.rebirths.length }
      })
      done = (RELICS ? false : LOOPS > 0 ? state.rebirths >= LOOPS : state.promoted) || state.t > LIMIT_MIN * 60
    }
    const rebirths = await page.evaluate(() => [...window.__autoplay.rebirths])
    // 끝났을 때 봇이 어디서 무엇을 하고 있었나 (멈춤을 찾을 때)
    const last = await page.evaluate(() => {
      const g = window.__game
      const p = g.hero.object.position
      const a = window.__autoplay
      return { step: a.step, want: a.wantRegion(), gods: a.forgeGods(), locked: g.hero.locked, armed: g.world.exitArmed, traveling: g.world.traveling, mats: Object.fromEntries(g.powers.loadout.materials), bag: g.powers.loadout.bag, slots: g.powers.loadout.slots, picks: g.pickups.list.map((i) => i.id), t: Math.round(g.time), region: g.region.id, x: Math.round(p.x), z: Math.round(p.z), hp: Math.round(g.combat.health.ratio * 100) / 100, moving: g.hero.isMoving, enemies: g.encounter.alive.length, chosen: g.powers.manifested, ready: g.progress.readyToPromote(g.powers.manifested ?? 'thor') }
    })
    const log = await page.evaluate(() => window.__game.log)
    const first = (type, detail) => log.find((e) => e.type === type && (detail === undefined || e.detail === detail))?.t
    const count = (type) => log.filter((e) => e.type === type).length
    const result = {
      run,
      relics: Object.fromEntries(RELIC_IDS.map((id) => [id, first('relic', id)])),
      manifest: first('manifest'),
      // 신화 개방 (E12-07): 첫째·둘째 신화가 열린 때와 연 신화 수
      opened: log.filter((e) => e.type === 'open').map((e) => ({ t: e.t, god: e.detail })),
      // 장비와 대장간 (E13-08): 주운 장비 수, 대장간 제작
      gear: count('gear'),
      forged: log.filter((e) => e.type === 'forge').map((e) => ({ t: e.t, what: e.detail })),
      bossKill: first('bossKill', 'giantKing'),
      legendStart: first('legendStart'),
      promote: first('promote'),
      kills: count('kill'),
      // 발현한 뒤(또는 처음부터 낀 뒤) 1분에 쓰러뜨린 수: 클래스끼리 비교한다
      killRate: (() => {
        const from = RELICS ? 0 : (first('manifest') ?? Infinity)
        const to = log.at(-1)?.t ?? 0
        const kills = log.filter((e) => e.type === 'kill' && e.t >= from).length
        return to > from ? Math.round((kills / ((to - from) / 60)) * 10) / 10 : 0
      })(),
      deaths: count('death'),
      hurt: count('hurt'),
      damageTaken: log.filter((e) => e.type === 'hurt').reduce((s, e) => s + Number(e.detail), 0),
      legendFails: count('legendFail'),
      end: log.at(-1)?.t,
      rebirths,
      last,
      errors,
      log,
    }
    results.push(result)
    console.log(
      `#${run} 2단계 ${fmt(result.promote)} | 첫 신화 ${fmt(result.manifest)} | 신화 둘 ${fmt(result.opened[1]?.t)} (연 신화 ${result.opened.length}: ${result.opened.map((o) => o.god).join(', ')}) | 거인 왕 ${fmt(result.bossKill)} | 장비 ${result.gear}, 첫 제작 ${fmt(result.forged[0]?.t)}${result.forged[0] ? ` (${result.forged[0].what})` : ''} | ` +
        `유물 ${Object.entries(result.relics).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')} | ` +
        `처치 ${result.kills}(첫 신화 뒤 분당 ${result.killRate}), 쓰러짐 ${result.deaths}, 피격 ${result.hurt}, 전설 실패 ${result.legendFails}` +
        (LOOPS > 0 ? ` | 윤회 ${rebirths.map((t, i) => fmt(t - (rebirths[i - 1] ?? 0))).join(' → ')}` : '') +
        (errors.length ? ` | 오류 ${errors.length}` : ''),
    )
    await page.close()
  }
  await browser.close()
} finally {
  stop()
}
mkdirSync('test-results', { recursive: true })
writeFileSync('test-results/playtest.json', JSON.stringify(results, null, 2))

if (GATE) {
  const failed = results.filter((r) => r.promote === undefined || r.errors.length > 0)
  if (failed.length > 0) {
    console.error(`봇 검증 실패: ${failed.length}판이 ${LIMIT_MIN}분 안에 승급하지 못했거나 오류가 났습니다.`)
    process.exit(1)
  }
  console.log('봇 검증 통과')
}

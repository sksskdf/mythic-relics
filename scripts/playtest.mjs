// 자동 플레이 검증: 봇이 이동 명령만으로 처음부터 승급까지 플레이하고, 걸린 시간과 흐름을 기록한다.
// 사용법: npm run build && node scripts/playtest.mjs [반복 횟수=3] [제한 시간(분)=45]
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const RUNS = Number(process.argv[2] ?? 3)
const LIMIT_MIN = Number(process.argv[3] ?? 45)
const PORT = 4183
const URL = `http://localhost:${PORT}/?fresh&autoplay`
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
    let done = false
    while (!done) {
      const state = await page.evaluate(() => {
        window.__autoplay.run(30)
        const g = window.__game
        return { t: g.time, promoted: g.progress.level('thor') >= 2 }
      })
      done = state.promoted || state.t > LIMIT_MIN * 60
    }
    const log = await page.evaluate(() => window.__game.log)
    const first = (type, detail) => log.find((e) => e.type === type && (detail === undefined || e.detail === detail))?.t
    const count = (type) => log.filter((e) => e.type === type).length
    const result = {
      run,
      relics: Object.fromEntries(['megingjord', 'jarngreipr', 'lokiMask', 'mjolnir'].map((id) => [id, first('relic', id)])),
      manifest: first('manifest'),
      bossKill: first('bossKill', 'giantKing'),
      legendStart: first('legendStart'),
      promote: first('promote'),
      kills: count('kill'),
      deaths: count('death'),
      hurt: count('hurt'),
      damageTaken: log.filter((e) => e.type === 'hurt').reduce((s, e) => s + Number(e.detail), 0),
      legendFails: count('legendFail'),
      end: log.at(-1)?.t,
      errors,
      log,
    }
    results.push(result)
    console.log(
      `#${run} 승급 ${fmt(result.promote)} | 발현 ${fmt(result.manifest)} | 거인 왕 ${fmt(result.bossKill)} | ` +
        `유물 ${Object.entries(result.relics).map(([k, v]) => `${k} ${fmt(v)}`).join(', ')} | ` +
        `처치 ${result.kills}, 쓰러짐 ${result.deaths}, 피격 ${result.hurt}, 전설 실패 ${result.legendFails}` +
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

// 화면 확인용 스크린숏 도구. 빌드한 게임을 열고, 원하는 상태를 만든 뒤 사진을 찍는다.
// 사용법: npm run build && node scripts/shot.mjs <저장 경로.png> [주소 뒤에 붙일 값] [게임 안에서 실행할 코드] [기다릴 프레임 수]
// 예: node scripts/shot.mjs test-results/manifest.png "?relics=mjolnir,megingjord,jarngreipr" "g.hero.teleport(11, 5)" 30
// 휴대폰으로 찍기 (E235): SHOT_SIZE=390x844 SHOT_TOUCH=1 을 앞에 붙이면 그 크기의 터치 기기로 연다
// 상태 보기: SHOT_LOG="<식>" 을 붙이면 찍을 때 그 식(g = 게임)의 값을 JSON으로 찍는다
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium } from 'playwright-core'

const [out = 'test-results/shot.png', query = '?relics=', code = '', waitFrames = '20'] = process.argv.slice(2)
const PORT = 4190
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}

try {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://localhost:${PORT}/`)).ok) break
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  const browser = await chromium.launch({
    executablePath: existsSync(BROWSER) ? BROWSER : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const [width, height] = (process.env.SHOT_SIZE ?? '1280x720').split('x').map(Number)
  const touch = process.env.SHOT_TOUCH === '1'
  const page = await browser.newPage({ viewport: { width, height }, ...(touch ? { hasTouch: true, isMobile: true } : {}) })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`http://localhost:${PORT}/${query}`)
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 3, null, { timeout: 60000 })
  if (code) await page.evaluate((c) => new Function('g', c)(window.__game), code)
  const start = await page.evaluate(() => window.__game.frame)
  await page.waitForFunction((f) => window.__game.frame > f, start + Number(waitFrames), { timeout: 120000 })
  mkdirSync(dirname(out), { recursive: true })
  if (process.env.SHOT_LOG) console.log(JSON.stringify(await page.evaluate((c) => new Function('g', `return (${c})`)(window.__game), process.env.SHOT_LOG)))
  await page.screenshot({ path: out })
  await browser.close()
  console.log(errors.length ? `오류: ${errors.join(' / ')}` : `저장: ${out}`)
} finally {
  stop()
}

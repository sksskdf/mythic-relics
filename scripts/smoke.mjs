// 빌드 결과를 실제 브라우저로 열어, 화면이 그려지고 오류가 없는지 확인한다.
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const PORT = 4173
const URL = `http://localhost:${PORT}/`
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' })
const stop = () => server.kill('SIGTERM')

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(URL)
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error('미리보기 서버가 뜨지 않았습니다.')
}

let failed = false
try {
  await waitForServer()
  const browser = await chromium.launch({
    executablePath: existsSync(BROWSER) ? BROWSER : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))

  await page.goto(URL)
  await page.waitForFunction(() => (window.__game?.frame ?? 0) > 10, null, { timeout: 15000 })
  const frames = await page.evaluate(() => window.__game.frame)

  // 조작 점검: 우클릭한 곳으로 걸어가는지, Space로 회피하는지 확인한다.
  const heroPos = () => page.evaluate(() => {
    const p = window.__game.hero.object.position
    return { x: p.x, z: p.z }
  })
  const before = await heroPos()
  await page.mouse.move(640 + 220, 360 + 60)
  await page.mouse.down({ button: 'right' })
  await page.mouse.up({ button: 'right' })
  await page.waitForFunction(
    ([x, z]) => {
      const p = window.__game.hero.object.position
      return Math.hypot(p.x - x, p.z - z) > 1
    },
    [before.x, before.z],
    { timeout: 20000 },
  )
  const moved = await heroPos()
  await page.keyboard.press('Space')
  await page.waitForFunction(() => window.__game.hero.dodgeCooldownLeft > 0, null, { timeout: 10000 })
  console.log(`이동 확인: (${before.x.toFixed(1)}, ${before.z.toFixed(1)}) → (${moved.x.toFixed(1)}, ${moved.z.toFixed(1)}), 회피 확인`)

  mkdirSync('test-results', { recursive: true })
  await page.screenshot({ path: 'test-results/smoke.png' })
  await browser.close()

  if (errors.length) {
    failed = true
    console.error('브라우저 오류:', errors)
  } else {
    console.log(`스모크 통과: ${frames}프레임 렌더링, 오류 없음`)
  }
} catch (e) {
  failed = true
  console.error(e)
} finally {
  stop()
}
process.exit(failed ? 1 : 0)

// 정보 화면·HUD 모음 (QA): 중반쯤의 상태를 꾸민 뒤 정보 화면 탭마다, 화면 크기마다 찍는다.
// 사용법: npm run build && node scripts/ui-sheet.mjs [저장 폴더=test-results/ui] [크기=1280x720,960x540,390x844]
// 결과: <폴더>/<크기>-<탭>.png, <크기>-hud.png. 글이 넘치거나 잘리는지, 좁은 화면에서 깨지는지 직접 본다.
// UI_DOM=1 이면 탭마다 정보 화면의 DOM도 <크기>-<탭>.html로 남긴다 (코드를 나눈 뒤 화면이 그대로인지 diff로 견줄 때)
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const [dir = 'test-results/ui', sizesArg = '1280x720,960x540,390x844'] = process.argv.slice(2)
const PORT = 4194
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const TABS = ['status', 'sources', 'relics', 'classes', 'trials', 'rift', 'map', 'looks']
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
  mkdirSync(dir, { recursive: true })
  const browser = await chromium.launch({
    executablePath: existsSync(BROWSER) ? BROWSER : undefined,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  })
  const errors = []
  for (const size of sizesArg.split(',')) {
    const [width, height] = size.split('x').map(Number)
    const page = await browser.newPage({ viewport: { width, height } })
    page.on('pageerror', (e) => errors.push(`${size}: ${e.message}`))
    // 장비 굴림이 판마다 같게 Math.random을 씨앗 고정으로 (DOM을 견줄 수 있게)
    await page.addInitScript(() => {
      let s = 20261027
      Math.random = () => {
        s = (s + 0x6d2b79f5) | 0
        let t = Math.imul(s ^ (s >>> 15), 1 | s)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
      }
    })
    await page.goto(`http://localhost:${PORT}/?fresh&relics=&region=village&noscenes`)
    await page.waitForFunction(() => (window.__game?.frame ?? 0) > 3, null, { timeout: 60000 })
    // 중반쯤: 토르를 고르고 신화 셋을 열고, 장비 몇 개와 재료, 위협 3단계, 시련 몇 개, 한계를 깬 뒤 별 셋
    await page.evaluate(() => {
      const g = window.__game
      g.dev.equip('mjolnir')
      g.dev.choose('thor')
      g.dev.promote()
      for (const god of ['loki', 'odin']) g.progress.open(god)
      for (const part of ['head', 'body', 'hands', 'feet', 'trinket']) g.dev.dropGear(part, part === 'trinket' ? 'hero' : 'rare', g.hero.object.position.x, g.hero.object.position.z)
      g.advance(1.5, 1 / 30)
      g.dev.fillForge('thor')
      // 위협 단계·시련·균열은 엔딩 뒤 장치라 엔딩 뒤로 넘겨 모든 탭을 찍는다 (E21-06)
      g.reachEnding()
      Object.assign(g.threat, { unlocked: 3, reached: 3, level: 3 })
      for (const id of ['noMyth', 'glass', 'crowd']) g.trials.win(id, 2, 95)
      for (const realm of ['norse', 'greek', 'china', 'japan', 'korea']) g.threat.cleared[realm] = 10
      Object.assign(g.threat, { unlocked: 10, reached: 10 })
      g.threatSystem.breakLimit()
      g.rift.reach(15, 5)
      g.threatSystem.apply()
      g.bus.emit('progressChanged', {})
    })
    const wait = async (frames = 3) => {
      const start = await page.evaluate(() => window.__game.frame)
      await page.waitForFunction((f) => window.__game.frame > f, start + frames, { timeout: 120000 })
    }
    await wait(6)
    await page.screenshot({ path: `${dir}/${size}-hud.png` })
    for (const tab of TABS) {
      await page.evaluate((tab) => {
        const g = window.__game
        g.menu.toggle(true)
        g.menu.tab = tab
        g.menu.refresh()
      }, tab)
      await wait()
      await page.screenshot({ path: `${dir}/${size}-${tab}.png` })
      if (process.env.UI_DOM) writeFileSync(`${dir}/${size}-${tab}.html`, (await page.evaluate(() => document.querySelector('.menu').outerHTML)).replace(/></g, '>\n<'))
      // 넘친 글: 상자 밖으로 삐져나온 요소 수
      const overflow = await page.evaluate(() => {
        const out = []
        for (const el of document.querySelectorAll('.menu *')) {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && (el.scrollWidth > el.clientWidth + 2) && getComputedStyle(el).overflowX === 'visible' && el.children.length === 0) out.push(`${el.className || el.tagName}: ${el.textContent?.slice(0, 20)}`)
        }
        return out.slice(0, 8)
      })
      if (overflow.length) console.log(`${size} ${tab} 넘침: ${overflow.join(' | ')}`)
    }
    await page.close()
    console.log(`${size} 찍음`)
  }
  await browser.close()
  console.log(errors.length ? `오류: ${errors.join(' / ')}` : `저장: ${dir}`)
} finally {
  stop()
}

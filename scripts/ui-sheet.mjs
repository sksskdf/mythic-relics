// 정보 화면·HUD 모음 (QA): 중반쯤의 상태를 꾸민 뒤 정보 화면 탭마다, 화면 크기마다 찍는다.
// 사용법: npm run build && node scripts/ui-sheet.mjs [저장 폴더=test-results/ui] [크기=1280x720,960x540,390x844]
// 결과: <폴더>/<크기>-<탭>.png, <크기>-hud.png (탭 아홉). 글이 넘치거나 잘리는지, 좁은 화면에서 깨지는지 직접 본다.
// UI_DOM=1 이면 탭마다 정보 화면의 DOM도 <크기>-<탭>.html로 남긴다 (코드를 나눈 뒤 화면이 그대로인지 diff로 견줄 때)
// 세로 크기(가로 < 세로)는 터치 기기로 연다. 화면마다 잘린 요소(화면 밖이나 잘라 내는 상자 밖으로 가로·세로가 나간 것)를 세어
// <폴더>/cut.json에 남긴다 (E235: 휴대폰에서 어느 화면도 잘리지 않는다)
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

const [dir = 'test-results/ui', sizesArg = '1280x720,960x540,390x844'] = process.argv.slice(2)
const PORT = 4194
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const TABS = ['status', 'sources', 'relics', 'classes', 'training', 'oaths', 'rift', 'map', 'looks']
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore', detached: true })
const stop = () => {
  try {
    process.kill(-server.pid)
  } catch {}
}

/**
 * 잘린 요소 (페이지 안에서 돈다): 보이는 HUD·정보 화면 요소 가운데, 가장 가까운 잘라 내는 조상(overflow hidden)이나
 * 화면 밖으로 가로나 세로가 나간 것. 밀어 볼 수 있는 상자(overflow auto·scroll) 안은 뺀다
 */
function findCuts() {
  const out = []
  for (const el of document.querySelectorAll('.hud *, .menu *, .minimap, .menu-button')) {
    if (!el.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) continue
    // 가로·세로마다: 잘라 내는 가장 가까운 상자(없으면 화면) 밖으로 나갔나. 스크롤 상자 안은 굴려 볼 수 있으니 세지 않는다
    const cut = (axis) => {
      const prop = axis === 'x' ? 'overflowX' : 'overflowY'
      let clip = null
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        if (getComputedStyle(p)[prop] !== 'visible') {
          clip = p
          break
        }
      }
      if (clip && ['auto', 'scroll'].includes(getComputedStyle(clip)[prop])) return false
      const box = clip ? clip.getBoundingClientRect() : { left: 0, right: innerWidth, top: 0, bottom: innerHeight }
      return axis === 'x' ? r.left < box.left - 1 || r.right > box.right + 1 : r.top < box.top - 1 || r.bottom > box.bottom + 1
    }
    const x = cut('x')
    if (x || cut('y')) out.push(`${x ? '가로' : '세로'} ${el.className || el.tagName}: ${(el.textContent ?? '').trim().slice(0, 16)}`)
  }
  return out
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
  /** 화면마다 잘린 요소 */
  const cuts = {}
  for (const size of sizesArg.split(',')) {
    const [width, height] = size.split('x').map(Number)
    const page = await browser.newPage({ viewport: { width, height }, ...(width < height ? { hasTouch: true, isMobile: true } : {}) })
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
    // 중반쯤: 토르를 고르고 신화 셋을 열고, 장비 몇 개와 재료, 위협 3단계, 지킨 맹세 몇 개, 한계를 깬 뒤 별 셋
    await page.evaluate(() => {
      const g = window.__game
      g.dev.equip('mjolnir')
      g.dev.choose('thor')
      g.dev.promote()
      for (const god of ['loki', 'odin']) g.progress.open(god)
      for (const part of ['head', 'body', 'hands', 'feet', 'trinket']) g.dev.dropGear(part, part === 'trinket' ? 'hero' : 'rare', g.hero.object.position.x, g.hero.object.position.z)
      g.advance(1.5, 1 / 30)
      g.dev.fillForge('thor')
      // 수련 (E236): 깨달음 여덟, 힘 갈래 넷과 손 갈래 둘을 찍고 둘은 남긴다
      g.dev.insight(8)
      for (const id of ['awaken', 'edge', 'fury', 'cleave', 'quick', 'stride']) g.dev.train(id)
      // 위협 단계·균열은 엔딩 뒤 장치라 엔딩 뒤로 넘겨 모든 탭을 찍는다 (E21-06)
      g.reachEnding()
      Object.assign(g.threat, { unlocked: 3, reached: 3, level: 3 })
      for (const id of ['silence', 'glass', 'crowd']) g.oaths.keep(id, 420)
      for (const realm of ['norse', 'greek', 'china', 'japan', 'korea']) g.threat.cleared[realm] = 10
      Object.assign(g.threat, { unlocked: 10, reached: 10 })
      g.threatSystem.breakLimit()
      g.rift.reach(15)
      g.threatSystem.apply()
      g.bus.emit('progressChanged', {})
    })
    const wait = async (frames = 3) => {
      const start = await page.evaluate(() => window.__game.frame)
      await page.waitForFunction((f) => window.__game.frame > f, start + frames, { timeout: 120000 })
    }
    await wait(6)
    await page.screenshot({ path: `${dir}/${size}-hud.png` })
    cuts[`${size} hud`] = await page.evaluate(findCuts)
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
      cuts[`${size} ${tab}`] = await page.evaluate(findCuts)
    }
    await page.close()
    console.log(`${size} 찍음`)
  }
  await browser.close()
  writeFileSync(`${dir}/cut.json`, JSON.stringify(cuts, null, 2))
  const cutCount = Object.values(cuts).reduce((n, list) => n + list.length, 0)
  for (const [where, list] of Object.entries(cuts)) if (list.length) console.log(`${where} 잘림 ${list.length}: ${list.slice(0, 4).join(' | ')}`)
  console.log(`잘린 요소 ${cutCount}`)
  console.log(errors.length ? `오류: ${errors.join(' / ')}` : `저장: ${dir}`)
} finally {
  stop()
}

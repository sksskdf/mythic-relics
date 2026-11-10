// 정보 화면·HUD 모음 (QA): 중반쯤의 상태를 꾸민 뒤 정보 화면 탭마다, 화면 크기마다 찍는다.
// 사용법: npm run build && node scripts/ui-sheet.mjs [저장 폴더=test-results/ui] [크기=1280x720,960x540,390x844,393x852,393x659]
// 결과: <폴더>/<크기>-<탭>.png (탭 여덟, 신 탭은 자리·외형 둘), <크기>-hud.png (카드가 다 지나간 HUD), <크기>-hud-card.png (큰 카드가 뜬 HUD).
// HUD 둘은 목표 한 줄이 보이게 엔딩 전에, 탭은 여덟이 다 열리게 엔딩 뒤로 넘겨 찍는다. 글이 넘치거나 잘리는지, 좁은 화면에서 깨지는지 직접 본다.
// UI_DOM=1 이면 탭마다 정보 화면의 DOM도 <크기>-<탭>.html로 남긴다 (코드를 나눈 뒤 화면이 그대로인지 diff로 견줄 때)
// 세로 크기(가로 < 세로)는 터치 기기로 연다. 393x852는 아이폰 15 Pro, 393x659는 그 사파리에서 주소창·도구 막대가 보일 때의 높이다 (E307).
// 화면마다 잘린 요소(화면 밖이나 잘라 내는 상자 밖으로 나간 것, 단서 없이 가로로 밀리는 상자, 다른 요소에 덮인 단추와 창 안의 글: `lib/cuts.mjs`)를 세어
// <폴더>/cut.json에 남긴다 (E235: 휴대폰에서 어느 화면도 잘리지 않는다). 탭 줄에 탭 여덟이 다 열려 있지 않으면 오류로 알린다 (탭이 적으면 탭 줄 잘림을 못 본다)
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { findCuts } from './lib/cuts.mjs'

const [dir = 'test-results/ui', sizesArg = '1280x720,960x540,390x844,393x852,393x659'] = process.argv.slice(2)
const PORT = 4194
const BROWSER = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
// 탭 일곱과 엔딩 뒤 하나 (E305-04), 신 탭은 「자리」와 「외형」을 따로 찍는다
const TABS = ['status', 'relics', 'training', 'gods', 'gods-looks', 'sources', 'map', 'oaths', 'endless']
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
    // 중반쯤: 토르를 고르고 신화 셋을 열고, 장비 몇 개와 재료, 수련 여섯 마디
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
    })
    const wait = async (frames = 3) => {
      const start = await page.evaluate(() => window.__game.frame)
      await page.waitForFunction((f) => window.__game.frame > f, start + frames, { timeout: 120000 })
    }
    // HUD는 엔딩 뒤로 넘기기 전에 찍는다: 엔딩 뒤에는 목표 한 줄이 없어, 위쪽 HUD 묶음(원천 칩·목표 한 줄·작은 지도)이 다 보이지 않는다.
    // 큰 카드가 뜬 HUD: 위에 꾸민 것들이 카드 줄을 세운다 (맨 앞이 큰 카드 「신이 깨어남」). 세로 화면의 큰 카드는 위쪽 HUD 묶음
    // 자리를 빌려 뜨니, 그 자리와 크기는 이 그림으로 본다. 카드의 뜨는 움직임은 실제 시간으로 흐른다
    await page.waitForFunction(() => window.__game.hud.gainsShowing === 'big', null, { timeout: 20000 }).catch(() => {})
    await page.waitForTimeout(500)
    await wait()
    await page.screenshot({ path: `${dir}/${size}-hud-card.png` })
    cuts[`${size} hud-card`] = await page.evaluate(findCuts)
    // HUD: 카드가 다 지나간 뒤에 찍는다 (큰 카드 둘과 장비 카드에 실제 10초쯤). 카드가 뜬 채로 찍으면 세로 화면에서는
    // 위쪽 HUD 묶음이 카드 밑에 깔려, HUD 배치가 깨져도 그림으로 알 수 없다 (E307)
    const calm = await page
      .waitForFunction(() => !window.__game.moments.holding && !window.__game.hud.gainsBusy && window.__game.hud.gainsShowing === null, null, { timeout: 90000 })
      .then(() => true, () => false)
    if (!calm) errors.push(`${size}: 얻은 것 카드가 지나가지 않아 HUD가 카드에 가린 채 찍혔다`)
    await wait()
    await page.screenshot({ path: `${dir}/${size}-hud.png` })
    cuts[`${size} hud`] = await page.evaluate(findCuts)
    // 정보 화면: 깊이·끝없는 원정은 엔딩 뒤 장치라 엔딩 뒤로 넘겨 모든 탭을 찍는다 (E21-06).
    // 지킨 맹세 셋, 깊이 10에서 한계를 깬 뒤(E305-03) 끝없는 원정 기록 15층
    await page.evaluate(() => {
      const g = window.__game
      g.reachEnding()
      for (const id of ['silence', 'glass', 'crowd']) g.oaths.keep(id, 420)
      g.dev.depth(10)
      g.depthSystem.breakLimit()
      g.endless.reach(15)
      g.bus.emit('progressChanged', {})
    })
    await wait(6)
    for (const tab of TABS) {
      await page.evaluate((tab) => {
        const g = window.__game
        const [id, view] = tab.split('-')
        g.menu.gods.view = view ?? 'slots'
        g.menu.show(id)
      }, tab)
      await wait()
      await page.screenshot({ path: `${dir}/${size}-${tab}.png` })
      if (process.env.UI_DOM) writeFileSync(`${dir}/${size}-${tab}.html`, (await page.evaluate(() => document.querySelector('.menu').outerHTML)).replace(/></g, '>\n<'))
      // 넘친 글: 상자 밖으로 삐져나온 요소 수
      const overflow = await page.evaluate(() => {
        const out = []
        // 휴대폰의 누르는 자리 넓히기(보이지 않는 ::before가 상자 밖으로 나간다, portrait.css)는 넘친 글이 아니다
        const widened = (el) => {
          const before = getComputedStyle(el, '::before')
          return before.content !== 'none' && before.position === 'absolute' && parseFloat(before.left) < 0
        }
        for (const el of document.querySelectorAll('.menu *')) {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && (el.scrollWidth > el.clientWidth + 2) && getComputedStyle(el).overflowX === 'visible' && el.children.length === 0 && !widened(el)) out.push(`${el.className || el.tagName}: ${el.textContent?.slice(0, 20)}`)
        }
        return out.slice(0, 8)
      })
      if (overflow.length) console.log(`${size} ${tab} 넘침: ${overflow.join(' | ')}`)
      cuts[`${size} ${tab}`] = await page.evaluate(findCuts)
    }
    // 탭 줄: 여덟이 다 열린 채 찍혔나 (탭이 여섯을 넘을 때 생기던 잘림은 다 열려 있어야 보인다)
    const shownTabs = await page.evaluate(() => [...document.querySelectorAll('.menu__tab')].filter((b) => b.checkVisibility()).map((b) => b.textContent.trim()))
    if (shownTabs.length !== 8) errors.push(`${size}: 탭 줄에 탭이 ${shownTabs.length}개뿐이다 (${shownTabs.join('·')})`)
    await page.close()
    console.log(`${size} 찍음 (탭 ${shownTabs.length}: ${shownTabs.join('·')})`)
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
